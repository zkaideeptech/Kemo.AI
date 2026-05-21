import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_ARTIFACT_KINDS,
  WORKSPACE_NAV_ITEMS,
  formatCount,
  getArtifactDefinition,
} from "./notebook-workspace.model";

test("workspace navigation only exposes backend-backed areas", () => {
  assert.deepEqual(
    WORKSPACE_NAV_ITEMS.map((item) => item.id),
    ["workspace", "live", "sources", "artifacts", "favorites", "settings"]
  );
});

test("artifact definitions only include supported backend artifact kinds", () => {
  assert.equal(SUPPORTED_ARTIFACT_KINDS.includes("publish_script"), true);
  assert.equal(SUPPORTED_ARTIFACT_KINDS.includes("quick_summary"), true);
  assert.equal(getArtifactDefinition("publish_script").label, "Publish Script");
  assert.equal(getArtifactDefinition("unsupported").label, "Artifact");
});

test("formatCount keeps dashboard metrics compact", () => {
  assert.equal(formatCount(48), "48");
  assert.equal(formatCount(1204), "1.2k");
});
