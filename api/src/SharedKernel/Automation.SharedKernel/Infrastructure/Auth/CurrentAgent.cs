using Automation.SharedKernel.Abstractions.Auth;
using Microsoft.AspNetCore.Http;

namespace Automation.SharedKernel.Infrastructure.Auth;

public class CurrentRunner(IHttpContextAccessor httpContextAccessor) : ICurrentRunner, ICurrentAgent
{
    public const string HttpContextItemKey = "CurrentRunnerId";
    public const string LegacyHttpContextItemKey = "CurrentAgentId";

    public Guid? RunnerId => (httpContextAccessor.HttpContext?.Items[HttpContextItemKey] as Guid?)
        ?? (httpContextAccessor.HttpContext?.Items[LegacyHttpContextItemKey] as Guid?);

    public bool IsRunnerRequest => RunnerId.HasValue;

    // ICurrentAgent compatibility
    public Guid? AgentId => RunnerId;
    public bool IsAgentRequest => IsRunnerRequest;
}

// Backward-compatibility alias
public class CurrentAgent(IHttpContextAccessor httpContextAccessor) : CurrentRunner(httpContextAccessor)
{
}
