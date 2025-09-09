using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Data;
using System.Security.Cryptography;
using System.Text;

namespace WebApp1.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly NpgsqlConnection _connection;
        public AuthController(NpgsqlConnection connection) => _connection = connection;

        // ===== DTO =====
        public class LoginRequest
        {
            public string EmployeeNo { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }
        public class ReturnRequest
        {
            public string EmployeeNo { get; set; } = string.Empty;
        }

        // ===== /auth/login : 開発用（平文比較） =====
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest login)
        {
            var emp = (login.EmployeeNo ?? "").Trim();
            var pass = (login.Password ?? "").Trim();
            if (emp.Length == 0 || pass.Length == 0)
                return Unauthorized(new { message = "IDまたはパスワードが正しくありません" });

            try
            {
                if (_connection.State != ConnectionState.Open)
                    await _connection.OpenAsync();

                const string sql = @"SELECT password_hash FROM auth_user WHERE employee_no = @employee_no";
                using var cmd = new NpgsqlCommand(sql, _connection);
                cmd.Parameters.AddWithValue("employee_no", emp);

                using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow);
                if (!await reader.ReadAsync())
                    return Unauthorized(new { message = "IDまたはパスワードが正しくありません" });

                var dbValue = reader.IsDBNull(0) ? null : reader.GetString(0)?.Trim();
                if (!string.Equals(dbValue, pass, StringComparison.Ordinal))
                    return Unauthorized(new { message = "IDまたはパスワードが正しくありません" });

                return Ok(new { message = "ログイン成功", employeeNo = emp });
            }
            finally
            {
                if (_connection.State == ConnectionState.Open)
                    await _connection.CloseAsync();
            }
        }

        // ===== /auth/me : 社員氏名＋現在貸出（貸出中のみ） =====
        // ルール: return_date IS NULL かつ available_flag = FALSE が「貸出中」
        // available_flag は TRUE=空き / FALSE=貸出中 とする
        [HttpGet("me")]
        public async Task<IActionResult> Me([FromQuery] string employeeNo)
        {
            if (string.IsNullOrWhiteSpace(employeeNo))
                return BadRequest(new { message = "employeeNo is required" });

            var emp = employeeNo.Trim();

            try
            {
                if (_connection.State != ConnectionState.Open)
                    await _connection.OpenAsync();

                const string sql = @"
WITH me AS (
  SELECT u.employee_no, u.name
  FROM mst_user u
  WHERE u.employee_no = @emp AND u.delete_flag = FALSE
  LIMIT 1
),
rent AS (
  SELECT asset_no, rental_date, due_date
  FROM trn_rental
  WHERE employee_no = @emp
    AND return_date IS NULL
    AND available_flag = FALSE
  ORDER BY rental_date DESC, rental_id DESC
  LIMIT 1
)
SELECT m.employee_no, m.name,
       r.asset_no, r.rental_date, r.due_date,
       (r.due_date IS NOT NULL AND r.due_date < NOW()) AS overdue
FROM me m
LEFT JOIN rent r ON TRUE;";

                using var cmd = new NpgsqlCommand(sql, _connection);
                cmd.Parameters.AddWithValue("emp", emp);

                using var rd = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow);
                if (!await rd.ReadAsync())
                    return NotFound(new { message = "ユーザーが見つかりません", employeeNo = emp });

                var hasRental = !rd.IsDBNull(rd.GetOrdinal("asset_no"));

                var body = new
                {
                    employeeNo = rd.GetString(rd.GetOrdinal("employee_no")),
                    name = rd.GetString(rd.GetOrdinal("name")),
                    rental = hasRental ? new
                    {
                        status = "貸出中",
                        assetNo = rd.GetString(rd.GetOrdinal("asset_no")),
                        rentalDate = rd.IsDBNull(rd.GetOrdinal("rental_date")) ? (DateTime?)null : rd.GetDateTime(rd.GetOrdinal("rental_date")),
                        dueDate = rd.IsDBNull(rd.GetOrdinal("due_date")) ? (DateTime?)null : rd.GetDateTime(rd.GetOrdinal("due_date")),
                        overdue = rd.GetBoolean(rd.GetOrdinal("overdue"))
                    } : null
                };

                return Ok(body);
            }
            finally
            {
                if (_connection.State == ConnectionState.Open)
                    await _connection.CloseAsync();
            }
        }

        // ===== /auth/return : 未返却の最新1件を返却に更新 =====
        [HttpPost("return")]
        public async Task<IActionResult> Return([FromBody] ReturnRequest req)
        {
            var emp = (req.EmployeeNo ?? "").Trim();
            if (string.IsNullOrEmpty(emp))
                return BadRequest(new { message = "employeeNo is required" });

            try
            {
                if (_connection.State != ConnectionState.Open)
                    await _connection.OpenAsync();

                // 最新の未返却レコード（貸出中）を rental_id で取得
                const string pickSql = @"
SELECT rental_id
FROM trn_rental
WHERE employee_no = @emp
  AND return_date IS NULL
  AND available_flag = FALSE
ORDER BY rental_date DESC, rental_id DESC
LIMIT 1;";
                long? rentalId = null;
                using (var pick = new NpgsqlCommand(pickSql, _connection))
                {
                    pick.Parameters.AddWithValue("emp", emp);
                    var o = await pick.ExecuteScalarAsync();
                    if (o is long l) rentalId = l;
                    else if (o is int i) rentalId = i;
                }
                if (rentalId is null)
                    return NotFound(new { message = "返却対象の貸出が見つかりません" });

                // 返却更新：NOW() で日時、available_flag を TRUE（＝空き）へ
                const string updSql = @"
UPDATE trn_rental
SET return_date    = NOW(),
    available_flag = TRUE
WHERE rental_id    = @rid;";
                using var upd = new NpgsqlCommand(updSql, _connection);
                upd.Parameters.AddWithValue("rid", rentalId.Value);

                var affected = await upd.ExecuteNonQueryAsync();
                if (affected == 0)
                    return NotFound(new { message = "返却更新に失敗しました" });

                return Ok(new { message = "返却完了" });
            }
            finally
            {
                if (_connection.State == ConnectionState.Open)
                    await _connection.CloseAsync();
            }
        }

        // 参考：将来ハッシュ認証に切替えるとき用
        private static string ComputeSha256Hash(string rawData)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(rawData));
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }
    }
}
