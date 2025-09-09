using Npgsql;
using System.Text.Json;
using System.Text.Encodings.Web;
using System.Text.Unicode;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // 日本語（UTF-8）を正しく処理するための設定
        options.JsonSerializerOptions.Encoder = JavaScriptEncoder.Create(UnicodeRanges.All);
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    });

// PostgreSQL接続サービスを追加
// appsettings.jsonなどから接続文字列を取得する方がより良い方法です
string connString = "Host=localhost;Username=postgres;Password=Hainef6love;Database=pc_rental_db";
builder.Services.AddScoped<NpgsqlConnection>(_ => new NpgsqlConnection(connString));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Swaggerを完全に無効化（開発環境でも起動しない）
// Configure the HTTP request pipeline.
 if (app.Environment.IsDevelopment())
 {
    app.UseDeveloperExceptionPage();   // ★ 追加：500 の中身をブラウザ/ログに出す
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();
