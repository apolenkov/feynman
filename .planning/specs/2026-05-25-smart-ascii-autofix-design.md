# Smart ASCII Autofix — Design Spec

**Date:** 2026-05-25
**Status:** Draft, awaiting user review
**Target release:** v1.3.0

## Goal

Расширить `feynman-lint --fix` так, чтобы он выравнивал не только фреймы (как сейчас), но и три новых класса ASCII-структуры: стрелки в колонку, junction в параллель-фане, разделители одной длины. Плюс закрыть существующий пробел в frame-autofix — он не чинит фреймы с titled top (`┌─ Title ─┐`).

## Why now

1. `feynman-lint --fix` уже существует и работает, но покрывает только frame alignment + L11→dot-leader conversion. Любая другая alignment-проблема (arrows, junctions, separators) остаётся ручной работой.
2. На скриншоте пользователя 25 мая был фрейм с titled top, который L09 видел как ошибку, но autofix молча пропускал — регекс `/^(\s*)┌─*┐\s*$/` требует чтобы между `┌` и `┐` были только дефисы.
3. Сам feynman продвигает arrow-flow и parallel-fan как ключевые визуалы — но автоматически выровнять их сейчас нельзя.

## In scope (v1.3.0)

| Pattern | Что фиксим |
|---------|-----------|
| A. Arrow column | `→` / `-->` / `──>` в одной колонке между соседних строк |
| B. Junction fan | `──┐` / `──┤` / `──┼` / `──┘` в одной колонке для parallel-fan |
| C. Separator length | `─────` линии одной длины внутри одного кодового блока |
| D. Titled top frame | `┌─ Title ─┐` фрейм — починить regex и сохранить title |

## Out of scope (v1.3.0)

- Lint-предупреждения для A/B/C (autofix-only пока) — можно добавить как `v1.3.1` если станет нужно. Логика детекции переиспользуется.
- CLI-флаги отключения отдельных паттернов (`--no-arrows`) — все включены под `--fix`, выключатели по запросу.
- ASCII-боксы (`+--+|--+`) — feynman продвигает только Unicode box-drawing, ASCII-вариант не support.
- Smart conversion (e.g. dot-leader для arrow-блоков) — `--fix` остаётся выравнивающим, не структурно-меняющим (кроме существующего L11→dot-leader, который опт-ин через `convertL11`).

## Pattern specs

### A. Arrow column

**Детект (precision-first):**

- Регион = ≥2 подряд идущих строк
- В каждой строке РОВНО одна стрелка из набора `→`, `-->`, `──>`, `─→`
- Все стрелки в пределах ±3 visual columns друг от друга (anti-false-positive guard)
- Префикс перед стрелкой не пустой (иначе нечего выравнивать)
- Все строки в одном кодовом блоке (fenced ``` или indented)

**Фикс:**

1. Найти `maxLeft` = max visual width of `line.slice(0, arrowPos).trimEnd()` по всем строкам региона.
2. Для каждой строки: pad left side до `maxLeft` пробелами + 1 пробел перед стрелкой + правая часть как есть.

**Пример:**

Before:
```
service A → db
service BB → cache
service CCC → queue
```

After:
```
service A   → db
service BB  → cache
service CCC → queue
```

**False-positive guard:** проза со словом со стрелкой типа «команда → результат» в одной строке не триггерит (нужно ≥2 строк подряд с такой же структурой).

### B. Junction fan

**Детект:**

- Регион = ≥2 подряд идущих строк
- Каждая строка начинается с `[...]` (optional indent)
- Каждая строка содержит junction-символ `──┐` или `──┤` или `──┼─` или `──┘` (одну штуку)
- Junction-символы в пределах ±3 visual columns друг от друга
- Опционально: одна строка региона может содержать `─→ [box]` справа от junction (merge target)

**Фикс:**

1. Найти `maxBoxEnd` = max visual column сразу после закрывающей `]` по всем строкам региона.
2. Для каждой строки: pad после `]` до `maxBoxEnd` пробелами + остальная часть строки как есть (включая `──┐` или `──┘` и опциональный `─→ [...]`).

**Пример:**

Before:
```
[A] ──┐
[BB] ──┤─→ [merge]
[CCC]──┘
```

After:
```
[A]  ──┐
[BB] ──┤─→ [merge]
[CCC]──┘
```

Wait — `[CCC]` 5-wide самый длинный, junction должен быть на колонке 6. Правильный фикс:

```
[A]   ──┐
[BB]  ──┤─→ [merge]
[CCC] ──┘
```

### C. Separator length

**Детект:**

- Внутри ОДНОГО кодового блока
- Линия состоит ТОЛЬКО из символов `─` (≥3 подряд), optional leading whitespace
- В блоке найдено ≥2 таких линий
- Линии должны быть «связаны» одним блоком — не разделены другими separator-линиями другой длины

**Фикс:**

- Найти `maxLen` = max length всех `─`-only линий в блоке.
- Каждую `─`-only линию подтянуть к `maxLen` (через `'─'.repeat(maxLen)` + leading whitespace).

**Conservative:** не трогать `─` линии в блоке с фреймами (там длина диктуется фреймом). Не трогать одиночные `─` линии — они не выравниваются «ни с чем».

### D. Titled top frame

**Изменение в `lib/lint/autofix.ts`:**

Заменить регекс детекции top bar:

```typescript
// Before (line 168):
const topMatch = line.match(/^(\s*)┌─*┐\s*$/);

// After:
const topMatch = line.match(/^(\s*)┌─.*─┐\s*$/);
```

Это match-ит и `┌─────┐`, и `┌─ Title ─┐`, и любую `┌─<anything>─┐` строку.

**В `autofixFrame()`:**

Распарсить top bar:

```typescript
const topInner = node.top.slice(node.top.indexOf('┌') + 1, node.top.lastIndexOf('┐'));
// topInner = "─ Title ─" or "─────"

// Extract title text (strip leading/trailing dashes and spaces)
const titleMatch = topInner.match(/^─+\s*(.+?)\s*─+$/);
const title = titleMatch ? titleMatch[1] : null;
```

**Перерисовка top bar:**

Если title есть:

```typescript
const titleSegment = `─ ${title} `;
const remainingDashes = '─'.repeat(Math.max(1, W - visualWidth(titleSegment)));
const top = indent + '┌' + titleSegment + remainingDashes + '┐';
```

Если title нет — старая логика `┌` + `─.repeat(W)` + `┐`.

**Bottom bar:** всегда без title (упрощение v1; titled bottom — редкий паттерн).

**Inner padding:** не меняется, остаётся существующая логика `W = max(topDashes, ...inner.map(visualWidth))`. Но `topDashes` теперь считается ПО ВСЕМУ topInner, не только по дефисам — иначе titled top даст маленькую W и сожмёт фрейм.

```typescript
// Before:
const topDashes = (node.top.match(/─/g) || []).length;

// After:
const topInner = node.top.slice(node.top.indexOf('┌') + 1, node.top.lastIndexOf('┐'));
const topWidth = visualWidth(topInner);
const W = Math.max(1, topWidth, ...inner.map(visualWidth));
```

## Architecture

### File structure

Текущий `lib/lint/autofix.ts` (~220 LoC) разбивается на модуль:

```
lib/lint/autofix/
├── index.ts           — dispatcher, опции, реэкспорт visualWidth
├── frame.ts           — autofixFrame, autofixFrameToDotLeader, isL11Eligible (текущая логика + Pattern D)
├── arrow.ts           — Pattern A: detect + fix
├── junction.ts        — Pattern B: detect + fix
├── separator.ts       — Pattern C: detect + fix
└── shared.ts          — visualWidth re-export, unwrapInner, общие хелперы
```

`lib/lint/autofix.ts` остаётся как тонкий shim: `export * from './autofix/index.ts';` для обратной совместимости импортов (`bin/feynman-lint.ts`, тесты, hook).

### Dispatcher

`autofix(text, opts)` в `index.ts`:

1. Если text пустой или нет ни одного `┌`/`→`/`──`/`─` — вернуть как есть (early-exit).
2. Сплит на строки + детекция fenced blocks (как сейчас).
3. Для каждого блока (вне fence или в fence если `processFenced`):
   a. Detect Pattern D (titled frames + старые) → коллекция frame regions.
   b. Detect Pattern A (arrow columns) → коллекция arrow regions. Skip пересечения с frame regions.
   c. Detect Pattern B (junction fans) → коллекция junction regions. Skip пересечения.
   d. Detect Pattern C (separator lines) → коллекция separator regions. Skip пересечения.
4. Применить fixes в порядке убывания приоритета: frames → junctions → arrows → separators. (Frames приоритетнее потому что они задают geometry окружающих элементов.)
5. Reassemble.

**Non-overlap invariant:** регион типа X не может перекрываться с регионом типа Y. Если перекрываются — побеждает более структурный (frame > junction > arrow > separator).

### Conservative-first heuristics

Каждый pattern требует **≥2 строк** и **structural guards** (junction-символ, не просто `─`; arrow в каждой строке; etc.). Это даёт high-precision: мы можем пропустить кейс, но не сломаем намеренный layout.

Контр-пример который НЕ должен триггерить:

```
текст со стрелкой → результат
другой текст без стрелки
третий текст со стрелкой → ответ
```

— Pattern A не сработает потому что средняя строка без стрелки → не ≥2 подряд.

## Testing

### Test infrastructure

Существующие `tests/autofix.test.ts` + `tests/lint.test.ts` остаются. Добавляются:

- `tests/autofix/arrow.test.ts` — Pattern A positive + negative cases
- `tests/autofix/junction.test.ts` — Pattern B
- `tests/autofix/separator.test.ts` — Pattern C
- `tests/autofix/titled-frame.test.ts` — Pattern D
- `tests/fixtures/autofix/arrow-*.md` (3-5 fixture files)
- `tests/fixtures/autofix/junction-*.md`
- `tests/fixtures/autofix/separator-*.md`
- `tests/fixtures/autofix/titled-frame-*.md`

Каждый pattern тестируется через snapshot:

```typescript
test('arrow column: aligns three lines with different left widths', () => {
  const before = readFixture('arrow-basic-before.md');
  const after  = readFixture('arrow-basic-after.md');
  assert.strictEqual(autofix(before), after);
});
```

### False-positive corpus

`tests/fixtures/autofix/should-not-touch.md` — большой файл с граничными кейсами:

- Проза со стрелкой («команда → результат») — Pattern A не трогает
- Одиночный `───` — Pattern C не трогает
- Junction-like в прозе («стрим `──>` сервер») — Pattern B не трогает
- Mixed indent / mixed fence — не должно дробить регионы криво

```typescript
test('false-positive corpus: autofix is a no-op', () => {
  const before = readFixture('should-not-touch.md');
  assert.strictEqual(autofix(before), before);
});
```

### Coverage gate

Существующий ≥95% coverage gate сохраняется. Новые файлы должны попадать под этот порог.

## Release

### Versioning

v1.2.1 → **v1.3.0** (new public feature → minor bump).

### Commit plan

Per-pattern commits для лёгкого ревью и rollback:

1. `refactor(autofix): split autofix.ts into autofix/ module` (zero behavior change, чисто структурный)
2. `fix(autofix): handle titled top in frames (Pattern D)` (закрывает существующий gap)
3. `feat(autofix): align arrow columns (Pattern A)` (новая фича)
4. `feat(autofix): align junction fans (Pattern B)` (новая фича)
5. `feat(autofix): normalize separator lengths (Pattern C)` (новая фича)
6. `chore(release): v1.3.0` (bump + CHANGELOG + build + tag + npm publish)

Каждый commit самостоятелен: тесты зелёные, lint чистый, можно ревертить независимо.

### Documentation

- `README.md` — раздел «Autofix capabilities» с примером «before/after» по каждому паттерну
- `CHANGELOG.md` — запись v1.3.0 с upgrade notes (опционально-разрушительные правки: separator normalization может изменить намеренные различия в длине; рекомендация — review diff перед коммитом)
- `rules/feynman-activate.md` — упомянуть что `--fix` теперь шире (если правила ссылаются на autofix)

## Open decisions (defaults я применю если не возразишь)

| # | Вопрос | Default |
|---|--------|---------|
| 1 | Куда вынести `unwrapInner` и common helpers? | `lib/lint/autofix/shared.ts` |
| 2 | Что делать с titled bottom `└─ Closeout ─┘`? | Out of scope v1.3.0 (редкий паттерн), добавим если попросят |
| 3 | Conservative threshold для ±N columns в Pattern A/B? | `±3` columns. Можно подвинуть на основе фикстур. |
| 4 | Минимум строк для Pattern C? | `≥2` separator-линий в одном блоке |
| 5 | Stop-hook (`hooks/feynman-session-start.ts` smoke) — включать новые паттерны? | Да, через дефолтный `autofix()` (без opt-in флагов). Stop-hook уже использует autofix conservative defaults — A/B/C/D подходят под conservative-first. |

## Risk & rollback

**Risk 1:** false positives в Pattern A/B/C ломают намеренный layout.
**Mitigation:** ≥2 строк требование + structural guards + ±N columns guard. False-positive corpus в тестах.
**Rollback:** revert commits 3-5 поочерёдно. Pattern D (frame fix) обратно совместим — не ломает существующие фреймы.

**Risk 2:** split `autofix.ts` ломает импорты в downstream-консьюмерах.
**Mitigation:** `autofix.ts` остаётся как shim `export * from './autofix/index.ts'`. CI прогоняет всё что было раньше + новое.
**Rollback:** revert commit 1 (refactor) — он чисто структурный, behavior не меняет.

**Risk 3:** Stop-hook начинает «исправлять» намеренные структуры в model output.
**Mitigation:** conservative defaults применяются автоматически — Stop-hook уже использует `autofix()` без `processFenced`/`convertL11`, новые паттерны под этими же defaults.
**Rollback:** если станет проблемой — добавить env flag `FEYNMAN_HOOK_AUTOFIX=frame-only` для отключения новых паттернов в hook scope.

## Acceptance criteria

- Все существующие тесты `tests/autofix.test.ts`, `tests/lint.test.ts`, `tests/lint-hook.test.ts` зелёные.
- Новые тесты для A/B/C/D зелёные (positive + negative).
- `npm run ci` зелёный (audit + typecheck + coverage ≥95% + docs + build + release smoke).
- `feynman-lint --fix` на reference-файле с 4 паттернами выравнивает корректно (manual verification).
- v1.3.0 опубликован на npm с правильным манифестом (тарбол содержит все `files[]`).
- README отражает новые возможности с before/after примерами.
