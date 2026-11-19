#!/usr/bin/env node
// Dependency-free tests. Run: node test/smoke.mjs
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse, stringify, lint, features, discover, slashName, load } from "../lib/command.mjs";
import { newCommand, scaffoldPlugin, renderReadmeTable, injectReadme } from "../lib/scaffold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "bin", "prompt-kit.mjs");

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n      ${e.message}`);
    failed++;
  }
};
const ok = (v, m) => {
  if (!v) throw new Error(m || "expected truthy");
};
const no = (v, m) => {
  if (v) throw new Error(m || "expected falsy");
};
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || "mismatch"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

const root = mkdtempSync(join(tmpdir(), "promptkit-test-"));
const write = (rel, text) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text, "utf8");
  return p;
};

const levels = (c) => lint(c).map((p) => `${p.level}:${p.message}`);
const hasProblem = (c, level, re) => lint(c).some((p) => p.level === level && re.test(p.message));

console.log("frontmatter");

check("splits frontmatter from body", () => {
  const c = parse(`---\ndescription: Do a thing\nargument-hint: [x]\n---\n\nThe prompt.\n`);
  eq(c.data.description, "Do a thing", "description");
  eq(c.data["argument-hint"], "[x]", "hint");
  eq(c.body, "The prompt.", "body");
  ok(c.hadFrontmatter, "flag");
});

check("a file with no frontmatter is all body", () => {
  const c = parse("Just a prompt.");
  eq(c.data, {}, "no data");
  eq(c.body, "Just a prompt.", "body");
  no(c.hadFrontmatter, "flag");
});

check("strips quotes and reads booleans", () => {
  const c = parse(`---\ndescription: "Quoted: with colon"\ndisable-model-invocation: true\n---\nbody`);
  eq(c.data.description, "Quoted: with colon", "quoted value kept whole");
  eq(c.data["disable-model-invocation"], true, "boolean");
});

check("survives CRLF and a BOM", () => {
  const c = parse(`﻿---\r\ndescription: X\r\n---\r\nbody\r\n`);
  eq(c.data.description, "X", "description");
  eq(c.body, "body", "body");
});

check("stringify round-trips", () => {
  const original = { data: { description: "D", "argument-hint": "[a]" }, body: "The prompt." };
  const back = parse(stringify(original));
  eq(back.data, original.data, "data");
  eq(back.body, original.body, "body");
});

check("stringify puts known keys first", () => {
  const s = stringify({ data: { custom: "x", description: "d" }, body: "b" });
  ok(s.indexOf("description") < s.indexOf("custom"), "description first");
});

console.log("features");

check("spots arguments, shell calls and file refs", () => {
  const f = features("Use $ARGUMENTS and !`git status` and @src/app.ts and ${CLAUDE_PLUGIN_ROOT}/x");
  ok(f.usesArguments, "arguments");
  eq(f.shellCalls, ["git status"], "shell");
  ok(f.fileRefs.includes("src/app.ts"), "file ref");
  ok(f.pluginRoot, "plugin root");
});

check("a plain prompt has no features", () => {
  const f = features("Just write some code.");
  no(f.usesArguments, "no args");
  eq(f.shellCalls, [], "no shell");
});

console.log("lint");

check("an empty body is an error", () => {
  ok(hasProblem(parse("---\ndescription: d\n---\n"), "error", /empty/), "should error");
});

check("shell calls without allowed-tools is an error", () => {
  const c = parse("---\ndescription: d\n---\nRun !`git status` please");
  ok(hasProblem(c, "error", /allowed-tools/), `should error, got ${levels(c)}`);
});

check("shell calls with allowed-tools is fine", () => {
  const c = parse("---\ndescription: d\nallowed-tools: Bash(git:*)\n---\nRun !`git status`");
  no(lint(c).some((p) => p.level === "error"), `should be clean, got ${levels(c)}`);
});

check("missing description is a warning", () => {
  ok(hasProblem(parse("---\nargument-hint: [x]\n---\nbody"), "warn", /description/), "warn");
});

check("an unknown frontmatter key is a warning", () => {
  ok(hasProblem(parse("---\ndescription: d\nnonsense: 1\n---\nbody"), "warn", /unknown frontmatter/), "warn");
});

check("argument-hint without $ARGUMENTS is a warning, and the reverse too", () => {
  ok(hasProblem(parse("---\ndescription: d\nargument-hint: [x]\n---\nno args here"), "warn", /never uses/), "unused hint");
  ok(hasProblem(parse("---\ndescription: d\n---\nUses $ARGUMENTS"), "warn", /no argument-hint/), "missing hint");
});

check("destructive and state-changing shell calls are warned about", () => {
  const rmCmd = parse("---\ndescription: d\nallowed-tools: Bash\n---\n!`" + "rm -rf build" + "`");
  ok(hasProblem(rmCmd, "warn", /deletes files/), `should warn, got ${levels(rmCmd)}`);
  const gitCmd = parse("---\ndescription: d\nallowed-tools: Bash\n---\n!`git push origin main`");
  ok(hasProblem(gitCmd, "warn", /changes git state/), `should warn, got ${levels(gitCmd)}`);
});

check("a read-only shell call is not warned about", () => {
  const c = parse("---\ndescription: d\nallowed-tools: Bash(git:*)\n---\n!`git status --short`");
  no(lint(c).some((p) => /deletes|changes git/.test(p.message)), "should be quiet");
});

check("a well-formed command is clean", () => {
  const c = parse(
    "---\ndescription: Review the diff\nargument-hint: [branch]\nallowed-tools: Bash(git:*)\n---\n" +
      "Review !`git diff --stat` for $ARGUMENTS and report real bugs only."
  );
  eq(lint(c), [], `expected no problems, got ${levels(c)}`);
});

console.log("discovery");

write("commands/one.md", "---\ndescription: One\n---\nbody");
write("commands/ns/two.md", "---\ndescription: Two\n---\nbody");
write("commands/notes.txt", "ignored");

check("finds markdown commands, including namespaced ones", () => {
  const found = discover(join(root, "commands"));
  eq(found.length, 2, "two commands");
  ok(found.every((f) => f.endsWith(".md")), "md only");
});

check("namespaced files get a colon name", () => {
  const base = join(root, "commands");
  eq(slashName(join(base, "ns", "two.md"), base), "ns:two", "namespaced");
  eq(slashName(join(base, "one.md"), base), "one", "flat");
});

check("a missing directory yields nothing", () => {
  eq(discover(join(root, "nope")), [], "empty");
});

console.log("scaffolding");

check("newCommand produces a parseable, lint-clean skeleton", () => {
  const c = newCommand({ name: "demo", description: "Do demo things" });
  const back = parse(stringify(c));
  eq(back.data.description, "Do demo things", "description");
  no(lint(back).some((p) => p.level === "error"), `no errors, got ${levels(back)}`);
});

check("a hint in the scaffold is actually used in the body", () => {
  const c = newCommand({ name: "d", description: "x", argumentHint: "[thing]" });
  ok(features(c.body).usesArguments, "body should reference $ARGUMENTS when a hint is set");
  no(lint(parse(stringify(c))).some((p) => /argument-hint/.test(p.message)), "no hint warning");
});

check("scaffoldPlugin writes the manifests and an example", () => {
  const d = join(root, "plug");
  mkdirSync(d, { recursive: true });
  const written = scaffoldPlugin(d, "team-kit");
  for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "README.md", "commands/example.md"]) {
    ok(written.includes(f), `missing ${f}`);
    ok(existsSync(join(d, f)), `not written: ${f}`);
  }
  const man = JSON.parse(readFileSync(join(d, ".claude-plugin/plugin.json"), "utf8"));
  eq(man.name, "team-kit", "plugin name");
});

check("scaffoldPlugin never overwrites", () => {
  const d = join(root, "plug");
  writeFileSync(join(d, "README.md"), "mine");
  scaffoldPlugin(d, "team-kit");
  eq(readFileSync(join(d, "README.md"), "utf8"), "mine", "existing file kept");
});

check("the readme table renders and injects", () => {
  const table = renderReadmeTable([{ slash: "a", data: { description: "Does a" } }]);
  ok(table.includes("`/a`"), "row");
  const out = injectReadme("x\n<!-- prompt-kit:commands -->\nold\n<!-- /prompt-kit:commands -->\ny", table);
  ok(out.includes("Does a"), "injected");
  no(out.includes("old"), "replaced");
  eq(injectReadme("no markers here", table), null, "no markers means no change");
});

console.log("cli");

const run = (args, cwd = root) => {
  try {
    return {
      out: execFileSync(process.execPath, [CLI, ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      }),
      code: 0,
    };
  } catch (e) {
    return { out: (e.stdout || "") + (e.stderr || ""), code: e.status };
  }
};

check("list shows the commands", () => {
  const { out } = run(["list"]);
  ok(out.includes("/one"), "flat command");
  ok(out.includes("/ns:two"), "namespaced command");
});

check("lint is clean on good commands", () => {
  const { code, out } = run(["lint"]);
  eq(code, 0, `expected 0, got ${code}: ${out}`);
});

check("lint exits 1 on an error", () => {
  write("commands/bad.md", "---\ndescription: d\n---\nRun !`git status`");
  const { code, out } = run(["lint"]);
  eq(code, 1, "exit code");
  ok(/allowed-tools/.test(out), "explains");
  rmSync(join(root, "commands/bad.md"));
});

check("--strict makes warnings blocking", () => {
  write("commands/warny.md", "---\n---\nbody with no description");
  const loose = run(["lint"]);
  const strict = run(["lint", "--strict"]);
  eq(loose.code, 0, "warnings alone should pass");
  eq(strict.code, 1, "strict should fail");
  rmSync(join(root, "commands/warny.md"));
});

check("new writes a file", () => {
  const { code } = run(["new", "fresh", "--description", "Fresh thing"]);
  eq(code, 0, "exit");
  ok(existsSync(join(root, "commands/fresh.md")), "written");
  eq(parse(readFileSync(join(root, "commands/fresh.md"), "utf8")).data.description, "Fresh thing", "description");
});

check("new refuses to clobber", () => {
  const { code, out } = run(["new", "fresh"]);
  eq(code, 1, "exit");
  ok(/already exists/.test(out), "message");
});

check("new rejects a bad name", () => {
  const { code, out } = run(["new", "bad name!"]);
  eq(code, 2, "usage error");
  ok(/not a usable command name/.test(out), "message");
});

check("--json is valid", () => {
  const list = JSON.parse(run(["list", "--json"]).out);
  ok(Array.isArray(list), "array");
  const lintJson = JSON.parse(run(["lint", "--json"]).out);
  ok(typeof lintJson.errors === "number", "errors count");
});

check("an empty project says how to start", () => {
  const empty = mkdtempSync(join(tmpdir(), "promptkit-empty-"));
  const { out } = run(["list"], empty);
  ok(/prompt-kit init/.test(out), "suggests init");
  try {
    rmSync(empty, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

check("readme needs the marker block", () => {
  writeFileSync(join(root, "README.md"), "# no markers");
  const { code, out } = run(["readme"]);
  eq(code, 2, "exit");
  ok(/no <!-- prompt-kit:commands -->/.test(out), "explains");
});

check("readme fills the table when markers exist", () => {
  writeFileSync(join(root, "README.md"), "# t\n<!-- prompt-kit:commands -->\n<!-- /prompt-kit:commands -->\n");
  const { code } = run(["readme"]);
  eq(code, 0, "exit");
  ok(readFileSync(join(root, "README.md"), "utf8").includes("`/one`"), "table written");
});

check("--help works", () => {
  ok(run(["--help"]).out.includes("shared, reviewed library"), "help");
});

try {
  rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
} catch {
  /* the OS will clear it */
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
