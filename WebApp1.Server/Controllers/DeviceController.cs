using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Data;

namespace WebApp1.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class DeviceController : ControllerBase
    {
        private readonly NpgsqlConnection _conn;
        public DeviceController(NpgsqlConnection conn) => _conn = conn;

        // DTO
        public class DeviceDto
        {
            public string AssetNo { get; set; } = string.Empty;   // 資産番号（PK）
            public string Maker { get; set; } = string.Empty;
            public string? Os { get; set; }
            public int? MemoryGb { get; set; }
            public int? StorageGb { get; set; }
            public string? Gpu { get; set; }
            public string? Location { get; set; }
            public bool BrokenFlag { get; set; } = false;         // 故障フラグ
            public DateTime? LeaseStart { get; set; }
            public DateTime? LeaseEnd { get; set; }
            public string? Remarks { get; set; }
        }
        public class DeleteDto { public string AssetNo { get; set; } = string.Empty; }

        // 一覧取得（デフォルトは未削除のみ。?includeDeleted=true で全部）
        [HttpGet("list")]
        public async Task<IActionResult> List([FromQuery] bool includeDeleted = false)
        {
            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            var sql = @"
SELECT asset_no, maker, os, memory_gb, storage_gb, gpu, location, broken_flag,
       lease_start, lease_end, remarks, register_date, update_date, delete_flag
  FROM mst_device " + (includeDeleted ? "" : "WHERE delete_flag = FALSE ") + @" 
 ORDER BY asset_no";

            using var cmd = new NpgsqlCommand(sql, _conn);
            using var rd = await cmd.ExecuteReaderAsync();

            var list = new List<object>();
            while (await rd.ReadAsync())
            {
                list.Add(new
                {
                    assetNo = rd.GetString(0),
                    maker = rd.GetString(1),
                    os = rd.IsDBNull(2) ? null : rd.GetString(2),
                    memoryGb = rd.IsDBNull(3) ? (int?)null : rd.GetInt32(3),
                    storageGb = rd.IsDBNull(4) ? (int?)null : rd.GetInt32(4),
                    gpu = rd.IsDBNull(5) ? null : rd.GetString(5),
                    location = rd.IsDBNull(6) ? null : rd.GetString(6),
                    brokenFlag = rd.GetBoolean(7),
                    leaseStart = rd.IsDBNull(8) ? (DateTime?)null : rd.GetDateTime(8),
                    leaseEnd = rd.IsDBNull(9) ? (DateTime?)null : rd.GetDateTime(9),
                    remarks = rd.IsDBNull(10) ? null : rd.GetString(10),
                    registerDate = rd.IsDBNull(11) ? (DateTime?)null : rd.GetDateTime(11),
                    updateDate = rd.IsDBNull(12) ? (DateTime?)null : rd.GetDateTime(12),
                    deleteFlag = rd.GetBoolean(13)
                });
            }
            return Ok(list);
        }

        // 新規作成
        [HttpPost("create")]
        public async Task<IActionResult> Create([FromBody] DeviceDto d)
        {
            var asset = (d.AssetNo ?? "").Trim();
            if (string.IsNullOrEmpty(asset)) return BadRequest(new { message = "資産番号は必須です" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();
            using var tx = await _conn.BeginTransactionAsync();

            // 存在チェック
            using (var chk = new NpgsqlCommand("SELECT 1 FROM mst_device WHERE asset_no=@a", _conn, (NpgsqlTransaction)tx))
            {
                chk.Parameters.AddWithValue("a", asset);
                if (await chk.ExecuteScalarAsync() != null)
                    return Conflict(new { message = "その資産番号は既に存在します" });
            }

            var sql = @"
INSERT INTO mst_device
(asset_no, maker, os, memory_gb, storage_gb, gpu, location, broken_flag, 
 lease_start, lease_end, remarks, register_date, update_date, delete_flag)
VALUES
(@asset_no, @maker, @os, @memory_gb, @storage_gb, @gpu, @location, @broken_flag,
 @lease_start, @lease_end, @remarks, CURRENT_DATE, CURRENT_DATE, FALSE)";
            using (var cmd = new NpgsqlCommand(sql, _conn, (NpgsqlTransaction)tx))
            {
                Add(cmd, "asset_no", asset);
                Add(cmd, "maker", d.Maker);
                Add(cmd, "os", d.Os);
                Add(cmd, "memory_gb", d.MemoryGb);
                Add(cmd, "storage_gb", d.StorageGb);
                Add(cmd, "gpu", d.Gpu);
                Add(cmd, "location", d.Location);
                Add(cmd, "broken_flag", d.BrokenFlag);
                Add(cmd, "lease_start", d.LeaseStart);
                Add(cmd, "lease_end", d.LeaseEnd);
                Add(cmd, "remarks", d.Remarks);
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
            return Ok(new { message = "登録しました" });
        }

        // 更新（資産番号で上書き）
        [HttpPut("update")]
        public async Task<IActionResult> Update([FromBody] DeviceDto d)
        {
            var asset = (d.AssetNo ?? "").Trim();
            if (string.IsNullOrEmpty(asset)) return BadRequest(new { message = "資産番号は必須です" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            var sql = @"
UPDATE mst_device SET
  maker=@maker, os=@os, memory_gb=@memory_gb, storage_gb=@storage_gb,
  gpu=@gpu, location=@location, broken_flag=@broken_flag,
  lease_start=@lease_start, lease_end=@lease_end, remarks=@remarks,
  update_date=CURRENT_DATE
WHERE asset_no=@asset_no AND delete_flag=FALSE";
            using var cmd = new NpgsqlCommand(sql, _conn);
            Add(cmd, "asset_no", asset);
            Add(cmd, "maker", d.Maker);
            Add(cmd, "os", d.Os);
            Add(cmd, "memory_gb", d.MemoryGb);
            Add(cmd, "storage_gb", d.StorageGb);
            Add(cmd, "gpu", d.Gpu);
            Add(cmd, "location", d.Location);
            Add(cmd, "broken_flag", d.BrokenFlag);
            Add(cmd, "lease_start", d.LeaseStart);
            Add(cmd, "lease_end", d.LeaseEnd);
            Add(cmd, "remarks", d.Remarks);

            var n = await cmd.ExecuteNonQueryAsync();
            if (n == 0) return NotFound(new { message = "対象が見つかりません（削除済の可能性）" });
            return Ok(new { message = "更新しました" });
        }

        // 論理削除
        [HttpPost("delete")]
        public async Task<IActionResult> Delete([FromBody] DeleteDto req)
        {
            var asset = (req.AssetNo ?? "").Trim();
            if (string.IsNullOrEmpty(asset)) return BadRequest(new { message = "assetNo is required" });

            if (_conn.State != ConnectionState.Open) await _conn.OpenAsync();

            var sql = @"UPDATE mst_device SET delete_flag=TRUE, update_date=CURRENT_DATE WHERE asset_no=@a AND delete_flag=FALSE";
            using var cmd = new NpgsqlCommand(sql, _conn);
            cmd.Parameters.AddWithValue("a", asset);
            var n = await cmd.ExecuteNonQueryAsync();
            if (n == 0) return NotFound(new { message = "対象が見つかりません（既に削除済）" });
            return Ok(new { message = "削除しました" });
        }

        private static void Add(NpgsqlCommand cmd, string name, object? value)
            => cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
    }
}
