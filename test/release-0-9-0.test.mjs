import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

/**
 * Plugin 0.9.0 (2026-10-06): the first release carrying the native GitHub
 * Copilot plugin (`.plugin/plugin.json` + `.github/plugin/marketplace.json`).
 * Learners only receive an update when the manifest version moves, so every
 * host manifest moves together. Copilot needs CLI 0.12.0 (`--agent copilot`,
 * `hook-context`, `question declare`) and the Copilot-capable server; the
 * existing hosts gain no requirement and no floor moves.
 */

const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", ".plugin/plugin.json"];

test("0.9.0: every host manifest, Copilot included, carries the release version", () => {
  for (const path of MANIFESTS) assert.equal(JSON.parse(read(path)).version, "0.9.0", path);
  const market = JSON.parse(read(".github/plugin/marketplace.json"));
  assert.deepEqual(market.plugins.map((plugin) => plugin.version), ["0.9.0"], "the Copilot marketplace entry");
});

test("0.9.0: the paid-mode release note names Copilot's CLI need and moves no floor", () => {
  const paid = read("skills/next-lesson/references/paid-mode.md");
  assert.ok(paid.startsWith("<!-- Release note (plugin 0.9.0)"), "the release note leads the file under the new version");
  const note = flat(paid.slice(0, paid.indexOf("-->")));
  assert.match(note, /0\.9\.0 adds the GitHub Copilot plugin, which needs CLI 0\.12\.0; Claude Code, Codex, and Cursor gain no new CLI or server requirement/);
  assert.match(note, /CLI 0\.8\.1 \/ plugin 0\.5\.8/, "the floor is unchanged");
});

test("compatibility notes: plugin 0.9.0 names Copilot's publication order and the rollback chain", () => {
  const compat = flat(read("WORKSHOP-COMPATIBILITY.md"));
  assert.match(compat, /Plugin 0\.9\.0 adds the native GitHub Copilot plugin/);
  assert.match(compat, /Publish CLI 0\.12\.0 and deploy the Copilot-capable server before plugin 0\.9\.0/);
  assert.match(compat, /0\.9\.0 back to 0\.8\.1, 0\.8\.1 back to 0\.8\.0, 0\.8\.0 back to 0\.7\.0/, "the rollback chain");
  assert.doesNotMatch(compat, /unchanged 0\.7\.0 version is not a Copilot publication claim/, "the stale development note is gone");
});

test("Copilot support notes state the released manifest version and its CLI requirement", () => {
  const support = flat(read("COPILOT-SUPPORT.md"));
  assert.doesNotMatch(support, /manifest still says 0\.7\.0/);
  assert.match(support, /0\.9\.0[^.]*first plugin release that includes Copilot/);
  assert.match(support, /Altitude CLI 0\.12\.0 or later/);
});
