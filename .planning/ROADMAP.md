# Roadmap: feynman

## Overview

feynman is an open-source Claude Code and Codex plugin that injects ASCII diagram rules on every prompt. Three milestones shipped (v0.1, v0.2.0, v0.3.0); v0.4.0 in progress.

## Milestones

- ✅ **v0.1 — Core** — Phase 1
- ✅ **v0.2.0 — Production-Ready** — Phases 2-7 (shipped 2026-05-07) — see [milestones/v0.2.0-ROADMAP.md](./milestones/v0.2.0-ROADMAP.md)
- ✅ **v0.3.0 — Prompt Architecture** — Phases 8 + 8.5 (shipped 2026-05-10) — see [milestones/v0.3.0-ROADMAP.md](./milestones/v0.3.0-ROADMAP.md)
- 🚧 **v0.4.0 — Visual Economy** — Phases 9-13 (in progress)

## Phase Numbering

- Integer phases (1, 2, …): planned milestone work
- Decimal phases (6.5, 8.5, …): insertions / parallel tracks
- Numbering continues across milestones

## Current Milestone: v0.4.0 Visual Economy

### Phases

- [ ] **Phase 9: Smallest-visual-first lint rules (L11/L12/L13/L14)** — overdecoration / token-budget / double-wrap detection + autofix for L11
- [ ] **Phase 10: Output-style presets (`short / middle / full`)** — schema extension, `/feynman style` subcommand, hook suffix injection
- [ ] **Phase 11: Compliance measurement A/B harness** — 50-prompt corpus, v0.2.x rules vs v0.3.x rules, REPORT.md
- [ ] **Phase 12: IDE compat polish** — `.clinerules/`, `.cursor/rules/*.mdc`, `.windsurf/rules/` install targets + doctor
- [ ] **Phase 13: Release v0.4.0** — bump, npm publish, tag, GitHub Release, CHANGELOG

## Phase Details

### Phase 9: Smallest-visual-first lint rules (L11/L12/L13/L14)
**Goal:** Линтер обнаруживает три класса дефектов экономии токенов: рамку для ≤5 пунктов (вместо dot-leader), padding-доминированный визуал, дерево внутри рамки. L11 получает autofix через расширение CLI `--fix`.
**Depends on:** v0.3.x infrastructure (autofix engine, lib/lint/width.js)
**Requirements:** LINT-11, LINT-12, LINT-13, LINT-14, DOCS-L11
**Success Criteria** (what must be TRUE):
1. `lib/lint/rules.js` экспортирует `L11_overdecoration`, `L12_token_budget`, `L13_double_wrap`; все с severity `warn`
2. `tests/lint-cases.json` имеет ≥3 положительных + ≥3 отрицательных fixture на каждое из L11/L12/L13
3. `bin/feynman-lint.js --fix` на frame с ≤5 inner content lines конвертирует в dot-leader list, сохраняет содержимое строк, эквивалентен по информации; идемпотентен
4. `--explain` flag выводит token-cost-сравнение per-визуал (`framing: ~280 chars; equivalent dot-leader: ~120 chars; saving: -160`)
5. `docs/lint-rules.md` документирует L11/L12/L13 с valid/invalid примерами и token-cost rows; cross-reference номера строк в `lib/lint/rules.js`
6. `npm test` зелёный, общее число тестов ≥ 290

**Plans:** TBD

### Phase 10: Output-style presets (`short / middle / full`)
**Goal:** Пользователь переключает стиль вывода между `short` (никаких frames/деревьев, только dot-leader + inline glyphs), `middle` (баланс — frames для ≥6, prefer trees and markdown tables), `full` (текущий default). Реализация — runtime suffix в additionalContext без раздувания rules-файла.
**Depends on:** Phase 9 (L11/L12/L13 уже умеют определять, когда визуал слишком тяжёл — output-style активно их предотвращает на стороне модели)
**Requirements:** STYLE-01, STYLE-02, STYLE-03, STYLE-04
**Success Criteria** (what must be TRUE):
1. `state.json` принимает `output_style: "short" | "middle" | "full"` с дефолтом `full`; back-compat при отсутствии поля
2. `/feynman style short` записывает в state.json и `/feynman status` показывает текущий стиль
3. `hooks/feynman-activate.js` читает `output_style`, добавляет одну строку в `additionalContext` при стиле ≠ `full`; rules-файл НЕ модифицируется (бюджет 4480 байт сохраняется)
4. End-to-end: при стиле `short` модель НЕ должна выдавать `┌─...─┐` блоки в ответе на структурированный промт (verified в Phase 11 eval)
5. README.md описывает три preset с token-cost comparison таблицей; `docs/architecture.md` показывает orthogonal axes (intensity × output-style)

**Plans:** TBD

### Phase 11: Compliance measurement A/B harness
**Goal:** Дать количественный ответ на вопрос «насколько XML rule contract v0.3.0 улучшил compliance vs v0.2.x?»; A/B на 50 промтах через тот же модель; pass/fail через feynman-lint.
**Depends on:** Phase 9 (L11/L12/L13 расширяют compliance-метрику новыми классами defects), Phase 10 (output-style preset = третья arm в A/B)
**Requirements:** EVAL-01, EVAL-02, EVAL-03
**Success Criteria** (what must be TRUE):
1. `eval/v0.4.0-compliance/prompts.json` содержит 50 промтов с structure-class tag (sequence/hierarchy/comparison/status/priority/none)
2. Harness прогоняет каждый промт через 3 arms: v0.2.x rules baseline, v0.3.x rules current (full), v0.3.x rules с output_style=middle; собирает ответы детерминистично
3. `feynman-lint` запускается на каждый ответ, агрегирует pass/fail per rule + общий compliance %
4. `eval/v0.4.0-compliance/REPORT.md` показывает результаты per structure-class с WIN/HURT/NEUTRAL classification и sample-size disclaimer
5. Любые HURT-class regressions явно идентифицированы и помечены для follow-up в v0.5.0+

**Plans:** TBD

### Phase 12: IDE compat polish
**Goal:** feynman устанавливается в Cline/Windsurf (`.clinerules/`), Cursor (`.cursor/rules/*.mdc`), Windsurf (`.windsurf/rules/`) одной командой; doctor проверяет здоровье установки.
**Depends on:** existing CLI install/uninstall/doctor infrastructure (Phase 5 v0.2.0)
**Requirements:** IDE-01, IDE-02, IDE-03, IDE-04, IDE-05
**Success Criteria** (what must be TRUE):
1. `npx @albinocrabs/feynman install --target cline` создаёт `.clinerules/feynman-rules.md` с правилами текущей intensity; идемпотентно
2. `npx @albinocrabs/feynman install --target cursor` создаёт `.cursor/rules/feynman.mdc` с YAML frontmatter (alwaysApply: true, globs: "**"); идемпотентно
3. `npx @albinocrabs/feynman install --target windsurf` создаёт `.windsurf/rules/feynman.md`; идемпотентно
4. `npx @albinocrabs/feynman doctor --target cline|cursor|windsurf` показывает зелёный статус для зарегистрированной установки
5. README.md секция "IDE Support" перечисляет все 5 targets (claude, codex, cline, cursor, windsurf) с one-liner на target

**Plans:** TBD

### Phase 13: Release v0.4.0
**Goal:** v0.4.0 опубликован в npm, GitHub Release создан с release-notes, тег запушен, CHANGELOG.md обновлён.
**Depends on:** Phase 9, 10, 11, 12 — все green
**Requirements:** REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE):
1. `node scripts/feynman-bump.js minor` бампит до v0.4.0 во всех трёх manifest-файлах
2. `npm run ci` зелёный; total tests ≥ 290+ (включая новые из Phase 9-12)
3. `npm view @albinocrabs/feynman version` возвращает `0.4.0`
4. `git tag --list 'v0.4.0'` существует; GitHub Release v0.4.0 создан с summary L11-L13 + output styles + compliance findings
5. CHANGELOG.md содержит секцию v0.4.0 с автогенерированным списком коммитов

**Plans:** TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core (v0.1) | v0.1 | 3/3 | Complete | — |
| 2-7 | v0.2.0 | done | Complete | 2026-05-07 |
| 8 + 8.5 | v0.3.0 | 8/8 | Complete | 2026-05-10 |
| 9. L11/L12/L13/L14 | v0.4.0 | 0/TBD | Not started | — |
| 10. Output-style presets | v0.4.0 | 0/TBD | Not started | — |
| 11. Compliance A/B | v0.4.0 | 0/TBD | Not started | — |
| 12. IDE compat polish | v0.4.0 | 0/TBD | Not started | — |
| 13. Release v0.4.0 | v0.4.0 | 0/TBD | Not started | — |

## Execution Order

```
[Phase 9 — L11/L12/L13/L14]
        │
        ├──→ [Phase 10 — Output-style presets]
        │              │
        │              ▼
        └──────→ [Phase 11 — Compliance A/B harness]
                       │
                       ▼
                [Phase 12 — IDE compat polish]
                       │
                       ▼
                [Phase 13 — Release v0.4.0]
```

Phase 9 и Phase 12 могут идти параллельно (разные файлы, разные тесты), но Phase 11 ждёт обоих.

## Coverage Validation

22 требований из REQUIREMENTS.md распределены по 5 фазам:

- Phase 9 ← LINT-11, LINT-12, LINT-13, LINT-14, DOCS-L11 (5)
- Phase 10 ← STYLE-01, STYLE-02, STYLE-03, STYLE-04 (4)
- Phase 11 ← EVAL-01, EVAL-02, EVAL-03 (3)
- Phase 12 ← IDE-01, IDE-02, IDE-03, IDE-04, IDE-05 (5)
- Phase 13 ← REL-01, REL-02, REL-03, REL-04, REL-05 (5)

Total: 22/22 mapped ✓
