# Logo Creative Brief — `@albinocrabs/feynman`

For when you want to commission/generate a real logo to replace the Apple pencil emoji in README.

## Brand context

- **npm scope:** `@albinocrabs` — albino crab is the established brand
- **Product:** feynman — Claude Code / Codex plugin that auto-draws ASCII diagrams
- **Personality:** technical, minimalist, slightly playful (tagline: "why explain in words when diagram do trick")
- **Brand color in manifests:** `#10B981` (emerald green)
- **License:** MIT, open-source

## Concept

An albino crab that is *actively drawing*. The crab IS the artist, not just decoration. The drawing it produces should hint at the plugin's job — boxes, arrows, trees — without being a literal screenshot.

## Image-gen prompt (paste into DALL-E / Midjourney / Stable Diffusion)

```
A minimalist line-art logo of a white albino crab holding a pencil in one
claw, drawing geometric shapes — boxes, arrows, and a tree-branch diagram —
that emerge from its pencil tip. Clean monochrome line art with a single
accent color (#10B981 emerald green) on the diagram lines. Flat 2D,
vector-style, transparent background, square 1:1 aspect ratio. Negative
space dominant, suitable for a 120px README header. No text, no labels.
Style: minimal corporate mark, think Stripe or Linear, not cartoon.
```

Variants to try:
- "...drawing one large simple arrow flow [A]→[B]→[C]..." (cleaner)
- "...the crab in profile view with the diagram emerging horizontally..." (banner-friendly)
- "...the crab from above, claws drawing in different directions..." (logomark style)

## Constraints

| field | value |
|---|---|
| primary color | albino white / `#FFFFFF` (the crab) |
| accent | emerald `#10B981` (the drawing it produces) |
| size | 1024×1024 source, displays at 120px in README |
| background | transparent PNG |
| style | flat 2D vector, minimal line art |
| forbidden | photorealism, 3D rendering, cartoonish style, drop shadows, gradients |

## Where to put it

1. `assets/logo.png` (1024×1024 transparent)
2. `assets/logo-128.png` (resized for README)
3. Update `README.md` line 2:
   ```html
   <img src="https://raw.githubusercontent.com/apolenkov/feynman/main/assets/logo-128.png" width="120" />
   ```
4. Optionally update `.claude-plugin/plugin.json` interface block with a `logoURL` field if marketplace accepts it.

## Quick alternatives (if image-gen unavailable)

- **DiceBear avatar generator** — free, URL-based, deterministic. Example: `https://api.dicebear.com/8.x/identicon/svg?seed=feynman&backgroundColor=ffffff`. Not a crab, but a placeholder better than pencil emoji.
- **Commission on Fiverr / 99designs** — $20-100 for a clean logomark with the brief above. 24-72h turnaround.
- **Open-source crab clipart** — search `crab` on flaticon.com or undraw.co; some have albino-friendly white variants. Filter by MIT or CC0 license.

## Why this matters

The Apple pencil emoji in the current README is:
- Visually unrelated to the @albinocrabs scope brand
- Apple-proprietary asset (legally awkward for any commercial use)
- Generic — not memorable

A real albino crab + drawing-action logo:
- Anchors the brand visually (matches the scope name)
- Tells the story (crab draws → plugin draws)
- Distinctive in the marketplace listing once it lands on claude.com/plugins

## Status

- Deferred from v0.4.0 session 2026-05-11 — user rejected ASCII-crab variant
- Pixel/raster art chosen as direction, not ASCII
- No image-gen credentials available to the agent; user runs the prompt manually
