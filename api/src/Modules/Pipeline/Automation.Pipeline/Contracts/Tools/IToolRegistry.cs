namespace Automation.Pipeline.Contracts.Tools;

public interface IToolRegistry
{
    IReadOnlyList<IResolverTool> GetAll();
    IResolverTool? GetByKey(string key);
    IResolverTool? Get(string key) => GetByKey(key);
}

