# Feynman 1.0 — frame removal, CI fix, dependabot merge

## Контекст

Пользователь видит, что плагин feynman приманивает Claude к ASCII frame-блокам
(`┌─...─┐`) даже когда это бессмысленно — в чате они только тратят токены, не
разделяя ничего полезного. Параллельно: открыто три dependabot PR, CI на них
падает, и накопленный объём breaking-изменений в истории давно превысил
формальный pre-1.0 statu — а версия всё ещё 0.7.0.

Цель: одним заходом выпустить **1.0.0**, который убирает frame block из правил,
чинит CI matrix и впитывает три dependabot bumps.

## TLDR

```
before                                  after
──────                                  ─────
v0.7.0                                  v1.0.0 (stability marker)
rules: status ≥6 → frame block          rules: status ≥6 → dot-leader / md table
full: <patterns> со 10 frame-шаблонами  <patterns> блок удалён целиком
CI matrix: Node 20 + Node 22            CI matrix: Node 22+ only (engines=22.6)
3 dependabot PR red                     3 dependabot PR green → merged
injections: 231 (full ~2.5KB)           injections counter сохраняется, payload меньше
```

Execution flow:

```
[wave A: CI fix] → [wave B: frame removal] → [wave C: bump 1.0.0] → [wave D: merge dependabot] → [release]
       │                    │                       │                          │
       └─ unblocks PRs      └─ rules + tests        └─ manifests + CHANGELOG   └─ on green main
```

## Architecture context

Что трогаем и почему:

- `.github/workflows/ci.yml` — убрать Node 20 из matrix (он несовместим с
  `engines.node >=22.6` уже с v0.6.0; matrix просто никогда не привели в
  соответствие).
- `rules/feynman-activate.md` — заменить `| status ≥6 | frame block |` на
  `dot-leader` или `markdown table` во всех трёх `<intensity>` секциях (lite
  l11, full l51, ultra l105). Удалить `<patterns selection="one-of">` блок
  целиком из `<intensity name="full">` (l76-84) — именно он приманивает Claude
  к frame-шаблонам через status→frame, retro→frame, handoff→frame и т.д.
- `tests/` — обновить fixture-тесты, которые сейчас проверяют наличие
  frame-визуала / patterns-блока.
- `lib/lint/rules/L11_overdecoration.ts` и соседние — проверить, что после
  выпиливания frame-патернов linter не будет внутренне противоречить.
- `package.json` + `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json`
  → bump `version: "0.7.0"` → `"1.0.0"`.
- `CHANGELOG.md` — добавить секцию `1.0.0 — 2026-05-22` с breaking notes и
  migration path.
- `README.md`, `docs/`, `examples/` — пересмотреть скриншоты/примеры на предмет
  оставшихся frame-блоков.

## Стратегия выполнения

Жёсткий wave-based fan-out, single-message parallel spawn внутри каждой волны.
Cost-tier matrix фиксирует, кто что делает; file-boundary matrix исключает
конфликты записи. Opus — только оркестратор и финальный синтез.

### Cost-tier matrix

| Wave | Агент | Tier   | Файлы (owner — единственный writer)                          |
|------|-------|--------|--------------------------------------------------------------|
| 0    | H1    | Haiku  | grep README.md, docs/**, examples/** на `frame\|┌─\|└─`      |
| 0    | H2    | Haiku  | read tests/*.test.ts, найти fixture со словом frame/patterns |
| 0    | H3    | Haiku  | read lib/lint/rules/L11/L12/L13, проверить зависимости       |
| 0    | H4    | Haiku  | read .github/workflows/ci.yml, цитата строк с Node 20        |
| 0    | H5    | Haiku  | read CHANGELOG.md последние 3 секции для тон-fit-а 1.0.0     |
| 1    | H6    | Haiku  | .github/workflows/ci.yml — drop node-version: 20             |
| 1    | H7    | Haiku  | package.json:3 + .claude-plugin/plugin.json:3 + .codex-plugin/plugin.json:3 → 1.0.0 |
| 1    | S1    | Sonnet | rules/feynman-activate.md — frame removal + <patterns> drop  |
| 1    | S2    | Sonnet | tests/ — обновить fixture-тесты по выходу H2                 |
| 2    | S3    | Sonnet | CHANGELOG.md — секция 1.0.0 по выходу H5 + breaking notes    |
| 2    | H8    | Haiku  | README.md / docs / examples sweep по выходу H1               |
| 3    | Opus  | Opus   | typecheck + lint + tests + atomic commits per wave           |
| 3    | Opus  | Opus   | push main + monitor CI + merge dependabot                    |
| 3    | Opus  | Opus   | release tarball build, остановка перед `npm publish`         |

Wave 0 — пять Haiku одним сообщением, output contract: каждый пишет в
`/tmp/feynman-100-<id>.md` структурированный отчёт (file paths + line numbers
+ цитаты). Никаких free-form ответов.

Wave 1 — четыре агента одним сообщением (H6/H7 micro, S1/S2 substantive).
File boundaries не пересекаются — verified by matrix.

Wave 2 — два агента одним сообщением, S3 читает выход H5 из /tmp,
H8 читает выход H1 из /tmp.

Wave 3 — Opus orchestrator, sequential, потому что atomic commits.

### Single-message spawn pattern

```
wave 0: [H1] [H2] [H3] [H4] [H5]   ← 5 параллельных Agent calls in one message
                  ↓ (выходы в /tmp/feynman-100-{1..5}.md)
wave 1: [H6] [H7] [S1] [S2]        ← 4 параллельных, файлы не пересекаются
                  ↓ (commits: ci-fix, bump, rules, tests)
wave 2: [S3] [H8]                   ← 2 параллельных, читают /tmp выходы wave 0
                  ↓ (commits: changelog, docs-sweep)
wave 3: Opus                        ← sequential: test → tag → release
```

### Anti-conflict matrix (file-level)

| File                              | Owner   | Other readers      |
|-----------------------------------|---------|--------------------|
| .github/workflows/ci.yml          | H6      | H4 (read-only)     |
| package.json                      | H7      | —                  |
| .claude-plugin/plugin.json        | H7      | —                  |
| .codex-plugin/plugin.json         | H7      | —                  |
| rules/feynman-activate.md         | S1      | H3 (read-only)     |
| tests/**/*.test.ts                | S2      | H2 (read-only)     |
| CHANGELOG.md                      | S3      | H5 (read-only)     |
| README.md / docs/** / examples/** | H8      | H1 (read-only)     |

Никакого overlap — все write-owner поля уникальны.

### Output contract per agent

Все subagent-ы возвращают только structured markdown в `/tmp/feynman-100-<id>.md`:

```
## Subject: <wave>-<id>
## Status: done | blocked | partial
## Files touched: <relative paths>
## Diff summary: <one paragraph>
## Verification: <command + result>
## Open: <если что-то осталось>
```

Free-form prose в чате запрещён — экономия токенов основного контекста.

### Sequencing rationale

- Wave 0 чисто read-only → можно запускать пока я отвечаю user-у.
- Wave 1 пишет в **независимые файлы** → fan-out даёт реальный speed-up.
- Wave 2 зависит от выхода wave 0 (H1 → H8, H5 → S3) → не раньше.
- Wave 3 sequential — atomic commits / push / CI watch.

## От человека

```
▲ ОТ ТЕБЯ
─────────
- approve этого плана (ExitPlanMode)
- approve финального npm publish (это уже под моим триггером npm run release,
  но я остановлюсь перед `npm publish` и спрошу)
```

Всё остальное — я делаю сам:
- редактирую файлы
- запускаю тесты / linter / typecheck
- коммичу wave A→B→C
- открываю release commit
- мержу 3 dependabot после зелёного CI
- готовлю tag v1.0.0

## Open questions

| # | вопрос                                              | как решу автономно                          | когда эскалирую                |
|---|-----------------------------------------------------|---------------------------------------------|--------------------------------|
| 1 | replacement для frame block в правилах              | dot-leader для ≤8, markdown table для ≥9    | если найду неожиданный edge    |
| 2 | сохранять ли `<patterns>` блок в каком-либо виде    | удаляю целиком; nazvania типа state/retro/  | если break в lint-тестах       |
|   |                                                     | handoff остаются в head-словах prose, не    |                                |
|   |                                                     | как mutex frame-шаблоны                     |                                |
| 3 | min Node engines: 22.6 → 22 LTS или оставить        | оставляю 22.6 (актуальные tests требуют)    | если eslint10/types25 требуют 24|

## Files to modify

- `.github/workflows/ci.yml:matrix.node` — убрать `20`, оставить `22`
- `rules/feynman-activate.md:11,51,105` — `frame block` → `dot-leader / md table`
- `rules/feynman-activate.md:76-84` — удалить `<patterns selection="one-of">`
- `package.json:3` — `"version": "0.7.0"` → `"1.0.0"`
- `.claude-plugin/plugin.json:3` — то же
- `.codex-plugin/plugin.json:3` — то же
- `CHANGELOG.md` — новая секция `## 1.0.0 - 2026-05-22` с breaking notes
- `tests/rules-content.test.ts` (или эквивалент) — выпилить ожидания frame block
- `lib/lint/rules/L11_overdecoration.ts` — проверить, не сломалось ли правило
- `README.md` — strip оставшиеся frame-демо если есть
- `docs/examples/`, `examples/` — то же

## Verification

```bash
# wave A: CI matrix sanity
node -e "console.log(require('./package.json').engines.node)"  # must show >=22.6
grep -rn "node-version" .github/workflows/                      # must not contain '20'

# wave B: frame removal
grep -rn "frame block" rules/feynman-activate.md                # must return zero
grep -rn "patterns selection" rules/feynman-activate.md         # must return zero
npm run typecheck
npm run test            # native node --test on Node 22+
npm run lint            # feynman self-lint
npm run eslint

# wave C: bump verification
node -e "
const p = require('./package.json');
const c = require('./.claude-plugin/plugin.json');
const x = require('./.codex-plugin/plugin.json');
if (p.version !== '1.0.0' || c.version !== '1.0.0' || x.version !== '1.0.0') {
  process.exit(1);
}
console.log('OK: all three at 1.0.0');
"
npm run test:docs       # CHANGELOG / README consistency check
npm run build           # produces dist/albinocrabs-feynman-1.0.0.tgz
npm run test:release    # smoke install from tarball

# wave D: dependabot merge sanity
gh pr view 3 --json statusCheckRollup
gh pr view 4 --json statusCheckRollup
gh pr view 5 --json statusCheckRollup
# all three must show success after wave A merges to main
```

Scenarios to walk through:

```
#   (a) свежая установка через npx @albinocrabs/feynman install --target claude
#   (b) обновление с 0.7.0 → 1.0.0: state.json сохраняется, intensity=full остаётся
#   (c) первый prompt после install: SessionStart инжектит правила БЕЗ frame block
#   (d) /feynman status показывает 1.0.0
#   (e) /feynman bump|highlight|eval всё ещё работают
```

## Side deliverables

После approve и merge:
- Обновить `~/.claude/.feynman/state.json` локально: counter `injections`
  сохраняется, ничего не сбрасываем.
- Добавить запись в memory: `project_v100_shipped.md` — frame block removed,
  1.0.0 как stability marker.
- Обновить `feedback_compact_chat_visuals.md`: теперь это не «дисциплина
  Claude», а **поведение плагина** — frame block выпилен в источнике.
- Заметка в `CHANGELOG.md` о смене мажорной версии: что нужно `npx
  @albinocrabs/feynman install` после обновления, чтобы стянуть новые правила.

---

# Follow-up: post-1.0.1 hardening (coverage + eslint)

## Контекст

v1.0.0 + v1.0.1 уже released. Два FRAGILE-флага из retro остались открытыми:
1. coverage threshold временно понижен 95→94 в `.github/workflows/ci.yml`
   (флап у границы при dependabot rebases)
2. `npm run eslint` падает «couldn't find a configuration file» — конфига нет
   вообще, eslint 10 требует flat config

Цель: закрыть оба — добавить недостающие тесты до устойчивого ≥95%, вернуть
порог 95%, создать рабочий `eslint.config.mjs`.

## TLDR

```
before                              after
──────                              ─────
coverage gate temporarily 94%       coverage gate restored to 95%
local 95.35% (margin тонкий)        ≥96% с запасом (+12 тестов)
npm run eslint → no config error    npm run eslint → 0 errors (flat config)
3 файла тянут вниз покрытие         12 целевых тестов закрывают gap
```

```
[wave 1: 4 parallel agents] → [wave 2: verify + gate restore + commit]
   S1 hook tests ──┐
   S2 cli tests  ──┤
   H1 width tests──┼─ parallel ─→ coverage ≥95 + eslint 0-err → commit → push → CI
   H2 eslint cfg ──┘
```

## Разведка (готова)

**Coverage** — локально 95.35% (проходит!), но CI показывал 94.6% из-за
поведения `codex-app-server.test.ts` в CI. 3 файла тянут вниз:

```
hooks/feynman-activate.ts  86.77%  malformed-rules / recovery / HTML-fallback / enabled=false+no-flag
bin/feynman-lint.ts        88.66%  CLI error branches (unknown flag, too many args, no args, --fix stdin, file-not-found)
lib/lint/width.ts          89.57%  ANSI-escape skip + char-not-found в firstVisualColumnOf
```

**Eslint** — конфига нет; eslint orphaned (НЕ в `ci`/`prepublishOnly`/CI workflow);
`@typescript-eslint` v8.59.3 уже установлен и поддерживает flat config нативно —
новых install НЕ нужно.

## Стратегия выполнения

### Cost-tier matrix

| Wave | Агент | Tier   | Файл (owner — единственный writer)                      |
|------|-------|--------|---------------------------------------------------------|
| 1    | S1    | Sonnet | tests/hook.test.ts — +4 теста feynman-activate          |
| 1    | S2    | Sonnet | tests/cli.test.ts — +5 тестов feynman-lint error branch |
| 1    | H1    | Haiku  | tests/lint.test.ts — +3 теста width.ts ANSI/not-found   |
| 1    | H2    | Haiku  | eslint.config.mjs (новый файл, flat/recommended)        |
| 2    | Opus  | Opus   | coverage verify + eslint run + gate 94→95 + commits     |

File boundaries не пересекаются — 4 разных файла, ни одного overlap.

### Single-message spawn

```
wave 1: [S1] [S2] [H1] [H2]   ← 4 параллельных Agent calls в одном сообщении
                  ↓
wave 2: Opus orchestrator (sequential — coverage gate + atomic commits)
```

### Решения (автономные, не эскалирую)

| # | вопрос                                  | решение                                       |
|---|-----------------------------------------|-----------------------------------------------|
| 1 | eslint preset: recommended vs type-checked | `flat/recommended` (non-type-checked) — рабочий eslint без массового шума; type-checked можно ужесточить позже |
| 2 | wire eslint в CI gate?                   | НЕТ на этом шаге — сначала config даёт 0 errors standalone; CI-интеграция отдельным решением, чтобы не блокировать на legacy lint debt |
| 3 | если eslint выдаст N>0 errors на коде    | сначала auto-fixable → `--fix`; оставшиеся → точечно `disable` конкретных правил с TODO, НЕ массовый relax |
| 4 | codex-app-server.test.ts CI/local расхождение | вне scope этого follow-up; отдельная задача (mock websocket или skip-when-unavailable) |

## От человека

```
▲ ОТ ТЕБЯ
─────────
- approve плана (ExitPlanMode)
- ничего больше — push на non-protected шаги под моим триггером,
  npm publish здесь НЕ нужен (это не релиз, только tests + eslint config)
```

## Files to modify

- `tests/hook.test.ts` — +4 теста (malformed rules → MALFORMED_FALLBACK,
  malformed_rules recovery, HTML-comment fallback, enabled=false+no-flag).
  Reuse `runHook` helper в describe-блоке feynman-activate.
- `tests/cli.test.ts` — +5 тестов feynman-lint напрямую через `runCli` helper
  (~line 974): unknown flag, too many args, no args, `--fix -` stdin, file-not-found.
- `tests/lint.test.ts` — +3 теста: import `lastVisualColumnOf`/`firstVisualColumnOf`
  из `../../lib/lint/width.ts`; ANSI-string в оба, char-not-found case.
- `eslint.config.mjs` — НОВЫЙ файл, flat config: parser `@typescript-eslint/parser`,
  plugin `@typescript-eslint/eslint-plugin`, globs из tsconfig include
  (hooks/lib/bin/tests/scripts **/*.ts), ignores (node_modules/dist/coverage/
  .build/feynman-rules-workspace/graphify-out/eval/evals).
- `.github/workflows/ci.yml` — вернуть порог 94→95 (после verify локального ≥95).

## Verification

```bash
# coverage gap closed
npm run coverage 2>&1 | grep -i "all files"        # must show >=95 (target >=96 с запасом)
npm test 2>&1 | tail -5                             # 366/366 pass (codex-server known-skip)

# eslint works
npm run eslint 2>&1 | tail -10                       # 0 errors (or documented disables)

# gate restored
grep -n "cov+0 < 95" .github/workflows/ci.yml        # must match (threshold back to 95)
npm run typecheck                                    # green
```

Scenarios:

```
#   (a) coverage report shows hooks/feynman-activate.ts, bin/feynman-lint.ts,
#       lib/lint/width.ts все >=95%
#   (b) npm run eslint завершается exit 0
#   (c) eslint.config.mjs не ловит dist/ coverage/ node_modules/
#   (d) CI on main green после push с восстановленным 95% порогом
```

## Side deliverables

- Memory: обновить `project_v101_shipped.md` — coverage gate restored to 95,
  eslint flat config added.
- Если eslint выявит реальные баги (не стилистику) — отдельный fix-commit с
  отметкой в CHANGELOG `[Unreleased]`.

---

# v1.1.0 — diagram expansion + design polish + rebuild/reinstall

## Context

feynman 1.0.1 is stable, but three scouting passes (coverage / design-skills /
external research) surfaced growth room: activity/sequence/C4 are only covered
implicitly (no named triggers), layout is absent (flagged as a gap in the repo
itself), and the 7 design principles from Rams/Tufte/frontend-design are not yet
baked into the rules. External research produced token-frugal notations (Mermaid
bare-arrow, C4 `Type(name)-->Type(name)`) plus a key reality-check: the feynman
block is below the cache threshold — caching as a feature is unreachable, so we
document the honest expectation instead.

Goal: v1.1.0 (minor, additive) — new lightweight diagram triggers + design
polish + L14 lint + an honest caching README section, then rebuild + reinstall
locally and publish.

## TLDR

```
before (1.0.1)                          after (1.1.0)
──────────────                          ─────────────
activity/sequence/C4 — implicit only    named triggers + minimal notation
layout — absent                          layout trigger (parallel columns │)
7 design principles in research          baked into <contract> (ladder/mutex/terse/horizontal/2-col)
L13 present, no L14                      L14 blank-line separation added
incident/activity examples — frames      converted to dot-leader (L11-clean)
README silent on caching                 caching reality + byte-stability section
```

```
[wave 1: 4 parallel impl agents] → [wave 2: Opus — bump/build/reinstall/publish]
   S1 rules ──────┐
   S2 lint+tests ─┤
   H3 examples ───┼─ parallel ─→ verify(tc+eslint+test+cov) → 1.1.0 → build → reinstall → publish
   H4 readme ─────┘
```

## Scope decisions (from the forks + "think more")

| Topic | Decision |
|-------|----------|
| diagram depth | lightweight named triggers, minimal notation (NOT full UML — research: 15-33% accuracy on nested blocks, +tokens) |
| sequence | `A->>B: msg` / `A-->>B: ok` — sync+return only, no activate/loop/alt |
| C4 | `Type(name) --> Type(name): label` (−60% vs C4-PlantUML); no Boundary macros |
| activity | flowchart arrow-chains `[step] -> [decision?] -> [step]`, fork/join via the existing parallel pattern |
| layout | new named trigger: parallel columns with a single `│` separator (db-schema already demonstrates) |
| plan-then-render | +1 line in `<contract>`: "enumerate entities/edges as bullets, then draw" (research 3.3) |
| caching | do NOT build a feature (block < 2048/4096 threshold). Document in README: byte-stability + 5-min TTL + bundling-out-of-our-control |
| L13 | already implemented — leave untouched |
| L14 | new: blank line before/after a fenced ASCII block |
| examples | fix incident-response.md + activity-sequence.md (frame→dot-leader); +1 clean example per new named trigger; +mapping example |
| version | 1.0.1 → 1.1.0 (additive triggers + new lint = minor) |

## Execution strategy (max Haiku/Sonnet fan-out)

### Cost-tier matrix

| Wave | Agent | Tier   | Files (owner = sole writer)                                      |
|------|-------|--------|------------------------------------------------------------------|
| 1    | S1    | Sonnet | rules/feynman-activate.md — 7 principles + activity/sequence/C4/layout triggers + plan-then-render |
| 1    | S2    | Sonnet | lib/lint/rules.ts + lib/lint/parser.ts + lib/lint/index.ts + tests/lint*.test.ts — L14 + tests |
| 1    | H3    | Haiku  | examples/** — fix incident/activity (frame→dot-leader); +activity/sequence/C4/layout/mapping clean examples |
| 1    | H4    | Haiku  | README.md — caching reality + byte-stability section |
| 2    | Opus  | Opus   | bump manifests, CHANGELOG, verify, build, reinstall, commit, push, watch CI, publish |

### Single-message spawn

```
wave 1: [S1] [S2] [H3] [H4]   ← 4 parallel Agent calls in one message
                  ↓ (4 non-overlapping file domains)
wave 2: Opus orchestrator (sequential — version/build/deploy/publish)
```

### Anti-conflict matrix

| File domain                       | Owner | Notes                                |
|-----------------------------------|-------|--------------------------------------|
| rules/feynman-activate.md         | S1    | S1 runs hook+rules-content tests after editing |
| lib/lint/** + tests/lint*.test.ts | S2    | L14 + parser node type if needed     |
| examples/**                       | H3    | one verified example per type        |
| README.md                         | H4    | caching section                      |

No overlap. Test-file boundary: tests/hook.test.ts → S1; tests/lint*.test.ts → S2.
Stated explicitly in both prompts so they never touch the same test file.

### Risk control

- S1 edits rules → may break tests/hook.test.ts (assertTagPairs, intensity
  extraction, SDLC-mutex assert). S1 MUST run `npm test` and fix broken asserts
  in tests/hook.test.ts (its domain for rules-dependent tests).
- S2 owns tests/lint*.test.ts. Boundary: hook.test.ts → S1, lint*.test.ts → S2.
- Each agent before handing off: `npm run eslint` (0 findings — now a CI gate) +
  `npm run typecheck`.

## Files to modify

- `rules/feynman-activate.md` — +named triggers (activity/sequence/C4/layout),
  +7 principles in `<contract>` of all 3 intensities, +plan-then-render. Minimal
  notation from research.
- `lib/lint/rules.ts` + `lib/lint/parser.ts` + `lib/lint/index.ts` — L14
  blank-line separation rule (reuse parser ASTNode; estimateFrameCost not needed).
- `tests/lint.test.ts` (+ lint-cases.json) — L14 fixtures + unit.
- `tests/hook.test.ts` — update rules-content asserts for the new triggers (S1).
- `examples/incident-response.md`, `examples/activity-sequence.md` — frame→dot-leader.
- `examples/sequence-messages.md`, `examples/activity-flow.md`,
  `examples/layout-columns.md`, `examples/mapping-pairs.md` — NEW clean examples
  (one per type; C4 already exists — align to the new notation).
- `README.md` — "Prompt caching" section (reality + byte-stability + 5-min TTL).
- `package.json` + `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json` —
  1.0.1 → 1.1.0.
- `CHANGELOG.md` — `## 1.1.0` section.

## Verification

```bash
# rules well-formed + triggers present
grep -cE 'activity|sequence|C4|layout' rules/feynman-activate.md   # new triggers present
npm test 2>&1 | grep -iE "tests|pass|fail"                          # 0 fail
npm run typecheck                                                   # green
npm run eslint                                                      # 0 findings (CI gate)
npm run coverage 2>&1 | grep "all files"                            # >=95

# L14 works
npm run lint -- examples/sequence-messages.md                       # clean
# (craft a fixture with no blank line around a fenced block → L14 warns)

# build + reinstall
npm run build                                                       # dist/albinocrabs-feynman-1.1.0.tgz
npm run test:release                                                # smoke OK
npx @albinocrabs/feynman@file:dist/...tgz install --target both     # OR local install path
cat ~/.claude/.feynman/state.json                                   # injections preserved

# bump consistency
node -e "['./package.json','./.claude-plugin/plugin.json','./.codex-plugin/plugin.json'].forEach(f=>{const v=require(f).version; if(v!=='1.1.0'){console.error(f,v);process.exit(1)}}); console.log('all 1.1.0')"
```

Scenarios:

```
#   (a) new session → SessionStart injects rules WITH activity/sequence/C4/layout triggers
#   (b) ask Claude for a sequence → emits `A->>B: msg` minimal, no activate/loop bloat
#   (c) ask for C4 → `Type(name) --> Type(name): label`, no frames
#   (d) parallel-columns layout → single │ separator, not md-table
#   (e) fenced ASCII without surrounding blank lines → L14 warn
#   (f) /feynman status → 1.1.0; reinstall preserved injections counter
```

## From the human

```
▲ FROM YOU
──────────
- approve this plan (ExitPlanMode)
- granular npm token for publishing v1.1.0 (same as 1.0.1; classic hits 2FA)
- everything else is me: rules/lint/examples/readme, bump, build, local REINSTALL,
  commit, push, watch CI
```

## Side deliverables

- Memory: `project_v110_shipped.md` — new diagram triggers + caching reality.
- `.planning/notes/` — save the 3-agent research findings as a note for the
  future (Obsidian wikilinks).
- If a verbosity measurement shows a regression — do NOT publish; revisit the
  notation.
