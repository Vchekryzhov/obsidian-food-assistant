import moduleManifest from "../module/manifest.json";
import moduleInstructions from "../module/instructions/Еда.md";
import weeklyMenuSkill from "../module/skills/weekly-menu/SKILL.md";
import inventorySkill from "../module/skills/inventory-maintenance/SKILL.md";
import helperTemplate from "../module/templates/Помощник по еде.md";
import menuTemplate from "../module/templates/Меню.md";
import menuHistoryTemplate from "../module/templates/История меню.md";
import inventoryTemplate from "../module/templates/Инвентарь.md";
import historyTemplate from "../module/templates/История.md";
import shoppingTemplate from "../module/templates/Список покупок.md";
import recipesCatalogTemplate from "../module/templates/Каталог рецептов.md";
import productsCatalogTemplate from "../module/templates/Каталог продуктов.md";
import recipeCardTemplate from "../module/templates/Карточка рецепта.md";
import productCardTemplate from "../module/templates/Карточка продукта.md";
import type { ModuleFile, ModulePackage } from "./contracts.ts";

export interface FoodModulePaths {
  dataRoot: string;
  moduleRoot: string;
}

export const DEFAULT_PATHS: FoodModulePaths = {
  dataRoot: moduleManifest.defaultDataRoot,
  moduleRoot: moduleManifest.defaultModuleRoot
};

export function createFoodModulePackage(paths: FoodModulePaths): ModulePackage {
  const dataRoot = normalizeRoot(paths.dataRoot, "Папка данных");
  const moduleRoot = normalizeRoot(paths.moduleRoot, "Папка модуля");
  const variables = { dataRoot, moduleRoot };

  const managed = (path: string, content: string): ModuleFile => ({
    path: render(path, variables),
    content: ensureTrailingNewline(render(content, variables)),
    policy: "managed"
  });
  const userFile = (path: string, content: string): ModuleFile => ({
    path: render(path, variables),
    content: ensureTrailingNewline(render(content, variables)),
    policy: "create-if-missing"
  });

  return {
    id: moduleManifest.id,
    version: moduleManifest.version,
    displayName: moduleManifest.displayName,
    routeText: [
      "## Помощник по еде",
      "",
      `Для запросов о еде, рецептах, меню, продуктах, инвентаре и покупках сначала прочитай [[${moduleRoot}]] и следуй указанному там режиму.`,
      `Пользовательские данные находятся в \`${dataRoot}/\`; не списывай продукты без подтверждения.`
    ].join("\n"),
    files: [
      managed("{{moduleRoot}}.md", moduleInstructions),
      managed("{{moduleRoot}}/skills/weekly-menu/SKILL.md", weeklyMenuSkill),
      managed("{{moduleRoot}}/skills/inventory-maintenance/SKILL.md", inventorySkill),
      userFile("{{dataRoot}}/Помощник по еде.md", helperTemplate),
      userFile("{{dataRoot}}/Меню.md", menuTemplate),
      userFile("{{dataRoot}}/История меню.md", menuHistoryTemplate),
      userFile("{{dataRoot}}/Инвентарь.md", inventoryTemplate),
      userFile("{{dataRoot}}/История.md", historyTemplate),
      userFile("{{dataRoot}}/Список покупок.md", shoppingTemplate),
      userFile("{{dataRoot}}/Каталог рецептов.md", recipesCatalogTemplate),
      userFile("{{dataRoot}}/Каталог продуктов.md", productsCatalogTemplate),
      userFile("{{dataRoot}}/Шаблоны/Карточка рецепта.md", recipeCardTemplate),
      userFile("{{dataRoot}}/Шаблоны/Карточка продукта.md", productCardTemplate)
    ]
  };
}

export function weeklyMenuPrompt(paths: FoodModulePaths): string {
  const moduleRoot = normalizeRoot(paths.moduleRoot, "Папка модуля");
  return `Прочитай [[${moduleRoot}]] и запусти режим составления меню на неделю. Сначала проведи короткое интервью.`;
}

function render(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(dataRoot|moduleRoot)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function normalizeRoot(value: string, label: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} должна быть относительным безопасным путём.`);
  }
  return normalized;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
