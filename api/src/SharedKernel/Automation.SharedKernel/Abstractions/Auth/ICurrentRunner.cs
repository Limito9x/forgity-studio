namespace Automation.SharedKernel.Abstractions.Auth;

public interface ICurrentRunner
{
    Guid? RunnerId { get; }
    bool IsRunnerRequest { get; }
}
