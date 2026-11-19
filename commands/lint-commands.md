---
description: Review this project's slash commands for problems
allowed-tools: Bash(npx:*), Read
---

Review the slash commands in this project.

!`npx -y @varun642002/prompt-kit lint`

Act on what it found:

- **Errors** mean a command will not do what it appears to do. Offer to fix
  each one — usually adding `allowed-tools`, or filling an empty body.
- **Warnings** are judgement calls. Say which are worth fixing and which are
  fine as they are; do not mechanically silence them.
- **Nothing reported** means they are in good shape. Say so in a line.

Read a command's file before changing it. The prompt is the product here, and
rewording someone's careful instructions to satisfy a linter is a poor trade.
