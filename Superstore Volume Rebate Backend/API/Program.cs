using FixedAssets_WS.Classes;
using DataService.DataAccess;
using DataService.Engines.Authentication;
using DataService.Others;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

foreach (var entry in builder.Configuration.GetSection("ConnectionStrings").GetChildren())
{
    var value = entry.Value;
    if (string.IsNullOrWhiteSpace(value)) continue;


    // Plain connection strings (contain '=') are used as-is; anything else is treated as encrypted.
    if (value.Contains('=')) continue;
    var decrypted = EncDec.DecryptConnectionString(value);


    if (!string.IsNullOrWhiteSpace(decrypted))
        builder.Configuration[entry.Path] = decrypted;
}
// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddControllers(options =>
{
    options.Filters.Add(new GlobalExceptionFilter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();
builder.Services.Configure<Jwt>(builder.Configuration.GetSection("Jwt"));
builder.Services.AddScoped<AuthenticationEngine>();
builder.Services.AddScoped<AutDAL>();

var app = builder.Build();

app.UseCors(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());



// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
//app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
