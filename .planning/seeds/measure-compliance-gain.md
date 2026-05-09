---
title: Measure compliance gain after XML rewrite
trigger_condition: After Phase 8 (XML rewrite) ships in v0.3.0
planted_date: 2026-05-09
---

# Measure compliance gain (v0.3.0+)

## Why

Phase 8 переписывает `feynman-activate.md` в XML-контракт (F1+F2+F4+F7).
Гипотеза: compliance LLM на ASCII-выводе вырастет. Без замера = не
докажем; реверт небезопасен.

## When

Триггер: тег `v0.3.0` запушен; npm-релиз опубликован.

## What

A/B-тест compliance до/после на корпусе из 50 структурированных промтов:

```
prompt corpus  →  [v0.2.x rules]  →  response  →  feynman-lint  →  pass/fail %
              \→  [v0.3.0 rules]  →  response  →  feynman-lint  →  pass/fail %
```

### Метрики

- compliance % (pass через `feynman-lint`)
- diagram density (диаграмм на ответ)
- false positives (диаграмма там, где не надо)
- latency overhead (XML vs MD парсинг хуком)

### Корпус (50 промтов)

- 10 sequence (pipeline / steps)
- 10 hierarchy (≥3 уровня)
- 10 comparison (2-3 опции)
- 10 status (>5 items)
- 10 negative-control (single fact / pure code → не должно быть диаграммы)

## Output

`docs/compliance-report-v0.3.0.md` с таблицей before/after + grade.
Если gain < 5% → ревизия Phase 8 решений.

## Owner

Human-driven (нужны Claude API credits для A/B прогона).
