Bug severity ranking:

▲ critical
  Data loss in checkout — P0; affects revenue, compliance, user trust; must fix before next deploy
  Accessibility regression in nav — P1; WCAG legal risk; blocks users with assistive tech

▼ medium
  Slow image loading on settings page — P2; UX degradation; no data risk; can schedule

▼ low
  Broken email link — P3; user frustration; workaround exists (copy-paste URL)
  Typo in footer — P4; cosmetic; no functional impact; batch with next release

**Risk register:**
| Bug | Risk | Impact | Mitigation |
|-----|------|--------|------------|
| Data loss checkout | P0 | Revenue + trust loss | Hotfix immediately |
| A11y regression | P1 | Legal/compliance | Fix within 48h |
| Slow images | P2 | UX | Performance sprint |
| Broken link | P3 | Frustration | Next release |
| Footer typo | P4 | Cosmetic | Batch fix |

**Priority decision:**
- CONTEXT: 5 bugs, ranging P0 to P4
- OPTIONS: fix all at once vs triage by severity
- CHOICE: fix P0 immediately, P1 within 48h, P2-P4 in next sprint
- CONSEQUENCE: data loss resolved fast; cosmetics deferred safely
