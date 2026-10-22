import { test } from "node:test";
import assert from "node:assert/strict";
import { indexDefinitions, definitionKey, nodeView, filterPalette } from "../src/features/pipelines/nodeDefinitions.ts";
const item = (source: string, key: string, extra = {}) => ({ source, key, label: key, category: "Tools", executor: "builtin", inputs: [], outputs: [], isVisibleInPalette: true, ...extra });
test("hidden definitions remain available to graph but absent from menus", () => {
  const hidden = item("Tool", "OldTool", { isVisibleInPalette: false });
  const definitions = [hidden, item("Tool", "Visible")];
  assert.equal(indexDefinitions(definitions).get(definitionKey("Tool", "OldTool")), hidden);
  assert.deepEqual(filterPalette(definitions, "server").map(x => x.key), ["Visible"]);
});
test("source separates equal keys; view depends on contract rather than tool name or dynamic flag", () => {
  const tool = item("Tool", "same", { isDynamic: true });
  const custom = item("Custom", "same", { executor: "python" });
  const map = indexDefinitions([tool, custom]);
  assert.equal(map.size, 2);
  assert.equal(nodeView("Tool", tool), "Standard");
  assert.equal(nodeView("Tool", item("Tool", "Renamed", { capabilities: { viewVariant: "Collection" } })), "Collection");
  assert.equal(nodeView("Tool", item("Tool", "Another", { capabilities: { viewVariant: "Unknown" } })), "Standard");
  assert.equal(nodeView("Tool"), "Missing");
  assert.equal(nodeView("Return"), "Return");
  assert.equal(nodeView("Start"), "Start");
});
test("stage menus preserve executor scoping", () => {
  const items = [item("Tool", "Core"), item("Custom", "Script", { executor: "blender" }), item("SubPipeline", "Macro"), item("Return", "Return", { category: "Flow Control" })];
  assert.deepEqual(filterPalette(items, "blender").map(x => x.key), ["Script"]);
  assert.deepEqual(filterPalette(items, "macro").map(x => x.key), ["Macro", "Return"]);
});
