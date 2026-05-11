# Research Summary — feynman v0.5.0 «Verbosity Economy»

*Synthesized from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md — 2026-05-11*

## Stack additions — ничего нового

Субагентный оркестратор (Phase 11) остаётся движком — никакого API-ключа не нужно.
Новое: `aggregate.js` (~100 строк, CommonJS, zero deps) читает 7 JSON-файлов и автоматически вычисляет числовые ячейки REPORT.md. `tokenx` опционален — `chars/4` достаточно для сравнения arm'ов на одной модели.

## Feature table stakes

| Вмешательство | Ожидаемый эффект | Статус |
|---|---|---|
| Budget compaction (−≥333 байт) | Gate: без него ABC не влезает в 4480 | Обязательный gate |
| A. Caption brevity | −10–20% символов (H1: длинные подписи) | Table stake |
| B. No-narration | −8–15% символов (H2: classify preamble) | Table stake |
| C. Response-length budget | −15–25% символов (H3: prose вокруг диаграмм) | Table stake |
| Hedge reduction | ~60–80 байт, ортогонален ABC, low-risk | Желательный |
| Telegraph English rewrite | −41% токенов, ~1800 байт freed | Defer v0.6.0 |

Все три A/B/C подтверждены официальной документацией Anthropic и рецензируемыми работами (arXiv 2411.07858). Positive examples формулировки работают лучше чистых запретов (pink-elephant эффект).

## Architecture decisions

**Двухволновое выполнение:**
```
Wave 1 (3 субагента): v0.2.x + v0.3.x + v0.3.x+ladder
  → sanity gate: delta vs Phase 11 < 10%; иначе — стоп, ребаланс корпуса
Wave 2 (4 субагента): arm-A + arm-B + arm-C + arm-ABC
```
Cap 4 параллельно во избежание ECONNRESET. Smoke-run перед Wave 1 документирует дисперсию.

**Корпус:** расширить `prompts.json` полями `boundary`, `phrasing`, `domain`. 35 новых промтов к существующим 15 (не заменять — сохраняем сравнимость с Phase 11). Граничные случаи (`"boundary": true`) — по одному на класс.

**Winner application:** победитель копируется одним коммитом в `rules/feynman-activate.md`. Отдельная ветка только если победитель требует изменений в hook/lint коде.

## Watch Out For

1. **N=50 без спаренного дизайна** — CI = ±14 pp, эффект 10% неразличим от шума.
   Превентивно: все 7 arm'ов на одних 50 промтах + Wilcoxon signed-rank + Bootstrap 95% CI.

2. **Бюджет слов (rule C) включает ASCII-блоки** — модель жертвует диаграммой ради лимита.
   Превентивно: формулировать C как «prose words, excluding code-fenced and ASCII blocks»; diagram rate измерять отдельно.

3. **Компакция проходит byte-gate, ломает структурные инварианты** — `wc -c ≤4480` не ловит потерю vocabulary.
   Превентивно: `npm test` после каждого среза (tests/hook.test.js:541-629 — полный оракул).

4. **Победа на 50 промтах, регрессия на v0.4.0 корпусе** — 15-промтовый v0.4.0 corpus другое распределение.
   Превентивно: оба корпуса как обязательные пороги перед релизом.

## Roadmap implication

5 phases, продолжение нумерации с 14:

```
[Ph 14: Corpus + Harness] → [Ph 15: Compaction] → [Ph 16: Candidate Rules]
                                                              │
                                                              ▼
                                                  [Ph 17: Wave 1→gate→Wave 2 + REPORT]
                                                              │
                                                              ▼
                                                  [Ph 18: Apply Winner + Regression Gates]
```

v0.6.0 candidate (не блокирует v0.5.0): Telegraph English rewrite — полностью переоткрывает бюджет (~1800 байт freed).
