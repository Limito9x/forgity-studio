using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace Automation.SharedKernel.Infrastructure.Persistence;

public interface ICurrentStudioProvider
{
    Guid? StudioId { get; }
}

public class CurrentStudioProvider(IHttpContextAccessor httpContextAccessor) : ICurrentStudioProvider
{
    public Guid? StudioId
    {
        get
        {
            var httpContext = httpContextAccessor.HttpContext;
            if (httpContext == null) return null;

            if (httpContext.Request.Headers.TryGetValue("X-Studio-Id", out var headerVal) &&
                Guid.TryParse(headerVal, out var headerStudioId) &&
                headerStudioId != Guid.Empty)
            {
                return headerStudioId;
            }

            if (httpContext.Request.Query.TryGetValue("studioId", out var queryVal) &&
                Guid.TryParse(queryVal, out var queryStudioId) &&
                queryStudioId != Guid.Empty)
            {
                return queryStudioId;
            }

            return null;
        }
    }
}
