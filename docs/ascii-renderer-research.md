# Исследование renderer для текстовых диаграмм

Дата проверки: 2026-09-05. Область: детерминированное превращение уже
извлечённых фактов в читаемый ASCII/Unicode-текст; исследование не доказывает,
что модель сможет безошибочно извлечь связи из произвольной прозы.

## Решение

Не добавлять `beautiful-mermaid`, Graph::Easy, Dagre или ELK.js в runtime.
В текущей итерации сохранить объяснение через инструкции, конкретные образцы
раскладки и проверку готовых отношений. Собственный TypeScript renderer —
рассмотренная альтернатива, а не принятое требование реализации.
Итоговое обоснование и исследования восприятия собраны в
[основном отчёте](ascii-explanation-research.md).

Причины связаны с границей продукта:

- `package.json` задаёт Node `>=22.18.0` и не имеет runtime dependencies;
  `lib/lint/parser.ts` сейчас распознаёт уже написанные блоки, а не извлекает
  отношения из прозы.
- Надёжность должна проверяться после извлечения: сначала immutable
  `VisualSpec`/relation ledger с устойчивыми ID узлов, направлением, подписью
  связи и признаком неопределённости, затем layout и renderer. При отсутствии
  направления renderer обязан оставить связь ненаправленной или выбрать таблицу;
  он не должен превращать соседство в причинность.
- Возможный будущий renderer мог бы покрыть четыре формы: короткая последовательность,
  ветвление/shared hub, иерархия и state flow. Для циклов и self-loop нужен
  отдельный ортогональный маршрут вокруг узла. Внутренний `width.ts` уже даёт
  более подходящую модель display width для CJK, emoji, combining marks и ANSI,
  чем проверенные внешние кандидаты.

Вариант для будущего детерминированного renderer:

```text
source facts → relation ledger / VisualSpec → deterministic grid layout
             → orthogonal routing → ASCII/Unicode canvas → semantic checks
```

Если такой renderer будет принят, у layout должен быть фиксированный порядок
обхода и tie-break по ID; нельзя
полагаться на случайный seed. Проверки должны включать: каждый узел и label
появляется ровно ожидаемое число раз, каждое отношение имеет маршрут, маршрут не
проходит через box, строки имеют согласованную display width, а повторный запуск
даёт тот же результат. Golden cases следует взять из циклов, fan-in/fan-out,
self-loop, duplicate labels и multiline labels ниже.

## Кандидаты

| Кандидат | Наблюдаемый факт по первоисточнику | Оценка для Feynman |
|---|---|---|
| `beautiful-mermaid` (вероятный актуальный аналог упомянутого `pretty-mermaid`) | `renderMermaidASCII()` синхронно выдаёт ASCII или Unicode; flow/state используют grid + A*; есть sequence/class/ER/XY renderer. Пакет MIT, но manifest версии 1.1.3 содержит `elkjs` и `entities`; registry сообщает около 2.1 MB unpacked. README: ASCII Output — <https://github.com/lukilabs/beautiful-mermaid/blob/main/README.md#ascii-output>; package.json — <https://github.com/lukilabs/beautiful-mermaid/blob/main/package.json> | Лучший reference для routing и fixtures, но runtime-зависимость нарушает zero-deps и принимает Mermaid, а не source prose. Изолировать ASCII-часть можно только как отдельное сопровождение/форк. |
| Graph::Easy 0.76 | Perl renderer для directed/undirected graph, ASCII и Unicode boxart; поддерживает edge labels, groups, loops и `textwrap: auto`/фиксированную ширину. Layout использует A* и seed; исходный `t/ascii.t` заявляет 451 проверку, fixtures включают self-loop и wrapping. Последний CPAN release — 0.76 от 2016-06-06. README — <https://github.com/ironcamel/Graph-Easy/blob/master/README>; layout — <https://github.com/ironcamel/Graph-Easy/blob/master/lib/Graph/Easy/Layout.pm>; wrapping — <https://github.com/ironcamel/Graph-Easy/blob/master/lib/Graph/Easy/Node.pm>; tests — <https://github.com/ironcamel/Graph-Easy/blob/master/t/ascii.t>; CPAN release — <https://metacpan.org/release/Graph-Easy> | Функционально близок, но GPLv2 + Perl/setup несовместимы с маленьким MIT/Node-only runtime. Код нельзя переносить без отдельного лицензионного решения. Поведение полезно как reference. |
| `@dagrejs/dagre` | MIT layout-only library для directed graphs; источник явно отделяет layout от rendering. Current registry package 3.1.1 имеет runtime dependency `@dagrejs/graphlib` и около 1.4 MB unpacked. Тесты проверяют edge labels, cycles и self-loop и возвращают координаты/points. README — <https://github.com/dagrejs/dagre/blob/master/README.md>; package.json — <https://github.com/dagrejs/dagre/blob/master/package.json>; cycle/layout tests — <https://github.com/dagrejs/dagre/blob/master/test/layout-test.ts> | Не renderer: всё равно нужны wrapping, display-width, canvas, glyphs и семантическая проверка. Может быть будущим layout reference, но добавлять для v1 не следует. |
| `elkjs` | Layout engine only: официальное README говорит, что rendering/styling не предоставляются. `layout()` возвращает `Promise`; npm package 0.12.0 имеет dual license `EPL-2.0 OR GPL-3.0-or-later` и около 8.0 MB unpacked. README — <https://github.com/kieler/elkjs#readme>; package.json — <https://github.com/kieler/elkjs/blob/master/package.json> | Слишком тяжёлый и не закрывает текстовый renderer. В частности, он не устраняет ни source-prose ambiguity, ни требования Feynman к display width. |

`asciigraph` отдельно не является серьёзным кандидатом: официальный Go-проект
строит числовые line charts из `[]float64`, а не node-edge diagrams с label,
ветвлением или циклом. README: <https://github.com/guptarohit/asciigraph/blob/master/README.md>

## Что проверено у ближайшего reference

`beautiful-mermaid` полезен именно как компактный набор ожидаемых ситуаций:

- `src/__tests__/ascii.test.ts` гоняет 44 ASCII и 22 Unicode golden-файла,
  отдельно проверяет ASCII/Unicode режим и отсутствие диагональных линий.
- Fixtures показывают back-reference, self-reference, shared fan-in/fan-out и
  duplicate labels: <https://github.com/lukilabs/beautiful-mermaid/tree/main/src/__tests__/testdata/ascii>.
- `ascii-multiline.test.ts` проверяет node/edge/subgraph/sequence/class/ER
  multiline labels и длинные строки: <https://github.com/lukilabs/beautiful-mermaid/blob/main/src/__tests__/ascii-multiline.test.ts>.
- Но width implementation измеряет строки через JS `String.length` в
  `multiline-utils.ts` (<https://github.com/lukilabs/beautiful-mermaid/blob/main/src/ascii/multiline-utils.ts>)
  и хранит canvas как массивы single-character strings в
  `canvas.ts` (<https://github.com/lukilabs/beautiful-mermaid/blob/main/src/ascii/canvas.ts>).
  Это наблюдаемый пробел относительно `lib/lint/width.ts` (<../lib/lint/width.ts>):
  готовый renderer нельзя принимать как источник истины для CJK/emoji/ANSI.
- ASCII public API действительно не вызывает ELK layout, но `package.json`
  всё равно объявляет `elkjs` и `entities`; это важное различие между
  «внутренний ASCII путь без ELK» и «пакет без runtime dependencies».

У Graph::Easy есть нужные идеи auto-wrap и loop routing, но layout может быть
прерываемым timeout и зависит от seed; это хороший список edge cases, а не
контракт для Feynman. Dagre и ELK полезны для сравнения layout semantics, но их
координаты сами по себе не доказывают корректность ASCII-вывода.

## Ограничения и нерешённые вопросы

1. `pretty-mermaid` как npm package сейчас не разрешается registry lookup
   (404); перед обсуждением reuse нужно подтвердить, что имеется в виду именно
   `beautiful-mermaid`. Registry endpoint: <https://registry.npmjs.org/pretty-mermaid>
2. Не определён формальный source-prose grammar: как отличать заявленный факт,
   условие, пример и неизвестную связь. Это нельзя надёжно решить layout-кодом;
   нужно зафиксировать IR и набор примеров/контрпримеров в skill/eval.
3. Не задан предел ширины терминала и политика для непереносимых multiline
   labels. До реализации нужно выбрать wrap policy, glyph mode (pure ASCII или
   Unicode по умолчанию) и поведение при конфликте маршрутов.
4. Текущий linter проверяет геометрию и стиль уже созданных diagrams, но не
   semantic edge coverage. Для нового renderer нужна отдельная проверка
   `VisualSpec → output`, иначе green lint не докажет сохранность отношений.

Следующий шаг текущей итерации: зафиксировать полный набор исходных отношений
и проверить готовые диаграммы из реальных поставок. Собственный canvas и router
не устранят ошибку извлечения смысла и добавят требование к среде исполнения
native skill. Их стоит пересматривать только при подтверждённой необходимости
детерминированной раскладки. Никакой код кандидатов в Feynman не переносится.
