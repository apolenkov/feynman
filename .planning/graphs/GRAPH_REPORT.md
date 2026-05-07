# Graph Report - /Users/ap/work/feynman  (2026-05-07)

## Corpus Check
- 20 files · ~49,174 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 110 nodes · 168 edges · 17 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]

## God Nodes (most connected - your core abstractions)
1. `parse()` - 12 edges
2. `targetConfig()` - 10 edges
3. `installOne()` - 9 edges
4. `issue()` - 9 edges
5. `readSettings()` - 6 edges
6. `uninstallOne()` - 6 edges
7. `cmdDoctor()` - 5 edges
8. `g()` - 5 edges
9. `getNthColumn()` - 5 edges
10. `enableUI()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `readSettings()` --calls--> `parse()`  [INFERRED]
  /Users/ap/work/feynman/tests/install.test.js → /Users/ap/work/feynman/lib/lint/parser.js
- `readSettings()` --calls--> `parse()`  [INFERRED]
  /Users/ap/work/feynman/bin/feynman.js → /Users/ap/work/feynman/lib/lint/parser.js
- `cmdDoctor()` --calls--> `parse()`  [INFERRED]
  /Users/ap/work/feynman/bin/feynman.js → /Users/ap/work/feynman/lib/lint/parser.js
- `parseAdditionalContext()` --calls--> `parse()`  [INFERRED]
  /Users/ap/work/feynman/tests/hook.test.js → /Users/ap/work/feynman/lib/lint/parser.js
- `readJson()` --calls--> `parse()`  [INFERRED]
  /Users/ap/work/feynman/tests/package.test.js → /Users/ap/work/feynman/lib/lint/parser.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.25
Nodes (14): bootstrapState(), cmdDoctor(), cmdInstall(), cmdUninstall(), hasFeynmanHook(), hookCommandFor(), installClaudeCommand(), installOne() (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.27
Nodes (11): addSortIndicators(), enableUI(), getNthColumn(), getTable(), getTableBody(), getTableHeader(), loadColumns(), loadData() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.22
Nodes (7): readCodexHooks(), readSettings(), readJson(), countDiagramChars(), getIndent(), looksLikeDiagram(), parse()

### Community 3 - "Community 3"
Cohesion: 0.35
Nodes (10): displayWidth(), issue(), L01_box_closure(), L02_tree_chars(), L03_arrow_style(), L04_column_widths(), L05_flow_integrity(), L06_priority_scale() (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.35
Nodes (8): a(), B(), D(), g(), i(), k(), Q(), y()

### Community 5 - "Community 5"
Cohesion: 0.32
Nodes (4): ctxUltraLen(), makeHome(), makeTempHome(), parseAdditionalContext()

### Community 6 - "Community 6"
Cohesion: 0.48
Nodes (6): classify(), commitRange(), commitsSince(), git(), latestTag(), render()

### Community 7 - "Community 7"
Cohesion: 0.4
Nodes (1): readSettings()

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (3): run(), format(), lint()

### Community 9 - "Community 9"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 11`** (2 nodes): `runLintHook()`, `lint-hook.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `buildCorrectionMessage()`, `feynman-lint.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `listMarkdown()`, `check-docs.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `lint.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `feynman-activate.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (1 nodes): `build-package.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse()` connect `Community 2` to `Community 0`, `Community 8`, `Community 5`, `Community 7`?**
  _High betweenness centrality (0.241) - this node is a cross-community bridge._
- **Why does `lint()` connect `Community 8` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `L07_no_mermaid_mix()` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `parse()` (e.g. with `readSettings()` and `cmdDoctor()`) actually correct?**
  _`parse()` has 8 INFERRED edges - model-reasoned connections that need verification._