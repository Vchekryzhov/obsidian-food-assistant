import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

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
let obsidianProcess;
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
  await writeFile(
    path.join(profileDirectory, "obsidian.json"),
    JSON.stringify({
      updateDisabled: true,
      vaults: {
        foodAssistantUi: { path: vaultDirectory, open: true, ts: Date.now() }
      }
    })
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
  consoleMessages.push(error instanceof Error ? error.stack ?? error.message : String(error));
  await mkdir(resultsDirectory, { recursive: true });
  if (window) {
    await window.screenshot({ path: path.join(resultsDirectory, "obsidian-ui-failure.png"), fullPage: true }).catch(() => undefined);
  }
  await writeFile(path.join(resultsDirectory, "obsidian-ui.log"), consoleMessages.join("\n"));
  throw error;
} finally {
  await closeObsidian();
  await rm(vaultDirectory, { recursive: true, force: true });
  await rm(profileDirectory, { recursive: true, force: true });
}

async function launchObsidian() {
  obsidianProcess = spawn(
    executablePath,
    [
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=9222",
      vaultDirectory,
      `--user-data-dir=${profileDirectory}`
    ],
    { detached: process.platform !== "win32", env: process.env }
  );
  obsidianProcess.stdout.on("data", (data) => consoleMessages.push(data.toString()));
  obsidianProcess.stderr.on("data", (data) => consoleMessages.push(data.toString()));

  const launched = await connectToObsidian();
  const launchedWindow = await findObsidianWindow(launched);
  return { app: launched, window: launchedWindow };
}

async function connectToObsidian() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (obsidianProcess.exitCode !== null) {
      throw new Error(`Obsidian exited before opening its debugging port: ${consoleMessages.join("\n")}`);
    }
    try {
      return await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 1_000 });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for Obsidian's debugging port: ${String(lastError)}`);
}

async function findObsidianWindow(browser) {
  const deadline = Date.now() + 30_000;
  let pageUrls = [];
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    pageUrls = pages.map((page) => page.url());
    for (const page of pages) {
      if (await page.evaluate(() => "app" in window).catch(() => false)) {
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Obsidian's window. Open pages: ${pageUrls.join(", ")}`);
}

async function closeObsidian() {
  const processId = obsidianProcess?.pid;
  const exited = obsidianProcess?.exitCode === null ? once(obsidianProcess, "exit") : undefined;
  await app?.close().catch(() => undefined);
  if (processId) {
    try {
      process.kill(process.platform === "win32" ? processId : -processId);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code !== "ESRCH") {
        throw error;
      }
    }
  }
  if (exited) {
    await exited;
  }
  app = undefined;
  obsidianProcess = undefined;
  window = undefined;
}

async function restartObsidian() {
  await closeObsidian();
  ({ app, window } = await launchObsidian());
  window.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  await openPluginSettings();
}

async function openPluginSettings() {
  await enableCommunityPlugins();
  await window.keyboard.press("Control+,");
  await window.locator(".vertical-tab-nav-item-title").filter({ hasText: "Food Assistant Module" }).click();
  await window.getByText("Папка данных", { exact: true }).waitFor();
}

async function enableCommunityPlugins() {
  const pluginId = "food-assistant-module";
  await window.waitForFunction(
    (id) => Boolean(window.app.plugins?.manifests?.[id]),
    pluginId
  );
  const trustAuthor = window.getByRole("button", { name: "Trust author and enable plugins" });
  await trustAuthor
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => trustAuthor.click())
    .catch(() => undefined);
  const loaded = await window.evaluate(async (id) => {
    await window.app.plugins.setEnable(true);
    return id in window.app.plugins.plugins;
  }, pluginId);
  assert.equal(loaded, true, "Food Assistant Module did not load");
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
  await restartObsidian();
  await assert.equal(await window.locator("input[type=text]").nth(index).inputValue(), expectedValue);
}

async function installFromSettings() {
  await window.getByRole("button", { name: "Установить / восстановить" }).click();
  await window.locator(".setting-item-description").filter({ hasText: /Готово:|Модуль уже актуален\.|Установлено:/ }).waitFor();
  await assert.doesNotReject(() => readFile(path.join(vaultDirectory, "test/food-data/Помощник по еде.md"), "utf8"));
}

async function assertWeeklyMenuScenarios() {
  await window.getByRole("button", { name: "Составить меню" }).click();
  await window.getByText(/Не удалось открыть Copilot Agent Chat/).waitFor();

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
