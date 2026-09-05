import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Sandbox-aware envelope reads (2026-09-04). Codex runs the agent's shell
 * commands inside a sandbox whose outbound network is OFF in both default
 * modes (only "Full Access" allows it). So when a skill runs
 * `altitude task --json` in Codex, the fetch fails instantly and the CLI fails
 * open: `source: "none"`, `journey: null`, exit 0 — and the old `begin` copy
 * read that as "your account doesn't have a journey ready yet". Two beta
 * learners lost hours reinstalling. Only the HOOKS run outside the sandbox
 * with network, which is why they warm a local copy the sandboxed read can
 * fall back on.
 *
 * The CLI (separate repo, separate release) adds two OPTIONAL fields:
 *
 *   reason:    "network_blocked" | "offline" | "unauthorized" | "server_error"
 *              — present only when source !== "network"; ABSENT on older CLIs
 *   transport: { code, message, elapsed_ms } | null — internal, never shown
 *
 * `journey: null` means "no journey" ONLY when `source === "network"`. These
 * tests pin that every skill reading the envelope branches on source + reason
 * instead of on `journey` alone, and that the Codex hook config stays inside
 * Codex's documented limits without disturbing its positional trust state.
 */

const REASONS = ['"network_blocked"', '"offline"', '"unauthorized"', '"server_error"'];

async function readSkill(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

async function markdownUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownUnder(path)));
    else if (entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

function sliceBetween(contents, startHeading, endHeading) {
  const start = contents.indexOf(startHeading);
  const end = contents.indexOf(endHeading);
  assert.ok(
    start !== -1 && end > start,
    `the "${startHeading}" … "${endHeading}" span moved or vanished`,
  );
  return contents.slice(start, end);
}

test("every skill file that runs altitude task --json handles a sandboxed read", async () => {
  const readers = [];
  for (const path of await markdownUnder(join(repoRoot, "skills"))) {
    const contents = await readFile(path, "utf8");
    if (!contents.includes("altitude task --json")) continue;
    const name = relative(repoRoot, path);
    readers.push(name);
    // The agent loads one skill file at a time, so each reader has to carry
    // the branch itself — a rule stated in `begin` does not govern
    // `next-lesson` or its mode reference.
    assert.match(
      contents,
      /network_blocked/,
      `${name} runs altitude task --json but never handles a network_blocked read`,
    );
  }
  for (const expected of ["skills/begin/SKILL.md", "skills/next-lesson/SKILL.md"]) {
    assert.ok(readers.includes(expected), `${expected} no longer runs altitude task --json?`);
  }
});

test("begin gives every reason its own exit, one command at a time", async () => {
  const begin = await readSkill("skills/begin/SKILL.md");
  const route = sliceBetween(begin, "## Step 1 — Find their route", "## Step 2 — Protect existing work");

  for (const source of ['"network"', '"cache"', '"none"']) {
    assert.match(route, new RegExp(`\`source\`[^\\n]*${source}|${source}`), `route never names source ${source}`);
  }
  for (const reason of REASONS) {
    assert.match(route, new RegExp(reason), `route never handles reason ${reason}`);
  }
  // network_blocked: name the sandbox in plain language, offer the escalated
  // re-run (Codex's shell tool takes a justification) and the learner's own
  // terminal, and say why the hooks must be trusted — they keep the copy fresh.
  assert.match(route, /sandbox/);
  assert.match(route, /escalated permissions/);
  assert.match(route, /Altitude needs network access to read your journey/);
  assert.match(route, /own terminal/);
  assert.match(route, /Hooks need review/);
  assert.match(route, /Trust all and continue/);
  // offline: retry or the free route; unauthorized: reconnect; server_error:
  // try again, then support.
  assert.match(route, /\/altitude:connect/);
  assert.match(route, /support@learnaltitude\.com/);
  // A cached answer is a normal answer: at most one calm line about it.
  assert.match(route, /"cache"[^\n]*(?:one calm line|at most one line)/);
  // Older CLI: source "none" with no reason — say you could not read it from
  // here and point at `altitude update`, keeping the free route open.
  assert.match(route, /no `reason`[^\n]*`altitude update`/);
  // transport is diagnostics for the CLI, never copy for the learner.
  assert.match(route, /`transport`[^\n]*never/);
});

test('"no journey ready yet" is said only on a live network read', async () => {
  for (const relativePath of ["skills/begin/SKILL.md", "skills/next-lesson/SKILL.md"]) {
    const skill = await readSkill(relativePath);
    // The invariant, stated where the envelope is read.
    assert.match(
      skill,
      /`journey: null` means "no journey" only when `source` is `"network"`/,
      `${relativePath} does not state the journey-null invariant`,
    );
    // And every line that offers the "ready yet" copy is gated on it.
    const lines = skill.split("\n").filter((line) => /ready yet/.test(line));
    if (relativePath === "skills/begin/SKILL.md") {
      assert.ok(lines.length > 0, "begin lost its no-journey route");
    }
    for (const line of lines) {
      assert.match(
        line,
        /`"network"`/,
        `${relativePath} says "ready yet" without checking source is "network": ${line}`,
      );
    }
  }
});

test("begin's post-bind re-read accepts a cached answer and never blames the bind for a reach failure", async () => {
  const begin = await readSkill("skills/begin/SKILL.md");
  const home = sliceBetween(begin, "## Step 3 — Make the journey's home", "## Step 4 — Materialize");

  // `altitude bind` runs in the learner's own terminal (network) and warms the
  // journey cache; the agent's sandboxed re-read then answers from "cache".
  assert.match(home, /`"cache"`/);
  assert.match(home, /not a binding failure/);
});

test("next-lesson reads source and reason before choosing a mode", async () => {
  const skill = await readSkill("skills/next-lesson/SKILL.md");
  const orient = sliceBetween(skill, "## Step 1 — Orient", "### Match their shell");

  for (const reason of REASONS) {
    assert.match(orient, new RegExp(reason), `orient never handles reason ${reason}`);
  }
  // The reach check precedes the mode choice: a "none" read must never be
  // mistaken for free mode or a paused subscription.
  assert.ok(
    orient.indexOf("network_blocked") < orient.indexOf("Choose exactly one mode"),
    "the reach check sits after the mode choice",
  );
  assert.match(orient, /never treat it as free mode or a paused subscription/);
  // Paused means the server SAID entitled is false — not that the field is
  // null because nothing was read.
  const paused = orient.split("\n").find((line) => line.includes("**Paused subscription:**"));
  assert.ok(paused, "the paused-subscription bullet moved or vanished");
  assert.match(paused, /exactly `false`/);
  assert.match(paused, /`source`/);
  // An unbound folder is a free project whatever the server said: no detour
  // through the reach exits for standalone learners who happen to have the
  // CLI connected.
  assert.match(orient, /`binding`[^\n]*changes nothing/);
  assert.match(orient, /escalated permissions/);
  assert.match(orient, /own terminal/);
  assert.match(orient, /Trust all and continue/);
  assert.match(orient, /"cache"[^\n]*(?:one calm line|at most one line)/);
  assert.match(orient, /no `reason`[^\n]*`altitude update`/);
  assert.match(orient, /support@learnaltitude\.com/);
  assert.match(orient, /`transport`[^\n]*never/);
});

test("paid-mode's post-completion refresh knows a non-network read cannot show the pointer moved", async () => {
  const paid = await readSkill("skills/next-lesson/references/paid-mode.md");

  // In a sandbox the emit spools and the re-read answers from the local copy,
  // so the pointer still shows the task just finished. That is a queued sync,
  // not a failure — and not a reason to emit twice or restart the task.
  assert.match(paid, /`"network"`[^\n]*pointer|pointer[^\n]*`"network"`/);
  assert.match(paid, /network_blocked/);
  assert.match(paid, /queued/);
  assert.match(paid, /never re-run the emit/i);
});

test("connect gets Codex through the sandbox and names the trust prompt that follows", async () => {
  const connect = await readSkill("skills/connect/SKILL.md");

  const codexLines = connect.split("\n").filter((line) => /sandbox/.test(line));
  assert.ok(codexLines.length > 0, "connect never mentions the sandbox");
  for (const line of codexLines) {
    assert.match(line, /Codex/, `sandbox guidance must be a labelled Codex aside: ${line}`);
  }
  assert.match(connect, /escalated permissions/);
  assert.match(connect, /justification/);
  assert.match(connect, /own terminal/);
  assert.match(connect, /Hooks need review/);
  assert.match(connect, /Trust all and continue/);
});

test("no envelope-reading skill tells a learner to reinstall", async () => {
  for (const relativePath of [
    "skills/begin/SKILL.md",
    "skills/next-lesson/SKILL.md",
    "skills/next-lesson/references/paid-mode.md",
    "skills/connect/SKILL.md",
  ]) {
    const skill = await readSkill(relativePath);
    // The failure mode this lane exists for: two learners reinstalled for
    // hours because a sandboxed read looked like a broken install.
    assert.doesNotMatch(skill, /re-?install/i, `${relativePath} suggests reinstalling`);
  }
});

test("README tells Codex learners the trust prompt keeps the journey copy fresh and returns after hook changes", async () => {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");
  const codex = sliceBetween(readme, "In Codex, run both lines", "The plugin also bundles");

  assert.match(codex, /Trust all and continue/);
  // Why trusting matters: Codex's default sandbox has no internet, so the
  // skills read the local copy the trusted hooks keep fresh.
  assert.match(codex, /sandbox/);
  // A hook's timeout is part of its trust hash, so this release re-prompts
  // every existing install once. Say so where the prompt is introduced.
  assert.match(codex, /again after a plugin update/);
});
