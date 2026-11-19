// Read, validate and write slash commands.
//
// A command is a Markdown file with YAML-ish frontmatter. The format is small
// enough to parse honestly: only the keys Claude Code actually reads, and a
// scalar parser rather than a pretend YAML implementation.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, relative, dirname } from "node:path";

export const KNOWN_KEYS = ["description", "argument-hint", "allowed-tools", "model", "disable-model-invocation"];

/**
 * Split frontmatter from body. Returns { data, body, raw, hadFrontmatter }.
 * Values are treated as scalars — a command's frontmatter has no nesting.
 */
export function parse(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src.trim(), raw: src, hadFrontmatter: false };

  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (value === "true") value = true;
    else if (value === "false") value = false;
    if (key) data[key] = value;
  }
  return { data, body: src.slice(m[0].length).trim(), raw: src, hadFrontmatter: true };
}

export function stringify({ data = {}, body = "" }) {
  const keys = [...KNOWN_KEYS.filter((k) => data[k] !== undefined), ...Object.keys(data).filter((k) => !KNOWN_KEYS.includes(k))];
  if (!keys.length) return `${body.trim()}\n`;
  const lines = ["---"];
  for (const k of keys) {
    const v = data[k];
    lines.push(`${k}: ${typeof v === "string" && /[:#]/.test(v) ? JSON.stringify(v) : v}`);
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

/** Everything a command's body does that matters for review. */
export function features(body) {
  const b = String(body || "");
  return {
    usesArguments: /\$ARGUMENTS|\$\d\b/.test(b),
    shellCalls: [...b.matchAll(/!`([^`]+)`/g)].map((m) => m[1].trim()),
    fileRefs: [...b.matchAll(/@([\w./\\-]+)/g)].map((m) => m[1]),
    pluginRoot: /\$\{?CLAUDE_PLUGIN_ROOT\}?/.test(b),
    words: b.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Problems worth telling someone about. Each is { level, message }.
 * 'error' means Claude Code will not use the command as intended; 'warn' means
 * it will work but probably not as the author hoped.
 */
export function lint(cmd) {
  const out = [];
  const { data, body, hadFrontmatter } = cmd;
  const f = features(body);
  const add = (level, message) => out.push({ level, message });

  if (!body.trim()) add("error", "the body is empty — there is no prompt here");

  if (!hadFrontmatter) add("warn", "no frontmatter, so it has no description and will be hard to find");
  else if (!data.description) add("warn", "no description — this is what people see when listing commands");
  else if (String(data.description).length > 120) add("warn", "description is long; one line reads better in a list");

  for (const k of Object.keys(data)) {
    if (!KNOWN_KEYS.includes(k)) add("warn", `unknown frontmatter key "${k}" — it will be ignored`);
  }

  if (data["argument-hint"] && !f.usesArguments) {
    add("warn", "argument-hint is set but the body never uses $ARGUMENTS");
  }
  if (f.usesArguments && !data["argument-hint"]) {
    add("warn", "the body uses $ARGUMENTS but no argument-hint tells anyone what to pass");
  }

  if (f.shellCalls.length && !data["allowed-tools"]) {
    add("error", `the body runs ${f.shellCalls.length} shell call(s) but allowed-tools is not set, so they will be refused`);
  }
  if (data["allowed-tools"] && !f.shellCalls.length && !/Read|Write|Edit|Glob|Grep/.test(String(data["allowed-tools"]))) {
    add("warn", "allowed-tools is set but the body runs nothing");
  }

  for (const c of f.shellCalls) {
    if (/\b(rm|rmdir|del)\b\s+-?[a-z]*\s*[/*]/.test(c) || /\brm\s+-[a-z]*r/.test(c)) {
      add("warn", `shell call deletes files: \`${c}\` — a command should gather context, not change things`);
    }
    if (/\bgit\s+(push|commit|reset|checkout)\b/.test(c)) {
      add("warn", `shell call changes git state: \`${c}\``);
    }
  }

  if (f.words > 600) add("warn", `${f.words} words — long prompts drift; consider splitting`);

  return out;
}

/** Load one command file. */
export function load(path) {
  const cmd = parse(readFileSync(path, "utf8"));
  return { ...cmd, path, name: basename(path).replace(/\.md$/i, "") };
}

/** Find command files under a directory, recursively (namespaced commands). */
export function discover(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const walk = (d, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.toLowerCase().endsWith(".md")) out.push(p);
    }
  };
  walk(dir, 0);
  return out.sort();
}

/** The slash name a file will be invoked by, including any namespace. */
export function slashName(file, root) {
  const rel = relative(root, file).replace(/\\/g, "/").replace(/\.md$/i, "");
  return rel.split("/").join(":");
}

export function save(path, cmd) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify(cmd), "utf8");
}

export function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
