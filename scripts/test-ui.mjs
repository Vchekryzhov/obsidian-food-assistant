import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { _electron as electron } from "playwright";

const executablePath = process.env.OBSIDIAN_UI_EXECUTABLE;
if (!executablePath) {
  throw new Error("Set OBSIDIAN_UI_EXECUTABLE to the Obsidian executable to run UI tests.");
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const resultsDirectory = path.join(projectRoot, "test-results");
const vaultDirectory = await mkdtemp(path.join(tmpdir(), "food-assistant-ui-vault-"));
const profileDirectory = await mkdtemp(path.join(tmpdir(), "food-assistant-ui-profile-"));
const pluginDirectory = path.join(vaultDirectory, ".obsidian", "plugins", "food-assistant-module");
const consoleMessages = [];
let app;
let window;

try {
  await mkdir(pluginDirectory, { recursive: true });
  await Promise.all(
    ["main.js", "manifest.json", "styles.css"].map((file) =>
      cp(path.join(projectRoot, file), path.join(pluginDirectory, file))
    )
  );
  await writeFile(
    path.join(vaultDirectory, ".obsidian", "community-plugins.json"),
    JSON.stringify(["food-assistant-module"])
  );

  ({ app, window } = await launchObsidian());
  window.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  await openPluginSettings();

  await assertSettingsVisible();
  await updateFolderAndRestart("dataRoot", "  test/food-data  ", "test/food-data");
  await updateFolderAndRestart("moduleRoot", "  test/food-module  ", "test/food-module");
  await installFromSettings();
  await assertWeeklyMenuScenarios();
} catch (error) {
  await mkdir(resultsDirectory, { recursive: true });
  if (window) {
    await window.screenshot({ path: path.join(resultsDirectory, "obsidian-ui-failure.png"), fullPage: true }).catch(() => undefined);
  }
  await writeFile(path.join(resultsDirectory, "obsidian-ui.log"), consoleMessages.join("\n"));
  throw error;
} finally {
  await app?.close();
  await rm(vaultDirectory, { recursive: true, force: true });
  await rm(profileDirectory, { recursive: true, force: true });
}

async function launchObsidian() {
  const launched = await electron.launch({
    executablePath,
    args: [vaultDirectory, `--user-data-dir=${profileDirectory}`, "--no-sandbox"]
  });
  const launchedWindow = await launched.firstWindow();
  await launchedWindow.waitForFunction(() => "app" in window);
  return { app: launched, window: launchedWindow };
}

async function openPluginSettings() {
  await window.evaluate(() => {
    const obsidian = window.app;
    obsidian.setting.open();
    obsidian.setting.openTabById("food-assistant-module");
  });
  await window.getByText("Папка данных", { exact: true }).waitFor();
}

async function assertSettingsVisible() {
  await window.getByText("Папка инструкций", { exact: true }).waitFor();
  await window.getByRole("button", { name: "Установить / восстановить" }).waitFor();
  await window.getByRole("button", { name: "Составить меню" }).waitFor();
}

async function updateFolderAndRestart(key, rawValue, expectedValue) {
  const inputs = window.locator("input[type=text]");
  const index = key === "dataRoot" ? 0 : 1;
  await inputs.nth(index).fill(rawValue);
  await inputs.nth(index).blur();
  await window.waitForFunction(
    async ({ pluginId, settingKey, settingValue }) => {
      const dataPath = `.obsidian/plugins/${pluginId}/data.json`;
      if (!(await window.app.vault.adapter.exists(dataPath))) {
        return false;
      }
      const saved = JSON.parse(await window.app.vault.adapter.read(dataPath));
      return saved[settingKey] === settingValue;
    },
    { pluginId: "food-assistant-module", settingKey: key, settingValue: expectedValue }
  );
  await app.close();
  ({ app, window } = await launchObsidian());
  window.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  await openPluginSettings();
  await assert.equal(await window.locator("input[type=text]").nth(index).inputValue(), expectedValue);
}

async function installFromSettings() {
  await window.getByRole("button", { name: "Установить / восстановить" }).click();
  await window.getByText(/Готово:|Модуль уже актуален\.|Установлено:/).waitFor();
  await assert.doesNotReject(() => readFile(path.join(vaultDirectory, "test/food-data/Помощник по еде.md"), "utf8"));
}

async function assertWeeklyMenuScenarios() {
  await window.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text) => Promise.resolve((window.__foodAssistantClipboard = text)) }
    });
  });
  await window.getByRole("button", { name: "Составить меню" }).click();
  await window.getByText(/Не удалось открыть Copilot Agent Chat/).waitFor();
  assert.match(await window.evaluate(() => window.__foodAssistantClipboard), /Прочитай/);

  await window.evaluate(() => {
    window.app.commands.commands["copilot:new-agent-chat"] = {
      id: "copilot:new-agent-chat",
      name: "Test Copilot command",
      callback: () => (window.__foodAssistantCopilotOpened = true)
    };
  });
  await window.evaluate(() => window.app.commands.executeCommandById("food-assistant-module:start-weekly-menu"));
  await window.getByText(/Agent Chat открыт/).waitFor();
  assert.equal(await window.evaluate(() => window.__foodAssistantCopilotOpened), true);
}
