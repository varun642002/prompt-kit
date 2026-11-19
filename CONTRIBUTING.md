# Contributing to prompt-kit

## Two rules

1. **No dependencies.** The frontmatter parser is deliberately not a YAML
   library: a command's frontmatter is flat scalars, so a real YAML dependency
   would buy nothing and add a supply chain to a tool people run in CI.
2. **Prompts are the product.** This tool reviews someone's careful writing. A
   rule that pushes authors to reword a good prompt just to satisfy a linter is
   a bad rule, however easy it is to implement.

## Setup

```bash
git clone https://github.com/varun642002/prompt-kit && cd prompt-kit && node test/smoke.mjs
```

There is no build step. Tests write throwaway command files to a temp directory.

## Adding a lint rule

`lib/command.mjs`, in `lint()`. Pick the severity honestly:

- **error** — the command will not do what it appears to do. Shell calls with no
  `allowed-tools` qualify, because every one of them is refused at runtime.
- **warn** — it works, but probably not as the author intended.

Collapsing those into one level is how linters end up ignored. Every rule needs
two tests: the hit, and the near-miss that must stay quiet. A read-only
`git status` must not trip the rule that catches `git push`.

## Things to know

- **The parser must survive real files.** CRLF, a BOM, quoted values containing
  colons, and keys it has never heard of. Unknown keys are reported, not
  rejected.
- **`new` writes a shape, not a prompt**, and says so in the body. A generated
  prompt that reads like a finished one gets shipped unedited.
- **Scaffolding never overwrites.** An existing README is worth more than the
  template.
- **Cleanup is best-effort.** Windows throws `EPERM` on a temp directory a child
  still holds, and that must not fail the run.
