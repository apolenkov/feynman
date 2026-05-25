# Plan: Add OpenCode as third target (с TargetAdapter refactor)

> Имя файла исторически связано с прошлой задачей (`enable-review-gate`).
> Актуальный контент — добавление поддержки OpenCode runtime в плагин
> `@albinocrabs/feynman` через мини-рефактор `TargetAdapter`.

---

## 0. Сейчас

```
ветка   : main (= origin/main)
dirty   : .planning/plans/   (untracked — этот файл)
tag     : v1.1.1 (последний релиз)
recent  : 9f1923b chore(release): v1.1.1
          cfde037 fix(lint): recognize sequence-message arrows
          84e7b30 chore(release): v1.1.0
          288f47f docs(readme): honest prompt-caching section
          6724528 docs(examples): de-frame heavy examples
```

Здесь нет `.planning/STATE.md` / `ROADMAP.md` — `feynman` не использует
полный GSD-аппарат core-principles. План пишется одиночным артефактом в
`.planning/plans/`, а закрытие = `chore(release): v1.2.0`.

---

## 1. TL;DR (визуально)

### Было

```
┌─ supported targets ──────────────────────────────────┐
│                                                       │
│   claude  ──► SessionStart hook ──► stdout JSON       │
│   codex   ──► SessionStart hook ──► stdout JSON       │
│                                                       │
│   код:    if (name === 'codex' ? '.codex' : '.claude')│
│           if (claude) { … } else if (codex) { … }     │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Проблема

```
[2 target ternary]                    [N=3+ target будет]
       │                                       │
       ▼                                       ▼
 if/else x N мест                       тройные тернарии
       │                                       │
       ▼                                       ▼
 OpenCode без stdout hook  ───►  «отсутствие hook» нельзя
                                  оформить как ещё одна ветка
                                  if/else — нужен другой
                                  механизм инъекции
       │                                       │
       └──────────► рост поверхности багов, drift между
                    тремя копиями hooks.json, дубль
                    `clientHome()` в SKILL.md
```

### Станет

```
┌─ TargetAdapter contract ─────────────────────────────────┐
│                                                           │
│   interface TargetAdapter { paths, install, uninstall,    │
│                              doctor }                     │
│                                                           │
│   claude   = createClaudeAdapter()    ── SessionStart hook│
│   codex    = createCodexAdapter()     ── SessionStart hook│
│   opencode = createOpenCodeAdapter()  ── instructions[]   │
│                                          в opencode.json  │
│                                                           │
│   installOne(t)   = adapters[t].install()                 │
│   cmdDoctor(t)    = adapters[t].doctor()                  │
│   cmdUninstall(t) = adapters[t].uninstall()               │
│                                                           │
│   lib/client-home.ts  — shared helper, дубль убран        │
└───────────────────────────────────────────────────────────┘
```

Одна строка пайплайна фаз:

```
[A: refactor] ── [B: opencode] ── [C: tests+docs] ── [Review Gate] ── [ship 1.2.0]
   ↑ green        ↑ instructions   ↑ skill+README     ↑ self-review    ↑ tag+npm
```

---

## 2. Recovered intent

Из текущей сессии:

| источник                              | что говорит                                            |
| ------------------------------------- | ------------------------------------------------------ |
| user message: «нужно добавить поддержку OpenCode» | новая фича: третий target                              |
| user answer #1                        | inject method = **native файл + `instructions: [...]`**|
| user answer #2                        | **сначала мини-рефактор TargetAdapter**, потом opencode|
| memory `project_v110_shipped`         | base = v1.1.x, добавляем как minor 1.2.0               |
| memory `feedback_npm_publish_2fa`     | релиз требует granular token + `npm publish dist/*.tgz`|

Ничего «обязательного» от человека сверх этого. Архитектурные решения
закрыты двумя ответами; всё остальное расписываю автономно.

---

## 3. Skill routing

| skill / source                | зачем                                          | что вернёт                          |
| ----------------------------- | ---------------------------------------------- | ----------------------------------- |
| `dtp-plan` (plan mode)        | стандартизация плана                           | этот файл                           |
| `dtp-plan review` (Phase D)   | 14-доменный read-only ревью перед commit       | PASS / BLOCK по доменам             |
| `Context7` (Phase B inline)   | подтвердить формат `instructions: [...]` opencode.json | актуальный SDK doc-фрагмент |
| `WebSearch` (Phase B inline)  | реальное поведение opencode при abs/relative path | эмпирический факт                |
| `graphify` (Phase A pre-edit) | граф вызовов `installOne` / `targetConfig`     | список call-sites                   |
| `npm test` / `tsc` / eslint   | gate перед review                              | PASS / FAIL                         |

**Пропущено сознательно:**

- `dtp-session-scan` — сессия в скоупе, intake не нужен
- `dtp-jira` — у репо нет Jira-привязки
- Plannotator rich mode — терминальный ASCII достаточен
- `make audit` — у `feynman` нет catalog→runtime pipeline, это
  одна managed npm-пакет-точка

---

## 4. Boundaries (что трогаем, что нет)

```
┌─ in-scope ──────────────────────────────┐  ┌─ out-of-scope ────────────────┐
│ bin/feynman.ts                           │  │ ~/.config/opencode/* —        │
│ lib/target-adapter.ts (new)              │  │   runtime файлы НЕ patch-им   │
│ lib/client-home.ts (new)                 │  │   напрямую кроме как через    │
│ skills/feynman/SKILL.md                  │  │   `feynman install`           │
│ tests/cli.test.ts                        │  │                               │
│ tests/install.test.ts                    │  │ hooks/feynman-session-start.ts│
│ README.md                                │  │   (уже target-agnostic через  │
│ package.json (version + files если надо) │  │    FEYNMAN_HOME env var)      │
│                                          │  │                               │
│                                          │  │ .opencode-plugin/ — НЕ        │
│                                          │  │   создаём (D-5)               │
│                                          │  │                               │
│                                          │  │ rules файлы (formats, lint    │
│                                          │  │   правила, intensity содерж.) │
└──────────────────────────────────────────┘  └───────────────────────────────┘
```

---

## 5. Locked architecture decisions

| #  | решение                                                                    | источник            |
| -- | -------------------------------------------------------------------------- | ------------------- |
| D1 | inject method для opencode = native `instructions: [абс. путь]`            | user answer #1      |
| D2 | мини-рефактор `TargetAdapter` ДО добавления opencode                       | user answer #2      |
| D3 | state в `~/.config/opencode/.feynman/` (симметрия с claude/codex)          | self-decide         |
| D4 | rules.md = `~/.config/opencode/.feynman/rules.md`, абс. путь в instructions| self-decide         |
| D5 | `.opencode-plugin/` НЕ создаём (npm-пакет сам по себе достаточен)          | self-decide         |
| D6 | `both` = claude+codex (legacy); `all`/`*` = claude+codex+opencode          | self-decide         |
| D7 | смена intensity → CLI перезапись rules.md → пользователь делает `/clear`   | self-decide         |
| D8 | idempotency для opencode.json: check-before-append, чужие пути не трогаем  | self-decide         |

---

## 6. Subagent roadmap

| stage | агент       | model tier      | scope                                | r/w  | выход                          |
| ----- | ----------- | --------------- | ------------------------------------ | ---- | ------------------------------ |
| S0    | Orchestrator | Sonnet         | live repo truth, координация фаз     | r/w  | merged 1.2.0                   |
| S1    | grep-scout  | Haiku           | grep всех `target ===` тернариев     | read | line list, /tmp/ternaries.md   |
| S2    | dup-scout   | Haiku           | `clientHome()` дубль в SKILL.md      | read | 2 ranges + diff                |
| S3    | doc-scout   | Haiku           | формат `instructions: []`, abs paths | read | /tmp/oc-instructions.md        |
| S4    | impl-A      | Sonnet          | Phase A: TargetAdapter refactor      | write | commit `refactor(cli): …`     |
| S5    | impl-B      | Sonnet          | Phase B: opencode adapter            | write | commit `feat(cli): …`         |
| S6    | impl-C      | Sonnet          | Phase C: tests + docs + skill        | write | commit `test/docs: …`         |
| S7    | reviewer    | Sonnet (cheap) | 14-domain read-only review           | read | PASS / BLOCK report            |
| S8    | deep-fix    | Opus (cond)     | conflict resolution (only if BLOCK)  | read | resolution patch suggestions   |

**Параллелизм:** S1 + S2 + S3 одной волной (single message, 3 tool calls)
перед Phase A. S4 → S5 → S6 строго последовательно (общий файл
`bin/feynman.ts`). S7 после S6 commit. S8 conditional, только при BLOCK.

**Запуск:** background где можно, foreground для commit-точек (S0 владеет
final result).

---

## 7. Token economy

| work type                              | model        | writes? | comment                                       |
| -------------------------------------- | ------------ | ------- | --------------------------------------------- |
| grep / classify / line-find            | Haiku        | no      | S1, S2                                        |
| ext docs lookup (Context7 + WebSearch) | Haiku        | no      | S3                                            |
| TargetAdapter refactor                 | Sonnet       | yes     | scoped: только `bin/feynman.ts` + `lib/`      |
| opencode adapter                       | Sonnet       | yes     | scoped: новый файл + 1 import                 |
| tests + docs                           | Sonnet       | yes     | 2 test files + SKILL.md + README              |
| 14-domain review                       | Sonnet       | no      | dispatch через `/dtp-plan review`             |
| conflict resolution (if BLOCK)         | Opus         | no      | только при verified conflict                  |

Правила:

- Не открываем raw sessions / огромные блоки исходников целиком — точечный read
- Deep model (Opus) не запускается без проверенного риска из ревью
- Между S4-S5-S6 не даём агентам собственный «full repo scan» — каждому
  передаётся список файлов + контракт output

---

## 8. Phases (детали)

### Phase A — TargetAdapter contract (bit-for-bit compat)

Цель: ввести контракт, мигрировать claude/codex, **поведение не меняется**.

Файлы:

- `bin/feynman.ts` — diff минимальный, диспатч через `adapters[name]`
- `lib/target-adapter.ts` (new) — типы + общие хелперы (если разрастётся)

Шаги:

- A.1 определить `TargetAdapter`, `InstallOpts`, `UninstallOpts`,
  `DoctorResult` (top-of-file или новый `lib/target-adapter.ts` — решит
  размер при импле)
- A.2 переписать `installOne()` → `adapters[target].install(opts)`
- A.3 то же для `cmdDoctor()` и `cmdUninstall()`
- A.4 прогнать `tests/cli.test.ts` + `tests/install.test.ts` — должны
  быть зелёными БЕЗ правок (если красные → откат, рефактор сломал)
- A.5 commit: `refactor(cli): introduce TargetAdapter contract for claude/codex`

### Phase B — OpenCode adapter

Файлы:

- `bin/feynman.ts` — регистрация `opencode` адаптера, `VALID_TARGETS`,
  `TARGET_ALIASES`, `targetNames`
- `lib/opencode-adapter.ts` (или inline в bin/) — реализация контракта

Содержимое `createOpenCodeAdapter()`:

```
paths.home     = ~/.config/opencode
paths.state    = ~/.config/opencode/.feynman/state.json
paths.flag     = ~/.config/opencode/.feynman-active
paths.settings = ~/.config/opencode/opencode.json

install():
  1. bootstrapState(target='opencode')           ← reuse existing fn
  2. render rules.md из state.intensity → .feynman/rules.md
  3. read opencode.json (create {} if absent)
  4. ensure absolute path of rules.md в instructions[]
     (check-before-append, no dedup чужих)
  5. write back, indent=2

uninstall():
  1. remove наш путь из instructions[]
  2. delete rules.md, .feynman/, .feynman-active
  3. state.json НЕ удаляем (симметрия с claude/codex)

doctor():
  - opencode.json существует?
  - наш путь в instructions[]?
  - rules.md существует и непустой?
  - state.json валидный?
  - .feynman-active flag статус
  - (НЕТ проверки hooks.json — opencode без hook by design)
```

Шаги:

- B.1 написать adapter
- B.2 `VALID_TARGETS += 'opencode'`, `all`/`*` → 3 targets, `both` остаётся 2
- B.3 эмпирически проверить absolute-path-в-instructions через OpenCode
  CLI (один прогон вручную) — fallback на relative от `~/.config/opencode/`
  если abs не работает
- B.4 commit: `feat(cli): add opencode target (native instructions injection)`

### Phase C — Tests + skill + docs

Файлы:

- `tests/cli.test.ts` — новые блоки + update `all`/`*` assertions
- `tests/install.test.ts` — параметризовать через адаптер если ассертит
  `.codex/hooks.json` напрямую
- `lib/client-home.ts` (new) — вынесенный helper
- `skills/feynman/SKILL.md` — ветка opencode + чтение helper-а
- `README.md` — install one-liner + intensity caveat + compatibility table
- `package.json` — version 1.2.0

Шаги:

- C.1 тестовые сценарии (см. Verification ниже) → `tests/cli.test.ts`
- C.2 вынести `clientHome()` из SKILL.md в `lib/client-home.ts`,
  добавить ветку opencode (`FEYNMAN_TARGET=opencode` → `~/.config/opencode`)
- C.3 README — opencode install + intensity caveat (`/clear` для перечитывания)
- C.4 commit-pair:
  - `test(cli): cover opencode target paths and idempotency`
  - `docs(readme): add opencode install + intensity caveat`
- C.5 version bump → 1.2.0 (отдельным commit после approval review-gate)

### Phase D — Review Gate (отдельная фаза)

После Phase C commits, **до** version bump:

- D.1 `npm test --silent 2>&1 | tail -10` → PASS
- D.2 `npm run typecheck` → PASS
- D.3 `npm run lint` → PASS
- D.4 `npm run lint:md` → PASS
- D.5 read-only 14-доменный review (S7) → PASS / BLOCK
  - typescript: типизация `TargetAdapter` без `any`
  - architecture: нет if-target-ternary где можно через adapter
  - security: не пишем за пределы `~/.config/opencode/.feynman/` + наш ключ
    в instructions[]
  - tests: idempotency покрыта, uninstall purge покрыт
  - docs: README отражает реальное поведение
- D.6 если BLOCK → S8 (Opus conflict) или ручная правка → loop в D.5
- D.7 если PASS → переходим к Phase E

### Phase E — Ship

- E.1 `npm run release` → собирает `dist/*.tgz`
- E.2 `npm publish dist/<pkg>.tgz` с granular token (2FA bypass)
- E.3 `git tag v1.2.0` + `git push --tags`
- E.4 update `MEMORY.md` записью «v1.2.0 — opencode target via instructions»
- E.5 (опционально) CHANGELOG.md entry

---

## 9. Verification

```bash
# 1. Unit tests + lint
npm test --silent 2>&1 | tail -10
npm run typecheck
npm run lint
npm run lint:md

# 2. Install opencode на чистый env
rm -rf ~/.config/opencode/.feynman ~/.config/opencode/.feynman-active
node bin/feynman.ts install --target opencode

# 3. Проверки файлов
test -f ~/.config/opencode/.feynman/state.json   && echo "state OK"
test -f ~/.config/opencode/.feynman/rules.md     && echo "rules OK"
test -f ~/.config/opencode/.feynman-active       && echo "flag OK"
grep -q "$HOME/.config/opencode/.feynman/rules.md" \
  ~/.config/opencode/opencode.json               && echo "instructions OK"

# 4. Idempotency
node bin/feynman.ts install --target opencode
# instructions[] не должен содержать дубликата нашего пути

# 5. Doctor
node bin/feynman.ts doctor --target opencode
# все строки → OK

# 6. All-target install
node bin/feynman.ts install --target all
# должно поставить claude + codex + opencode

# 7. Uninstall
node bin/feynman.ts uninstall --target opencode
test ! -f ~/.config/opencode/.feynman/rules.md   && echo "rules removed"
test ! -f ~/.config/opencode/.feynman-active     && echo "flag removed"
test -f ~/.config/opencode/.feynman/state.json   && echo "state preserved"
grep -q "feynman" ~/.config/opencode/opencode.json \
  && echo "FAIL: instructions cleanup" \
  || echo "instructions cleaned"

# 8. Реальная OpenCode-сессия (ручная, единственный шаг где смотрит человек)
opencode
# проверить визуально: ASCII-стиль подхватился в первом ответе
```

Ожидаемый итог:

```
┌─ ship gate ─────────────────────────────────┐
│ unit tests           PASS                    │
│ typecheck            PASS                    │
│ lint + lint:md       PASS                    │
│ install claude       ok (existing)           │
│ install codex        ok (existing)           │
│ install opencode     ok (new)                │
│ install all          3 targets               │
│ doctor opencode      OK                      │
│ uninstall opencode   clean                   │
│ OpenCode session     rules visible (human)   │
└──────────────────────────────────────────────┘
```

---

## 10. Agent does / Human does

### ✓ Я делаю сам

- мини-рефактор `TargetAdapter` (Phase A) — Sonnet
- адаптер opencode + работа с `opencode.json` (Phase B) — Sonnet
- тесты + docs + skill update (Phase C) — Sonnet
- параллельная разведка S1/S2/S3 через Haiku
- gate run + 14-домен review (Phase D)
- release & tag (Phase E) — после approval review-gate
- update MEMORY.md

### ▲ От тебя

- ничего обязательного во время реализации
- (опционально, после ship) один прогон `opencode` сессии и визуальная
  проверка ASCII-шапки в первом ответе

---

## 11. Open questions (с defaults)

| #  | вопрос                                                                    | default                                                                                                                | когда спросить                       |
| -- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Q1 | OpenCode понимает абсолютные пути в `instructions: [...]`?                | пишу absolute. Если в реальном прогоне (Phase B.3) не подхватилось — fallback на relative от `~/.config/opencode/`     | если оба варианта не работают        |
| Q2 | `opencode.json` иногда содержит JSONC (комментарии / trailing commas)?    | сначала `JSON.parse`. На fail — минимальный regex strip-comments (без npm-deps)                                        | если в реальном env встретится JSONC |
| Q3 | Есть ли env var `OPENCODE_CONFIG_DIR` для нестандартного пути?            | пока нет такой переменной по разведке — использую жёсткий `~/.config/opencode`. Если позже появится — env probe        | если пользователь явно использует    |
| Q4 | `lib/target-adapter.ts` отдельным файлом или inline в `bin/feynman.ts`?   | inline пока fits в ~150 LoC; вынести в `lib/` если перевалит за 200                                                     | автономно по факту в Phase A         |

Все четыре — нон-блокирующие, default действует, в чате спрашиваю
только если Q1 окажется реальным блокером.

---

## 12. Не трогать

- остальные ветки / forks
- runtime файлы `~/.claude/*` и `~/.codex/*` без `feynman` команды
- `.opencode-plugin/` folder (D-5)
- `hooks/feynman-session-start.ts` — уже target-agnostic через `FEYNMAN_HOME`
- содержимое самих rules / lint правил / intensity formats — не наша задача

---

## 13. Iteration reserve

- 10–20% контекста фазы держу под self-review + plan-hardening
- если в Phase B выяснится, что absolute path не работает — итерация Q1
  fallback БЕЗ остановки на approval
- если в Phase D ревью даст BLOCK → fix-loop в Sonnet (S6), а не сразу Opus
- iteration reserve покрывает: 1 правку плана по feedback, 1 self-review
  pass, 1 verification refresh перед commit

---

## 14. Rollback

Phase A — чистый рефактор без изменения поведения; rollback = revert одного
commit.

Phase B — единственное место, где плагин трогает чужой конфиг
(`opencode.json`) — `uninstall` чистит это полностью (шаг 7 verification).

Аварийный rollback вручную (если CLI uninstall сломан):

```bash
node -e '
  const f = process.env.HOME + "/.config/opencode/opencode.json";
  const j = require(f);
  j.instructions = (j.instructions || [])
    .filter(p => !p.includes(".feynman/rules.md"));
  require("fs").writeFileSync(f, JSON.stringify(j, null, 2));
'
rm -rf ~/.config/opencode/.feynman ~/.config/opencode/.feynman-active
```

---

## 15. Self-check (pillars gate перед ExitPlanMode)

```
┌─ pillar gate ────────────────────────────────────────┐
│ Workflow         ✓ DTP-plan формат применён           │
│ Git/TTT          ✓ ветка main, нет dirty в core       │
│ Source of truth  ✓ правится bin/lib/skills, не runtime│
│ Tests            ✓ команды + критерии PASS прописаны  │
│ Skills/docs      ✓ markdown lint + skill update в C   │
│ Token economy    ✓ Haiku scan, Sonnet impl, Opus cond │
│ Visual quality   ✓ ASCII frames + flow + table        │
│ Iteration        ✓ reserve + Phase D = отдельная фаза │
│ Boundaries       ✓ in/out scope разнесены             │
│ Open questions   ✓ все с default, Q1 — единственный   │
│                    потенциальный escalation           │
└──────────────────────────────────────────────────────┘
```

---

## 16. Closeout

После Phase E:

- commit pair: refactor / feat / test+docs / release
- `git tag v1.2.0` + `git push --tags`
- `npm publish dist/<pkg>.tgz` (granular token, 2FA bypass)
- MEMORY.md entry: «v1.2.0 — opencode target via native instructions,
  TargetAdapter contract introduced»
- (опционально) README badge / compatibility table обновление
- (опционально) CHANGELOG.md о breaking-compat-aware расширении `all`/`*`
