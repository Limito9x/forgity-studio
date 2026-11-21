import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "js-yaml";
import {
  graphToPipelineYaml,
  pipelineYamlToGraph,
} from "../src/features/pipelines/utils/pipelineDslConverter.ts";

test("legacy scope wrappers and stage metadata are omitted from pipeline YAML", () => {
  const yaml = graphToPipelineYaml(
    "Example",
    [
      { id: "scope-1", type: "scopeContainer", position: { x: 0, y: 0 } },
      {
        id: "node-1",
        parentId: "scope-1",
        data: { refId: "ToolA", configValues: {} },
      },
      {
        id: "node-2",
        data: { refId: "ToolB", configValues: {} },
      },
    ],
    [
      { id: "scope-edge", source: "scope-1", target: "node-1" },
      {
        id: "node-edge",
        source: "node-1",
        sourceHandle: "out",
        target: "node-2",
        targetHandle: "in",
      },
    ]
  );
  const parsed = load(yaml) as {
    nodes: Array<{ id: string; stage?: string }>;
    edges: Array<{ from: string; to: string }>;
    runner?: string;
  };

  assert.deepEqual(parsed.nodes.map((node) => node.id), ["node-1", "node-2"]);
  assert.ok(parsed.nodes.every((node) => node.stage === undefined));
  assert.deepEqual(parsed.edges, [{ from: "node-1.out", to: "node-2.in" }]);
  assert.equal(parsed.runner, undefined);
});

test("legacy scope nodes and stage references are ignored when importing YAML", () => {
  const graph = pipelineYamlToGraph(`
name: Legacy
nodes:
  - id: scope-1
    tool: ScopeContainer
  - id: node-1
    tool: ToolA
    stage: scope-1
  - id: node-2
    tool: ToolB
edges:
  - from: scope-1.exec_out
    to: node-1.exec_in
  - from: node-1.out
    to: node-2.in
`);

  assert.deepEqual(graph.nodes.map((node) => node.id), ["node-1", "node-2"]);
  assert.ok(graph.nodes.every((node) => node.parentId === undefined));
  assert.deepEqual(graph.edges.map(({ source, target }) => [source, target]), [
    ["node-1", "node-2"],
  ]);
});
