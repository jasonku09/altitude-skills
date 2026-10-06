import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

/**
 * Plugin 0.8.1 (2026-10-06): a prose-only patch on 0.8.0. Begin's no-journey
 * route now sends the learner to the Journey tab's "Build my journey" button.
 * Learners only receive an update when the manifest version moves, so every
 * host manifest moves together. No CLI, server, or envelope requirement is
 * added and no floor moves.
 */

test("0.8.1: every host manifest carries the release version", () => {
  for (const path of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json"]) {
    assert.equal(JSON.parse(read(path)).version, "0.8.1", path);
  }
});

test("0.8.1: the paid-mode release note names the patch and moves no floor", () => {
  const paid = read("skills/next-lesson/references/paid-mode.md");
  assert.ok(paid.startsWith("<!-- Release note (plugin 0.8.1)"), "the release note leads the file under the new version");
  const note = flat(paid.slice(0, paid.indexOf("-->")));
  assert.match(note, /0\.8\.1 is a prose-only patch on 0\.8\.0 with no new CLI or server requirement/);
  assert.match(note, /CLI 0\.8\.1 \/ plugin 0\.5\.8/, "the floor is unchanged");
});

test("compatibility notes: plugin 0.8.1 adds no requirement and inherits 0.8.0's publication order", () => {
  const compat = flat(read("WORKSHOP-COMPATIBILITY.md"));
  assert.match(compat, /Plugin 0\.8\.1 is a prose-only patch on 0\.8\.0/);
  assert.match(compat, /Plugin 0\.8\.1 [^]*adds no CLI, server, or envelope requirement and moves no floor/);
  assert.match(compat, /0\.8\.1 back to 0\.8\.0, 0\.8\.0 back to 0\.7\.0, 0\.7\.0 back to 0\.6\.1/, "the rollback chain");
});
