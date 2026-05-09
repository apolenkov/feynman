# Open Research Questions

## Q-2026-05-09-01 — XML compatibility across hosts

**Status:** open
**Blocks:** Phase 8 (Prompt Architecture Rewrite)
**Planted:** 2026-05-09

### Question

Поддерживают ли Codex `additionalContext` и Cursor `.mdc`-rules
XML-теги внутри injected text так же надёжно, как Claude Code?

### Why it matters

Phase 8 ставит на XML-обёртку (`<structure_triggers>`, `<intensity name="..."/>`).
Если Codex / Cursor парсят XML хуже Claude — compliance может упасть на
этих платформах. feynman заявлен как cross-host hook → нужна верификация
до старта Phase 8.

### What to verify

```
host           | XML tags pass-through? | XML in rule sections respected?
───────────────|────────────────────────|────────────────────────────────
Claude Code    | ?                      | ? (likely yes — Anthropic-trained)
Codex          | ?                      | ?
Cursor (.mdc)  | ?                      | ?
Cline / Windsurf| ?                     | ?
```

### How to answer

1. Прогнать минимальный hook с `<test_tag>diagram rule</test_tag>` content
   на каждом хосте.
2. Сравнить compliance на 5 фикстур-промтах (sequence/hierarchy/comparison).
3. Найти community evidence (Cursor docs, Codex hooks API changelog 2025+).

### Decision impact

- All hosts OK → запускать Phase 8 как запланировано.
- Codex/Cursor degrade → разделить rule files: XML для Claude, MD для остальных.
