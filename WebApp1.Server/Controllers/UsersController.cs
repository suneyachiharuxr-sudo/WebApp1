using Microsoft.AspNetCore.Mvc;
using Npgsql;
using NpgsqlTypes;

namespace WebApp1.Server.Controllers
{
    [ApiController]
    [Route("users")]
    public class UsersController : ControllerBase
    {
        private readonly NpgsqlConnection _conn;
        public UsersController(NpgsqlConnection conn) => _conn = conn;

        // --- 小ヘルパ ---
        private static string S(NpgsqlDataReader rd, string col)
            => rd.IsDBNull(rd.GetOrdinal(col)) ? "" : rd.GetString(rd.GetOrdinal(col));
        private static int? I(NpgsqlDataReader rd, string col)
            => rd.IsDBNull(rd.GetOrdinal(col)) ? (int?)null : rd.GetInt32(rd.GetOrdinal(col));
        private static DateTime? D(NpgsqlDataReader rd, string col)
            => rd.IsDBNull(rd.GetOrdinal(col)) ? (DateTime?)null : rd.GetDateTime(rd.GetOrdinal(col));
        private static bool B(NpgsqlDataReader rd, string col)
            => !rd.IsDBNull(rd.GetOrdinal(col)) && rd.GetBoolean(rd.GetOrdinal(col));
        private static void Add(NpgsqlCommand cmd, string name, object? value)
            => cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);

        public class UserDto
        {
            public string EmployeeNo { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string? NameKana { get; set; }
            public string? Department { get; set; }
            public string? TelNo { get; set; }
            public string? MailAddress { get; set; }  // DB列は mail_adress
            public int? Age { get; set; }
            public int? Gender { get; set; } // 0:男性,1:女性,2:その他
            public string? Position { get; set; }
            public string? AccountLevel { get; set; }
            public DateTime? RegisterDate { get; set; }
            public DateTime? UpdateDate { get; set; }
            public DateTime? RetireDate { get; set; }
            public bool DeleteFlag { get; set; } = false;
        }

        public class DeleteReq { public string EmployeeNo { get; set; } = string.Empty; }

        // ===== 一覧 =====
        [HttpGet("list")]
        public async Task<IActionResult> List()
        {
            // 見出し「更新日」は update_date、「退職日」は retire_date を返す
            const string sql = @"
SELECT
  employee_no,
  name,
  name_kana,
  tel_no,
  mail_adress   AS mail_address,
  position,
  account_level,
  update_date,

  department,
  age,
  gender,
  retire_date,
  register_date,
  delete_flag
FROM mst_user
ORDER BY employee_no;";

            if (_conn.State != System.Data.ConnectionState.Open) await _conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, _conn);
            using var rd = await cmd.ExecuteReaderAsync();

            var list = new List<object>();
            while (await rd.ReadAsync())
            {
                list.Add(new
                {
                    employeeNo = S(rd, "employee_no"),
                    name = S(rd, "name"),
                    nameKana = S(rd, "name_kana"),
                    telNo = S(rd, "tel_no"),
                    mailAddress = S(rd, "mail_address"),
                    position = S(rd, "position"),
                    accountLevel = S(rd, "account_level"),
                    updateDate = D(rd, "update_date"),     // ← 更新日

                    department = S(rd, "department"),
                    age = I(rd, "age"),
                    gender = I(rd, "gender"),
                    retireDate = D(rd, "retire_date"),     // ← 退職日
                    registerDate = D(rd, "register_date"),
                    deleteFlag = B(rd, "delete_flag"),
                });
            }
            return Ok(list);
        }

        // ===== 新規 =====
        [HttpPost("create")]
        public async Task<IActionResult> Create([FromBody] UserDto u)
        {
            var emp = (u.EmployeeNo ?? "").Trim();
            if (string.IsNullOrEmpty(emp)) return BadRequest(new { message = "社員番号は必須です" });
            if (string.IsNullOrWhiteSpace(u.Name)) return BadRequest(new { message = "氏名は必須です" });

            if (_conn.State != System.Data.ConnectionState.Open) await _conn.OpenAsync();

            // 重複チェック
            using (var chk = new NpgsqlCommand("SELECT 1 FROM mst_user WHERE employee_no=@e", _conn))
            {
                chk.Parameters.AddWithValue("e", emp);
                if (await chk.ExecuteScalarAsync() != null)
                    return Conflict(new { message = "その社員番号は既に存在します" });
            }

            const string sql = @"
INSERT INTO mst_user
(employee_no, name, name_kana, department, tel_no, mail_adress, age, gender,
 position, account_level, register_date, update_date, retire_date, delete_flag)
VALUES
(@employee_no, @name, @name_kana, @department, @tel_no, @mail_adress, @age, @gender,
 @position, @account_level, COALESCE(@register_date, CURRENT_DATE), CURRENT_DATE, @retire_date, COALESCE(@delete_flag, FALSE));";

            using var cmd = new NpgsqlCommand(sql, _conn);
            Add(cmd, "employee_no", emp);
            Add(cmd, "name", u.Name);
            Add(cmd, "name_kana", u.NameKana);
            Add(cmd, "department", u.Department);
            Add(cmd, "tel_no", u.TelNo);
            Add(cmd, "mail_adress", u.MailAddress);
            Add(cmd, "age", u.Age);
            Add(cmd, "gender", u.Gender);
            Add(cmd, "position", u.Position);
            Add(cmd, "account_level", u.AccountLevel);
            Add(cmd, "register_date", u.RegisterDate);
            Add(cmd, "retire_date", u.RetireDate);
            Add(cmd, "delete_flag", u.DeleteFlag);

            await cmd.ExecuteNonQueryAsync();
            return Ok(new { message = "登録しました" });
        }

        // ===== 更新 =====
        [HttpPut("update")]
        public async Task<IActionResult> Update([FromBody] UserDto u)
        {
            var emp = (u.EmployeeNo ?? "").Trim();
            if (string.IsNullOrEmpty(emp)) return BadRequest(new { message = "社員番号は必須です" });
            if (_conn.State != System.Data.ConnectionState.Open) await _conn.OpenAsync();

            const string sql = @"
UPDATE mst_user SET
  name=@name,
  name_kana=@name_kana,
  department=@department,
  tel_no=@tel_no,
  mail_adress=@mail_adress,
  age=@age,
  gender=@gender,
  position=@position,
  account_level=@account_level,
  retire_date=@retire_date,
  delete_flag=COALESCE(@delete_flag, delete_flag),
  update_date=CURRENT_DATE
WHERE employee_no=@employee_no;";

            using var cmd = new NpgsqlCommand(sql, _conn);
            Add(cmd, "employee_no", emp);
            Add(cmd, "name", u.Name);
            Add(cmd, "name_kana", u.NameKana);
            Add(cmd, "department", u.Department);
            Add(cmd, "tel_no", u.TelNo);
            Add(cmd, "mail_adress", u.MailAddress);
            Add(cmd, "age", u.Age);
            Add(cmd, "gender", u.Gender);
            Add(cmd, "position", u.Position);
            Add(cmd, "account_level", u.AccountLevel);
            Add(cmd, "retire_date", u.RetireDate);
            Add(cmd, "delete_flag", u.DeleteFlag);

            var n = await cmd.ExecuteNonQueryAsync();
            if (n == 0) return NotFound(new { message = "対象が見つかりません" });
            return Ok(new { message = "更新しました" });
        }

        // ===== 物理削除 =====
        [HttpPost("delete")]
        public async Task<IActionResult> Delete([FromBody] DeleteReq req)
        {
            var emp = (req.EmployeeNo ?? "").Trim();
            if (string.IsNullOrEmpty(emp)) return BadRequest(new { message = "employeeNo is required" });
            if (_conn.State != System.Data.ConnectionState.Open) await _conn.OpenAsync();

            const string sql = @"DELETE FROM mst_user WHERE employee_no=@e;";
            using var cmd = new NpgsqlCommand(sql, _conn);
            cmd.Parameters.AddWithValue("e", emp);

            try
            {
                var n = await cmd.ExecuteNonQueryAsync();
                if (n == 0) return NotFound(new { message = "対象が見つかりません" });
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.ForeignKeyViolation)
            {
                return Conflict(new { message = "貸出履歴などで参照されているため削除できません（先に返却/整理してください）" });
            }

            return Ok(new { message = "削除しました" });
        }
    }
}
