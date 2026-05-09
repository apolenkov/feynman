# Bug Severity Ranking

Five bugs ordered by severity, highest first. Data loss is treated as the only true P0 because it destroys user state irreversibly. Accessibility regression in nav and a broken email link are core-flow blockers. Slow images and a footer typo are cosmetic / performance polish.

```
▲ high
  1. data loss in checkout         (P0 — blocks revenue, destroys state)
  2. broken email link             (P1 — breaks comms / verification flow)
  3. accessibility regression nav  (P1 — blocks assistive-tech users)
  4. slow image loading settings   (P3 — perf, page still functional)
▼ low
  5. typo in footer                (P4 — cosmetic, no functional impact)
```

## Severity criteria

```
Criterion         | Weight
------------------|---------------------------
data integrity    | highest — irreversible harm
core flow blocked | high    — revenue / access
partial impairment| medium  — degraded UX
cosmetic          | low     — visible, no harm
```

## Per-bug rationale

```
+---- Bug Triage ----------------------------------------------+
| #1 checkout data loss | P0 | revenue + trust + irreversible  |
| #2 broken email link  | P1 | breaks verify / reset / notify  |
| #3 a11y nav regression| P1 | excludes users, legal exposure  |
| #4 slow settings img  | P3 | annoying, page still works     |
| #5 footer typo        | P4 | brand polish, fix in next pass  |
+--------------------------------------------------------------+
```

## Suggested response order

```
[#1 checkout] --> [#2 email] --> [#3 a11y nav] --> [#4 slow img] --> [#5 typo]
   hotfix now     same-day fix     same-day fix      next sprint      backlog
```

Notes: if the broken email link is part of password-reset or order-confirmation, promote it to P0 alongside checkout. If the a11y regression breaks keyboard navigation entirely, also promote to P0 — accessibility regressions that fully block a user class are not P1.
