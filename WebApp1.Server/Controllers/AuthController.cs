using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Data;

namespace WebApp1.Server.Controllers
{
    [ApiController]
    [Route("auth")] // ← フロントの呼び出しに合わせて固定
    public class AuthController : ControllerBase
    {
        private readonly NpgsqlConnection _conn;
        public AuthController(NpgsqlConnection conn) => _conn = conn;

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
        public class PwRequest
        {
            public string EmployeeNo { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        // ---------- 追加1: パスワード済みか確認 ----------
        // GET /auth/exists?employeeNo=A1001
        [HttpGet("exists")]
        public async Task<IActionResult> Exists([FromQuery] string employeeNo)
        {
            var emp = (employeeNo ?? "").Trim();
            if (string.IsNullOrEmpty(emp)) return BadRequest(new { message = "employeeNo is required" });

            try
            {
                if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();
                using var cmd = new NpgsqlCommand("SELECT 1 FROM auth_user WHERE employee_no=@e LIMIT 1", _conn);
                cmd.Parameters.AddWithValue("e", emp);
                var exists = await cmd.ExecuteScalarAsync() != null;
                return Ok(new { exists });
            }
            finally
            {
                if (_conn.State == ConnectionState.Open) await _conn.CloseAsync();
            }
        }

        // ---------- 追加2: パスワード登録/上書き（平文保存） ----------
        // POST /auth/set-password  { employeeNo, password }
        [HttpPost("set-password")]
        public async Task<IActionResult> SetPassword([FromBody] PwRequest req)
        {
            var emp = (req.EmployeeNo ?? "").Trim();
            var pw = (req.Password ?? "");

            if (string.IsNullOrEmpty(emp)) return BadRequest(new { message = "社員番号が未指定です" });
            if (string.IsNullOrWhiteSpace(pw)) return BadRequest(new { message = "パスワードを入力してください" });
            if (pw.Length < 4) return BadRequest(new { message = "4文字以上で入力してください" });

            try
            {
                if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

                // MST_USER に存在確認
                using (var chk = new NpgsqlCommand("SELECT 1 FROM mst_user WHERE employee_no=@e", _conn))
                {
                    chk.Parameters.AddWithValue("e", emp);
                    if (await chk.ExecuteScalarAsync() == null)
                        return NotFound(new { message = "対象ユーザーが見つかりません" });
                }

                const string upsert = @"
INSERT INTO auth_user(employee_no, password_hash)
VALUES(@e, @p)
ON CONFLICT (employee_no)
DO UPDATE SET password_hash = EXCLUDED.password_hash;";

                using var cmd = new NpgsqlCommand(upsert, _conn);
                cmd.Parameters.AddWithValue("e", emp);
                cmd.Parameters.AddWithValue("p", pw); // 平文で保存
                await cmd.ExecuteNonQueryAsync();

                return Ok(new { message = "パスワードを登録しました" });
            }
            finally
            {
                if (_conn.State == ConnectionState.Open) await _conn.CloseAsync();
            }
        }

        // ---------- 既存：平文ログイン（開発用） ----------
        // POST /auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest login)
        {
            var emp = (login.EmployeeNo ?? "").Trim();
            var pass = (login.Password ?? "").Trim();
            if (emp.Length == 0 || pass.Length == 0)
                return Unauthorized(new { message = "IDまたはパスワードが正しくありません" });

            try
            {
                if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

                const string sql = @"SELECT password_hash FROM auth_user WHERE employee_no=@e";
                using var cmd = new NpgsqlCommand(sql, _conn);
                cmd.Parameters.AddWithValue("e", emp);

                using var rd = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow);
                if (!await rd.ReadAsync())
                    return Unauthorized(new { message = "IDまたはパスワードが正しくありません" });

                var dbValue = rd.IsDBNull(0) ? null : rd.GetString(0)?.Trim();
                if (!string.Equals(dbValue, pass, StringComparison.Ordinal))
                    return Unauthorized(new { message = "IDまたはパスワードが正しくありません" });

                return Ok(new { message = "ログイン成功", employeeNo = emp });
            }
            finally
            {
                if (_conn.State == ConnectionState.Open) await _conn.CloseAsync();
            }
        }

        // ---------- 既存：本人情報＋最新の貸出 ----------
        // GET /auth/me?employeeNo=A1001
        [HttpGet("me")]
        public async Task<IActionResult> Me([FromQuery] string employeeNo)
        {
            if (string.IsNullOrWhiteSpace(employeeNo))
                return BadRequest(new { message = "employeeNo is required" });

            var emp = employeeNo.Trim();

            try
            {
                if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

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

                using var cmd = new NpgsqlCommand(sql, _conn);
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
                if (_conn.State == ConnectionState.Open) await _conn.CloseAsync();
            }
        }

        // ---------- 既存：返却 ----------
        // POST /auth/return  { employeeNo }
        [HttpPost("return")]
        public async Task<IActionResult> Return([FromBody] ReturnRequest req)
        {
            var emp = (req.EmployeeNo ?? "").Trim();
            if (string.IsNullOrEmpty(emp))
                return BadRequest(new { message = "employeeNo is required" });

            try
            {
                if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

                const string pickSql = @"
SELECT rental_id
FROM trn_rental
WHERE employee_no = @emp
  AND return_date IS NULL
  AND available_flag = FALSE
ORDER BY rental_date DESC, rental_id DESC
LIMIT 1;";
                long? rentalId = null;
                using (var pick = new NpgsqlCommand(pickSql, _conn))
                {
                    pick.Parameters.AddWithValue("emp", emp);
                    var o = await pick.ExecuteScalarAsync();
                    if (o is long l) rentalId = l;
                    else if (o is int i) rentalId = i;
                }
                if (rentalId is null)
                    return NotFound(new { message = "返却対象の貸出が見つかりません" });

                const string updSql = @"
UPDATE trn_rental
SET return_date    = NOW(),
    available_flag = TRUE
WHERE rental_id    = @rid;";
                using var upd = new NpgsqlCommand(updSql, _conn);
                upd.Parameters.AddWithValue("rid", rentalId.Value);

                var affected = await upd.ExecuteNonQueryAsync();
                if (affected == 0)
                    return NotFound(new { message = "返却更新に失敗しました" });

                return Ok(new { message = "返却完了" });
            }
            finally
            {
                if (_conn.State == ConnectionState.Open) await _conn.CloseAsync();
            }
        }
    }
}
