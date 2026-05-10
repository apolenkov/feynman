<!-- GSD:project-start source:PROJECT.md -->
## Project

**feynman**

feynman is an open-source Claude Code and Codex plugin that automatically injects ASCII diagram rules into every AI request via the `UserPromptSubmit` hook. When a response has structure — flow, hierarchy, comparison, status — feynman makes the assistant draw it as an ASCII diagram without the developer having to ask.

Tagline: "why explain in words when diagram do trick"

**Core Value:** Every response that has structure — flow, hierarchy, comparison, status — gets an ASCII diagram without the developer having to ask.

### Constraints

- **Tech Stack**: Pure JavaScript (Node.js) hook — no build step, no deps, CommonJS for zero-dep portability
- **Compatibility**: Must work with Claude Code and Codex hooks APIs
- **Scope**: Open-source repo, public README, install one-liner
- **Design**: Greenfield — repo is empty, start from scratch
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
- **Hook Runtime**: Node.js >= 18, CommonJS (`require()`), zero npm deps
- **Plugin Manifests**: `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` — `name` kebab-case, `version` semver `MAJOR.MINOR.PATCH`
- **Install**: `npx @albinocrabs/feynman install --target claude|codex|both`; `bash install.sh` remains a Claude Code fallback
- **IDE compat** (v0.3.0+): `.clinerules/` for Cline/Windsurf, `.cursor/rules/*.mdc` for Cursor

## What NOT to Use
| Rejected | Why |
|----------|-----|
| ESM (`import`/`export`) | Requires `"type": "module"` in package.json; zero-dep CJS is simpler |
| `jq` for settings.json merge | Not universally installed; use `node -e` inline for portability |
| npm dependencies | Zero-dep is a hard constraint; keeps install auditable and fast |
| `SessionStart` hook instead of `UserPromptSubmit` | Only fires once — rules lost after context compaction |
| `type: "prompt"` hook | LLM-interpreted, non-deterministic; rules injection must be exact text, not AI-summarized |
| Mermaid / graphviz rendering | Out of scope per PROJECT.md; ASCII only |
| Single flat `.clinerules` file | Cline deprecated flat file in favor of `.clinerules/` directory |
| `console.log` for hook output | Adds trailing newline; use `process.stdout.write(JSON.stringify(...))` |

## Confidence Levels
| Area | Confidence | Source |
|------|------------|--------|
| `UserPromptSubmit` hook input format (`prompt` field in stdin) | HIGH | Official Claude Code docs via Context7 `/anthropics/claude-code` |
| `hookSpecificOutput.additionalContext` output format | HIGH | Official Claude Code docs (code.claude.com/docs/en/hooks) |
| `additionalContext` 10,000 char cap | MEDIUM | Official docs page (single source, no corroboration) |
| CommonJS requirement for hook scripts | HIGH | Zero-dep constraint + hooks API docs confirm CJS works reliably |
| `.claude-plugin/plugin.json` manifest format | HIGH | Context7 `/anthropics/claude-code` official plugin docs |
| `.codex-plugin/plugin.json` manifest format | HIGH | Implemented and package-tested for Codex plugin discovery |
| hooks.json plugin format with `${CLAUDE_PLUGIN_ROOT}` | HIGH | Context7 official docs |
| `node -e` inline Node.js for settings.json merge | HIGH | Verified in feynman install.sh — no jq dependency |
| `.clinerules/` directory format (Cline) | HIGH | Multiple sources: everydev.ai analysis + Cline docs |
| `.windsurf/rules/` format | MEDIUM | Single source (everydev.ai); Windsurf docs not directly verified |
| `.cursor/rules/*.mdc` YAML frontmatter format | HIGH | Multiple sources: Cursor documentation + community reports |
| `UserPromptSubmit` has no matcher support | HIGH | Official docs: "No matcher support — fires on every prompt submission" |
| Marketplace publish path | LOW | No public Anthropic documentation found for v1.0 marketplace submission |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Модульная система
- Только `require()` — никакого `import`/`export`, никакого `"type": "module"`
- Ноль npm-зависимостей — хук должен работать без `npm install`

### Пути к файлам
- Всегда `os.homedir()` — никогда тильда (`~/`) или жёсткий путь `/Users/...`
- Файлы рядом с хуком — через `__dirname`

### Вывод хука
- Только `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:text}}))`
- Без переноса строки в конце. Никогда `console.log` — добавляет `\n`, ломает JSON.

### Формат файла правил
- Варианты интенсивности задаются XML-элементами: `<intensity name="lite">…</intensity>`
- Допустимые значения: `lite` | `full` | `ultra`. По умолчанию: `full`
- Правила — только декларативные факты, не команды (баг #17804)
- Хук поддерживает оба формата: XML (канонический, Phase 8) и HTML-комментарии (обратная совместимость; решение Q-2026-05-09-01)

### Файл состояния + флаг-файл
- Состояние: `~/.claude/.feynman/state.json` или `~/.codex/.feynman/state.json` — схема `{enabled: boolean, intensity: string, injections: number}`
- Флаг: `~/.claude/.feynman-active` или `~/.codex/.feynman-active` — есть = активен; нет + state есть = отключён пользователем
- Первый запуск: оба отсутствуют → создать оба → продолжить нормально
- Схема заморожена — не менять имена полей (используется в Phase 2 скиллах)

### Известные баги хуков (влияют на этот проект)

| Баг | Эффект | Решение |
|-----|--------|---------|
| #8810 | Тильда-пути не работают из поддиректорий | `os.homedir()` |
| #13912 | Чистый stdout = красная ошибка в UI | Только JSON-обёртка |
| #17804 | Императивные правила = защита от инъекций | Только декларативные фразы |
| #35713 | Отключённый плагин всё равно инжектит | Проверка флаг-файла до чтения state |
| #10225 | Хуки из пути плагина не срабатывают | Регистрировать только через `settings.json` |
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

```
settings.json / hooks.json
     │  срабатывает на каждый промт
     ▼
feynman-activate.js
     │
     ├─ [1] защита session_id (path traversal)
     ├─ [2] флаг-файл ~/.claude/.feynman-active или ~/.codex/.feynman-active
     │       нет флага + нет state  → bootstrap (первый запуск)
     │       нет флага + state есть → exit 0 (отключён пользователем)
     ├─ [3] читать state.json → enabled? intensity?
     ├─ [4] читать rules/feynman-activate.md → извлечь секцию по intensity
     ├─ [5] state.injections++
     └─ [6] stdout: JSON additionalContext → инжектируется в каждый промт
                                                      │
                                               Claude Code / Codex / модель
```

Скилл `/feynman` и CLI `feynman install|doctor|uninstall` читают и пишут тот же `state.json`.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
