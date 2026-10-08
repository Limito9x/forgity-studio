using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.ExecPlanner;
using Automation.Pipeline.Tools;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ExecPlannerTests
{
    private readonly ExecPlanner _planner = new();
    private readonly FakeToolRegistry _toolRegistry = new();

    [Fact]
    public void BuildExecPlan_ScopedStages_ShouldOrderByStageEdgesAndPreserveTargetRunnerId()
    {
        var pipeline = CreatePipeline("ScopedPipeline");

        var runnerA = Guid.NewGuid();
        var runnerB = Guid.NewGuid();

        var stageServer = CreateContainer(pipeline.Id, "Server Stage", "dotNet", null, 100, 0);
        var stageBlender = CreateContainer(pipeline.Id, "Blender Prep", "blender", runnerA, 600, 0);
        var stageUnreal = CreateContainer(pipeline.Id, "Unreal Import", "unreal", runnerB, 1100, 0);

        // Add containers in reverse order to verify topological sort via edges
        pipeline.AddNode(stageUnreal);
        pipeline.AddNode(stageBlender);
        pipeline.AddNode(stageServer);

        // Root Start and Return nodes (StageId = null)
        var startNode = CreateNode(pipeline.Id, "Start", "Start");
        var returnNode = CreateNode(pipeline.Id, "Return", "Return");

        // Intra-stage nodes for Blender Stage: Import -> Clean -> Export
        var importNode = CreateNode(pipeline.Id, "custom_import", "Tool", stageBlender.Id);
        var cleanNode = CreateNode(pipeline.Id, "custom_clean", "Tool", stageBlender.Id);
        var exportNode = CreateNode(pipeline.Id, "custom_export", "Tool", stageBlender.Id);

        // Intra-stage node for Server Stage
        var serverToolNode = CreateNode(pipeline.Id, "ServerAction", "Tool", stageServer.Id);

        // Intra-stage node for Unreal Stage
        var unrealImportNode = CreateNode(pipeline.Id, "unreal_import", "Tool", stageUnreal.Id);

        pipeline.AddNode(startNode);
        pipeline.AddNode(returnNode);
        pipeline.AddNode(exportNode);
        pipeline.AddNode(importNode);
        pipeline.AddNode(cleanNode);
        pipeline.AddNode(serverToolNode);
        pipeline.AddNode(unrealImportNode);

        // Intra-stage exec edges inside Blender Stage (Import -> Clean -> Export)
        pipeline.AddEdge(importNode.Id, "exec_out", cleanNode.Id, "exec_in");
        pipeline.AddEdge(cleanNode.Id, "exec_out", exportNode.Id, "exec_in");

        // Inter-stage exec edges between child nodes: ServerAction -> Import, Export -> UnrealImport
        pipeline.AddEdge(serverToolNode.Id, "exec_out", importNode.Id, "exec_in");
        pipeline.AddEdge(exportNode.Id, "exec_out", unrealImportNode.Id, "exec_in");

        var customDefs = new List<NodeDefinition>
        {
            new(pipeline.ProjectId, "Import Mesh", "custom_import", "Import Mesh", "blender", [], []),
            new(pipeline.ProjectId, "Clean Mesh", "custom_clean", "Clean Mesh", "blender", [], []),
            new(pipeline.ProjectId, "Export FBX", "custom_export", "Export FBX", "blender", [], []),
            new(pipeline.ProjectId, "Unreal Import", "unreal_import", "Unreal Import", "unreal", [], []),
        };

        var plan = _planner.BuildExecPlan(pipeline, customDefs, _toolRegistry);

        plan.IsValid.Should().BeTrue();
        plan.Segments.Should().HaveCount(5);

        // Segment 0: Root Start
        plan.Segments[0].Executor.Should().Be("dotNet");
        plan.Segments[0].Steps.Should().ContainSingle(s => s.NodeId == startNode.Id);

        // Segment 1: Server Stage
        plan.Segments[1].StageId.Should().Be(stageServer.Id);
        plan.Segments[1].Executor.Should().Be("dotNet");
        plan.Segments[1].Steps.Should().ContainSingle(s => s.NodeId == serverToolNode.Id);

        // Segment 2: Blender Worker Stage (all 3 steps fused into 1 segment with TargetRunnerId = runnerA)
        plan.Segments[2].StageId.Should().Be(stageBlender.Id);
        plan.Segments[2].StageName.Should().Be("Blender Prep");
        plan.Segments[2].Executor.Should().Be("blender");
        plan.Segments[2].TargetRunnerId.Should().Be(runnerA);
        plan.Segments[2].Steps.Select(s => s.NodeId).Should().ContainInOrder(importNode.Id, cleanNode.Id, exportNode.Id);

        // Segment 3: Unreal Worker Stage (TargetRunnerId = runnerB)
        plan.Segments[3].StageId.Should().Be(stageUnreal.Id);
        plan.Segments[3].Executor.Should().Be("unreal");
        plan.Segments[3].TargetRunnerId.Should().Be(runnerB);
        plan.Segments[3].Steps.Should().ContainSingle(s => s.NodeId == unrealImportNode.Id);

        // Segment 4: Root Return
        plan.Segments[4].Executor.Should().Be("dotNet");
        plan.Segments[4].Steps.Should().ContainSingle(s => s.NodeId == returnNode.Id);
    }

    [Fact]
    public void BuildExecPlan_MacroStageWithSubPipeline_ShouldCreateDedicatedSubPipelineSegment()
    {
        var pipeline = CreatePipeline("MacroOrchestratorPipeline");

        var macroStage = CreateContainer(pipeline.Id, "Main Macro", "dotNet", null, 0, 0);
        pipeline.AddNode(macroStage);

        var subPipelineNode1 = CreateNode(pipeline.Id, Guid.NewGuid().ToString(), "SubPipeline", macroStage.Id);
        var subPipelineNode2 = CreateNode(pipeline.Id, Guid.NewGuid().ToString(), "SubPipeline", macroStage.Id);

        pipeline.AddNode(subPipelineNode1);
        pipeline.AddNode(subPipelineNode2);

        pipeline.AddEdge(subPipelineNode1.Id, "exec_out", subPipelineNode2.Id, "exec_in");

        var plan = _planner.BuildExecPlan(pipeline, [], _toolRegistry);

        plan.IsValid.Should().BeTrue();
        plan.Segments.Should().HaveCount(2);
        plan.Segments[0].IsSubPipeline.Should().BeTrue();
        plan.Segments[0].StageId.Should().Be(macroStage.Id);
        plan.Segments[0].Steps[0].NodeId.Should().Be(subPipelineNode1.Id);

        plan.Segments[1].IsSubPipeline.Should().BeTrue();
        plan.Segments[1].StageId.Should().Be(macroStage.Id);
        plan.Segments[1].Steps[0].NodeId.Should().Be(subPipelineNode2.Id);
    }

    [Fact]
    public void BuildExecPlan_WhenStageEdgesContainCycle_ShouldDetectCycle()
    {
        var pipeline = CreatePipeline("StageCyclePipeline");

        var stageA = CreateContainer(pipeline.Id, "Stage A", "dotNet", null, 0, 0);
        var stageB = CreateContainer(pipeline.Id, "Stage B", "dotNet", null, 400, 0);

        var childA = CreateNode(pipeline.Id, "ChildActionA", "Tool", stageA.Id);
        var childB = CreateNode(pipeline.Id, "ChildActionB", "Tool", stageB.Id);

        pipeline.AddNode(stageA);
        pipeline.AddNode(stageB);
        pipeline.AddNode(childA);
        pipeline.AddNode(childB);

        // Cycle between Stage A and Stage B via child node edges
        pipeline.AddEdge(childA.Id, "exec_out", childB.Id, "exec_in");
        pipeline.AddEdge(childB.Id, "exec_out", childA.Id, "exec_in");

        var plan = _planner.BuildExecPlan(pipeline, [], _toolRegistry);

        plan.IsValid.Should().BeFalse();
        plan.CycleNodeIds.Should().Contain(stageA.Id.ToString());
        plan.CycleNodeIds.Should().Contain(stageB.Id.ToString());
    }

    [Fact]
    public void BuildExecPlan_ContiguousAgentSteps_ShouldFuseIntoSingleSegment()
    {
        // Setup Pipeline: Root Start -> Blender Stage (Import -> Save -> Export)
        var pipeline = CreatePipeline("TestPipeline");
        var stageBlender = CreateContainer(pipeline.Id, "Blender Worker", "blender", null, 0, 0);
        pipeline.AddNode(stageBlender);

        var startNode = CreateNode(pipeline.Id, "Start", "Start");
        var importNode = CreateNode(pipeline.Id, "custom_import", "Tool", stageBlender.Id);
        var saveNode = CreateNode(pipeline.Id, "custom_save", "Tool", stageBlender.Id);
        var exportNode = CreateNode(pipeline.Id, "custom_export", "Tool", stageBlender.Id);

        // Pure Node connected only via Data wire (BreakStruct)
        var breakStructNode = CreateNode(pipeline.Id, "BreakStruct", "Tool", stageBlender.Id);

        pipeline.AddNode(startNode);
        pipeline.AddNode(importNode);
        pipeline.AddNode(saveNode);
        pipeline.AddNode(exportNode);
        pipeline.AddNode(breakStructNode);

        // Exec Wires inside Blender Stage: Import -> Save -> Export
        pipeline.AddEdge(importNode.Id, "exec_out", saveNode.Id, "exec_in");
        pipeline.AddEdge(saveNode.Id, "exec_out", exportNode.Id, "exec_in");

        // Data Wire: BreakStruct -> Import (Data wire only)
        pipeline.AddEdge(breakStructNode.Id, "Path", importNode.Id, "FilePath");

        var customDefs = new List<NodeDefinition>
        {
            new(pipeline.ProjectId, "Import Mesh", "custom_import", "Import Mesh", "blender", [], []),
            new(pipeline.ProjectId, "Save File", "custom_save", "Save File", "blender", [], []),
            new(pipeline.ProjectId, "Export FBX", "custom_export", "Export FBX", "blender", [], []),
        };

        var plan = _planner.BuildExecPlan(pipeline, customDefs, _toolRegistry);

        plan.IsValid.Should().BeTrue();
        plan.Segments.Should().HaveCount(2);

        // Segment 1: dotNet (Root Start)
        plan.Segments[0].Executor.Should().Be("dotNet");
        plan.Segments[0].Steps.Should().HaveCount(1);
        plan.Segments[0].Steps[0].NodeId.Should().Be(startNode.Id);

        // Segment 2: blender (Import + Save + Export fused together!)
        plan.Segments[1].Executor.Should().Be("blender");
        plan.Segments[1].Steps.Should().HaveCount(3);
        plan.Segments[1].Steps[0].NodeId.Should().Be(importNode.Id);
        plan.Segments[1].Steps[1].NodeId.Should().Be(saveNode.Id);
        plan.Segments[1].Steps[2].NodeId.Should().Be(exportNode.Id);

        // BreakStruct (Pure node) must NOT be present in ExecPlan segments!
        plan.GetAllSteps().Any(s => s.NodeId == breakStructNode.Id).Should().BeFalse();
    }

    [Fact]
    public void BuildExecPlan_WithForEachLoop_ShouldConstructBodyPlanAndContinuation()
    {
        // Setup Pipeline: Root Start -> Macro Stage (ForEach -> loop_body -> ProcessStep (blender); ForEach -> completed -> NotifyStep (dotNet))
        var pipeline = CreatePipeline("ForEachPipeline");
        var macroStage = CreateContainer(pipeline.Id, "Macro Stage", "dotNet", null, 0, 0);
        pipeline.AddNode(macroStage);

        var startNode = CreateNode(pipeline.Id, "Start", "Start");
        var forEachNode = CreateNode(pipeline.Id, "ForEach", "FlowControl", macroStage.Id);
        var processNode = CreateNode(pipeline.Id, "custom_process", "Tool", macroStage.Id);
        var notifyNode = CreateNode(pipeline.Id, "custom_notify", "Tool", macroStage.Id);

        pipeline.AddNode(startNode);
        pipeline.AddNode(forEachNode);
        pipeline.AddNode(processNode);
        pipeline.AddNode(notifyNode);

        pipeline.AddEdge(forEachNode.Id, "loop_body", processNode.Id, "exec_in");
        pipeline.AddEdge(forEachNode.Id, "completed", notifyNode.Id, "exec_in");

        var customDefs = new List<NodeDefinition>
        {
            new(pipeline.ProjectId, "Process", "custom_process", "Process", "blender", [], []),
            new(pipeline.ProjectId, "Notify", "custom_notify", "Notify", "dotNet", [], []),
        };

        var plan = _planner.BuildExecPlan(pipeline, customDefs, _toolRegistry);

        plan.IsValid.Should().BeTrue();
        plan.Segments.Should().HaveCount(3);

        // Segment 1: Start (dotNet)
        plan.Segments[0].Executor.Should().Be("dotNet");
        plan.Segments[0].Steps[0].NodeId.Should().Be(startNode.Id);

        // Segment 2: ForEach (FlowControl)
        var fcSegment = plan.Segments[1];
        fcSegment.IsFlowControl.Should().BeTrue();
        fcSegment.Steps[0].NodeId.Should().Be(forEachNode.Id);
        fcSegment.BodyPlan.Should().NotBeNull();
        fcSegment.BodyPlan!.Segments.Should().HaveCount(1);
        fcSegment.BodyPlan.Segments[0].Steps[0].NodeId.Should().Be(processNode.Id);

        // Segment 3: Continuation (Notify)
        plan.Segments[2].Executor.Should().Be("dotNet");
        plan.Segments[2].Steps[0].NodeId.Should().Be(notifyNode.Id);
    }

    [Fact]
    public void BuildExecPlan_WhenIntraStageCycleExists_ShouldDetectCycle()
    {
        var pipeline = CreatePipeline("IntraStageCyclePipeline");
        var serverStage = CreateContainer(pipeline.Id, "Server Stage", "dotNet", null, 0, 0);
        pipeline.AddNode(serverStage);

        var nodeA = CreateNode(pipeline.Id, "custom_a", "Tool", serverStage.Id);
        var nodeB = CreateNode(pipeline.Id, "custom_b", "Tool", serverStage.Id);

        pipeline.AddNode(nodeA);
        pipeline.AddNode(nodeB);

        pipeline.AddEdge(nodeA.Id, "exec_out", nodeB.Id, "exec_in");
        pipeline.AddEdge(nodeB.Id, "exec_out", nodeA.Id, "exec_in"); // Intra-stage Cycle!

        var customDefs = new List<NodeDefinition>
        {
            new(pipeline.ProjectId, "A", "custom_a", "A", "dotNet", [], []),
            new(pipeline.ProjectId, "B", "custom_b", "B", "dotNet", [], [])
        };

        var plan = _planner.BuildExecPlan(pipeline, customDefs, _toolRegistry);

        plan.IsValid.Should().BeFalse();
        plan.CycleNodeIds.Should().NotBeEmpty();
    }

    // Helpers
    private static PipelineEntity CreatePipeline(string name)
    {
        return new PipelineEntity(Guid.NewGuid(), name);
    }

    [Fact]
    public void BuildExecPlan_PlugOverSelect_WireIntoContainerRunnerPin_ShouldOverrideHeaderSelectRunner()
    {
        var pipeline = CreatePipeline("PlugOverSelectPipeline");

        var staticRunnerA = Guid.NewGuid();
        var dynamicRunnerB = Guid.NewGuid();

        // 1. Container cấu hình header select = staticRunnerA
        var stageBlender = CreateContainer(pipeline.Id, "Blender Worker Stage", "blender", staticRunnerA, 100, 0);
        pipeline.AddNode(stageBlender);

        // 2. Start Node có output pin 'target_runner'
        var startNode = CreateNode(pipeline.Id, "Start", "Start");
        pipeline.AddNode(startNode);

        // 3. Intra-stage Action Node
        var actionNode = CreateNode(pipeline.Id, "render_scene", "Tool", stageBlender.Id);
        pipeline.AddNode(actionNode);

        // 4. Edge: Cắm dây từ startNode 'target_runner' vào cổng 'runner' của stageBlender (Plug over Select)
        pipeline.AddEdge(startNode.Id, "target_runner", stageBlender.Id, "runner");

        // 5. RuntimeInputs cung cấp Runner B
        var runtimeInputs = new Dictionary<string, object?>
        {
            ["target_runner"] = dynamicRunnerB.ToString()
        };

        // 6. Build Plan
        var plan = _planner.BuildExecPlan(pipeline, [], _toolRegistry, runtimeInputs);

        // 7. Verify: StageWorkerBinding ghi nhận cơ chế Plug over Select
        plan.Graph.Should().NotBeNull();
        var binding = plan.Graph!.StageBindings[stageBlender.Id];

        binding.ConfiguredRunnerId.Should().Be(staticRunnerA);
        binding.EffectiveRunnerId.Should().Be(dynamicRunnerB);
        binding.BindingSource.Should().Be(Automation.Pipeline.Engine.Models.StageBindingSource.DataWire);
        binding.TargetQueueName.Should().Be($"stage_tasks.{dynamicRunnerB}");

        // Segment tương ứng cũng phải mang runner B được chỉ định từ dây cắm
        var segment = plan.Segments.FirstOrDefault(s => s.StageId == stageBlender.Id);
        segment.Should().NotBeNull();
        segment!.TargetRunnerId.Should().Be(dynamicRunnerB);
    }

    private static PipelineNode CreateContainer(Guid pipelineId, string name, string executor = "dotNet", Guid? runnerId = null, float x = 0, float y = 0)
    {
        var metadataJson = System.Text.Json.JsonSerializer.Serialize(new { executor, targetRunnerId = runnerId });
        var metadataDoc = System.Text.Json.JsonDocument.Parse(metadataJson);
        return new PipelineNode(Guid.NewGuid(), pipelineId, name, PipelineNodeKind.Container, x, y, null, null, new NodeSize(400, 300), metadataDoc);
    }

    private static PipelineNode CreateNode(Guid pipelineId, string refId, string kind, Guid? stageId = null)
    {
        return new PipelineNode(Guid.NewGuid(), pipelineId, refId, kind, 0, 0, null, stageId);
    }

    private class FakeToolRegistry : IToolRegistry
    {
        private readonly List<IResolverTool> _tools =
        [
            new FakeTool("BreakStruct", "Break Struct", isPure: true),
            new FakeTool("ForEach", "For Each", isPure: false, category: "Flow Control"),
        ];

        public IReadOnlyList<IResolverTool> GetAll() => _tools;
        public IResolverTool? GetByKey(string key) => _tools.FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
    }

    private class FakeTool(string key, string label, bool isPure, string? category = null) : IResolverTool
    {
        public string Key => key;
        public string Label => label;
        public string? Category => category;
        public bool IsPure => isPure;
        public IReadOnlyList<PinDefinition> Inputs => [];
        public IReadOnlyList<PinDefinition> Outputs => [];
        public Task<Dictionary<string, object>> ExecuteAsync(Dictionary<string, object> inputs, ToolExecutionContext context)
            => Task.FromResult(new Dictionary<string, object>());
    }
}
