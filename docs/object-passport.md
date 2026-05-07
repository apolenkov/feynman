# Feynman Product Passport

## 1) Миссия и область применения

`feynman` — plugin для Claude Code и Codex, который injects ASCII-правила диаграмм в каждый prompt на слое `UserPromptSubmit`.

Главная задача: ускорить расшифровку структуры и снизить когнитивную нагрузку в ответах с потоками, иерархией, сравнением и статусами.

Не делает:
- бизнес-логику приложения,
- редизайн ответа API/фронтенда,
- сетевые вызовы или фоновое хранение текстовых логов.

## 2) Артефакты проекта

| Слой | Артефакт | Назначение |
|---|---|---|
| Hook | `hooks/feynman-activate.js` | Чтение состояния и инъекция `additionalContext` |
| Rules | `rules/feynman-activate.md` | Набор правил `lite/full/ultra` |
| CLI | `bin/feynman.js` | `install/uninstall/doctor/lint/examples/bootstrap/version/help` |
| Lint | `bin/feynman-lint.js`, `lib/lint/*` | Проверка корректности ASCII-диаграмм |
| Skill | `skills/feynman/SKILL.md` | Slash-команды управления режимом |
| Package | `.claude-plugin/`, `.codex-plugin/`, `hooks.json` | Доставка плагина |

## 3) Runtime state

`~/.claude/.feynman/` или `~/.codex/.feynman/`:

- `state.json` — `enabled`, `intensity`, `injections`.
- `.feynman-active` — флаг включения.

Семантика:
- флаг есть: инъекция может выполняться (если `enabled: true`);
- флага нет + state есть: отключено пользователем;
- оба файла отсутствуют: bootstrap первого запуска.

## 4) Управление состоянием (slash)

- `/feynman on` / `/feynman start` — включить инъекцию;
- `/feynman off` / `/feynman stop` — выключить инъекцию;
- `/feynman lite|full|ultra` — переключить интенсивность;
- `/feynman` / `/feynman status` — статус без изменений.

## 5) CLI контракт

| Команда | Что делает |
|---|---|
| `feynman install` | Регистрирует hook в `settings.json`/`hooks.json` |
| `feynman uninstall` | Удаляет hook, оставляя state |
| `feynman doctor` | Диагностический health-check |
| `feynman lint` | Проверяет Markdown на правила L01-L08 |
| `feynman examples` | Печатает примеры ответов |
| `feynman bootstrap` | Экспортирует артефакты в локальную папку |
| `feynman version` | Версия пакета |
| `feynman help` | Текущая справка CLI |

## 6) Качество диаграмм

Источник правил:
- `rules/feynman-activate.md` (источник истины для `lite/full/ultra`)

Обновление правил требует синхронизации:
- `hooks/feynman-activate.js` + `bin/feynman.js` + `skills/feynman/SKILL.md`
- плюс smoke/pattern-тесты `tests/cli.test.js`.

## 7) Технико-операционные ограничения

- Zero deps, CommonJS.
- Node >= 18.
- No network at runtime для hook execution (внешние пути не используются).
- Bootstrap включает runtime files для дисконнекта: `hooks/feynman-activate.js`, `bin/feynman.js`, `package.json` и ассеты.

## 8) Проверки и сопровождение

Обязательные для релиза:
- `feynman bootstrap --out ... --force`
- `feynman lint --json README.md` (рекурентно по docs),
- CI matrix (`Node 18/20` на `ubuntu`/`macos`).

## 9) Известный рынок и позиционирование

В рынке есть аналоги по prompt-управлению (кнопки в IDE/CLI/prompt-команды), но у `feynman` уникально сочетание:
- автоматическая ASCII-семантика на hooks,
- отдельный lint для качества диаграмм,
- zero-dep runtime.

## 10) Связь

- [Architecture](./architecture.md)
- [Launch](./launch.md)
- [RTK Playbook](../RTK.md)
