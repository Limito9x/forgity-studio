import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPipelineParameterPinId,
  pipelineParameterToPin,
} from "../src/features/pipelines/adapters/pipelineParameterPins.ts";

test("Start and Return parameter pins use the contract key and display label", () => {
  const parameter = {
    id: "c2d93e71-3b60-43da-8a11-722cd0f6e842",
    key: "input_path",
    label: "Input Path",
    kind: "Input",
    type: "Asset",
    isRequired: true,
  };

  const outputPin = pipelineParameterToPin(parameter, "Output");
  const inputPin = pipelineParameterToPin({ ...parameter, kind: "Output" }, "Input");

  assert.equal(getPipelineParameterPinId(parameter), "input_path");
  assert.equal(outputPin.id, "input_path");
  assert.equal(outputPin.label, "Input Path");
  assert.equal(outputPin.direction, "Output");
  assert.equal(inputPin.id, outputPin.id);
  assert.equal(inputPin.direction, "Input");
});

test("file path picker metadata does not change the String pin type", () => {
  const assetPin = pipelineParameterToPin(
    { key: "preset_path", label: "Preset Path", type: "Asset" },
    "Input",
  );
  const localFilePin = pipelineParameterToPin(
    {
      key: "local_preset",
      label: "Local Preset",
      type: "String",
      cardinality: "Array",
      contextData: { type: "path", pathKind: "file", accept: ".py" },
    },
    "Input",
  );

  assert.equal(assetPin.primitiveType, "Asset");
  assert.equal(localFilePin.primitiveType, "String");
  assert.equal(localFilePin.cardinality, "Array");
  assert.deepEqual(
    JSON.parse(localFilePin.metadata ?? "{}"),
    { type: "path", pathKind: "file", accept: ".py" },
  );
});
