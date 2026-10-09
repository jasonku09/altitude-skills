import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

/**
 * Plugin 0.10.0: the lesson page bootstrap (test/lesson-page-bootstrap.test.mjs).
 * The rule runs `altitude lesson open`, which needs the page CLI (0.13.0) and a
 * server that serves `/api/lesson-page/bundle`. On an older CLI or server the task
 * read carries no available `lesson_page`, so the lesson runs in the terminal
 * unchanged. Learners only receive an update when the manifest version moves, so
 * every host manifest moves together. No floor moves.
 */

const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", ".plugin/plugin.json"];

test("0.10.0: every host manifest carries the release version", () => {
  for (const path of MANIFESTS) assert.equal(JSON.parse(read(path)).version, "0.10.0", path);
  const market = JSON.parse(read(".github/plugin/marketplace.json"));
  assert.deepEqual(market.plugins.map((plugin) => plugin.version), ["0.10.0"], "the Copilot marketplace entry");
});

test("0.10.0: the paid-mode release note names the page CLI and server and moves no floor", () => {
  const paid = read("skills/next-lesson/references/paid-mode.md");
  assert.ok(paid.startsWith("<!-- Release note (plugin 0.10.0)"), "the release note leads the file under the new version");
  const note = flat(paid.slice(0, paid.indexOf("-->")));
  assert.match(note, /0\.10\.0 adds the lesson page bootstrap: `altitude lesson open` needs CLI 0\.13\.0 and the server that serves `\/api\/lesson-page\/bundle`/);
  assert.match(note, /older CLIs and servers send no available `lesson_page`, so the lesson stays in the terminal unchanged/);
  assert.match(note, /CLI 0\.8\.1 \/ plugin 0\.5\.8/, "the floor is unchanged");
});

test("compatibility notes: plugin 0.10.0 names the page's publication order and the rollback chain", () => {
  const compat = flat(read("WORKSHOP-COMPATIBILITY.md"));
  assert.match(compat, /Plugin 0\.10\.0 adds the lesson page bootstrap/);
  assert.match(compat, /Deploy the server that serves `\/api\/lesson-page\/bundle` and publish CLI 0\.13\.0 before plugin 0\.10\.0/);
  assert.match(compat, /0\.10\.0 back to 0\.9\.0, 0\.9\.0 back to 0\.8\.1/, "the rollback chain");
});

test("README: one line says 0.10.0 opens paid lessons on the page and older setups keep the terminal", () => {
  const readme = flat(read("README.md"));
  assert.match(readme, /Plugin 0\.10\.0 can open a subscribed journey's lessons on a lesson page in your browser; it needs CLI 0\.13\.0/);
});
