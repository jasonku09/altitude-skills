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
 * every host manifest moves together. The server raises the lesson runtime floor
 * after CLI 0.13.0 and plugin 0.10.0 are published.
 */

const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", ".plugin/plugin.json"];

test("0.10.0: every host manifest carries the release version", () => {
  for (const path of MANIFESTS) assert.equal(JSON.parse(read(path)).version, "0.10.2", path);
  const market = JSON.parse(read(".github/plugin/marketplace.json"));
  assert.deepEqual(market.plugins.map((plugin) => plugin.version), ["0.10.2"], "the Copilot marketplace entry");
});

test("0.10.0: the next-lesson release note names the page CLI, server, and subsequent floor raise", () => {
  const skill = read("skills/next-lesson/SKILL.md");
  const body = skill.slice(skill.indexOf("\n---\n", 3) + 5).replace(/^\n+/, "");
  assert.ok(skill.startsWith("---\n") && body.startsWith("<!-- Release note (plugin 0.10.0)"), "the release note leads next-lesson's SKILL.md, right after its frontmatter, under the new version");
  const note = flat(body.slice(0, body.indexOf("-->")));
  assert.match(note, /0\.10\.0 adds the lesson page bootstrap: `altitude lesson open` needs CLI 0\.13\.0 and the server that serves `\/api\/lesson-page\/bundle`/);
  assert.match(note, /older CLIs and servers send no available `lesson_page`, so the lesson stays in the terminal unchanged/);
  assert.match(note, /The server raises the enforced runtime floor to CLI 0\.13\.0 \/ plugin 0\.10\.0 after 0\.10\.0 is published \(it was CLI 0\.8\.1 \/ plugin 0\.5\.8\)/, "the server raises the floor after publication");
});

test("compatibility notes: plugin 0.10.0 names the page's publication order and the rollback chain", () => {
  const compat = flat(read("WORKSHOP-COMPATIBILITY.md"));
  assert.match(compat, /Plugin 0\.10\.0 adds the lesson page bootstrap/);
  assert.match(compat, /Deploy the server that serves `\/api\/lesson-page\/bundle` and publish CLI 0\.13\.0 before plugin 0\.10\.0/);
  assert.match(compat, /Publishing 0\.10\.0 itself moves no floor: older CLIs strip `lesson_page` and older servers never send it/);
  assert.match(compat, /Once CLI 0\.13\.0 and plugin 0\.10\.0 are both published, the server raises its lesson runtime floor \(`minimum_cli_version` \/ `minimum_plugin_version`\) to CLI 0\.13\.0 \/ plugin 0\.10\.0, so older installs get the server's update message at their next lesson until they update/);
  assert.match(compat, /before plugin 0\.10\.0, then raise the server's lesson runtime floor/);
  assert.match(compat, /0\.10\.0 back to 0\.9\.0, 0\.9\.0 back to 0\.8\.1/, "the rollback chain");
});

test("README: one line says 0.10.0 opens paid lessons on the page and a page that can't open keeps the terminal", () => {
  const readme = flat(read("README.md"));
  assert.match(readme, /Plugin 0\.10\.0 opens paid lessons on a web lesson page in your browser and needs CLI 0\.13\.0\. Where a page can't open \(over SSH, for example\), the lesson stays in the terminal\./);
  assert.doesNotMatch(readme, /accounts in the beta/);
});
