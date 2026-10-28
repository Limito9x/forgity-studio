using Automation.Pipeline.Runtime.Planner.Models;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ScopeContextAndRedisKeyTests
{
    [Fact]
    public void ScopeContext_RootScope_ShouldHaveEmptyPath()
    {
        var root = new ScopeContext("root");
        root.GetScopePath().Should().BeEmpty();
    }

    [Fact]
    public void ScopeContext_SingleLoop_ShouldProduceCorrectScopePath()
    {
        var root = new ScopeContext("root");
        var loopScope = root.BuildChildScope("loop_items", iterationIndex: 2);

        loopScope.GetScopePath().Should().Be("scope:loop_items:iter:2");
    }

    [Fact]
    public void ScopeContext_NestedLoop_ShouldProduceHierarchicalScopePath()
    {
        var root = new ScopeContext("root");
        var outerScope = root.BuildChildScope("outer_loop", iterationIndex: 1);
        var innerScope = outerScope.BuildChildScope("inner_loop", iterationIndex: 5);

        innerScope.GetScopePath().Should().Be("scope:outer_loop:iter:1:scope:inner_loop:iter:5");
    }

    [Fact]
    public void ScopeContext_GetValue_ShouldClimbToParentScope()
    {
        var root = new ScopeContext("root");
        root.SetValue("GlobalVar", "Hello");

        var outerScope = root.BuildChildScope("outer");
        outerScope.SetValue("OuterVar", 100);

        var innerScope = outerScope.BuildChildScope("inner");
        innerScope.SetValue("InnerVar", true);

        innerScope.GetValue("InnerVar").Should().Be(true);
        innerScope.GetValue("OuterVar").Should().Be(100);
        innerScope.GetValue("GlobalVar").Should().Be("Hello");
        innerScope.GetValue("NonExistent").Should().BeNull();
    }

    [Fact]
    public void RedisKeyStrategy_OutsideLoop_ShouldGenerateStandardKey()
    {
        var execId = Guid.NewGuid();
        var nodeId = Guid.NewGuid();

        var key = RedisKeyStrategy.GetNodePinKey(execId, nodeId, "output_path");
        key.Should().Be($"pe:{execId}:node:{nodeId}:pin:output_path");
    }

    [Fact]
    public void RedisKeyStrategy_InsideLoop_ShouldIncludeScopeAndIteration()
    {
        var execId = Guid.NewGuid();
        var nodeId = Guid.NewGuid();
        var root = new ScopeContext("root");
        var loopScope = root.BuildChildScope("foreach_mesh", iterationIndex: 3);

        var key = RedisKeyStrategy.GetNodePinKey(execId, nodeId, "mesh_file", loopScope);
        key.Should().Be($"pe:{execId}:scope:foreach_mesh:iter:3:node:{nodeId}:pin:mesh_file");
    }

    [Fact]
    public void RedisKeyStrategy_NestedLoop_ShouldIncludeAllScopeLevels()
    {
        var execId = Guid.NewGuid();
        var nodeId = Guid.NewGuid();
        var root = new ScopeContext("root");
        var outer = root.BuildChildScope("character_loop", iterationIndex: 0);
        var inner = outer.BuildChildScope("texture_loop", iterationIndex: 2);

        var key = RedisKeyStrategy.GetNodePinKey(execId, nodeId, "tex_path", inner);
        key.Should().Be($"pe:{execId}:scope:character_loop:iter:0:scope:texture_loop:iter:2:node:{nodeId}:pin:tex_path");
    }
}
