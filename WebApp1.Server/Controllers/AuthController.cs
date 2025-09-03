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

        // ---- DTO ----
        public class LoginRequest
        {
            public string EmployeeNo { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class ReturnRequest
        {
            public string EmployeeNo { get; set; } = string.Empty;
        }

        // ---- /auth/login : 開発用・平文比較 ----
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

                using var reader = await cmd.ExecuteReaderAsync();
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

        // ---- /auth/me : 社員名＋貸出状況を返す ----
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

                // 1) 氏名（MST_USER）
                string? name;
                {
                    const string sql = @"SELECT name
                                           FROM mst_user
                                          WHERE employee_no = @emp AND delete_flag = FALSE";
                    using var cmd = new NpgsqlCommand(sql, _connection);
                    cmd.Parameters.AddWithValue("emp", emp);
                    var obj = await cmd.ExecuteScalarAsync();
                    name = obj as string;
                }
                if (string.IsNullOrEmpty(name))
                    return NotFound(new { message = "ユーザーが見つかりません", employeeNo = emp });

                // 2) 貸出状況（TRN_RENTAL）
                // ルール: return_date が NULL かつ available_flag = TRUE が「貸出中」
                string rentalStatus = "なし";
                string? assetNo = null;
                DateTime? rentalDate = null;
                DateTime? dueDate = null;

                {
                    const string sql = @"
                        SELECT asset_no, rental_date, due_date
                          FROM trn_rental
                         WHERE employee_no = @emp
                           AND return_date IS NULL
                           AND available_flag = FALSE
                         ORDER BY rental_date DESC
                         LIMIT 1";
                    using var cmd = new NpgsqlCommand(sql, _connection);
                    cmd.Parameters.AddWithValue("emp", emp);

                    using var rd = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow);
                    if (await rd.ReadAsync())
                    {
                        rentalStatus = "貸出中";
                        assetNo = rd.IsDBNull(0) ? null : rd.GetString(0);
                        rentalDate = rd.IsDBNull(1) ? null : rd.GetFieldValue<DateTime>(1);
                        dueDate = rd.IsDBNull(2) ? null : rd.GetFieldValue<DateTime>(2);
                    }
                }

                return Ok(new
                {
                    employeeNo = emp,
                    name,
                    rental = new
                    {
                        status = rentalStatus, // "貸出中" | "なし"
                        assetNo,
                        rentalDate,
                        dueDate
                    }
                });
            }
            finally
            {
                if (_connection.State == ConnectionState.Open)
                    await _connection.CloseAsync();
            }
        }

        // ---- /auth/return : 未返却の最新1件を返却扱いに更新 ----
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

                // available_flag は「TRUE=貸出中」を前提。逆運用なら TRUE/FALSE を反転してください。
                const string sql = @"
                    UPDATE trn_rental
                       SET return_date   = CURRENT_DATE,
                           available_flag = TRUE
                     WHERE ctid IN (
                       SELECT ctid
                         FROM trn_rental
                        WHERE employee_no = @emp
                          AND return_date IS NULL
                          AND available_flag = FALSE
                        ORDER BY rental_date DESC
                        LIMIT 1
                     )";
                using var cmd = new NpgsqlCommand(sql, _connection);
                cmd.Parameters.AddWithValue("emp", emp);

                var affected = await cmd.ExecuteNonQueryAsync();
                if (affected == 0)
                    return NotFound(new { message = "返却対象の貸出が見つかりません" });

                return Ok(new { message = "返却完了" });
            }
            finally
            {
                if (_connection.State == ConnectionState.Open)
                    await _connection.CloseAsync();
            }
        }

        // （未使用：必要ならハッシュ関数を再利用できます）
        private static string ComputeSha256Hash(string rawData)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(rawData));
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }
    }
}
