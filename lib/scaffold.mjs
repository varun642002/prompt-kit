// Create a shareable command library: a plugin repo that others install.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "./command.mjs";

/** Where Claude Code looks for commands, in order of how shareable they are. */
export const SCOPES = {
  project: { dir: ".claude/commands", what: "this repo, committed and shared with the team" },
  personal: { dir: null, what: "you only, in ~/.claude/commands" },
  plugin: { dir: "commands", what: "a plugin repo others can install" },
};

export function newCommand({ name, description = "", argumentHint = "", allowedTools = "" }) {
  const data = {};
  if (description) data.description = description;
  if (argumentHint) data["argument-hint"] = argumentHint;
  if (allowedTools) data["allowed-tools"] = allowedTools;

  const body = [
    `${description || `Do the thing that /${name} is for.`}`,
    "",
    "Say here, in plain words, what you want done — as if briefing a colleague",
    "who knows the codebase but not this task.",
    "",
    argumentHint ? "The user's input is in $ARGUMENTS." : "",
    "",
    "Be specific about:",
    "",
    "- what to look at first",
    "- what a good result looks like",
    "- what to leave alone",
    "",
    "Then report what changed and anything that needs a decision.",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  return { data, body };
}

const PLUGIN_README = (name) => `# ${name}

Shared slash commands for Claude Code.

## Install

\`\`\`bash
claude plugin marketplace add <owner>/${name}
\`\`\`

\`\`\`bash
claude plugin install ${name}@${name}
\`\`\`

## Commands

<!-- prompt-kit:commands -->
<!-- Run \`prompt-kit readme\` to fill this in from the command files. -->
<!-- /prompt-kit:commands -->

## Adding a command

\`\`\`bash
npx @varun642002/prompt-kit new my-command --description "What it does"
\`\`\`

\`\`\`bash
npx @varun642002/prompt-kit lint
\`\`\`

Commands are Markdown. Frontmatter carries the description, the argument hint
and the tools the command may use; the body is the prompt.
`;

/** Build a plugin repository that holds commands. */
export function scaffoldPlugin(root, name, { description = `Shared slash commands` } = {}) {
  const written = [];
  const put = (rel, text) => {
    const p = join(root, rel);
    if (existsSync(p)) return;
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text, "utf8");
    written.push(rel);
  };

  put(
    ".claude-plugin/plugin.json",
    JSON.stringify({ name, description, version: "0.1.0", keywords: ["commands", "prompts", "claude-code"] }, null, 2) + "\n"
  );
  put(
    ".claude-plugin/marketplace.json",
    JSON.stringify(
      { name, description, owner: { name: "" }, plugins: [{ name, description, version: "0.1.0", source: "./" }] },
      null,
      2
    ) + "\n"
  );
  put("README.md", PLUGIN_README(name));
  put(
    "commands/example.md",
    stringify(
      newCommand({
        name: "example",
        description: "An example command — rename or delete it",
        argumentHint: "[what to work on]",
      })
    )
  );
  return written;
}

/** Rewrite the command table between the README markers. */
export function renderReadmeTable(commands) {
  if (!commands.length) return "_No commands yet._";
  const rows = [
    "| Command | What it does |",
    "|---|---|",
    ...commands.map((c) => `| \`/${c.slash}\` | ${(c.data.description || "—").replace(/\|/g, "\\|")} |`),
  ];
  return rows.join("\n");
}

export function injectReadme(text, table) {
  const start = "<!-- prompt-kit:commands -->";
  const end = "<!-- /prompt-kit:commands -->";
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) return null;
  return text.slice(0, i + start.length) + "\n" + table + "\n" + text.slice(j);
}
