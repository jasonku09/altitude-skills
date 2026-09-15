# next-lesson — free mode

Binding rules for sessions where Step 1 chose **free mode** — and for **paused subscriptions**, which run as free mode against the existing plan. Read this file in full right after choosing the mode, before orienting further. Nothing here repeats SKILL.md — both apply, and the step headings below name where each rule slots into SKILL.md's flow.

## Paused subscription

Give one honest notice in this session: their `plan.md` survives and remains theirs, while the server map, reviews, and gates are paused. Then use free mode against the existing plan. Resume local knowledge-graph maintenance; if `learning/knowledge-graph.md` does not exist, initialize it in the existing free-mode format. Seed only concepts the plan names explicitly, and add others as lessons encounter them—never reconstruct mastery or evidence from server state you cannot see.

## Step 1 — Orient (free)

While orienting, also read `learning/knowledge-graph.md` — mastery lives there, and Step 2 and Step 3 both draw on it. While reconciling the file map, depth lives in the knowledge graph, so file-map entries can link to concepts with `→ [[concept-name]]`.

If the current section has no task breakdown yet, break **this section only** into 3–7 small tasks (each completable in one sitting, each ending in something observable) and append them under the section in `plan.md` as checkboxes. Do not break down future sections.

## Step 2 — Review one stale leaf (free)

Scan the graph for concepts with status `practicing` or `understood` whose `last-reviewed` is more than ~7 days old. If any exist, pick **one** — prefer one relevant to today's task — and ask a single review question before starting.

- Pass → update `last-reviewed`.
- Struggle → downgrade `understood` to `practicing`, note it in `evidence`, and give a 2–3 sentence refresher. No shame, no lecture — forgetting is how memory works; that's why we review.

Every few lessons, swap the concept question for a repo-tour question from `learning/file-map.md` — "quick tour check: what's `package-lock.json` for?" This is the one place a plain "what is it for?" is right: the tour was lessons ago, so recalling it is retrieval rather than reading back. Pass → refresh its date. Struggle → back to `parked`, with a plain-language refresher.

## Step 3 — When prior knowledge surfaces (free)

In free mode, give the same immediate accommodation — the concept joins this session's `exercise` set on their word alone — and record the concept as `understood` in `learning/knowledge-graph.md` with the evidence note `self-reported prior knowledge`. There is no account mutation or map handoff in standalone free mode.

## Step 4 — Close the loop (free)

Update `learning/knowledge-graph.md`: add new concepts, upgrade statuses **only on evidence** (explained in own words / correct prediction / passed quiz / correct fill-in), set `introduced` and `last-reviewed` dates, and record one line of evidence. Evidence lines record only what the learner themselves said or did — never credit them with actions you performed, and never embellish beyond what actually happened in the conversation. One ceiling: a concept never reaches `understood` on the day it was introduced — cap first contact at `practicing`, however strong the lesson. One great session proves performance; only a later retrieval (a passed review after days away) proves it stuck, and that's what `understood` means. The sole exception is prior knowledge handled under Step 3's free-mode analog: set it directly to `understood` with the exact evidence note `self-reported prior knowledge`; this self-report exception applies to no other concept.

A gap filled from a rung-3 reveal is not a correct fill-in: it moves no status and earns no evidence line for that concept this session, and you never say that to the learner — asking for the answer is legitimate, not a mark against them. The forward prediction check that follows the reveal is a genuine check and counts on its honest outcome like any other.

Mark the task done in `plan.md`.

## Plan changes (free)

The plan-edit moves in SKILL.md's "When they want something not in the plan" apply directly: update `plan.md` yourself so the plan stays the truth.
