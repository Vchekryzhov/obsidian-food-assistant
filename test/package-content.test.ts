import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFoodModule } from "../src/installer.ts";
import { MemoryVault } from "./memory-vault.ts";

test("food module defaults live under the solidalarm namespace", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../module/manifest.json", import.meta.url), "utf8")
  ) as {
    id: string;
    version: string;
    displayName: string;
    defaultDataRoot: string;
    defaultModuleRoot: string;
  };

  assert.deepEqual(
    {
      dataRoot: manifest.defaultDataRoot,
      moduleRoot: manifest.defaultModuleRoot
    },
    {
      dataRoot: "solidalarm/Питание",
      moduleRoot: "solidalarm/Питание/Еда"
    }
  );

  const vault = new MemoryVault();
  await installFoodModule(vault, {
    id: manifest.id,
    version: manifest.version,
    displayName: manifest.displayName,
    routeText: "Read [[solidalarm/Питание/Еда]].",
    files: [
      {
        path: "solidalarm/Питание/Еда.md",
        content: "managed instructions\n",
        policy: "managed"
      },
      {
        path: "solidalarm/Питание/Помощник по еде.md",
        content: "user home\n",
        policy: "create-if-missing"
      }
    ]
  });

  assert.equal(vault.files.get("solidalarm/Питание/Еда.md") !== undefined, true);
  assert.equal(vault.files.get("solidalarm/Питание/Помощник по еде.md") !== undefined, true);
  assert.equal(vault.files.has("modules/Еда.md"), false);
  assert.match(vault.files.get("AGENTS.md") ?? "", /solidalarm\/Питание\/Еда/);
});
