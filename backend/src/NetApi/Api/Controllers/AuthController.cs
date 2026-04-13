using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using NetApi.Domain;
using NetApi.Infrastructure.Persistence;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;

namespace NetApi.Api.Controllers
{
    [Route("api/auth")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        public class LoginRequest
        {
            public string Username { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class AuthResponse
        {
            public bool Success { get; set; }
            public string? Token { get; set; }
            public string? Error { get; set; }
        }

        public class StatusResponse
        {
            public bool HasAccount { get; set; }
        }

        private readonly AppDbContext _db;
        private readonly IConfiguration _config;

        public AuthController(AppDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        [HttpGet("status")]
        public IActionResult GetStatus()
        {
            return Ok(new StatusResponse { HasAccount = _db.Users.Any() });
        }

        [HttpGet("kiosk")]
        public IActionResult KioskAccess()
        {
            var remoteIp = NormalizeIp(HttpContext.Connection.RemoteIpAddress);
            if (!IsKioskBypassAllowed(remoteIp))
            {
                return StatusCode(StatusCodes.Status403Forbidden, new AuthResponse { Success = false, Error = "Kiosk access denied." });
            }

            return Ok(new AuthResponse { Success = true, Token = GenerateKioskToken(remoteIp) });
        }

        [HttpPost("setup")]
        public IActionResult Setup([FromBody] LoginRequest request)
        {
            if (_db.Users.Any())
                return Conflict(new AuthResponse { Success = false, Error = "An account already exists." });

            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new AuthResponse { Success = false, Error = "Username and password are required." });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = request.Username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password)
            };

            _db.Users.Add(user);
            _db.SaveChanges();

            return Ok(new AuthResponse { Success = true, Token = GenerateToken(user) });
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            var user = _db.Users.FirstOrDefault(u => u.Username == request.Username);
            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return Unauthorized(new AuthResponse { Success = false, Error = "Invalid credentials." });

            return Ok(new AuthResponse { Success = true, Token = GenerateToken(user) });
        }

        private string GenerateToken(User user)
        {
            var secret = _config["Auth:JwtSecret"]!;
            var expiryHours = _config.GetValue<int>("Auth:TokenExpiryHours", 12);

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                claims: new[] { new Claim(ClaimTypes.Name, user.Username) },
                expires: DateTime.UtcNow.AddHours(expiryHours),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private string GenerateKioskToken(string remoteIp)
        {
            var secret = _config["Auth:JwtSecret"]!;
            var expiryHours = _config.GetValue<int>("Auth:TokenExpiryHours", 12);
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Name, "kiosk"),
                new Claim("rsh_access", "kiosk"),
                new Claim("rsh_ip", remoteIp)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddHours(expiryHours),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private bool IsKioskBypassAllowed(string remoteIp)
        {
            if (string.IsNullOrWhiteSpace(remoteIp))
                return false;

            if (remoteIp == IPAddress.Loopback.ToString() || remoteIp == IPAddress.IPv6Loopback.ToString())
                return true;

            var allowedIps = _config.GetSection("Kiosk:BypassIPs").Get<string[]>() ?? Array.Empty<string>();
            return allowedIps.Any(ip => string.Equals(ip?.Trim(), remoteIp, StringComparison.OrdinalIgnoreCase));
        }

        private static string NormalizeIp(IPAddress? address)
        {
            if (address == null)
                return string.Empty;

            if (address.IsIPv4MappedToIPv6)
                address = address.MapToIPv4();

            return address.ToString();
        }
    }
}
