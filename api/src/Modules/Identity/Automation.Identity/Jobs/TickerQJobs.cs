using TickerQ.Utilities.Base;

namespace Automation.Identity.Jobs;

public class TickerQJobs(IdentityJobs identityJobs)
{
    // Chạy mỗi ngày 1 lần vào lúc 3:00 AM sáng
    [TickerFunction("CleanupExpiredRefreshTokensAsync", "0 3 * * *")]
    public async Task CleanupExpiredRefreshTokensAsync(CancellationToken ct)
    {
        await identityJobs.CleanupExpiredRefreshTokens(ct);
    }
}
