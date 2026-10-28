import { test } from "node:test";
import assert from "node:assert/strict";
import {
  indexDefinitions,
  definitionKey,
  nodeView,
  filterPalette,
  buildSchemaConfigSignature,
  arePinListsEqual,
  applyNodeConfigUpdate,
} from "../src/features/pipelines/nodeDefinitions.ts";
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
  const items = [
    item("Tool", "Core"),
    item("Custom", "Script", { executor: "blender" }),
    item("SubPipeline", "Macro", { executor: "builtin" }),
    item("Return", "Return", { category: "Flow Control", executor: "builtin" })
  ];
  assert.deepEqual(filterPalette(items, "blender").map(x => x.key), ["Script"]);
  assert.deepEqual(filterPalette(items, "macro").map(x => x.key), ["Macro", "Return"]);
  // Server / DotNet stage must contain Core tools, NEVER SubPipeline or Return
  assert.deepEqual(filterPalette(items, "server").map(x => x.key), ["Core"]);
});
test("buildSchemaConfigSignature only changes when schemaConfigKeys change", () => {
  const keys = ["StructType"];
  const sig1 = buildSchemaConfigSignature({ StructType: "Resource", Target: "id-1" }, keys);
  const sig2 = buildSchemaConfigSignature({ StructType: "Resource", Target: "id-2" }, keys);
  const sig3 = buildSchemaConfigSignature({ StructType: "Repository", Target: "id-2" }, keys);
  assert.equal(sig1, sig2);
  assert.notEqual(sig1, sig3);
  assert.equal(buildSchemaConfigSignature({ Any: 1 }, []), '{"Any":1}');
});
test("arePinListsEqual detects type or structType changes on pins with identical id", () => {
  const pinA = { id: "Target", label: "Target", primitiveType: "EntityRef", cardinality: "Single", structType: "Resource", isRequired: true };
  const pinB = { ...pinA, structType: "Repository" };
  assert.equal(arePinListsEqual([pinA as never], [{ ...pinA } as never]), true);
  assert.equal(arePinListsEqual([pinA as never], [pinB as never]), false);
});
test("applyNodeConfigUpdate clears dependent config when StructType changes and preserves unrelated updates", () => {
  const prev = { StructType: "Resource", Target: "res-123", Name: "hero" };
  const sameStruct = applyNodeConfigUpdate(prev, "Target", "res-456");
  assert.equal(sameStruct.didChangeStructType, false);
  assert.deepEqual(sameStruct.configValues, { StructType: "Resource", Target: "res-456", Name: "hero" });

  const changedStruct = applyNodeConfigUpdate(prev, "StructType", "Repository");
  assert.equal(changedStruct.didChangeStructType, true);
  assert.deepEqual(changedStruct.configValues, { StructType: "Repository" });

  const clearedStruct = applyNodeConfigUpdate(prev, "StructType", "");
  assert.equal(clearedStruct.didChangeStructType, true);
  assert.deepEqual(clearedStruct.configValues, { StructType: "" });
});
