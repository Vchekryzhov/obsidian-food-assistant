import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting
} from "obsidian";
import { formatInstallSummary, installFoodModule } from "./installer.ts";
import { ObsidianVaultWriter } from "./obsidian-vault-writer.ts";
import {
  DEFAULT_PATHS,
  createFoodModulePackage,
  weeklyMenuPrompt,
  type FoodModulePaths
} from "./package-content.ts";

interface FoodAssistantSettings extends FoodModulePaths {}

const DEFAULT_SETTINGS: FoodAssistantSettings = { ...DEFAULT_PATHS };

export default class FoodAssistantPlugin extends Plugin {
  settings: FoodAssistantSettings = DEFAULT_SETTINGS;
  lastStatus = "Модуль ещё не проверялся.";

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("utensils", "Составить меню на неделю", () => {
      void this.startWeeklyMenu();
    });

    this.addCommand({
      id: "install-or-repair",
      name: "Установить или восстановить модуль",
      callback: () => void this.installOrRepair()
    });
    this.addCommand({
      id: "open-home",
      name: "Открыть помощник по еде",
      callback: () => void this.openHome()
    });
    this.addCommand({
      id: "start-weekly-menu",
      name: "Составить меню на неделю",
      callback: () => void this.startWeeklyMenu()
    });

    this.addSettingTab(new FoodAssistantSettingTab(this.app, this));
  }

  async installOrRepair(): Promise<boolean> {
    try {
      const modulePackage = createFoodModulePackage(this.settings);
      const report = await installFoodModule(
        new ObsidianVaultWriter(this.app.vault),
        modulePackage
      );
      this.lastStatus = formatInstallSummary(report);
      new Notice(this.lastStatus, 6000);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastStatus = `Ошибка установки: ${message}`;
      new Notice(this.lastStatus, 8000);
      return false;
    }
  }

  async openHome(): Promise<void> {
    if (!(await this.installOrRepair())) {
      return;
    }
    const path = `${this.settings.dataRoot}/Помощник по еде`;
    await this.app.workspace.openLinkText(path, "", false);
  }

  async startWeeklyMenu(): Promise<void> {
    await this.openHome();
    const prompt = weeklyMenuPrompt(this.settings);
    let copied = false;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      copied = false;
    }

    const opened = executeObsidianCommand(this.app, "copilot:new-agent-chat");
    if (!opened) {
      new Notice(
        `Не удалось открыть Copilot Agent Chat. Откройте его вручную и отправьте: ${prompt}`,
        10000
      );
      return;
    }
    new Notice(
      copied
        ? "Agent Chat открыт. Запрос скопирован — вставьте его в чат."
        : `Agent Chat открыт. Отправьте: ${prompt}`,
      8000
    );
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<FoodAssistantSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class FoodAssistantSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: FoodAssistantPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Помощник по еде" });
    containerEl.createEl("p", {
      text: "Установщик обновляет только свои инструкции. Рецепты, продукты, инвентарь, меню и историю он не перезаписывает."
    });

    new Setting(containerEl)
      .setName("Папка данных")
      .setDesc("Здесь хранятся рецепты, продукты, меню и история.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_PATHS.dataRoot)
          .setValue(this.plugin.settings.dataRoot)
          .onChange(async (value) => {
            this.plugin.settings.dataRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Папка инструкций")
      .setDesc("Маршрутизатор и skills для агента.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_PATHS.moduleRoot)
          .setValue(this.plugin.settings.moduleRoot)
          .onChange(async (value) => {
            this.plugin.settings.moduleRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const actions = containerEl.createDiv({ cls: "food-assistant-actions" });
    new Setting(actions)
      .setName("Установка")
      .addButton((button) =>
        button.setButtonText("Установить / восстановить").setCta().onClick(async () => {
          await this.plugin.installOrRepair();
          this.display();
        })
      );
    new Setting(actions)
      .setName("Запуск")
      .addButton((button) =>
        button.setButtonText("Составить меню").onClick(async () => {
          await this.plugin.startWeeklyMenu();
        })
      );

    containerEl.createDiv({
      cls: "food-assistant-status",
      text: this.plugin.lastStatus
    });
  }
}

function executeObsidianCommand(app: App, commandId: string): boolean {
  const commandHost = app as App & {
    commands?: { executeCommandById(id: string): boolean };
  };
  return commandHost.commands?.executeCommandById(commandId) ?? false;
}
