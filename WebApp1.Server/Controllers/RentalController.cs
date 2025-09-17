using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Data;

namespace WebApp1.Server.Controllers
{
    [ApiController]
    [Route("rentals")]
    public class RentalsController : ControllerBase
    {
        private readonly NpgsqlConnection _conn;
        public RentalsController(NpgsqlConnection conn) => _conn = conn;

        // 一覧：各資産の“直近の貸出行”をそのまま表示（返却済でも誰が借りてたか残す）
        [HttpGet("list")]
        public async Task<IActionResult> List()
        {
            const string sql = @"
WITH latest AS (
  SELECT DISTINCT ON (asset_no)
         rental_id, asset_no, employee_no, rental_date, return_date, due_date, available_flag
  FROM trn_rental
  ORDER BY asset_no, rental_date DESC, rental_id DESC
)
SELECT
  ROW_NUMBER() OVER (ORDER BY d.asset_no) AS no,
  d.asset_no,
  d.maker,
  d.os,
  d.location,
  l.employee_no,
  u.name AS employee_name,
  l.rental_date,
  l.return_date,
  l.due_date,
  (l.return_date IS NOT NULL OR l.available_flag = TRUE) AS is_free
FROM mst_device d
LEFT JOIN latest     l ON l.asset_no = d.asset_no
LEFT JOIN mst_user   u ON u.employee_no = l.employee_no
WHERE d.delete_flag = FALSE
ORDER BY d.asset_no;";

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();
            using var cmd = new NpgsqlCommand(sql, _conn);
            using var rd = await cmd.ExecuteReaderAsync();

            var list = new List<object>();
            while (await rd.ReadAsync())
            {
                list.Add(new
                {
                    no = rd.GetInt32(rd.GetOrdinal("no")),
                    assetNo = rd.GetString(rd.GetOrdinal("asset_no")),
                    maker = rd.IsDBNull(rd.GetOrdinal("maker")) ? "" : rd.GetString(rd.GetOrdinal("maker")),
                    os = rd.IsDBNull(rd.GetOrdinal("os")) ? "" : rd.GetString(rd.GetOrdinal("os")),
                    location = rd.IsDBNull(rd.GetOrdinal("location")) ? "" : rd.GetString(rd.GetOrdinal("location")),
                    employeeNo = rd.IsDBNull(rd.GetOrdinal("employee_no")) ? null : rd.GetString(rd.GetOrdinal("employee_no")),
                    employeeName = rd.IsDBNull(rd.GetOrdinal("employee_name")) ? null : rd.GetString(rd.GetOrdinal("employee_name")),
                    rentalDate = rd.IsDBNull(rd.GetOrdinal("rental_date")) ? (DateTime?)null : rd.GetDateTime(rd.GetOrdinal("rental_date")),
                    returnDate = rd.IsDBNull(rd.GetOrdinal("return_date")) ? (DateTime?)null : rd.GetDateTime(rd.GetOrdinal("return_date")),
                    dueDate = rd.IsDBNull(rd.GetOrdinal("due_date")) ? (DateTime?)null : rd.GetDateTime(rd.GetOrdinal("due_date")),
                    isFree = rd.IsDBNull(rd.GetOrdinal("is_free")) ? true : rd.GetBoolean(rd.GetOrdinal("is_free"))
                });
            }
            return Ok(list);
        }

        public record RentReq(string AssetNo, string EmployeeNo);

        // 貸出：既存行を“貸出中”に更新（同一資産の未返却があれば409）
        [HttpPost("rent")]
        public async Task<IActionResult> Rent([FromBody] RentReq req)
        {
            if (string.IsNullOrWhiteSpace(req.AssetNo)) return BadRequest(new { message = "assetNo is required" });
            if (string.IsNullOrWhiteSpace(req.EmployeeNo)) return BadRequest(new { message = "employeeNo is required" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            // 既に貸出中なら弾く
            const string chk = @"
SELECT 1
FROM trn_rental
WHERE asset_no = @asset
  AND return_date IS NULL
  AND available_flag = FALSE
  AND employee_no IS NOT NULL
LIMIT 1;";
            using (var c = new NpgsqlCommand(chk, _conn))
            {
                c.Parameters.AddWithValue("asset", req.AssetNo.Trim());
                var exists = await c.ExecuteScalarAsync();
                if (exists != null) return Conflict(new { message = "この資産は未返却の貸出が存在します" });
            }

            // 貸出に更新
            const string upd = @"
UPDATE trn_rental
SET employee_no   = @emp,
    rental_date   = CURRENT_DATE,
    return_date   = NULL,
    due_date      = CURRENT_DATE + INTERVAL '7 days',
    inventory_date= CURRENT_DATE,
    remarks       = COALESCE(remarks, ''),
    available_flag= FALSE
WHERE asset_no = @asset;";
            using (var u = new NpgsqlCommand(upd, _conn))
            {
                u.Parameters.AddWithValue("asset", req.AssetNo.Trim());
                u.Parameters.AddWithValue("emp", req.EmployeeNo.Trim());
                var n = await u.ExecuteNonQueryAsync();
                if (n == 0)
                    return NotFound(new { message = "資産番号が見つかりません（TRN_RENTALに初期行を用意してください）" });
            }

            return Ok(new { message = "貸出しました" });
        }

        // ★ 変更：本人しか返却できないようにする
        public record ReturnReq(string AssetNo, string EmployeeNo);

        // 返却：現在貸出中 かつ 借りている本人に一致する行のみ返却OK
        [HttpPost("return")]
        public async Task<IActionResult> Return([FromBody] ReturnReq req)
        {
            if (string.IsNullOrWhiteSpace(req.AssetNo))
                return BadRequest(new { message = "assetNo is required" });
            if (string.IsNullOrWhiteSpace(req.EmployeeNo))
                return BadRequest(new { message = "employeeNo is required" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            const string upd = @"
UPDATE trn_rental
SET return_date    = NOW(),
    available_flag = TRUE
WHERE asset_no     = @asset
  AND return_date IS NULL
  AND available_flag = FALSE
  AND employee_no = @emp;";
            using var ucmd = new NpgsqlCommand(upd, _conn);
            ucmd.Parameters.AddWithValue("asset", req.AssetNo.Trim());
            ucmd.Parameters.AddWithValue("emp", req.EmployeeNo.Trim());

            var n = await ucmd.ExecuteNonQueryAsync();
            if (n == 0)
            {
                // 借りている本人でない or そもそも貸出中でない
                return Forbid(); // 403
            }

            return Ok(new { message = "返却しました" });
        }
    }
}
