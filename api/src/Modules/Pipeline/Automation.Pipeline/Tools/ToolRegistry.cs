namespace Automation.Pipeline.Tools;

public class ToolRegistry : IToolRegistry
{
    private readonly IReadOnlyList<IResolverTool> _allTools;
    private readonly IReadOnlyDictionary<string, IResolverTool> _tools;

    public ToolRegistry(IEnumerable<IResolverTool> tools)
    {
        var toolList = tools.ToList();
        _allTools = toolList;

        var dict = new Dictionary<string, IResolverTool>(StringComparer.OrdinalIgnoreCase);
        foreach (var tool in toolList)
        {
            dict[tool.Key] = tool;
            foreach (var alias in tool.Aliases)
            {
                dict.TryAdd(alias, tool);
            }
        }

        _tools = dict;
    }

    public IReadOnlyList<IResolverTool> GetAll() => _allTools;

    public IResolverTool? GetByKey(string key) => _tools.GetValueOrDefault(key);
}
