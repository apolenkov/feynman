---
title: feynman improvement research — local-only analysis
date: 2026-05-10
scope: PROJECT.md + rules/feynman-activate.md + iteration-2 findings + Phase 8 REVIEW
out_of_scope: web research, ecosystem benchmarking
---

# feynman improvement research (local-only)

## 1. Цель проекта

feynman — это hook-плагин для Claude Code и Codex, который на каждом
`UserPromptSubmit` инжектит декларативный контракт «структура → ASCII-визуал»
в `additionalContext`. Цель — чтобы ответ ассистента в монохромном терминале
автоматически приобретал визуальную форму (стрелки, деревья, frame-блоки,
шкалы приоритета), когда в нём есть структура, и оставался прозой, когда
структуры нет. Пользователь не должен явно просить «нарисуй схему» — правило
работает превентивно через канал/амплифай/подавление.

## 2. Пять gap'ов между состоянием и заявленной целью

```
gap                              evidence (iter-2 / REVIEW)         severity
──────────────────────────────────────────────────────────────────────────────
G1 lite-режим неконсистентен     WR-04: status≥6 в прозе, нет в      ▲ high
                                 trigger-таблице → модель угадывает
G2 ultra: list≥2 vs suppress     WR-05: 2-item recommendation        ▲ high
   конфликт                      попадает в дерево вместо прозы
G3 NEUTRAL-кейсы не WIN          eval-13/14/19: rules не дают         ▼ medium
                                 уплотнения там где могли бы
G4 нет sanity-проверки           WR-01/02/03: future edit может       ▼ medium
   rules-файла в hook'е          молча отключить инжекцию
G5 нет Stop-hook autofix         PROJECT v0.2 заявил линтер,          ▲ high
   на rendered output            но его влияние на UX в терминале
                                 не измерено (ASCII rendering ≠
                                 monospaced alignment в frame-блоках)
──────────────────────────────────────────────────────────────────────────────
```

Под G3 особенно: eval-13 (single-fact) и eval-19 (greeting) дают одинаковые
байты во всех arms — rules там «нейтральны», но и не помогают. Eval-14
(pure-code) — то же самое, code-only block не обогащается комментарием-схемой
даже когда это уместно (например ASCII-картинка пайплайна сборки в комментарии
к Dockerfile).

Под G5: REVIEW не покрывает выравнивание frame-блоков в реальном выводе.
Правило `visuals.md` пользователя жёстко требует «every `│` on the right MUST
align», но rules/feynman-activate.md не передаёт это требование модели —
значит в терминале блок ломается.

## 3. Топ-5 улучшений, ranked по value/effort

```
                                        value  effort  V/E
─────────────────────────────────────────────────────────
I1 frame-block alignment contract        ▲▲▲    ▼     12  ← рекомендую
I2 lite WR-04 fix (1 строка)             ▲▲     ▼      9
I3 ultra suppression precedence (WR-05)  ▲▲     ▼      9
I4 hook sanity assertion (WR-01/02/03)   ▲      ▼      6
I5 Stop-hook ASCII alignment autofix     ▲▲▲    ▲     4
─────────────────────────────────────────────────────────
budget remaining: 4480 - 4480 = 0 bytes
```

**I1. Frame-block alignment contract** (rules-side, ~+90 bytes)

Что: добавить в `<contract>` каждой intensity одну строку — «frame blocks:
right `│` aligned, top/bottom `─` width = inner-line max +2». Это самый дешёвый
способ убрать главный читательский раздражитель в монохромном терминале.

Почему: ровный правый край frame-блока — единственная вещь, которая в `iTerm`/
`Terminal.app` делает ASCII-кадр читаемым. Кривой край превращает frame в
мусор. Это правило уже есть в global `~/.claude/rules/visuals.md`, но
feynman не дублирует его в инжектируемых правилах — пользователи без global
rule не получают alignment.

Byte-cost: budget=4480, current=4480, slack=0 → нужно сократить что-то ещё на
≥90 байт. Кандидаты для урезания:
- ultra `<triggers>` дублирует full на 95% — заменить на `inherits="full"
  override`-секцию, выиграть ~200 байт
- examples в lite (lines 25-34) дублируют full examples — drop, экономия ~150
  байт

Risk: alignment-инструкция длинная для модели; может быть проигнорирована при
сложных deep-trees. Митигация: формулировка «right edge MUST align» (как в
visuals.md), не объяснение алгоритма.

**I2. lite WR-04 fix** (rules-side, +28 bytes на строку, либо -10 если убрать
prose-claim)

Что: добавить `| status ≥6 | frame block |` в lite triggers ИЛИ удалить prose-
утверждение про ≥6. Я бы убрал prose — lite по определению минималистичный,
frame-block там избыточен.

Byte-cost: net -10 байт (free space).

Risk: пользователи lite привыкли к frame-блокам — но iter-2 не показал ни
одного eval'а где lite использовал frame, так что регрессии нет.

**I3. ultra suppression precedence** (rules-side, +35 bytes)

Что: в `<contract>` ultra добавить «suppression outranks triggers» (REVIEW
рекомендация WR-05 option 2). Это уже сделано (line 113-114 показывает
`Suppression outranks triggers — apply triggers only after suppression check
passes`), но я перечитал — ОК, вижу в текущем файле уже есть. Тогда
альтернативная формулировка: убрать `any list ≥2 items` целиком, оставить
suppression как есть.

Byte-cost: -28 байт (drop триггер).

Risk: ultra режим теряет агрессивность на 2-item списках — но iter-2 не
тестировал ultra, так что регрессия неизвестна. Нужен mini-eval (3 prompts:
2-item recommendation, 2-item comparison, 2-item factual).

**I4. hook sanity assertion** (hook-side, +120 bytes JS, 0 rules-bytes)

Что: WR-02 fix — count opens/closes `<intensity>` tags, exit 0 при mismatch.
Это catches G4: будущий edit, который роняет инжекцию, теперь не выдаёт
«silent disable», а fail-safe.

Byte-cost: 0 (rules не трогаем, только hook).

Risk: zero — fail-safe path уже принят в проекте.

**I5. Stop-hook ASCII alignment autofix** (новая phase, no rules-bytes)

Что: расширить существующий L01-L08 линтер новым правилом L09 «frame-block
right-alignment» с auto-fix через padding. На Stop-hook мы видим уже
rendered output — там можно детерминированно выравнивать `│` без участия
модели.

Почему: это решает G5 на 100% — модель не должна угадывать ширину блока,
линтер просто перепосчитывает.

Byte-cost: 0 rules.

Risk: edge case — multi-byte unicode (▲▼├──) ширина в monospaced fonts
варьируется. Нужно использовать `Intl.Segmenter` или mock-проверку «один
char = одна column» для ASCII-only набора.

## 4. Идеи без роста rules (САМОЕ ЦЕННОЕ)

```
budget-neutral wins
├── N1 Stop-hook autofix L09 (frame alignment)   ← мой выбор #1
├── N2 ultra inherits full (rules consolidation)
└── N3 CLI feynman lint --fix на pre-paste
```

**N1. L09 frame-alignment autofix** (Stop-hook, 0 rules-bytes)

Подробнее чем в I5: парсим вывод модели, находим `┌─ … ─┐ ... └─┘` блоки,
вычисляем max inner width, padding'ом trailing-spaces выравниваем правую
колонку. Если блок невалидный (нет нижней границы, missing corners) — лог в
state.json `lintHits++` (для будущей phase «Self-improvement loop»).

Это даёт пользователю **визуально валидный output без увеличения rules**.
Модель просто пишет приблизительно ровно, hook доводит до идеала. Самое
большое улучшение «понять структуру за 2 секунды» в монохромном терминале.

**N2. ultra inherits full** (rules-side, экономия 200+ байт без потери
функциональности)

Текущая структура: 3 полных `<intensity>` блока, ultra = full + усиление.
Можно ввести `<intensity name="ultra" inherits="full">` и положить только
дельту:

```xml
<intensity name="ultra" inherits="full">
<override>
| hierarchy ≥2 | ASCII tree |
| any list ≥3 items | tree or flow |  ← поднял до ≥3 (фикс WR-05)
</override>
<contract>Suppression outranks triggers.</contract>
</intensity>
```

Hook парсит inherits, мерджит. Это освобождает ~200 байт budget'а — место
под I1 (alignment), I2 (status≥6), I3 (suppression precedence) одновременно.

Risk: усложняет hook (новый merge-mode), нужна спека. Но это
single-localization change — 30 строк JS, тесты пишутся за час.

**N3. CLI feynman lint --fix как pre-commit / pre-paste hook** (CLI-side, 0
rules-bytes)

Что: добавить `feynman lint --fix <file>` который читает markdown, ищет
frame-блоки и flow-цепочки, нормализует их (alignment, padding, consistent
arrow-style `→` vs `->`). Пользователь может прицепить к git pre-commit для
.md файлов или ручному «paste-then-format» workflow.

Это улучшает UX **за пределами AI-сессии** — feynman становится не только
hook, но и стандартом форматирования ASCII-визуалов в репо.

Risk: scope creep — выходит за «just a hook». Но PROJECT v0.2 уже включает
`bin/feynman-lint` CLI, так что это просто +1 subcommand.

## Closing question

Из трёх budget-neutral идей самое высокое V/E — **N1 (Stop-hook L09
autofix)**. Это превращает feynman из «инжектор инструкций» в «гарантированно
читаемый output» — что и есть исходная цель проекта (помочь человеку быстро
понять структуру в монохромном терминале). N2 — необходимое условие для
будущих rules-доработок (без него budget=0). N3 — nice-to-have, шире scope.

Файл: `/Users/ap/work/feynman/.planning/notes/feynman-improvement-research-2026-05-10.md`
