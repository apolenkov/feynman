---
title: Prompt rewrite research — XML contract for feynman-activate.md
date: 2026-05-09
context: gsd-explore session — 7 рычагов улучшения промта; выбран агрессивный путь (F1+F2+F4+F7) → Phase 8
---

# Prompt rewrite research (2026-05-09)

## Контекст

Текущий `rules/feynman-activate.md` использует декларативные предложения
(«A response describing X includes Y») с literal syntax samples и негативной
секцией «When no diagram appears». Уже учитывает баг #17804 (нет
императивных глаголов). Вопрос: что ещё повышает compliance LLM на
ASCII-выводе.

## 7 рычагов (приоритет ▲ → ▼)

```
┌─ findings ────────────────────────────────────────────────────────┐
│ F1 XML-теги секций       ▲ high   архитектурный сдвиг             │
│ F2 позитивная рамка      ▲ high   убрать "когда не появляется"    │
│ F4 таблица триггеров     ▲ high   structure → visual              │
│ F7 XML обёртка + MD тело ● med    intensity-маркеры → XML         │
│ F3 few-shot литералы     ● med    3 примера на класс              │
│ F5 CoT classify-first    ▼ low    "сначала классифицируй тип"     │
│ F6 README про compaction ▼ low    документация, не правка         │
└───────────────────────────────────────────────────────────────────┘
```

### F1 — XML-tagged sections
Anthropic-обученный парсер; markdown-заголовки = размытые границы.
**Action:** обернуть `feynman-activate.md` в `<structure_triggers>`,
`<diagram_syntax>`, `<examples>`, `<output_contract>`. MD остаётся внутри.

### F2 — Positive framing
"Don't do X" триггерит pink-elephant; модели хуже масштабируются на
отрицаниях (NeQA bench 2025).
**Action:** удалить секцию «when no diagram appears»; заменить позитивным
контрактом «response with structure contains ASCII block before prose».

### F4 — Decision-table triggers
Таблица structure→visual уже работает в `~/.claude/rules/visuals.md`.
**Action:** перенести таблицу как первичный триггер; декларативные
предложения → fallback.

### F7 — XML wrapper + MD body
**Action:** `<!-- lite -->` HTML-комменты → `<intensity name="lite">…</intensity>`.
Парсер хука: одна строка regex.

### F3 — Few-shot with literal characters
ArtPerception 2025: показ литералов `├──`, `└──`, `┌─┐` повышает compliance.
**Action:** 3 канонических примера на класс (sequence/hierarchy/comparison).

### F5 — Classify-before-answer CoT
Two-stage: классификация типа контента → рендер из таблицы. Marginal на
reasoning-моделях, значимо на non-reasoning.
**Action:** добавить в контракт: "(1) есть ли sequence/hierarchy/
comparison/state? (2) если да — рендер из таблицы".

### F6 — CLAUDE.md/hook = compaction-survivor
Compaction не сохраняет conversation rules; только статичные файлы.
**Action:** документация в README как primary value-prop vs SessionStart.
Не правка кода.

## Decision (2026-05-09)

Выбран путь **A — aggressive**: F1+F2+F4+F7 одной фазой. Phase 8
«Prompt Architecture Rewrite (XML contract)». Ломает обратную
совместимость парсера → миграционный коммит обязателен.

F3+F5 — внутри той же фазы как secondary.
F6 — отдельная задача в README, не блокирует.

## Sources

- Use XML tags to structure your prompts — Anthropic docs
- Mastering Claude Prompts: XML vs Markdown (algorithmunmasked, 2025-05)
- Pink Elephant Problem: Negative Instructions (eval.16x.engineer)
- ArtPerception: ASCII art recognition (arXiv 2510.10281, 2025)
- Why LLMs Suck at ASCII Art (TDS / Medium)
- Compaction — Anthropic API docs
- How Claude Code Got Better by Protecting More Context (matsuoka.com)
- Chain-of-thought Prompting in 2025 — Adaline
