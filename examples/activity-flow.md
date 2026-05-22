# Activity Flow: Form Submission Handling

## Question

> What happens when a user submits a form? Show the validation and
> persistence steps, including what happens on failure.

## Without feynman

When the form is submitted, the server validates the input fields. If
validation fails the user sees an error and the form stays open. If
validation passes, the server checks for duplicate entries. A duplicate
triggers a conflict response. A clean record gets persisted and the user
is redirected to the confirmation page.

## With feynman

```
[form submitted]
      |
      v
[validate fields]
      |
   pass? --no--> [return field errors] --> [form stays open]
      |
     yes
      |
      v
[check for duplicate]
      |
  found? --yes-> [409 Conflict response]
      |
      no
      |
      v
[persist record]
      |
      v
[redirect to confirmation]
```

Two decision points, three terminal outcomes. Each path ends at a named
outcome so nothing is left implicit.

## Why this works

Form submission is an activity flow with conditional branches — feynman's
arrow-chain and decision-branch rules activate. Boxes mark actions;
`--no-->` and `--yes-->` label the branch exits; each terminal result is
a named box, not implied prose.
