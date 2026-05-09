# Bug Severity Ranking

Here's how I'd rank these 5 bugs from highest to lowest severity:

## 1. Data loss in checkout — CRITICAL (P0)
This is your top priority and should be treated as an incident. Checkout is a revenue-generating path, and data loss means lost orders, lost money, broken customer trust, and potential compliance/legal exposure (depending on what data is being lost). Drop everything and fix this first. Consider whether you need to roll back, take checkout offline temporarily, or notify affected customers.

## 2. Accessibility regression in nav — HIGH (P1)
Navigation is a core surface used on every page. An accessibility regression here can completely block users who rely on screen readers or keyboard navigation from using the site at all. Beyond the user impact, depending on your jurisdiction (ADA in the US, EAA in the EU, AODA in Canada) this can carry legal risk. Treat it as high priority and fix in the current sprint.

## 3. Broken email link — HIGH (P1) / MEDIUM (P2)
Severity depends on which email and which link. A broken password-reset or order-confirmation link is effectively P1 (blocks a critical user flow and generates support tickets). A broken link in a marketing newsletter is more like P2. Default to P1 until you confirm which email it is.

## 4. Slow image loading on settings page — MEDIUM (P2) / LOW (P3)
Settings is a low-traffic, low-frequency page. Slow images are annoying but don't block functionality. Worth fixing, but it's a performance polish item — schedule it into a normal sprint, not a hotfix.

## 5. Typo in footer — LOW (P3)
Cosmetic, low visibility, no functional impact. Fix it when someone has 10 minutes — or batch it with the next copy review pass.

---

## Summary table

| Rank | Bug | Severity | Why |
|------|-----|----------|-----|
| 1 | Data loss in checkout | P0 / Critical | Revenue + trust + legal |
| 2 | A11y regression in nav | P1 / High | Blocks users site-wide; legal risk |
| 3 | Broken email link | P1–P2 | Depends on which email |
| 4 | Slow images on settings | P2–P3 | Annoying, not blocking |
| 5 | Typo in footer | P3 / Low | Cosmetic |

## Two questions before you triage

1. **Which email is the broken link in?** Transactional (reset, receipt, verification) bumps it to P1. Marketing keeps it at P2.
2. **Is the data loss in checkout actively happening right now in production?** If yes, this isn't just a bug — it's an active incident, and you should consider pausing checkout, paging on-call, and starting an incident timeline before fixing.
