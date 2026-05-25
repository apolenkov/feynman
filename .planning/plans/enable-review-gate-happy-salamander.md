# Plan: Smart ASCII autofix expansion (v1.3.0)

> Имя файла историческое (`enable-review-gate-happy-salamander`).
> Актуальный контент — расширение `feynman-lint --fix` до 4-х паттернов
> выравнивания. Спек: `.planning/specs/2026-05-25-smart-ascii-autofix-design.md`.

---

## Context

`feynman-lint --fix` уже существует и выравнивает фреймы + переводит L11 в
dot-leader. Но он промахивается на трёх классах ASCII-структур, которые сам
feynman продвигает как «обязательные визуалы»: arrow-flow, parallel-fan,
длина разделителей. Плюс есть один gap в существующем frame-autofix — regex
не ловит фреймы с titled top (`┌─ Title ─┐`), из-за чего L09 видит ошибку,
но autofix её не чинит.

Цель v1.3.0 — закрыть gap (Pattern D) и добавить 3 новых паттерна
выравнивания (A/B/C). Архитектурно — без split-а файла, inline в
`lib/lint/autofix.ts` (по выбору пользователя). Split откладываем до v1.3.x
если файл реально разрастётся.

---

## 1. TL;DR

### Было

```
lib/lint/autofix.ts (~220 LoC)
  autofix(text, opts)
    └── только frame alignment + опц. L11→dot-leader

регекс top bar: /^(\s*)┌─*┐\s*$/
                 ↑ НЕ ловит titled top
```

### Станет

```
lib/lint/autofix.ts (~500 LoC, inline)
  autofix(text, opts)
    ├── detectAndFixFrames()       Pattern D (включает titled top)
    ├── detectAndFixJunctions()    Pattern B (NEW)
    ├── detectAndFixArrows()       Pattern A (NEW)
    └── detectAndFixSeparators()   Pattern C (NEW)

регекс top bar: /^(\s*)┌─.*─┐\s*$/
                 ↑ ловит и `┌────┐`, и `┌─ Title ─┐`
```

### Execution flow

```
[wave 0: Haiku разведка]
  ├── A: grep autofix call-sites + idempotency proof
  └── B: fixture skeleton template

         ↓ (parallel, single message)

[wave 1: Sonnet impl, sequentially — общий файл]
  ├── C: Pattern D (titled top + W расчёт)        commit
  ├── D: Pattern A (arrow column)                 commit
  ├── E: Pattern B (junction fan)                 commit
  └── F: Pattern C (separator length)             commit

         ↓

[wave 2: Sonnet docs+release]
  ├── G: tests + fixtures + README + CHANGELOG    commit
  └── H: version 1.3.0 + tag + npm publish        commit
```

### От человека одной строкой

Ничего обязательного. Опционально — глянуть `npm run release` dry-run output
перед `npm publish` если хочешь подстраховаться. Остальное — Я делаю сам.

---

## 2. Architecture context

```
bin/feynman-lint.ts --fix <file>
  └── reads file
      └── autofix(text, { processFenced, convertL11 })   ← lib/lint/autofix.ts
            ├── split → lines + fenced detection
            ├── для каждого блока:
            │     ├── detect frames → fix (Pattern D + старые)
            │     ├── detect junctions → fix (Pattern B)         ← NEW
            │     ├── detect arrows → fix (Pattern A)            ← NEW
            │     └── detect separators → fix (Pattern C)        ← NEW
            └── reassemble → возврат
      └── writes file (если изменилось)

hooks/feynman-session-start.ts (Stop-hook smoke)
  └── вызывает autofix() с conservative defaults (без processFenced, без convertL11)
      └── те же 4 паттерна автоматически включены под conservative-first
```

Non-overlap invariant: регион типа X не пересекается с регионом типа Y.
При конфликте побеждает более структурный (frame > junction > arrow > separator).

---

## 3. Стратегия выполнения

### Cheap-first delegation

- **Haiku** (parallel wave 0): разведка call-sites через grep, идемпотентность
  proof через двойной прогон, скелет fixture файлов.
- **Sonnet** (sequential wave 1): 4 паттерна по одному коммиту — общий файл
  `autofix.ts`, параллелить нельзя из-за конфликта правок.
- **Sonnet** (wave 2): тесты + docs + release в одной волне.
- **Opus**: только если в wave 1 застрянет — fallback на synthesis.

### Parallel waves

- Wave 0: 2 Haiku-агента одним сообщением (call-site разведка + fixture-skeleton).
- Wave 1: 4 Sonnet-агента последовательно (общий файл `autofix.ts`, race
  невозможен).
- Wave 2: tests/docs/release sequentially.

### Subagent split

| stage | agent        | model  | scope                                                                    | r/w   | output                       |
| ----- | ------------ | ------ | ------------------------------------------------------------------------ | ----- | ---------------------------- |
| S0    | orchestrator | Sonnet | live repo truth + координация фаз                                       | r/w   | merged 1.3.0                 |
| S1    | call-scout   | Haiku  | grep всех `import.*autofix` + `autofix(` использований                   | read  | `/tmp/autofix-callers.md`    |
| S2    | fixture-tpl  | Haiku  | скелет fixture файлов (before/after MD)                                  | write | `/tmp/fixture-template.md`   |
| S3    | impl-D       | Sonnet | Pattern D: titled top regex + W calc + title preserve                    | write | commit                       |
| S4    | impl-A       | Sonnet | Pattern A: arrow column detection + fix                                  | write | commit                       |
| S5    | impl-B       | Sonnet | Pattern B: junction fan detection + fix                                  | write | commit                       |
| S6    | impl-C       | Sonnet | Pattern C: separator length detection + fix                              | write | commit                       |
| S7    | docs-test    | Sonnet | fixtures + tests + README + CHANGELOG                                    | write | commit                       |
| S8    | release      | Sonnet | version bump + tag + npm publish                                         | write | tagged + published           |
| S9    | reviewer     | Sonnet | read-only review между S6 и S7                                           | read  | PASS / BLOCK                 |

S1+S2 параллельно (single message, 2 tool calls). S3→S4→S5→S6 строго
последовательно. S9 после S6, до S7. S7→S8 sequentially.

---

## 4. Boundaries

```
in-scope                            │  out-of-scope
────────────────────────────────────┼────────────────────────────────────
lib/lint/autofix.ts                 │  lint warnings для A/B/C (только autofix)
tests/autofix.test.ts               │  CLI flags `--no-arrows` etc.
tests/fixtures/autofix/*.md (new)   │  ASCII boxes (`+--+|--+`)
README.md (Autofix capabilities)    │  titled bottom (`└─ Closeout ─┘`)
CHANGELOG.md                        │  split autofix.ts в module (отложено)
package.json (version)              │  performance optimization
                                    │  изменения hook input/output API
```

---

## 5. Locked decisions

| #  | решение                                                                       | источник           |
| -- | ----------------------------------------------------------------------------- | ------------------ |
| D1 | Inline в `autofix.ts`, без split на module                                    | user answer        |
| D2 | Idempotency `autofix(autofix(x)) === autofix(x)` — мандатный test fixture     | self-decide        |
| D3 | Pattern A anchor — позиция первого char стрелки (`→` / `-` / `─`)             | self-decide        |
| D4 | Frame > junction > arrow > separator при конфликте регионов                   | spec §architecture |
| D5 | Pattern D bottom bar — всегда без title (упрощение v1)                        | spec §Pattern D    |
| D6 | Pattern C tolerance — ≥2 `─`-only линий, обе ≥3 символа                       | spec §Pattern C    |
| D7 | Conservative ±3 columns guard для A/B                                         | spec §Pattern A/B  |
| D8 | 5 коммитов вместо 6 (без отдельного refactor)                                 | user answer        |

---

## 6. Files to modify

- **`lib/lint/autofix.ts`** — основные правки:
  - Line 168: regex `/^(\s*)┌─*┐\s*$/` → `/^(\s*)┌─.*─┐\s*$/`
  - В `autofixFrame()`: парсинг titleSegment, расчёт W через `visualWidth(topInner)`
  - Новые функции: `detectAndFixArrows()`, `detectAndFixJunctions()`,
    `detectAndFixSeparators()`
  - В `autofix()` dispatcher: добавить вызовы новых детекторов после frame fix
  - Idempotency: каждая detect-функция возвращает unchanged если region уже
    выровнен (важно для двойного прогона в stop-hook)
- **`tests/autofix.test.ts`** — добавить блоки:
  - `describe('Pattern D — titled frame')`
  - `describe('Pattern A — arrow column')`
  - `describe('Pattern B — junction fan')`
  - `describe('Pattern C — separator length')`
  - `describe('idempotency')` — двойной прогон не меняет вывод
  - `describe('false-positive corpus')` — `should-not-touch.md`
- **`tests/fixtures/autofix/`** — новые файлы:
  - `titled-frame-before.md` + `-after.md`
  - `arrow-basic-before.md` + `-after.md`
  - `junction-fan-before.md` + `-after.md`
  - `separator-length-before.md` + `-after.md`
  - `should-not-touch.md` (false-positive corpus)
- **`README.md`** — раздел «Autofix capabilities» с before/after блоками по
  каждому из 4-х паттернов
- **`CHANGELOG.md`** — запись v1.3.0 с upgrade notes (conservative-first,
  никакого breaking)
- **`package.json`** — version `1.2.1` → `1.3.0`
- **`MEMORY.md` (после ship)** — pointer на `project_v130_shipped.md`

---

## 7. Verification

```bash
# 1. Unit + integration
npm test --silent 2>&1 | tail -10
npm run typecheck
npm run lint
npm run lint:md

# 2. Coverage gate (≥95%, существующий)
npm run test:coverage 2>&1 | tail -5

# 3. CI bundle
npm run ci

# 4. Manual fixture check (4 паттерна)
node bin/feynman-lint.ts --fix tests/fixtures/autofix/titled-frame-before.md
diff tests/fixtures/autofix/titled-frame-before.md \
     tests/fixtures/autofix/titled-frame-after.md
# повторить для arrow, junction, separator

# 5. Idempotency proof
cp tests/fixtures/autofix/arrow-basic-before.md /tmp/idem.md
node bin/feynman-lint.ts --fix /tmp/idem.md
md5sum /tmp/idem.md > /tmp/idem.md5
node bin/feynman-lint.ts --fix /tmp/idem.md
md5sum -c /tmp/idem.md5   # должно совпасть

# 6. False-positive corpus
cp tests/fixtures/autofix/should-not-touch.md /tmp/fp.md
node bin/feynman-lint.ts --fix /tmp/fp.md
diff tests/fixtures/autofix/should-not-touch.md /tmp/fp.md
# diff пустой = autofix не тронул

# 7. Release smoke
npm run release   # dry-run проверки внутри build-package + release-smoke
# затем npm publish с granular token

# 8. Установка на чистый env
npm install -g @albinocrabs/feynman@1.3.0
feynman doctor
echo "test ┌─ Title ─┐
text content" | feynman lint --fix /dev/stdin
```

Ожидаемый итог:

```
unit tests           PASS  (включая 4 новых describe-блока)
typecheck            PASS
lint + lint:md       PASS
coverage             ≥95%
ci bundle            PASS
4 manual fixtures    align как expected
idempotency          double-pass = no-op
false-positive       no-op на should-not-touch.md
release smoke        PASS
npm install global   v1.3.0 работает
```

---

## 8. Phases

### Phase A — Pattern D (titled top fix)

- A.1 заменить regex на line 168
- A.2 пересчитать W через `visualWidth(topInner)` вместо `match(/─/g)`
- A.3 распарсить title, перерисовать top через `titleSegment + remainingDashes`
- A.4 fixture `titled-frame-before/-after.md`
- A.5 test block `Pattern D — titled frame`
- A.6 verify: existing frame tests должны быть зелёными БЕЗ правок
- commit: `fix(autofix): handle titled top in frames (Pattern D)`

### Phase B — Pattern A (arrow column)

- B.1 функция `detectArrowRegions(lines)` — возвращает `[{start, end, arrows: [{line, pos}]}]`
- B.2 функция `fixArrowRegion(lines, region)` — pad left side до maxLeft
- B.3 интеграция в dispatcher после frame fix, с не-пересечением
- B.4 fixture + test block
- commit: `feat(autofix): align arrow columns (Pattern A)`

### Phase C — Pattern B (junction fan)

- C.1 функция `detectJunctionRegions(lines)`
- C.2 функция `fixJunctionRegion(lines, region)` — pad после `]` до maxBoxEnd
- C.3 интеграция (приоритет выше arrow при пересечении)
- C.4 fixture + test
- commit: `feat(autofix): align junction fans (Pattern B)`

### Phase D — Pattern C (separator length)

- D.1 функция `detectSeparatorRegions(lines, fenceState)`
- D.2 функция `fixSeparatorRegion(lines, region)` — `─`.repeat(maxLen)
- D.3 guard: не трогать `─` внутри frame regions
- D.4 fixture + test
- commit: `feat(autofix): normalize separator lengths (Pattern C)`

### Phase E — Tests + docs

- E.1 false-positive corpus `should-not-touch.md`
- E.2 idempotency test block
- E.3 README раздел «Autofix capabilities»
- E.4 CHANGELOG entry с upgrade notes
- E.5 reviewer agent gate (S9) — read-only review всех 4 паттернов
- commit: `test(autofix): expand coverage for patterns A/B/C/D + idempotency`
- commit: `docs(readme,changelog): document v1.3.0 autofix patterns`

### Phase F — Ship

- F.1 `package.json` version → 1.3.0
- F.2 `npm run ci` — финальная gate
- F.3 `npm run release` → собирает `dist/<pkg>.tgz`
- F.4 `npm publish $(cat dist/TARBALL.txt) --access public` (granular token)
- F.5 `git tag v1.3.0 && git push --tags`
- F.6 MEMORY.md entry `project_v130_shipped.md`
- commit: `chore(release): v1.3.0`

---

## 9. Token economy

| work type                              | model        | writes? | comment                                       |
| -------------------------------------- | ------------ | ------- | --------------------------------------------- |
| grep call-sites + idempotency proof    | Haiku        | no      | S1                                            |
| fixture skeleton template              | Haiku        | yes     | S2 — простые stub-файлы                       |
| Pattern D impl                         | Sonnet       | yes     | S3 — точечная правка regex + W                |
| Pattern A/B/C impl                     | Sonnet       | yes     | S4-S6 — новые функции, sequential             |
| read-only review (4 паттерна)          | Sonnet       | no      | S9 — между S6 и S7                            |
| docs + fixtures + CHANGELOG            | Sonnet       | yes     | S7 — низкий риск                              |
| release                                | Sonnet       | yes     | S8 — механическая последовательность          |
| conflict resolution (if BLOCK)         | Opus         | no      | conditional, только при verified conflict     |

---

## 10. Я делаю сам vs ▲ От тебя

### ✓ Я делаю сам

- разведка call-sites + idempotency proof (Haiku × 2 parallel)
- impl Pattern D (regex fix + W recalculation)
- impl Patterns A/B/C (4 sequential Sonnet коммита)
- fixtures + false-positive corpus + idempotency test
- README + CHANGELOG обновление
- version bump → 1.3.0 + ci gate + release + npm publish + git tag
- обновление MEMORY.md

### ▲ От тебя

- ничего обязательного во время реализации
- (опционально) глянуть `npm run release` dry-run output перед публикацией
- (опционально) после ship — прогнать `feynman-lint --fix` на одном из своих
  файлов с frame-block, проверить визуально

---

## 11. Open questions

| #  | вопрос                                                                  | как решу автономно                                                                                                          | когда эскалирую                              |
| -- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Q1 | Что делать с Pattern A где у строк разнотипные стрелки (`→` + `-->`)?   | anchor = позиция ПЕРВОГО char стрелки. Сохраняет колонку начала arrow.                                                       | если фикстура с разнотипными сломается       |
| Q2 | Что считать «одним блоком» для Pattern C?                                | блок = область между двумя fence-маркерами ИЛИ между двумя blank-линиями. Стандарт для всех 4-х паттернов.                   | если эмпирически появятся false positives    |
| Q3 | Pattern B — что если junction есть, но `[...]` бокса нет (нет prefix)?  | skip — Pattern B требует `[box]` префикса. Чистые junction без бокса — рарный паттерн, не покрываем в v1.3.0.                | никогда (out of scope)                       |
| Q4 | Что если в frame regions есть arrow inside?                              | frame побеждает по priority. Arrow внутри inner-области фрейма не выравнивается этим passом (frame фиксит inner-padding сам). | если визуально сломается — отдельный fix     |
| Q5 | Stop-hook idempotency — нужны ли отдельные тесты?                        | да, `tests/lint-hook.test.ts` уже покрывает stop-hook прогон. Добавлю проверку double-run = no-op для всех 4-х паттернов.    | никогда                                      |

---

## 12. Не трогать

- `bin/feynman-lint.ts` — `--fix` уже вызывает `autofix()`, изменений не нужно
- `hooks/feynman-session-start.ts` — autofix вызывается с conservative
  defaults, новые паттерны включаются автоматически
- `lib/lint/rules.ts` — L09 (right_edge_alignment) уже детектит проблему,
  отдельных правил для A/B/C не добавляем (по решению — autofix-only)
- API hook input/output — без изменений
- `lib/lint/width.ts` — используется как есть

---

## 13. Iteration reserve

- 10-15% контекста фазы держу под self-review + plan-hardening
- если в Phase B/C/D выяснится, что conservative ±3 columns слишком жёсткий
  или слишком мягкий — итерация tolerance в той же фазе без остановки
- если reviewer agent (S9) даст BLOCK — fix-loop в Sonnet (S3-S6), а не
  сразу Opus
- iteration reserve покрывает: 1 правку плана по feedback, 1 self-review
  pass, 1 verification refresh перед commit

---

## 14. Rollback

Каждый из 5-ти feature/fix коммитов самостоятелен и обратимо реверится:

- Pattern D fix (commit 1) — точечная правка regex, revert восстанавливает
  старый behavior, frame tests продолжат проходить
- Pattern A/B/C (commits 2-4) — новые функции, revert удаляет их вызовы из
  dispatcher и сами функции, остальные паттерны работают
- Tests + docs (commit 5) — независим от impl коммитов
- Release commit (chore) — revert + новый release с правильным fix

Аварийный rollback публикации:

```bash
# Если v1.3.0 на npm оказался сломан:
npm deprecate @albinocrabs/feynman@1.3.0 \
  "broken: use 1.2.1 or wait for 1.3.1"
# затем fix-forward в 1.3.1, не revert опубликованной версии
```

---

## 15. Self-check (pillars gate перед ExitPlanMode)

```
pillar gate
  workflow        ✓ DTP-plan формат применён
  git/ttt         ✓ ветка main, dist/* в .gitignore
  source of truth ✓ правится lib/lint/, без runtime-патчинга
  tests           ✓ idempotency + false-positive corpus + 4 паттерна
  skills/docs     ✓ README раздел + CHANGELOG entry
  token economy   ✓ Haiku scan, Sonnet impl, Opus только conditional
  visual quality  ✓ ASCII trees + arrows вместо тяжёлых frames
  iteration       ✓ reserve + reviewer gate (S9) между S6 и S7
  boundaries      ✓ in/out scope разнесены
  open questions  ✓ все 5 с default, Q1 — единственный риск escalation
  surgical        ✓ inline в autofix.ts, без split на module (per user)
```

---

## 16. Closeout

После Phase F:

- 5 feature/fix коммитов + 1 release коммит на `main`
- `git tag v1.3.0` + `git push --tags`
- `npm publish $(cat dist/TARBALL.txt) --access public` (granular token)
- MEMORY.md entry: «v1.3.0 — smart ASCII autofix expanded to 4 patterns
  (titled frames, arrow columns, junction fans, separator lengths);
  conservative-first heuristics; idempotent for stop-hook double-run»
- (опционально) README badge на новую версию
- (опционально) краткий tweet/issue update про новые возможности `--fix`
