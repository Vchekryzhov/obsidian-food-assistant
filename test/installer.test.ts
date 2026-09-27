import assert from "node:assert/strict";
import test from "node:test";
import type { ModulePackage } from "../src/contracts.ts";
import { formatInstallSummary, installFoodModule } from "../src/installer.ts";
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
  assert.deepEqual(report, {
    created: ["modules/Food.md", "Food/Inventory.md"],
    updated: ["AGENTS.md"],
    skipped: [],
    conflicts: []
  });
  assert.deepEqual([...vault.folders].sort(), [".food-assistant", "Food", "modules"].sort());
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
  assert.deepEqual(report.skipped, ["modules/Food.md", "Food/Inventory.md", "AGENTS.md"]);
  assert.deepEqual(report.conflicts, []);
  assert.equal((vault.files.get("AGENTS.md")?.match(/food-assistant:start/g) ?? []).length, 1);
});

test("pre-existing user files are skipped without changing their contents", async () => {
  const vault = new MemoryVault({ "Food/Inventory.md": "my real inventory\n" });

  const report = await installFoodModule(vault, packageVersion());

  assert.equal(vault.files.get("Food/Inventory.md"), "my real inventory\n");
  assert.deepEqual(report.skipped, ["Food/Inventory.md"]);
  assert.deepEqual(report.conflicts, []);
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

test("state records the package version and hashes of managed files", async () => {
  const vault = new MemoryVault();

  await installFoodModule(vault, packageVersion("0.2.0", "managed v2\n"));

  const state = JSON.parse(vault.files.get(".food-assistant/installed.json") ?? "") as {
    schemaVersion: number;
    packageId: string;
    packageVersion: string;
    managedFiles: Record<string, string>;
  };
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.packageId, "food-assistant");
  assert.equal(state.packageVersion, "0.2.0");
  assert.deepEqual(Object.keys(state.managedFiles), ["modules/Food.md"]);
  assert.match(state.managedFiles["modules/Food.md"], /^[0-9a-f]{8}$/);
});

test("routing is added, updated, and kept outside the managed block", async () => {
  const vault = new MemoryVault({
    "AGENTS.md": "# Local rules\n\n<!-- food-assistant:start -->\nOld route.\n<!-- food-assistant:end -->\n\n## More local rules\n"
  });

  const report = await installFoodModule(vault, packageVersion());
  const routing = vault.files.get("AGENTS.md") ?? "";

  assert.match(routing, /^# Local rules/);
  assert.match(routing, /Read \[\[modules\/Food\]\]\./);
  assert.match(routing, /## More local rules/);
  assert.equal((routing.match(/food-assistant:start/g) ?? []).length, 1);
  assert.deepEqual(report.updated, ["AGENTS.md"]);
  assert.deepEqual(report.created, ["modules/Food.md", "Food/Inventory.md"]);

  const secondReport = await installFoodModule(vault, packageVersion());
  assert.deepEqual(secondReport.skipped, ["modules/Food.md", "Food/Inventory.md", "AGENTS.md"]);
});

test("routing preserves a local edit outside its managed block", async () => {
  const vault = new MemoryVault({ "AGENTS.md": "# Local rules\n" });
  await installFoodModule(vault, packageVersion());
  vault.files.set("AGENTS.md", `${vault.files.get("AGENTS.md")}\n## Added locally\n`);

  const report = await installFoodModule(vault, packageVersion());

  assert.match(vault.files.get("AGENTS.md") ?? "", /## Added locally/);
  assert.deepEqual(report.skipped, ["modules/Food.md", "Food/Inventory.md", "AGENTS.md"]);
});

test("invalid or unrelated state cannot authorize an overwrite", async () => {
  const invalidStates = [
    "not json",
    JSON.stringify({ schemaVersion: 2, packageId: "food-assistant", managedFiles: {} }),
    JSON.stringify({ schemaVersion: 1, packageId: "other-package", managedFiles: {} }),
    JSON.stringify({ schemaVersion: 1, packageId: "food-assistant", managedFiles: {} })
  ];

  for (const installedState of invalidStates) {
    const vault = new MemoryVault({
      "modules/Food.md": "pre-existing\n",
      ".food-assistant/installed.json": installedState
    });

    const report = await installFoodModule(vault, packageVersion("0.2.0", "managed v2\n"));

    assert.equal(vault.files.get("modules/Food.md"), "pre-existing\n");
    assert.deepEqual(report.conflicts, ["modules/Food.md"]);
  }
});

test("normalized equivalent paths do not create duplicate files", async () => {
  const vault = new MemoryVault();
  const modulePackage = packageVersion();
  modulePackage.files = [
    { ...modulePackage.files[0], path: ".\\modules//Food.md" },
    { ...modulePackage.files[1], path: ".\\Food//Inventory.md" }
  ];

  const report = await installFoodModule(vault, modulePackage);

  assert.equal(vault.files.get("modules/Food.md"), "managed v1\n");
  assert.equal(vault.files.get("Food/Inventory.md"), "user data\n");
  assert.deepEqual(report.created, ["modules/Food.md", "Food/Inventory.md", "AGENTS.md"]);
  assert.equal(vault.files.has(".\\modules//Food.md"), false);
});

test("unsafe paths and package metadata are rejected before writing", async () => {
  const invalidPaths = ["", "/absolute.md", "../escape.md", "folder/../file.md", "folder/./file.md", "folder/"];

  for (const path of invalidPaths) {
    const vault = new MemoryVault();
    const invalid = packageVersion();
    invalid.files[0] = { ...invalid.files[0], path };

    await assert.rejects(() => installFoodModule(vault, invalid), /Unsafe vault path/);
    assert.equal(vault.files.size, 0);
    assert.equal(vault.folders.size, 0);
  }

  const duplicate = packageVersion();
  duplicate.files[1] = { ...duplicate.files[1], path: "./modules//Food.md" };
  const duplicateVault = new MemoryVault();
  await assert.rejects(() => installFoodModule(duplicateVault, duplicate), /Duplicate module file/);
  assert.equal(duplicateVault.files.size, 0);

  const incomplete = { ...packageVersion(), displayName: "" };
  const incompleteVault = new MemoryVault();
  await assert.rejects(() => installFoodModule(incompleteVault, incomplete), /metadata is incomplete/);
  assert.equal(incompleteVault.files.size, 0);
});

test("install summaries describe unchanged, changed, and conflicting installs", () => {
  assert.equal(
    formatInstallSummary({ created: [], updated: [], skipped: ["AGENTS.md"], conflicts: [] }),
    "Модуль уже актуален."
  );
  assert.equal(
    formatInstallSummary({ created: ["new.md"], updated: ["old.md"], skipped: [], conflicts: [] }),
    "Готово: создано 1, обновлено 1."
  );
  assert.equal(
    formatInstallSummary({ created: ["new.md"], updated: [], skipped: [], conflicts: ["old.md"] }),
    "Установлено: 1. Не перезаписаны изменённые файлы: old.md."
  );
});
