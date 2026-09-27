import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFoodModule } from "../src/installer.ts";
import {
  DEFAULT_PATHS,
  createFoodModulePackage,
  weeklyMenuPrompt
} from "../src/package-content.ts";
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

test("the factory builds the complete default package with ownership policies", () => {
  const modulePackage = createFoodModulePackage(DEFAULT_PATHS);

  assert.equal(modulePackage.id, "food-assistant");
  assert.equal(modulePackage.version, "0.2.0");
  assert.equal(modulePackage.displayName, "Помощник по еде");
  assert.deepEqual(
    modulePackage.files.map(({ path, policy }) => ({ path, policy })),
    [
      { path: "solidalarm/Питание/Еда.md", policy: "managed" },
      { path: "solidalarm/Питание/Еда/skills/weekly-menu/SKILL.md", policy: "managed" },
      { path: "solidalarm/Питание/Еда/skills/inventory-maintenance/SKILL.md", policy: "managed" },
      { path: "solidalarm/Питание/Помощник по еде.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Меню.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/История меню.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Инвентарь.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/История.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Список покупок.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Каталог рецептов.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Каталог продуктов.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Шаблоны/Карточка рецепта.md", policy: "create-if-missing" },
      { path: "solidalarm/Питание/Шаблоны/Карточка продукта.md", policy: "create-if-missing" }
    ]
  );
  assert.match(modulePackage.routeText, /\[\[solidalarm\/Питание\/Еда\]\]/);
  assert.match(modulePackage.routeText, /`solidalarm\/Питание\//);
  for (const file of modulePackage.files) {
    assert.doesNotMatch(file.content, /\{\{(?:dataRoot|moduleRoot)\}\}/);
    assert.equal(file.content.endsWith("\n"), true);
  }
});

test("the real food package installs every module file under the configured namespace", async () => {
  const modulePackage = createFoodModulePackage(DEFAULT_PATHS);
  const vault = new MemoryVault();

  const report = await installFoodModule(vault, modulePackage);

  assert.deepEqual(report.created, [
    ...modulePackage.files.map((file) => file.path),
    "AGENTS.md"
  ]);
  for (const file of modulePackage.files) {
    assert.equal(vault.files.get(file.path), file.content);
  }
  assert.equal(vault.files.has(".food-assistant/installed.json"), true);
  assert.match(vault.files.get("AGENTS.md") ?? "", /solidalarm\/Питание\/Еда/);
});

test("the factory normalizes custom roots in paths, content, routing, and prompt", () => {
  const paths = {
    dataRoot: "  ./Vault\\Food\\Data/  ",
    moduleRoot: " Modules\\Food/ "
  };
  const modulePackage = createFoodModulePackage(paths);

  assert.equal(modulePackage.files[0].path, "Modules/Food.md");
  assert.equal(modulePackage.files[3].path, "Vault/Food/Data/Помощник по еде.md");
  assert.match(modulePackage.files[0].content, /Vault\/Food\/Data/);
  assert.doesNotMatch(modulePackage.files[0].content, /\{\{(?:dataRoot|moduleRoot)\}\}/);
  assert.match(modulePackage.routeText, /\[\[Modules\/Food\]\]/);
  assert.match(modulePackage.routeText, /`Vault\/Food\/Data\//);
  assert.equal(
    weeklyMenuPrompt(paths),
    "Прочитай [[Modules/Food]] и запусти режим составления меню на неделю. Сначала проведи короткое интервью."
  );
});

test("the factory rejects unsafe roots", () => {
  for (const dataRoot of ["", "/absolute", "folder//data", "folder/./data", "folder/../data", "./"]) {
    assert.throws(() => createFoodModulePackage({ ...DEFAULT_PATHS, dataRoot }), /Папка данных/);
  }
  for (const moduleRoot of ["", "/absolute", "folder//module", "folder/./module", "folder/../module", "./"]) {
    assert.throws(() => createFoodModulePackage({ ...DEFAULT_PATHS, moduleRoot }), /Папка модуля/);
    assert.throws(() => weeklyMenuPrompt({ ...DEFAULT_PATHS, moduleRoot }), /Папка модуля/);
  }
});
