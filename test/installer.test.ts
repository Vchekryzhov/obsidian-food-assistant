import assert from "node:assert/strict";
import test from "node:test";
import type { ModulePackage } from "../src/contracts.ts";
import { installFoodModule } from "../src/installer.ts";
import { MemoryVault } from "./memory-vault.ts";

function packageVersion(version = "0.1.0", instructions = "managed v1\n"): ModulePackage {
  return {
    id: "food-assistant",
    version,
    displayName: "Food Assistant",
    routeText: "Read [[modules/Food]].",
    files: [
      { path: "modules/Food.md", content: instructions, policy: "managed" },
      { path: "Food/Inventory.md", content: "user data\n", policy: "create-if-missing" }
    ]
  };
}

test("fresh install creates module, user data, routing, and state", async () => {
  const vault = new MemoryVault({ "AGENTS.md": "# Existing rules\n" });
  const report = await installFoodModule(vault, packageVersion());

  assert.equal(vault.files.get("modules/Food.md"), "managed v1\n");
  assert.equal(vault.files.get("Food/Inventory.md"), "user data\n");
  assert.match(vault.files.get("AGENTS.md") ?? "", /# Existing rules/);
  assert.match(vault.files.get("AGENTS.md") ?? "", /food-assistant:start/);
  assert.match(vault.files.get(".food-assistant/installed.json") ?? "", /"packageVersion": "0.1.0"/);
  assert.deepEqual(report.conflicts, []);
});

test("reinstall is idempotent and preserves user data", async () => {
  const vault = new MemoryVault();
  await installFoodModule(vault, packageVersion());
  vault.files.set("Food/Inventory.md", "my real inventory\n");

  const report = await installFoodModule(vault, packageVersion());

  assert.equal(vault.files.get("Food/Inventory.md"), "my real inventory\n");
  assert.deepEqual(report.created, []);
  assert.deepEqual(report.updated, []);
  assert.deepEqual(report.conflicts, []);
  assert.equal((vault.files.get("AGENTS.md")?.match(/food-assistant:start/g) ?? []).length, 1);
});

test("clean managed files update to a new package version", async () => {
  const vault = new MemoryVault();
  await installFoodModule(vault, packageVersion());

  const report = await installFoodModule(vault, packageVersion("0.2.0", "managed v2\n"));

  assert.equal(vault.files.get("modules/Food.md"), "managed v2\n");
  assert.deepEqual(report.updated, ["modules/Food.md"]);
});

test("locally edited managed files become conflicts instead of being overwritten", async () => {
  const vault = new MemoryVault();
  await installFoodModule(vault, packageVersion());
  vault.files.set("modules/Food.md", "my edits\n");

  const report = await installFoodModule(vault, packageVersion("0.2.0", "managed v2\n"));

  assert.equal(vault.files.get("modules/Food.md"), "my edits\n");
  assert.deepEqual(report.conflicts, ["modules/Food.md"]);
});

test("pre-existing unowned managed path is preserved", async () => {
  const vault = new MemoryVault({ "modules/Food.md": "pre-existing\n" });

  const report = await installFoodModule(vault, packageVersion());

  assert.equal(vault.files.get("modules/Food.md"), "pre-existing\n");
  assert.deepEqual(report.conflicts, ["modules/Food.md"]);
});

test("unsafe paths are rejected", async () => {
  const vault = new MemoryVault();
  const invalid = packageVersion();
  invalid.files[0] = { ...invalid.files[0], path: "../escape.md" };

  await assert.rejects(() => installFoodModule(vault, invalid), /Unsafe vault path/);
});
