using Npgsql;
using System.Text.Json;
using System.Text.Encodings.Web;
using System.Text.Unicode;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // ���{��iUTF-8�j�𐳂����������邽�߂̐ݒ�
        options.JsonSerializerOptions.Encoder = JavaScriptEncoder.Create(UnicodeRanges.All);
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    });

// PostgreSQL�ڑ��T�[�r�X��ǉ�
// appsettings.json�Ȃǂ���ڑ���������擾����������ǂ����@�ł�
string connString = "Host=localhost;Username=postgres;Password=Hainef6love;Database=pc_rental_db";
builder.Services.AddScoped<NpgsqlConnection>(_ => new NpgsqlConnection(connString));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Swagger�����S�ɖ������i�J�����ł��N�����Ȃ��j
// Configure the HTTP request pipeline.
 if (app.Environment.IsDevelopment())
 {
    app.UseDeveloperExceptionPage();   // �� �ǉ��F500 �̒��g���u���E�U/���O�ɏo��
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();
