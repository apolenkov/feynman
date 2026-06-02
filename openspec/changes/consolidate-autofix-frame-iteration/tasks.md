## 1. Characterise current behaviour

- [ ] 1.1 In `tests/autofix.test.ts`, add a temporary characterisation test that
  captures the CURRENT autofix output for a holed frame (an inner blank line)
  and a runaway row (no right `│`). Run it, record the actual output. This is a
  throwaway snapshot to know exactly what the consolidation changes — do not
  commit it as a kept test.

## 2. Pin the target behaviour (red)

- [ ] 2.1 In `tests/autofix.test.ts`, add the kept regression tests for the three
  spec scenarios: (a) holed frame → inner `│ … │` rows aligned; (b) runaway row
  (left border only) → not treated as inner; (c) well-formed frame → output
  identical to before. Tests (a) and (b) FAIL against the current loop (red).
- [ ] 2.2 Delete the temporary characterisation test from task 1.1.

## 3. Consolidate onto nextFrame (green)

- [ ] 3.1 In `lib/lint/autofix.ts`, replace the hand-written frame-scanning loop
  with `nextFrame` from `lib/lint/frames.ts`, following its documented usage
  (advance to `closeLi + 1` when closed, else `topLi + 1`). Keep the L15→L11→
  align dispatch unchanged. Import `nextFrame`; drop the now-dead top/bottom
  regexes if they are unused elsewhere in the file.
- [ ] 3.2 Run `tests/autofix.test.ts`; the task-2.1 regression tests now pass.

## 4. Reconcile fixtures and close the gate

- [ ] 4.1 Run the full `tests/autofix.test.ts` and `tests/lint.test.ts` suites.
  For any fixture whose output drifted, confirm the new output is correct against
  the spec and update it; flag anything that looks wrong instead of forcing green.
- [ ] 4.2 Run `npm run typecheck`, `npm run eslint`, `npm test`, `npm run test:docs`
  — all green.
- [ ] 4.3 Commit as `refactor(lint): route autofix through nextFrame (one frame definition)`.
