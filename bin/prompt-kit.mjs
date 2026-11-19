#!/usr/bin/env node
// prompt-kit — keep a team's slash commands in one place, reviewed and shared.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { discover, load, lint, slashName, save, features, isDir } from "../lib/command.mjs";
import { newCommand, scaffoldPlugin, renderReadmeTable, injectReadme } from "../lib/scaffold.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith("-") ? argv[0] : "list";
const rest = argv.slice(1);
const has = (f) => argv.includes(f);
const val = (f, d = "") => {
  const i = argv.indexOf(f);
  return i === -1 ? d : (argv[i + 1] ?? d);
};
const positional = () => {
  const out = [];
  for (let i = 1; i < argv.length; i++) {
    const prev = argv[i - 1];
    if (argv[i].startsWith("--")) continue;
    if (["--description", "--hint", "--tools", "--dir", "--out"].includes(prev)) continue;
    out.push(argv[i]);
  }
  return out;
};

if (has("--help") || has("-h") || cmd === "help") {
  console.log(`prompt-kit — a shared, reviewed library of slash commands

usage:
  prompt-kit list                 every command found, and what it does
  prompt-kit lint                 problems in those commands
  prompt-kit new <name>           write a new command file
  prompt-kit init <name>          scaffold a plugin repo others can install
  prompt-kit readme               refresh the command table in README.md

options:
  --dir PATH          where commands live (default: auto-detect)
  --description TEXT  for new
  --hint TEXT         argument-hint, for new
  --tools TEXT        allowed-tools, for new
  --out PATH          file to write, for new
  --json              machine-readable
  --strict            lint warnings also exit non-zero

Exit codes: 0 fine, 1 problems found, 2 bad usage.`);
  process.exit(0);
}

/** Commands live in different places depending on how they are shared. */
function findRoot(explicit) {
  if (explicit) return explicit;
  for (const d of ["commands", ".claude/commands"]) {
    if (isDir(d)) return d;
  }
  return null;
}

const root = findRoot(val("--dir"));

function loadAll() {
  if (!root) return [];
  return discover(root).map((f) => {
    const c = load(f);
    return { ...c, slash: slashName(f, root), file: f };
  });
}

if (cmd === "init") {
  const name = positional()[0] || basename(process.cwd());
  const written = scaffoldPlugin(process.cwd(), name);
  if (!written.length) {
    console.log("prompt-kit: nothing to do — those files already exist.");
    process.exit(0);
  }
  console.log(`\n  created a command library "${name}":\n`);
  for (const w of written) console.log(`    ${w}`);
  console.log(`\n  Add commands with:  prompt-kit new <name> --description "..."\n`);
  process.exit(0);
}

if (cmd === "new") {
  const name = positional()[0];
  if (!name) {
    console.error("prompt-kit: a name is required — prompt-kit new review-pr");
    process.exit(2);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    console.error(`prompt-kit: "${name}" is not a usable command name (letters, digits and dashes).`);
    process.exit(2);
  }
  const target = val("--out") || join(root || "commands", `${name}.md`);
  if (existsSync(target) && !has("--force")) {
    console.error(`prompt-kit: ${target} already exists. Pass --force to replace it.`);
    process.exit(1);
  }
  save(
    target,
    newCommand({
      name,
      description: val("--description"),
      argumentHint: val("--hint"),
      allowedTools: val("--tools"),
    })
  );
  console.log(`wrote ${target}\n\nEdit the body — the scaffold is a shape, not a prompt.`);
  process.exit(0);
}

const commands = loadAll();

if (!root || !commands.length) {
  const where = root ? root : "commands/ or .claude/commands/";
  if (has("--json")) {
    console.log(JSON.stringify({ root, commands: [], problems: [] }, null, 2));
    process.exit(0);
  }
  console.log(`\nprompt-kit: no commands found in ${where}.\n\n  prompt-kit init <name>   to start a shared library\n`);
  process.exit(cmd === "lint" ? 0 : 0);
}

if (cmd === "readme") {
  const path = val("--out") || "README.md";
  if (!existsSync(path)) {
    console.error(`prompt-kit: ${path} not found.`);
    process.exit(2);
  }
  const updated = injectReadme(readFileSync(path, "utf8"), renderReadmeTable(commands));
  if (!updated) {
    console.error(
      `prompt-kit: ${path} has no <!-- prompt-kit:commands --> block, so there is nowhere to put the table.`
    );
    process.exit(2);
  }
  writeFileSync(path, updated, "utf8");
  console.log(`updated the command table in ${path} (${commands.length} commands)`);
  process.exit(0);
}

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\u001b[${code}m${s}\u001b[0m` : s);
const dim = c("2");
const red = c("31");
const yellow = c("33");
const green = c("32");

if (cmd === "list") {
  if (has("--json")) {
    console.log(
      JSON.stringify(
        commands.map((x) => ({ slash: x.slash, file: x.file, ...x.data, ...features(x.body) })),
        null,
        2
      )
    );
    process.exit(0);
  }
  console.log(`\n  ${commands.length} command(s) in ${root}\n`);
  for (const x of commands) {
    const f = features(x.body);
    const tags = [
      f.usesArguments ? "args" : "",
      f.shellCalls.length ? `${f.shellCalls.length} shell` : "",
      x.data["allowed-tools"] ? "tools" : "",
    ].filter(Boolean);
    console.log(`  /${x.slash.padEnd(22)} ${x.data.description || dim("(no description)")}`);
    if (tags.length) console.log(`   ${dim(" ".repeat(22) + "  " + tags.join(" · "))}`);
  }
  console.log();
  process.exit(0);
}

if (cmd === "lint") {
  const all = commands.map((x) => ({ x, problems: lint(x) }));
  const errors = all.reduce((n, a) => n + a.problems.filter((p) => p.level === "error").length, 0);
  const warns = all.reduce((n, a) => n + a.problems.filter((p) => p.level === "warn").length, 0);

  if (has("--json")) {
    console.log(JSON.stringify({ errors, warnings: warns, commands: all.map((a) => ({ slash: a.x.slash, problems: a.problems })) }, null, 2));
    process.exit(errors || (has("--strict") && warns) ? 1 : 0);
  }

  console.log();
  for (const { x, problems } of all) {
    if (!problems.length) continue;
    console.log(`  /${x.slash}  ${dim(x.file)}`);
    for (const p of problems) {
      const tag = p.level === "error" ? red("error") : yellow("warn ");
      console.log(`      ${tag}  ${p.message}`);
    }
    console.log();
  }
  if (!errors && !warns) console.log(`  ${green("ok")}  ${commands.length} command(s), nothing to report\n`);
  else console.log(`  ${errors ? red(`${errors} error(s)`) : "0 errors"}, ${warns} warning(s)\n`);

  process.exit(errors || (has("--strict") && warns) ? 1 : 0);
}

console.error(`prompt-kit: unknown command "${cmd}" (try --help)`);
process.exit(2);
