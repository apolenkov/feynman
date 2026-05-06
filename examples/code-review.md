# Code Review: PR with Mixed-Severity Issues

## Question

> Review this PR. It has a SQL injection vulnerability in the login handler,
> a missing null check that could cause crashes, and a variable name that
> doesn't follow conventions. How should I prioritize the fixes?

## Without feynman

The SQL injection is the most critical issue because it's a security
vulnerability that could expose user data. The missing null check is serious
because it causes crashes in production but doesn't expose data. The naming
convention issue is low severity — it's cosmetic and only affects readability.
Fix security first, stability second, style last.

## With feynman

Priority order:

```
▲ high
  SQL injection (login handler, line 47)
  — user input concatenated into query string
  — fix: parameterized query or ORM method

  null check missing (user.profile access, line 83)
  — crashes when user has no profile row
  — fix: optional chaining or guard clause

▼ low
  variable name: usr_Obj → user (line 31)
  — convention: camelCase, descriptive noun
  — fix: rename + search-replace in file
```

Issue comparison:

```
issue             | severity | risk           | fix effort
──────────────────|──────────|────────────────|────────────
SQL injection     | critical | data breach    | 15 min
null crash        | high     | prod outage    | 5 min
naming convention | low      | readability    | 2 min
```

Fix sequence: null check (5 min, unblock prod) → SQL injection (15 min,
close security hole) → rename (2 min, cleanup). Total: ~22 min.

## Why this works

Issues ordered by severity map to feynman's priority-scale rule (▲▼ markers).
A multi-criteria comparison of the same issues across dimensions (risk, effort)
activates the comparison-column rule. Both diagrams together give a complete
picture — one for prioritization, one for planning.
