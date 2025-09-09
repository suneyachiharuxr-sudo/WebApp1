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

        // 一覧：資産1行 + TRN_RENTAL(資産1行) を素直に左結合
        // 「現在貸出中」= return_date IS NULL AND available_flag = FALSE AND employee_no IS NOT NULL
        [HttpGet("list")]
        public async Task<IActionResult> List()
        {
            const string sql = @"
SELECT
  ROW_NUMBER() OVER (ORDER BY d.asset_no) AS no,
  d.asset_no,
  d.maker,
  d.os,
  d.location,
  CASE WHEN (r.return_date IS NULL AND r.available_flag = FALSE AND r.employee_no IS NOT NULL)
       THEN r.employee_no END AS employee_no,
  CASE WHEN (r.return_date IS NULL AND r.available_flag = FALSE AND r.employee_no IS NOT NULL)
       THEN u.name END        AS employee_name,
  r.rental_date,
  r.return_date,
  r.due_date,
  -- TRUE=空き / FALSE=貸出中
  (NOT (r.return_date IS NULL AND r.available_flag = FALSE AND r.employee_no IS NOT NULL)) AS is_free
FROM mst_device d
LEFT JOIN trn_rental r ON r.asset_no = d.asset_no
LEFT JOIN mst_user   u ON u.employee_no = r.employee_no
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
                    isFree = rd.GetBoolean(rd.GetOrdinal("is_free"))
                });
            }
            return Ok(list);
        }

        public record RentReq(string AssetNo, string EmployeeNo);

        // 貸出：行をINSERTしない。既存の資産行を「貸出中」にUPDATE
        [HttpPost("rent")]
        public async Task<IActionResult> Rent([FromBody] RentReq req)
        {
            if (string.IsNullOrWhiteSpace(req.AssetNo)) return BadRequest(new { message = "assetNo is required" });
            if (string.IsNullOrWhiteSpace(req.EmployeeNo)) return BadRequest(new { message = "employeeNo is required" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            // 既に貸出中なら弾く（一覧と同じ定義）
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

            // 貸出に更新（空き状態を前提に上書き）
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

        public record ReturnReq(string AssetNo);

        // 返却：現在貸出中の行を返却に更新
        [HttpPost("return")]
        public async Task<IActionResult> Return([FromBody] ReturnReq req)
        {
            if (string.IsNullOrWhiteSpace(req.AssetNo))
                return BadRequest(new { message = "assetNo is required" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            const string upd = @"
UPDATE trn_rental
SET return_date    = NOW(),
    available_flag = TRUE
WHERE asset_no     = @asset
  AND return_date IS NULL
  AND available_flag = FALSE;";
            using var ucmd = new NpgsqlCommand(upd, _conn);
            ucmd.Parameters.AddWithValue("asset", req.AssetNo.Trim());
            var n = await ucmd.ExecuteNonQueryAsync();
            if (n == 0)
                return NotFound(new { message = "返却対象がありません（すでに空きor行が未作成）" });

            return Ok(new { message = "返却しました" });
        }
    }
}
