using FixedAssets_WS.Classes;
using DataService.DataAccess;
using DataService.Engine;
using DataService.Engines.Authentication;
using DataService.Models;
using DataService.Others;
using Main.Middleware;
using Main.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.IdentityModel.Tokens;
using System.Text;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);


// Decrypt connection strings at startup
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

// Request timeouts
builder.Services.AddRequestTimeouts(o =>
{
    o.DefaultPolicy = new RequestTimeoutPolicy { Timeout = TimeSpan.FromMinutes(2) };
});
// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowSSE", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("_auth");
    });
});

// Add services to the container.

builder.Services.AddControllers(options =>
{
    options.Filters.Add(new GlobalExceptionFilter());
    options.Filters.Add(new AuthorizeFilter());
});


builder.Services.AddScoped<AuthenticationEngine>();


// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();

builder.Services.AddHttpContextAccessor();

builder.Services.AddScoped<UserTenantContextProvider>();
builder.Services.AddScoped<JWTTokenProvider>();

builder.Services.AddScoped<COM_UserInfo>();
builder.Services.AddScoped<AutDAL>();

//Sales Volume Rebate
builder.Services.AddScoped<COM_CurrencyDAL>();
builder.Services.AddScoped<COM_CompanyDAL>();
builder.Services.AddScoped<Com_CurrencyEngine>();

builder.Services.AddScoped<COM_DailyRateDAL>();
builder.Services.AddScoped<CVRDailyRatesEngine>();

builder.Services.AddScoped<CVRTypeDAL>();
builder.Services.AddScoped<CVRTypeEngine>();

builder.Services.AddScoped<CVRComputationTypeDAL>();
builder.Services.AddScoped<CVRComputationTypeEngine>();

builder.Services.AddScoped<CVRSettlementTypeDAL>();
builder.Services.AddScoped<CVRSettlementTypeEngine>();

builder.Services.AddScoped<CVRContractDAL>();
builder.Services.AddScoped<CVRContractEngine>();

builder.Services.AddScoped<CVRContractClientDAL>();
builder.Services.AddScoped<CVRContractClientEngine>();

builder.Services.AddScoped<ClientsDAL>();
builder.Services.AddScoped<CVRLookupsDAL>();

builder.Services.AddScoped<CVRPlanWorkspaceDAL>();
builder.Services.AddScoped<CVRPlanWorkspaceEngine>();

builder.Services.AddScoped<CVRComputationDAL>();
builder.Services.AddScoped<CVRComputationEngine>();

builder.Services.AddScoped<CVRSettlementPaymentDAL>();
builder.Services.AddScoped<CVRSettlementPaymentEngine>();

builder.Services.AddScoped<CVRSavedComputationDAL>();
builder.Services.AddScoped<CVRSavedComputationEngine>();

//end of sales volume rebate

builder.Services.Configure<Jwt>(builder.Configuration.GetSection("Jwt"));

var JwtConfig = builder.Configuration.GetSection("Jwt");

var signingKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(JwtConfig["Key"]));
var tokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuerSigningKey = true,
    IssuerSigningKey = signingKey,
    ValidateIssuer = true,
    ValidIssuer = JwtConfig["Issuer"],
    ValidateAudience = true,
    ValidAudience = JwtConfig["Audience"],
    ValidateLifetime = true,
    ClockSkew = TimeSpan.Zero,
    RequireExpirationTime = true,
};

builder.Services.AddAuthentication(o =>
{
    o.DefaultAuthenticateScheme = "TestKey";
})
.AddJwtBearer("TestKey", x =>
{
    x.RequireHttpsMetadata = false;
    x.TokenValidationParameters = tokenValidationParameters;
    x.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            Console.WriteLine($"Authentication failed: {context.Exception}");
            return Task.CompletedTask;
        },
        OnTokenValidated = context =>
        {
            Console.WriteLine("Token successfully validated");
            Console.WriteLine($"User: {context.Principal.Identity.Name}");
            Console.WriteLine($"Claims: {string.Join(", ", context.Principal.Claims.Select(c => $"{c.Type}={c.Value}"))}");
            return Task.CompletedTask;
        },
        OnMessageReceived = context =>
        {
            Console.WriteLine($"Token received: {context.Token}");
            return Task.CompletedTask;
        },
        OnChallenge = context =>
        {
            Console.WriteLine($"Challenge issued: {context.Error} - {context.ErrorDescription}");
            return Task.CompletedTask;
        }
    };
});


var app = builder.Build();
app.UseCors("AllowSSE");

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

//app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TokenRefreshMiddleware>();
app.MapControllers();


app.Run();
