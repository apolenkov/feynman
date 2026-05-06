# Contributing

Improvements to the rules in `rules/feynman-activate.md` are welcome — open a PR with before/after examples showing the change.

## How

1. Fork repo
2. Edit `rules/feynman-activate.md` — the three intensity sections (`lite`, `full`, `ultra`)
3. Open PR with:
   - **Before:** what Claude draws (or doesn't draw) now
   - **After:** what Claude draws with the change
   - One sentence why the change improves clarity

## Rules authoring guidelines

- Rules must be **declarative facts** — "Responses that contain flows include an ASCII diagram"
- Never imperative commands — "Always draw a diagram when you see a flow" triggers Claude's prompt-injection defense ([bug #17804](https://github.com/anthropics/claude-code/issues/17804))
- Each intensity variant must stay under 8,000 characters
- Measure with: `node -e "const f=require('fs').readFileSync('rules/feynman-activate.md','utf8');['lite','full','ultra'].forEach(v=>{const s=f.indexOf('<!-- '+v+' -->');const e=f.indexOf('<!-- /'+v+' -->',s);console.log(v,f.slice(s,e+('<!-- /'+v+' -->').length).length,'chars');")`

## Ideas

See [issues](../../issues) for open tasks.

Small focused change > big rewrite.
