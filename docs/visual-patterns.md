# Visual Patterns: Research Foundation

How feynman's rules derive from visual communication research.

---

## Core Principle

A diagram should reduce the cognitive work required to extract information.
When prose describes a structure, the reader must reconstruct that structure
mentally. A diagram presents the structure directly.

feynman operationalizes this principle in eight lint rules (L01-L08) that
enforce correctness of the most common ASCII diagram patterns.

---

## Tufte: Data-Ink Ratio

**Source:** Edward R. Tufte, *The Visual Display of Quantitative Information*, 2nd ed.
Graphics Press, 2001.

Tufte's central rule: maximize the ratio of data ink to total ink. Remove
everything that does not carry information.

```
data-ink ratio = (ink carrying data) / (total ink in graphic)

high ratio  -->  dense, clear
low ratio   -->  cluttered, noisy
```

**Small multiples** (Tufte, *Envisioning Information*, 1990) — repeat the same
graphic structure across multiple instances to enable comparison. The same
visual encoding applied consistently lets the eye detect differences without
re-learning the encoding.

### How feynman embodies Tufte

**L08 frame width discipline** directly enforces data-ink ratio in ASCII frames.
Every row in a frame block must have the same display width. Ragged right
edges add visual noise without information.

Valid (consistent width — passes L08):

```
┌─ Status ──────┐
│  item-a  ok   │
│  item-b  wait │
└───────────────┘
```

Invalid (ragged right edge — fails L08):

```text
┌─ Status ─────┐
│  item-a done │
│  item-b in progress│
└────────┘
```

**L01 box closure** enforces structural completeness. An unclosed box is
decoration without information — the visual boundary promises containment
but does not deliver it.

---

## Few: Pre-Attentive Attributes

**Source:** Stephen Few, *Show Me the Numbers*, 2nd ed. Analytics Press, 2012.
Stephen Few, *Now You See It*. Analytics Press, 2009.

Pre-attentive processing happens in under 250 ms, before conscious attention.
Attributes processed pre-attentively include: position, length, size, color,
orientation, shape, and enclosure.

For ASCII diagrams, the relevant pre-attentive attributes are:

```
attribute    | ASCII representation        | activates
-------------|-----------------------------|--------------------------
position     | indentation, left-alignment | hierarchy, sequence
enclosure    | frame blocks                | grouping
shape        | [box] vs tree vs lines      | diagram type
orientation  | --> (horizontal) vs |       | flow direction
```

Few's dashboard principle: a viewer should be able to identify the most
important item within 5 seconds. In a code review response, `▲` and `▼`
markers make the highest and lowest priority items instantly findable.

### How feynman embodies Few

**L06 priority scale** enforces that `▲` and `▼` always appear together.
A scale with only one end is not a scale — it lacks the reference point
that makes the pre-attentive contrast useful.

Valid (both ends — passes L06):

```
▲ high
  critical-bug
  security-patch
▼ low
  cosmetic-fix
```

Invalid (one end only — fails L06):

```text
▲ high
  critical-bug
  security-patch
```

Without `▼ low`, the reader cannot determine whether "security-patch" is at
the top, middle, or bottom of the full severity range.

**L05 flow integrity** enforces that boxes in sequence have arrows between them.
The pre-attentive attribute of position implies connection only when supported
by an explicit visual link. Two boxes next to each other with no arrow are
ambiguous — parallel? sequential? unrelated?

---

## Bertin: Visual Variables

**Source:** Jacques Bertin, *Semiology of Graphics*, trans. William J. Berg.
University of Wisconsin Press, 1983 (orig. 1967).

Bertin identified seven visual variables: position, size, value (lightness),
texture, color, orientation, and shape. Each variable has different
*retinal properties* — they vary in whether they communicate order, quantity,
or mere difference.

For monochrome ASCII (no color, no size variation), the available variables are:

```
variable     | ASCII encoding                  | retinal property
-------------|─────────────────────────────────|------------------
position     | column, indentation level        | order, quantity
orientation  | --> (horizontal) | (vertical)    | difference
shape        | frame vs [box] vs tree vs scale  | difference
texture      | - vs space vs | fill             | difference
```

Bertin's key insight: variables must be used consistently within a graphic.
Inconsistent use of a variable adds noise without information.

### How feynman embodies Bertin

**L02 tree chars** enforces consistent use of the shape variable.
In ASCII trees, `├──` signals "more siblings follow" and `└──` signals
"last sibling." Using `├──` for the last child violates Bertin's consistency
requirement — the shape variable now carries conflicting information.

Valid (correct last-child marker — passes L02):

```
root
├── child-a
├── child-b
└── child-c
```

Invalid (wrong last-child marker — fails L02):

```text
root
├── child-a
├── child-b
├── child-c
```

**L03 arrow style** enforces consistency of the shape variable for directional
links. `-->`, `─→`, and `──>` all encode "directed connection," but mixing
them within a single diagram adds visual noise. The reader must expend
attention verifying that mixed styles are equivalent rather than distinct.

Valid (consistent style — passes L03):

```
[A] --> [B] --> [C] --> [D]
```

Invalid (mixed styles — fails L03):

```text
[A] --> [B] --> [C] --> [D]
```

Note: the invalid example above only becomes invalid when `→` appears alongside
`-->` in the same diagram block.

**L04 column widths** enforces consistent position encoding in tables.
Misaligned column separators break the visual grid — the position variable
now encodes nothing, forcing the reader to count pipes instead of reading
structure.

---

## Knaflic: Annotation and Focus

**Source:** Cole Nussbaumer Knaflic, *Storytelling with Data*. Wiley, 2015.

Knaflic emphasizes that every visual element should serve a purpose, and that
annotation should guide attention to what matters. Unlabeled structures leave
the reader to infer the author's intent.

**L07 no mermaid/ASCII mix** enforces a single visual vocabulary per document.
Mixing Mermaid syntax and ASCII diagrams forces the reader to context-switch
between two encoding systems. It also signals that the response was assembled
without a deliberate visual strategy.

---

## Principle-to-Rule Mapping

```
principle                     | rule | what it enforces
------------------------------|------|---------------------------------------------
Tufte: data-ink ratio         | L08  | frame rows same width (no wasted ink)
Tufte: structural completeness| L01  | every box-open has a matching box-close
Few: pre-attentive scale      | L06  | both scale ends (▲ and ▼) always present
Few: position implies sequence| L05  | boxes in sequence require explicit arrows
Bertin: shape consistency     | L02  | last tree child uses └── not ├──
Bertin: shape consistency     | L03  | one arrow style per diagram
Bertin: position encoding     | L04  | table column counts consistent across rows
Knaflic: single vocabulary    | L07  | no mermaid + ASCII mix in same document
```

---

## Bibliography

- Tufte, Edward R. *The Visual Display of Quantitative Information*, 2nd ed.
  Cheshire, CT: Graphics Press, 2001.

- Tufte, Edward R. *Envisioning Information*. Cheshire, CT: Graphics Press,
  1990.

- Few, Stephen. *Show Me the Numbers: Designing Tables and Graphs to Enlighten*,
  2nd ed. Burlingame, CA: Analytics Press, 2012.

- Few, Stephen. *Now You See It: Simple Visualization Techniques for Quantitative
  Analysis*. Burlingame, CA: Analytics Press, 2009.

- Bertin, Jacques. *Semiology of Graphics: Diagrams, Networks, Maps*. Trans.
  William J. Berg. Madison, WI: University of Wisconsin Press, 1983.
  (Original: *Semiologie graphique*, Gauthier-Villars, 1967.)

- Nussbaumer Knaflic, Cole. *Storytelling with Data: A Data Visualization
  Guide for Business Professionals*. Hoboken, NJ: Wiley, 2015.
