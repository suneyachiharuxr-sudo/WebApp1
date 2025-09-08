using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Data;

namespace WebApp1.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class RentalsController : ControllerBase
    {
        private readonly NpgsqlConnection _conn;
        public RentalsController(NpgsqlConnection conn) => _conn = conn;

        // ===== DTO =====
        public class RentRequest
        {
            public string AssetNo { get; set; } = string.Empty;
            public string EmployeeNo { get; set; } = string.Empty;
            public string EmployeeName { get; set; } = string.Empty;
            public DateTime? DueDate { get; set; } // 返却締切日
        }

        public class ReturnRequest
        {
            public string AssetNo { get; set; } = string.Empty;
        }

        // ===== 一覧（貸出状況） =====
        // 例: GET /rentals/list?keyword=DELL&onlyBorrowed=true
        [HttpGet("list")]
        public async Task<IActionResult> List([FromQuery] string? keyword = null, [FromQuery] bool onlyBorrowed = false)
        {
            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            // 空き/使用中を trn_rental.available で管理。レコード未存在は未貸出＝available=true扱い。
            var sql = @"
SELECT 
  d.asset_no,
  d.maker,
  d.os,
  d.location,
  COALESCE(r.available, TRUE) AS available,   -- レコード無=空き
  r.employee_no,
  r.employee_name,
  r.rental_date,
  r.return_date,
  r.due_date
FROM mst_device d
LEFT JOIN trn_rental r ON r.asset_no = d.asset_no
WHERE d.delete_flag = FALSE
";

            // 検索条件
            var where = new List<string>();
            if (!string.IsNullOrWhiteSpace(keyword))
            {
                where.Add(@"(
  d.asset_no ILIKE @kw
 OR d.maker   ILIKE @kw
 OR d.os      ILIKE @kw
 OR d.location ILIKE @kw
 OR COALESCE(r.employee_name,'') ILIKE @kw
)");
            }
            if (onlyBorrowed)
            {
                where.Add(@"COALESCE(r.available, TRUE) = FALSE");
            }
            if (where.Count > 0)
            {
                sql += " AND " + string.Join(" AND ", where) + "\n";
            }

            sql += "ORDER BY d.asset_no";

            using var cmd = new NpgsqlCommand(sql, _conn);
            if (!string.IsNullOrWhiteSpace(keyword))
                cmd.Parameters.AddWithValue("kw", $"%{keyword.Trim()}%");

            var rows = new List<object>();
            using var rd = await cmd.ExecuteReaderAsync();
            while (await rd.ReadAsync())
            {
                rows.Add(new
                {
                    assetNo = rd.GetString(0),
                    maker = rd.GetString(1),
                    os = rd.IsDBNull(2) ? null : rd.GetString(2),
                    location = rd.IsDBNull(3) ? null : rd.GetString(3),
                    isFree = rd.GetBoolean(4), // 空き=true
                    employeeNo = rd.IsDBNull(5) ? null : rd.GetString(5),
                    employeeName = rd.IsDBNull(6) ? null : rd.GetString(6),
                    rentalDate = rd.IsDBNull(7) ? (DateTime?)null : rd.GetDateTime(7),
                    returnDate = rd.IsDBNull(8) ? (DateTime?)null : rd.GetDateTime(8),
                    dueDate = rd.IsDBNull(9) ? (DateTime?)null : rd.GetDateTime(9)
                });
            }
            return Ok(rows);
        }

        // ===== 資産番号クリック → 詳細（モーダル用） =====
        // 例: GET /rentals/asset/A19-06-001
        [HttpGet("asset/{assetNo}")]
        public async Task<IActionResult> GetAssetDetail([FromRoute] string assetNo)
        {
            if (string.IsNullOrWhiteSpace(assetNo)) return BadRequest(new { message = "assetNo is required" });
            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            var sql = @"
SELECT 
  d.asset_no, d.maker, d.os, d.memory_gb, d.storage_gb, d.gpu, d.location, d.broken_flag,
  d.remarks, d.register_date,
  COALESCE(r.available, TRUE) AS available,
  r.employee_no, r.employee_name, r.rental_date, r.return_date, r.due_date
FROM mst_device d
LEFT JOIN trn_rental r ON r.asset_no = d.asset_no
WHERE d.delete_flag = FALSE AND d.asset_no = @a
";
            using var cmd = new NpgsqlCommand(sql, _conn);
            cmd.Parameters.AddWithValue("a", assetNo.Trim());

            using var rd = await cmd.ExecuteReaderAsync();
            if (!await rd.ReadAsync()) return NotFound(new { message = "機器が見つかりません" });

            var res = new
            {
                assetNo = rd.GetString(0),
                maker = rd.GetString(1),
                os = rd.IsDBNull(2) ? null : rd.GetString(2),
                memoryGb = rd.IsDBNull(3) ? (int?)null : rd.GetInt32(3),
                storageGb = rd.IsDBNull(4) ? (int?)null : rd.GetInt32(4),
                gpu = rd.IsDBNull(5) ? null : rd.GetString(5),
                location = rd.IsDBNull(6) ? null : rd.GetString(6),
                brokenFlag = rd.GetBoolean(7),
                remarks = rd.IsDBNull(8) ? null : rd.GetString(8),
                registerDate = rd.IsDBNull(9) ? (DateTime?)null : rd.GetDateTime(9),
                isFree = rd.GetBoolean(10),
                employeeNo = rd.IsDBNull(11) ? null : rd.GetString(11),
                employeeName = rd.IsDBNull(12) ? null : rd.GetString(12),
                rentalDate = rd.IsDBNull(13) ? (DateTime?)null : rd.GetDateTime(13),
                returnDate = rd.IsDBNull(14) ? (DateTime?)null : rd.GetDateTime(14),
                dueDate = rd.IsDBNull(15) ? (DateTime?)null : rd.GetDateTime(15)
            };
            return Ok(res);
        }

        // ===== 貸出 =====
        // body: { assetNo, employeeNo, employeeName, dueDate }
        [HttpPost("rent")]
        public async Task<IActionResult> Rent([FromBody] RentRequest req)
        {
            var asset = (req.AssetNo ?? "").Trim();
            if (string.IsNullOrEmpty(asset)) return BadRequest(new { message = "assetNo is required" });
            if (string.IsNullOrWhiteSpace(req.EmployeeNo) || string.IsNullOrWhiteSpace(req.EmployeeName))
                return BadRequest(new { message = "社員番号と社員氏名は必須です" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();
            await using var tx = await _conn.BeginTransactionAsync();

            // 存在確認 + 削除済みチェック
            using (var chk = new NpgsqlCommand("SELECT 1 FROM mst_device WHERE asset_no=@a AND delete_flag=FALSE", _conn, (NpgsqlTransaction)tx))
            {
                chk.Parameters.AddWithValue("a", asset);
                if (await chk.ExecuteScalarAsync() == null)
                    return NotFound(new { message = "機器が見つかりません（削除済み含む）" });
            }

            // 現況確認（既に貸出中なら弾く）
            bool isFree = true;
            using (var cur = new NpgsqlCommand("SELECT available FROM trn_rental WHERE asset_no=@a FOR UPDATE", _conn, (NpgsqlTransaction)tx))
            {
                cur.Parameters.AddWithValue("a", asset);
                var v = await cur.ExecuteScalarAsync();
                if (v != null) isFree = (bool)v;
            }
            if (!isFree) return Conflict(new { message = "この機器は既に貸出中です" });

            // upsert（未登録ならINSERT、あればUPDATE）
            var sql = @"
INSERT INTO trn_rental(asset_no, available, employee_no, employee_name, rental_date, return_date, due_date)
VALUES (@a, FALSE, @eno, @ename, CURRENT_TIMESTAMP, NULL, @due)
ON CONFLICT (asset_no) DO UPDATE SET
  available = EXCLUDED.available,
  employee_no = EXCLUDED.employee_no,
  employee_name = EXCLUDED.employee_name,
  rental_date = EXCLUDED.rental_date,
  return_date = EXCLUDED.return_date,
  due_date = EXCLUDED.due_date
";
            using (var cmd = new NpgsqlCommand(sql, _conn, (NpgsqlTransaction)tx))
            {
                cmd.Parameters.AddWithValue("a", asset);
                cmd.Parameters.AddWithValue("eno", req.EmployeeNo.Trim());
                cmd.Parameters.AddWithValue("ename", req.EmployeeName.Trim());
                cmd.Parameters.AddWithValue("due", (object?)req.DueDate ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
            return Ok(new { message = "貸出処理を登録しました" });
        }

        // ===== 返却 =====
        // body: { assetNo }
        [HttpPost("return")]
        public async Task<IActionResult> Return([FromBody] ReturnRequest req)
        {
            var asset = (req.AssetNo ?? "").Trim();
            if (string.IsNullOrEmpty(asset)) return BadRequest(new { message = "assetNo is required" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();
            await using var tx = await _conn.BeginTransactionAsync();

            var sql = @"
UPDATE trn_rental
   SET available = TRUE,
       return_date = CURRENT_TIMESTAMP
 WHERE asset_no = @a AND COALESCE(available, TRUE) = FALSE";
            using var cmd = new NpgsqlCommand(sql, _conn, (NpgsqlTransaction)tx);
            cmd.Parameters.AddWithValue("a", asset);
            var n = await cmd.ExecuteNonQueryAsync();
            if (n == 0)
                return NotFound(new { message = "貸出中のレコードが見つかりません" });

            await tx.CommitAsync();
            return Ok(new { message = "返却処理を登録しました" });
        }
    }
}
