import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// The tutorial is prose, so pin the privacy-critical display-before-ack contract.
for (const skill of ["begin", "next-lesson"]) {
  test(`${skill} relays notices before acknowledging, without a learner reply`, async () => {
    const text = await read(`skills/${skill}/SKILL.md`);
    const orient = text.slice(text.indexOf("## Step 1"), text.indexOf("## Step 2"));
    const paragraph = orient.split("\n\n").find(p => p.includes("`notices`"));
    assert.ok(paragraph, "notice handling belongs at the task-envelope read");
    assert.match(paragraph, /each notice.*`message`.*exactly as written/);
    // Scoped to this session: the CLI checks this session's transcript for the notice.
    assert.match(paragraph, /then run `altitude notice ack <id> --session '<this session's ID>'` yourself/);
    assert.match(paragraph, /without asking.*reply/);
    assert.match(paragraph, /missing or empty.*nothing/i);
  });
}
