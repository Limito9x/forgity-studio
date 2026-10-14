using Automation.Identity.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Identity.Jobs;

public class IdentityJobs(
    IdentityDbContext dbContext,
    ILogger<IdentityJobs> logger)
{
    /// <summary>
    /// Dọn dẹp các Refresh Token đã hết hạn hoặc đã bị thu hồi khỏi Database.
    /// Sử dụng ExecuteDeleteAsync để xóa trực tiếp trên PostgreSQL với hiệu năng cao.
    /// </summary>
    public async Task CleanupExpiredRefreshTokens(CancellationToken ct = default)
    {
        logger.LogInformation("Bắt đầu dọn dẹp các Refresh Token đã hết hạn / thu hồi...");

        try
        {
            var now = DateTime.UtcNow;

            var deletedCount = await dbContext.RefreshTokens
                .Where(t => t.ExpiresAt <= now || (t.RevokedAt != null && t.RevokedAt <= now))
                .ExecuteDeleteAsync(ct);

            if (deletedCount > 0)
            {
                logger.LogInformation("Đã dọn dẹp thành công {Count} refresh tokens.", deletedCount);
            }
            else
            {
                logger.LogInformation("Không có refresh token nào cần dọn dẹp.");
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Tác vụ bị hủy khi ứng dụng dừng
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi xảy ra trong quá trình dọn dẹp refresh tokens.");
            throw;
        }
    }
}
