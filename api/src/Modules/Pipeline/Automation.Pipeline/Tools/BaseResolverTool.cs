using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools;

/// <summary>
/// Lớp cơ sở trừu tượng hỗ trợ Strongly-Typed Model Binding cho các Pipeline Tools.
/// Tự động sinh danh sách PinDefinition từ TInput và TOutput nếu không override thủ công.
/// Tự động bind raw Dictionary sang typed TInput và serialize TOutput sang Dictionary trả về.
/// </summary>
public abstract class BaseResolverTool<TInput, TOutput> : IResolverTool
    where TInput : class, new()
    where TOutput : class
{
    public abstract string Key { get; }
    public abstract string Label { get; }
    public virtual IReadOnlyList<string> Aliases => [];
    public virtual bool IsPure => false;
    public virtual bool IsDynamic => false;
    public virtual string? Category => null;
    public virtual string? Description => null;

    private IReadOnlyList<PinDefinition>? _inputs;
    public virtual IReadOnlyList<PinDefinition> Inputs => _inputs ??= ToolModelBinder.InferPins(typeof(TInput));

    private IReadOnlyList<PinDefinition>? _outputs;
    public virtual IReadOnlyList<PinDefinition> Outputs => _outputs ??= ToolModelBinder.InferPins(typeof(TOutput));

    public virtual (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    ) => (Inputs, Outputs);

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var typedInput = ToolModelBinder.Bind<TInput>(inputs);
        var typedOutput = await ExecuteCoreAsync(typedInput, context);
        return ToolModelBinder.ToDictionary(typedOutput);
    }

    protected abstract Task<TOutput> ExecuteCoreAsync(TInput input, ToolExecutionContext context);
}
