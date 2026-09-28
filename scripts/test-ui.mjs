import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const executablePath = process.env.OBSIDIAN_UI_EXECUTABLE;
if (!executablePath) {
  throw new Error("Set OBSIDIAN_UI_EXECUTABLE to the Obsidian executable to run UI tests.");
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const resultsDirectory = path.join(projectRoot, "test-results");
const vaultDirectory = await mkdtemp(path.join(tmpdir(), "food-assistant-ui-vault-"));
const profileDirectory = await mkdtemp(path.join(tmpdir(), "food-assistant-ui-profile-"));
const pluginId = "food-assistant-module";
const pluginDirectory = path.join(vaultDirectory, ".obsidian", "plugins", pluginId);
const debuggingPort = await getAvailablePort();
const consoleMessages = [];
let app;
let obsidianProcess;
let window;
let settingsWindow;
let stage = "prepare isolated application";

try {
  await mkdir(pluginDirectory, { recursive: true });
  await Promise.all(
    ["main.js", "manifest.json", "styles.css"].map((file) =>
      cp(path.join(projectRoot, file), path.join(pluginDirectory, file))
    )
  );
  await writeFile(
    path.join(vaultDirectory, ".obsidian", "community-plugins.json"),
    JSON.stringify([pluginId])
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
  stage = "open plugin settings";
  await openPluginSettings();

  stage = "settings visible";
  await assertSettingsVisible();
  stage = "search both folder settings";
  await assertSettingsSearch();
  stage = "persist dataRoot after restart";
  await updateFolderAndRestart("dataRoot", "  test/food-data  ", "test/food-data");
  stage = "persist moduleRoot after restart";
  await updateFolderAndRestart("moduleRoot", "  test/food-module  ", "test/food-module");
  stage = "install module and refresh status";
  await installFromSettings();
  stage = "weekly menu actions";
  await assertWeeklyMenuScenarios();
  console.log("Obsidian UI scenarios passed.");
} catch (error) {
  consoleMessages.push(`Failed stage: ${stage}`);
  consoleMessages.push(error instanceof Error ? error.stack ?? error.message : String(error));
  await mkdir(resultsDirectory, { recursive: true });
  if (window) {
    await captureUiDiagnostics();
    const pages = app?.contexts().flatMap((context) => context.pages()) ?? [window];
    await Promise.allSettled(pages.map((page, index) =>
      page.screenshot({ path: path.join(resultsDirectory, `obsidian-ui-failure-${index}.png`), fullPage: true, timeout: 5_000 })
    ));
  }
  await writeFile(path.join(resultsDirectory, "obsidian-ui.log"), consoleMessages.join("\n"));
  throw error;
} finally {
  await closeObsidian();
  await rm(vaultDirectory, { recursive: true, force: true });
  await rm(profileDirectory, { recursive: true, force: true });
}

async function captureUiDiagnostics() {
  const diagnostics = await window
    .evaluate((id) => {
      const controls = [...document.querySelectorAll("button, [aria-label], [data-tooltip-position]")]
        .map((element) => {
          const htmlElement = element;
          const rect = htmlElement.getBoundingClientRect();
          return {
            tag: htmlElement.tagName,
            className: htmlElement.className,
            ariaLabel: htmlElement.getAttribute("aria-label"),
            title: htmlElement.getAttribute("title"),
            tooltip: htmlElement.getAttribute("data-tooltip-position"),
            text: htmlElement.textContent?.trim().slice(0, 80) ?? "",
            visible: rect.width > 0 && rect.height > 0
          };
        })
        .filter((control) => control.ariaLabel || control.title || control.text)
        .slice(-80);
      return {
        applicationTitle: document.title,
        settingsCommandIds: Object.keys(window.app?.commands?.commands ?? {}).filter((commandId) => commandId.includes("settings")),
        settingMethods: Object.keys(window.app?.setting ?? {}),
        pluginDiscovered: Boolean(window.app?.plugins?.manifests?.[id]),
        pluginLoaded: Boolean(window.app?.plugins?.plugins?.[id]),
        controls
      };
    }, pluginId)
    .catch((diagnosticError) => ({ diagnosticError: String(diagnosticError) }));
  consoleMessages.push(`[food-assistant-ui] ${JSON.stringify(diagnostics)}`);
  for (const page of app?.contexts().flatMap((context) => context.pages()) ?? []) {
    consoleMessages.push(`[food-assistant-ui-page] ${JSON.stringify({
      url: page.url(),
      frames: await Promise.all(page.frames().map(async (frame) => ({
        url: frame.url(),
        settingsVisible: await frame.locator(".mod-settings").isVisible().catch(() => false)
      })))
    })}`);
  }
}

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function launchObsidian() {
  obsidianProcess = spawn(
    executablePath,
    [
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${debuggingPort}`,
      vaultDirectory,
      `--user-data-dir=${profileDirectory}`
    ],
    { detached: process.platform !== "win32", env: process.env }
  );
  obsidianProcess.stdout.on("data", (data) => consoleMessages.push(data.toString()));
  obsidianProcess.stderr.on("data", (data) => consoleMessages.push(data.toString()));

  const launched = await connectToObsidian();
  app = launched;
  for (const context of launched.contexts()) {
    const observe = (page) => {
      page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
      page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
      page.setDefaultTimeout(15_000);
    };
    context.pages().forEach(observe);
    context.on("page", observe);
  }
  const launchedWindow = await findObsidianWindow(launched);
  await launchedWindow.waitForFunction((expectedPath) =>
    window.app?.vault?.adapter?.getBasePath?.() === expectedPath,
  vaultDirectory);
  window = launchedWindow;
  await launchedWindow.waitForFunction(() => /Obsidian v?\d+\.\d+\.\d+/.test(document.title));
  const runtimeVersion = (await launchedWindow.title()).match(/Obsidian v?(\d+\.\d+\.\d+)/)?.[1];
  consoleMessages.push(`Runtime: ${runtimeVersion}; debugging port: ${debuggingPort}`);
  if (process.env.OBSIDIAN_UI_VERSION) {
    assert.equal(runtimeVersion, process.env.OBSIDIAN_UI_VERSION, "Unexpected Obsidian runtime version");
  }
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
      return await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`, { timeout: 1_000 });
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
    const stopped = await Promise.race([exited.then(() => true), delay(5_000).then(() => false)]);
    if (!stopped) {
      try {
        process.kill(process.platform === "win32" ? processId : -processId, "SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
      await Promise.race([exited, delay(5_000)]);
    }
  }
  await Promise.race([app?.close().catch(() => undefined), delay(5_000)]);
  app = undefined;
  obsidianProcess = undefined;
  window = undefined;
  settingsWindow = undefined;
}

async function restartObsidian() {
  await closeObsidian();
  ({ app, window } = await launchObsidian());
  await openPluginSettings();
}

async function openPluginSettings() {
  await enableCommunityPlugins();
  const opened = await window.evaluate(() => window.app.commands.executeCommandById("app:open-settings"));
  assert.equal(opened, true, "Obsidian settings command is unavailable");
  settingsWindow = await findSettingsWindow();
  await settingsWindow.locator(".vertical-tab-nav-item-title").filter({ hasText: /^Food Assistant Module$/ }).click();
  await settingsWindow.getByText("Папка данных", { exact: true }).waitFor();
}

async function findSettingsWindow() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of app.contexts().flatMap((context) => context.pages())) {
      for (const frame of page.frames()) {
        if (await frame.locator(".mod-settings").isVisible().catch(() => false)) {
          return frame;
        }
      }
    }
    await delay(100);
  }
  throw new Error("Obsidian did not show a settings window in the owned browser session");
}

async function enableCommunityPlugins() {
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
  await settingsWindow.getByText("Папка инструкций", { exact: true }).waitFor();
  await settingsWindow.getByRole("button", { name: "Установить / восстановить", exact: true }).waitFor();
  await settingsWindow.getByRole("button", { name: "Составить меню", exact: true }).waitFor();
}

async function assertSettingsSearch() {
  const supportsSearch = await window.evaluate(() => Boolean(window.app.setting.searchComponent));
  if (!supportsSearch) {
    assert.match(await window.title(), /Obsidian v?1\.11\.4/, "Search is required on Obsidian 1.13+");
    return;
  }
  const search = settingsWindow.locator(".setting-search-container input");
  for (const key of ["dataRoot", "moduleRoot"]) {
    const name = key === "dataRoot" ? "Папка данных" : "Папка инструкций";
    const value = await folderInput(key).inputValue();
    await search.fill(name);
    await settingsWindow.locator(".setting-search-results").getByText(name, { exact: true }).click();
    await folderInput(key).waitFor({ state: "visible" });
    assert.equal(await folderInput(key).inputValue(), value);
    await search.fill("");
  }
}

function folderInput(key) {
  const name = key === "dataRoot" ? "Папка данных" : "Папка инструкций";
  return settingsWindow.locator(".setting-item").filter({
    has: settingsWindow.getByText(name, { exact: true })
  }).locator("input[type=text]");
}

async function updateFolderAndRestart(key, rawValue, expectedValue) {
  await folderInput(key).fill(rawValue);
  await folderInput(key).blur();
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
  assert.equal(await folderInput(key).inputValue(), expectedValue);
}

async function installFromSettings() {
  await settingsWindow.getByRole("button", { name: "Установить / восстановить", exact: true }).click();
  await settingsWindow.locator(".setting-item-description").filter({ hasText: /Готово:|Модуль уже актуален\.|Установлено:/ }).waitFor();
  await assert.doesNotReject(() => readFile(path.join(vaultDirectory, "test/food-data/Помощник по еде.md"), "utf8"));
  await settingsWindow.getByRole("button", { name: "Установить / восстановить", exact: true }).click();
  await settingsWindow.locator(".setting-item-description").filter({ hasText: "Модуль уже актуален." }).waitFor();
  await restartObsidian();
  await settingsWindow.getByRole("button", { name: "Установить / восстановить", exact: true }).click();
  await settingsWindow.locator(".setting-item-description").filter({ hasText: "Модуль уже актуален." }).waitFor();
}

async function assertWeeklyMenuScenarios() {
  await window.evaluate(() => {
    window.__foodAssistantClipboard = { writes: [], reject: false };
    window.__foodAssistantCopilotCalls = 0;
    // Obsidian owns a non-configurable navigator.clipboard getter and delegates
    // writes to Electron. Stub that OS boundary, including across popout focus.
    window.electron.clipboard.writeText = (text) => {
      const state = window.__foodAssistantClipboard;
      if (state.reject) throw new Error("Synthetic clipboard rejection");
      state.writes.push(text);
    };
  });
  assert.deepEqual(await window.evaluate(() => window.__foodAssistantClipboard.writes), []);
  await settingsWindow.getByRole("button", { name: "Составить меню", exact: true }).click();
  await waitForNotice(/Не удалось открыть Copilot Agent Chat/);
  const expectedPrompt = "Прочитай [[test/food-module]] и запусти режим составления меню на неделю. Сначала проведи короткое интервью.";
  assert.deepEqual(await window.evaluate(() => window.__foodAssistantClipboard.writes), [expectedPrompt]);

  await window.evaluate(() => {
    window.app.commands.commands["copilot:new-agent-chat"] = {
      id: "copilot:new-agent-chat",
      name: "Test Copilot command",
      callback: () => { window.__foodAssistantCopilotCalls += 1; }
    };
  });
  assert.equal(await window.evaluate(() => window.app.commands.executeCommandById("food-assistant-module:start-weekly-menu")), true);
  await window.waitForFunction(() => window.__foodAssistantCopilotCalls === 1);
  await waitForNotice(/Agent Chat открыт\. Запрос скопирован/);
  assert.deepEqual(await window.evaluate(() => window.__foodAssistantClipboard.writes), [expectedPrompt, expectedPrompt]);

  await window.evaluate(() => { window.__foodAssistantClipboard.reject = true; });
  assert.equal(await window.evaluate(() => window.app.commands.executeCommandById("food-assistant-module:start-weekly-menu")), true);
  await window.waitForFunction(() => window.__foodAssistantCopilotCalls === 2);
  await waitForNotice(/Agent Chat открыт\. Отправьте:/);
  assert.deepEqual(await window.evaluate(() => window.__foodAssistantClipboard.writes), [expectedPrompt, expectedPrompt]);

  await window.evaluate(() => {
    window.__foodAssistantClipboard.reject = false;
    window.app.setting.close();
  });
  await window.getByLabel("Составить меню на неделю", { exact: true }).click();
  await window.waitForFunction(() => window.__foodAssistantCopilotCalls === 3);
  await waitForNotice(/Agent Chat открыт\. Запрос скопирован/);
  assert.deepEqual(await window.evaluate(() => window.__foodAssistantClipboard.writes), [expectedPrompt, expectedPrompt, expectedPrompt]);
}

async function waitForNotice(text) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of app.contexts().flatMap((context) => context.pages())) {
      for (const frame of page.frames()) {
        if (await frame.locator(".notice").filter({ hasText: text }).last().isVisible().catch(() => false)) return;
      }
    }
    await delay(100);
  }
  throw new Error(`Obsidian did not display the expected notice: ${text}`);
}
