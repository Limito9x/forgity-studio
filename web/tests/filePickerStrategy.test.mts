import { test } from "node:test";
import assert from "node:assert/strict";
import { isLocalRunner, type LocalMachineInfo } from "../src/lib/platform/filePickerStrategy.ts";

test("isLocalRunner: returns false if not in desktop environment", () => {
  const runner = {
    id: "runner-1",
    name: "Local Runner",
    machineKey: "DESKTOP-ABC123",
    isActive: true,
    createdAt: "",
    hardwareFingerprint: "sha256-hash-123",
  };
  const localInfo: LocalMachineInfo = {
    isDesktop: false,
  };
  assert.equal(isLocalRunner(runner, localInfo), false);
});

test("isLocalRunner: matches by hardwareFingerprint when both present", () => {
  const runner = {
    id: "runner-1",
    name: "Local Runner",
    machineKey: "DIFFERENT-MACHINE-KEY",
    isActive: true,
    createdAt: "",
    hardwareFingerprint: "SHA256-HASH-123456",
  };
  const localInfo: LocalMachineInfo = {
    isDesktop: true,
    hardwareFingerprint: "sha256-hash-123456",
    machineKey: "SOME-KEY",
    hostname: "DESKTOP-MYPC",
  };
  assert.equal(isLocalRunner(runner, localInfo), true);
});

test("isLocalRunner: returns false if hardwareFingerprints differ", () => {
  const runner = {
    id: "runner-1",
    name: "Remote Runner",
    machineKey: "DESKTOP-MYPC",
    isActive: true,
    createdAt: "",
    hardwareFingerprint: "sha256-hash-remote-999",
  };
  const localInfo: LocalMachineInfo = {
    isDesktop: true,
    hardwareFingerprint: "sha256-hash-local-111",
    machineKey: "DESKTOP-MYPC",
    hostname: "DESKTOP-MYPC",
  };
  assert.equal(isLocalRunner(runner, localInfo), false);
});

test("isLocalRunner: fallback to machineKey or hostname when runner has no hardwareFingerprint", () => {
  const runnerLegacy = {
    id: "runner-legacy",
    name: "Legacy Runner",
    machineKey: "DESKTOP-DNN7HQ6-c7a1b2c3d4e5f6",
    isActive: true,
    createdAt: "",
    hardwareFingerprint: null,
  };
  const localInfo: LocalMachineInfo = {
    isDesktop: true,
    hardwareFingerprint: "new-sha256-fingerprint",
    machineKey: "DESKTOP-DNN7HQ6-c7a1b2c3d4e5f6",
    hostname: "DESKTOP-DNN7HQ6",
  };
  assert.equal(isLocalRunner(runnerLegacy, localInfo), true);
});

test("isLocalRunner: returns false if neither fingerprint nor machineKey matches", () => {
  const runner = {
    id: "runner-other",
    name: "Cloud Worker",
    machineKey: "CLOUD-AWS-RUNNER-01",
    isActive: true,
    createdAt: "",
    hardwareFingerprint: null,
  };
  const localInfo: LocalMachineInfo = {
    isDesktop: true,
    hardwareFingerprint: "local-fp",
    machineKey: "DESKTOP-DNN7HQ6",
    hostname: "DESKTOP-DNN7HQ6",
  };
  assert.equal(isLocalRunner(runner, localInfo), false);
});
