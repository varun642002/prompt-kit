<div align="center">

# 🧰 prompt-kit

### A shared, reviewed library of slash commands

*Good prompts live in one person's head, or one person's `~/.claude/`. This makes them a repo your team installs.*

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-D97757)](https://claude.com/claude-code)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-37-success.svg)](test/smoke.mjs)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## 🤷 The problem

Someone on the team writes a genuinely good `/review` command. It sits in their
personal `~/.claude/commands/`. Nobody else has it. Nobody reviews it. When it
breaks, it breaks silently — a shell call that was never allowed, an
`$ARGUMENTS` nothing passes.

Prompts are source. Treat them like it.

## ✨ What it does

**Start a library others can install:**

```bash
npx @varun642002/prompt-kit init team-kit
```

```text
  created a command library "team-kit":

    .claude-plugin/plugin.json
    .claude-plugin/marketplace.json
    README.md
    commands/example.md
```

Push it, and the team installs with two commands. That's the whole distribution
story — no registry, no server.

**Add a command:**

```bash
npx @varun642002/prompt-kit new review --description "Review the diff for real bugs" --hint "[branch]"
```

**Review them like code:**

```bash
npx @varun642002/prompt-kit lint
```

```text
  /deploy  commands/deploy.md
      error  the body runs 2 shell call(s) but allowed-tools is not set,
             so they will be refused
      warn   shell call changes git state: `git push origin main`

  /review  commands/review.md
      warn   the body uses $ARGUMENTS but no argument-hint tells anyone
             what to pass

  1 error(s), 2 warning(s)
```

Exit code 1 on errors, so it belongs in CI.

## 🚀 Install

```bash
claude plugin marketplace add varun642002/prompt-kit
```

```bash
claude plugin install prompt-kit@prompt-kit
```

Or use it with no install at all:

```bash
npx @varun642002/prompt-kit lint
```

## 🎮 Commands

| | Does |
|---|---|
| `prompt-kit list` | Every command found, what it does, and whether it uses args, shell or tools |
| `prompt-kit lint` | Problems, split into errors and warnings |
| `prompt-kit new <name>` | Write a new command file from a sane skeleton |
| `prompt-kit init <name>` | Scaffold a plugin repo others can install |
| `prompt-kit readme` | Refresh the command table in `README.md` |

| Flag | Effect |
|---|---|
| `--dir PATH` | Where commands live (default: `commands/`, then `.claude/commands/`) |
| `--strict` | Warnings also exit non-zero |
| `--json` | Machine-readable |
| `--description` `--hint` `--tools` | Frontmatter for `new` |

## 🔍 What lint catches

**Errors** — the command will not do what it looks like it does:

- An empty body. There is no prompt.
- Shell calls (`` !`cmd` ``) with no `allowed-tools`, so every one is refused.

**Warnings** — it works, but probably not as intended:

- No `description`, so nobody can find it
- An `argument-hint` the body never uses, or `$ARGUMENTS` with no hint
- Unknown frontmatter keys, silently ignored
- Shell calls that **delete files** or **change git state** — a command should
  gather context, not mutate the repo behind a one-word invocation
- Prompts over 600 words, which drift

## 📐 Where commands live

| Scope | Directory | Shared with |
|---|---|---|
| Project | `.claude/commands/` | the repo, committed |
| Personal | `~/.claude/commands/` | you only |
| **Plugin** | `commands/` | **anyone who installs it** |

`init` sets up the third, because that is the one that makes a prompt a team
asset instead of a personal habit.

Subdirectories namespace a command: `commands/ci/deploy.md` is `/ci:deploy`.

## 🧭 Notes for anyone forking this

- **The frontmatter parser is deliberately not YAML.** A command's frontmatter
  is flat scalars; a real YAML dependency would buy nothing and add a supply
  chain. It handles quotes, booleans, CRLF and a BOM, and ignores what it does
  not understand.
- **`new` writes a shape, not a prompt.** The skeleton says what to fill in and
  says so out loud, because a generated prompt that reads like a finished one
  gets shipped unedited.
- **The scaffold never overwrites.** A README someone has written is worth more
  than the template.
- **Lint distinguishes "will not work" from "probably not meant".** Collapsing
  those into one severity is how linters get ignored.

## 🤝 Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). No dependencies, please.
A new rule needs a test for the hit and one for the near-miss.

- [ ] Detect commands that duplicate each other
- [ ] `prompt-kit test` — run a command against a fixture repo and diff the result
- [ ] Usage stats from transcripts: which commands are actually invoked
- [ ] Import an existing `~/.claude/commands/` into a shareable library

## 📄 License

[MIT](LICENSE)
