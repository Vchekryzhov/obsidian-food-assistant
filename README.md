# Food Assistant Module

## English

Food Assistant Module is a local-first Obsidian plugin for recipes, product cards, manual inventory, weekly menus, consumption history, and shopping lists. It installs a food-assistant module into your vault and opens Copilot Agent Chat with a prepared weekly-menu prompt. The plugin does not insert or send that prompt: you paste and send it yourself.

The module's scenarios and instructions are currently in Russian. It requires Obsidian desktop 1.11.4 or later. Copilot and Dataview are separate community plugins that must be installed and configured independently.

### Install

Install the three release assets — `main.js`, `manifest.json`, and `styles.css` — into `.obsidian/plugins/food-assistant-module/`, restart Obsidian, enable **Food Assistant Module**, and select **Install / repair** in the plugin settings. You can then use the ribbon button or the **Food Assistant Module: Create weekly menu** command.

### Data safety and Copilot

The installer updates its managed instructions only when they have not been edited locally. It never overwrites recipes, products, inventory, menus, or history, and removing the plugin does not remove vault data. Starting a weekly menu replaces the clipboard contents with the generated prompt after your explicit action; the plugin never reads previous clipboard contents. If clipboard access is unavailable, the prompt remains visible in the notification for manual copying. Copilot is opened through its public command; if it is unavailable, the notification explains how to continue manually.

## Русский

Локальный помощник по еде для Obsidian: рецепты, карточки продуктов, ручной инвентарь, недельное меню, история расхода и список покупок. Агент работает через Copilot Agent Chat с Codex и подпиской ChatGPT; отдельный OpenAI API key модулю не нужен.

Проект состоит из двух частей:

- Obsidian-плагин устанавливает, проверяет и запускает модуль;
- `module/` содержит переносимые инструкции, skills и начальные шаблоны.

## Что получает пользователь

После установки в vault появляются:

- `solidalarm/Питание/Еда.md` и два режима агента;
- стартовая страница `solidalarm/Питание/Помощник по еде.md`;
- пустые меню, инвентарь, история и список покупок;
- Dataview-каталоги рецептов и продуктов;
- единые шаблоны карточек рецепта и продукта;
- управляемый routing-блок в `AGENTS.md`.

Кнопка с иконкой приборов устанавливает или восстанавливает модуль, открывает стартовую страницу и запускает новый Copilot Agent Chat. Стартовый запрос копируется в буфер обмена — его остаётся вставить в чат.

## Требования

- desktop-версия Obsidian 1.11.4 или новее;
- community plugin **Dataview** для живых каталогов;
- community plugin **Copilot** с настроенным Codex backend;
- вход Codex через аккаунт ChatGPT с подходящей подпиской.

Copilot и Dataview не включены в этот пакет и устанавливаются отдельно.

## Быстрая установка beta через BRAT

Пока плагин проходит проверку Community directory, его можно установить из публичного GitHub-репозитория:

1. Установите community plugin **BRAT** в тестовый vault.
2. Откройте настройки BRAT и выберите **Add beta plugin**.
3. Вставьте `https://github.com/Vchekryzhov/obsidian-food-assistant`.
4. Включите **Food Assistant Module** в списке Community plugins.
5. Откройте настройки плагина и нажмите **Установить / восстановить**.

BRAT будет брать сборку из GitHub Release с версией, совпадающей с `manifest.json`.

## Ручная установка MVP

1. Соберите проект командой `npm ci && npm run build`.
2. Создайте в vault папку `.obsidian/plugins/food-assistant-module/`.
3. Скопируйте туда `main.js`, `manifest.json` и `styles.css`.
4. Перезапустите Obsidian и включите **Food Assistant Module** в Community plugins.
5. Откройте настройки плагина и нажмите **Установить / восстановить**.
6. В Copilot выберите Agent Chat, настройте Codex и войдите через ChatGPT.

После этого используйте иконку приборов или команду **Food Assistant Module: Составить меню на неделю**.

## Защита данных

Установщик различает инструкции и данные:

- управляемые инструкции модуля в `solidalarm/Питание/` обновляются только если после установки их не менял пользователь;
- существующие рецепты, продукты, меню, инвентарь и история никогда не перезаписываются;
- существующий `AGENTS.md` сохраняется, плагин управляет только блоком между собственными HTML-маркерами;
- при конфликте файл остаётся нетронутым, а пользователь получает уведомление;
- удаление плагина не удаляет содержимое vault.

Состояние установки хранится в `.food-assistant/installed.json`. Оно содержит только версию и контрольные суммы управляемых файлов.

## Формат модуля

`module/manifest.json` описывает идентификатор, версию, корневые пути, необязательные зависимости и политику данных. В Markdown-файлах можно использовать переменные:

- `{{dataRoot}}` — папка данных модуля, по умолчанию `solidalarm/Питание`;
- `{{moduleRoot}}` — путь инструкций агента, по умолчанию `solidalarm/Питание/Еда`.

Все файлы food-модуля находятся внутри namespace-папки `solidalarm`. Другие модули в будущем смогут использовать соседние папки, например `solidalarm/Здоровье`.

При обновлении уже установленной версии плагин не перемещает старые пользовательские файлы автоматически: сохранённые пользователем пути остаются в настройках. Перенос существующего vault в новый namespace должен быть отдельной подтверждаемой операцией.

Политики файлов задаются в коде упаковки:

- `managed` — пакет может обновить неизменённый файл;
- `create-if-missing` — пакет создаёт файл один раз и больше его не трогает.

Главная программная граница — `installFoodModule(vault, package)`. Obsidian и тестовый vault реализуют один маленький интерфейс файлового хранилища, поэтому правила сохранности данных тестируются без запуска Obsidian.

## Разработка

```bash
npm install
npm test
npm run build
```

Полная проверка: `npm run check`.

### UI-проверка

`npm run test:ui` запускает собранный плагин в отдельном временном vault и профиле Obsidian. Укажите `OBSIDIAN_UI_EXECUTABLE` — путь к исполняемому файлу проверяемого Obsidian. Команда не использует уже открытый Obsidian или личный vault; при сбое сохраняет скриншот и логи в `test-results/`. CI запускает её для Obsidian 1.11.4 и 1.13.7.

Для релиза приложите к GitHub Release три файла:

- `manifest.json`
- `main.js`
- `styles.css`

Тег релиза должен совпадать с версией в `manifest.json` без префикса `v`.

## Ограничения MVP

- Copilot не предоставляет стабильный публичный API для программной отправки сообщения, поэтому плагин открывает Agent Chat и копирует запрос, но не нажимает Send.
- Поиск и корзина магазина подключаются как отдельный MCP-инструмент агента; этот репозиторий не хранит токены магазина.
- Автоматические прогнозы расхода появятся после накопления подтверждённой истории; меню само по себе не списывает продукты.
