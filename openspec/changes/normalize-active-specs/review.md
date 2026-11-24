# R10 obligation and scenario comparison

The baseline is `0d8defc`. The comparison uses the six active spec blobs at
that revision and the specs produced by an OpenSpec 2.1.1 archive rehearsal.
All 36 requirement names and all 92 existing scenarios are retained. Scenario
clauses are unchanged apart from markup in repository-quality and the explicit
no-diagnostic expectation for the L05 parallel branch example.
The 17 added scenarios express existing cases in a form OpenSpec can validate.

| Capability | Baseline blob | Existing + added scenarios | Obligations retained |
| --- | --- | --- | --- |
| cli-structure | `1b71cb944eb7d513d060634af6323ef4b64782ff` | 3 + 1 | The entrypoint only parses and dispatches, obeys the fixed line cap, and imports commands. Command bodies, presentation and adapters stay in their original directories. The new scenario carries the list of command examples. Behavior and exit codes remain covered by the original scenarios. |
| diagram-lint | `e66c35e02ead3cebe3e7b71be789ea83f3fdf76d` | 44 + 10 | L01 preserves all corner pairs, severity, display-width matching and UTF-16 diagnostics. L05 preserves the complete-region grammar, all bare arrows and bounded label forms, invalid connectors and the parallel-layout gap and branch rules. L11/L12/L13/L15 preserve the triggers, severity, explanation and exemptions. The CLI keeps input modes, output formats, exit codes, fixes and cost reporting. Autofix keeps shared frame detection, same-indent closer selection, fence scope and preservation of nonempty text. |
| diagram-rules | `2cbdc4229f54b1c7592bec6a56ba9cd99e7826f4` | 11 + 2 | Explicit diagram and prose precedence, latest instruction on conflict, prose defaults, false-premise correction and the single independently answerable question remain required. |
| doc-drift-guard | `518ebd882fd9f10f41e6825c4c626830ac6a084a` | 4 + 1 | The same CI entry points fail on the same fixed phrase set in live tracked text. The existing decision-record and guard-script exclusions and the separate requirement for named constants are retained. |
| plugin-install | `01a5a2cec1760c255dde2069e60ffb4b68983c1f` | 24 + 2 | The original staged-write and atomic-rename requirement is verbatim. New scenarios cover write, flush and rename failure and the stop on corrupt-state backup failure. |
| repository-quality | `fa63d3206b107e8f7397710dc250583ac551ce0f` | 6 + 1 | The headings expose the three active obligations to OpenSpec. The Q01–Q15 table and the historical comparison text are unchanged. The ASCII requirement retains fact preservation, relationship semantics, display width and the original protocol evidence. The failure scenario covers retaining and fixing new failures without relaxing criteria. |

The repository-quality scenario count includes four active scenarios and two
historical scenarios. Its structure patch keeps the historical comparison
outside the active Requirements section.
