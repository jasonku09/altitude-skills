# The Knowledge Tree — copy/paste edition

Don't want to install the skill pack? These prompts walk the same steps from the video *"How I would learn to code in 2026 (If I could start over)"* — just copy, paste, and go. The skills are still the fuller experience (they carry the whole method so you don't have to), but these will take you most of the way.

Two things before you start:

1. **Work in one project folder.** Make an empty folder for your project and always start your coding agent inside it.
2. **The prompts save your progress to files** in a `learning/` folder — plain markdown you own. That's how a brand-new session picks up exactly where the last one left off. Don't skip those parts.

Works with Claude Code, Cursor, or Codex — any coding agent that can read and write files in your folder.

---

## Step 1 — Get set up with a coding agent

No prompt needed — this step is about setup. Get a subscription to a real coding agent (Claude Code, Cursor, or Codex — skip the vibe-coding app builders), install it, and learn just enough to get moving: context and context management, memory, model selection, plan mode, skills. An evening or two. If you want a guided tour, paste this:

```
I'm brand new to this coding agent. Give me a short, practical tour of just the
fundamentals I need to get started: what context is and how to manage it, memory,
model selection, plan mode, and skills. One at a time, with a tiny hands-on
exercise for each. Don't try to teach me everything — just enough to start.
```

## Step 2 — Pick your project (plant the tree)

Pick something you actually want to exist — a daily or weekly annoyance software could remove. If nothing comes to mind, have the AI interview you:

```
Hello — I'm looking for ideas for a project we can build together, as a way to
learn to code for real. My current experience with building software: [describe
honestly — "none", "a few spreadsheet formulas", "some HTML years ago"].
Interview me about my life — my work, my routines, my hobbies, anything I do
repeatedly that software could streamline. Ask one question at a time and wait
for my answer. Then pitch me 2–3 project ideas sized for my level: challenging
but not overwhelming, with something visible working early. Steer me away from
first-project traps like marketplaces, payments, real-time/multiplayer apps, or
anything that's only useful if other people show up for it.
```

## Step 3 — Define the MVP

```
Help me define the MVP for this project — the minimal version that is actually
usable, live on the internet, not a demo on my laptop. Split every feature we've
talked about into two lists: "In the MVP" (the smallest set that makes it
genuinely useful end to end) and "Parking lot (v2)" (everything else, written
down so it stops nagging me). Push back if I try to sneak extra features into
the MVP. Then create a file called learning/project.md recording who I am and my
experience level, the project idea, and both lists — every future session will
start by reading that file.
```

## Step 4 — Build the trunk

```
Read learning/project.md. What are the fundamental core components of this
project that I will need to learn and build in order to deploy it end to end?
Assume I know nothing about engineering or coding — define every term in plain
language the first time you use it. Don't go deep into the details: just lay out
the major pieces (roughly 5–9), with a high-level explanation of what each piece
is and why this project needs it. I want to follow engineering best practices
from day one, including source control. Once you've laid them out, check my
understanding: have me explain one or two of the pieces back in my own words.
Then add this trunk to learning/project.md.
```

Read through the result carefully. This is the trunk — the foundation every branch and leaf will attach to.

## Step 5 — Build the branches

```
Read learning/project.md. Help me come up with a plan to build this project with
learning as the primary objective — speed of delivery is not the goal here,
understanding is. First, walk me through every design decision this project
needs (language, frontend, backend, database, hosting) one at a time: recommend
the popular, common, boring choice — the one with the biggest community and the
most beginner documentation — name 1–2 alternatives with the real tradeoff in a
sentence or two, and check that I can say in my own words why the recommendation
fits before locking it in. Then structure the build as 5–9 sections, each ending
in a concrete deliverable I can see working, sequenced so each layer builds
naturally on the last — for a web app: a basic page rendering, then styling and
interactivity, then a simple local server, then APIs, then a database, then the
core features, then tests, then live deployment. Sections only — no task-level
breakdown yet. Save the locked decisions and the sectioned plan to
learning/plan.md. The goal: by the end of this project I should be able to
explain how my app works end to end.
```

## Step 6 — Define the leaves

```
Read learning/project.md and learning/plan.md. Create my living knowledge graph
at learning/knowledge-graph.md — the map of what I actually know. It gets
updated after every lesson, and it's the thing that decides what I get quizzed
on. Seed one entry per concept this project will teach me, spanning every level:
low-level (variables, loops, functions), structural (files talking to each
other, dependencies, package.json), engineering practice (git commits, testing,
environment variables), and AI-era practice (writing a good plan, reviewing a
diff, agent memory files). Each entry gets a status — seed (not yet taught) →
introduced (explained once) → practicing (used it with help) → understood
(explained in my own words and passed a quiz) — plus introduced/last-reviewed
dates and a one-line evidence field. Statuses only ever upgrade on evidence of
something I actually said or did, and I shouldn't be re-quizzed on concepts that
are understood and fresh. Anything we already walked through and checked while
planning starts as introduced, not seed. Also create learning/file-map.md — a
map of every file and folder in the project, one line each on what it is and why
it exists, marked known (I explained it in my own words), parked (honest
one-liner for now, deep dive scheduled), or generated (machine-made, never
edit). Nothing in my repo should ever be a mystery box. Start it with the
learning/ files themselves.
```

Steps 2–6 take an hour or two with the AI's help. Now the tire meets the road.

## Step 7 — Follow the plan, one task at a time

This is the prompt you'll reuse every session, for months. Take it slow — one task per sitting. The pause between lessons is part of the method.

```
Read learning/plan.md, learning/knowledge-graph.md, and learning/file-map.md,
then let's execute the next task — just that one task; I'll come back for the
next one. If the current section isn't broken into tasks yet, break this section
only into 3–7 small tasks, each ending in something I can see working, and add
them to the plan as checkboxes. If anything on disk isn't accounted for in the
file map, tour it or park it with an honest one-liner before we build. Then
teach as you go: before each chunk of code, explain in plain language what it
does and why it's there. Take really small steps — never dump a big block of
code on me. Leave 1–3 blanks marked "TODO(you)" in the actual file for me to
fill in my editor, then read what I really saved and respond to my real code.
Before running any new code or command, ask me to predict what will happen — and
when my prediction is wrong, slow down and dig into the gap, because that's
where the learning is. When a command creates new files (scaffolds, installers),
walk me through the 4–6 that matter in plain language and park the rest in the
file map — never build on files I can't account for. Quiz me on graph concepts
as they come up, but never re-quiz what's marked understood and fresh. At the
end: update learning/knowledge-graph.md (statuses upgrade only on evidence of
what I actually did) and learning/file-map.md (files I authored count as known),
check the task off in learning/plan.md, give me a one-line recap of the new
leaves on my tree, and stop there.
```

---

## Extras — for when real life happens

**When you broke something.** You will. It's a gift, not a detour:

```
I changed something on my own and now it's broken. Before you fix anything, show
me how to see what I changed — git status and git diff, read together in plain
language — and ask me for one prediction about why it broke before revealing the
cause. If my change shows a reasonable instinct, help me finish what I was
trying to do rather than undoing my work. Let me type the fix. Afterwards, add
what this taught me to learning/knowledge-graph.md and suggest committing the
repair.
```

**Weekly review.** Memory fades on a schedule; review on one too:

```
Read learning/knowledge-graph.md. Quiz me on 3–5 concepts I haven't reviewed in
over a week, one question at a time. Update last-reviewed dates on passes. If I
struggle, downgrade understood to practicing — no shame, forgetting is how
memory works, that's why we review — and give me a 2–3 sentence refresher. End
with one repo-tour question from learning/file-map.md: pick a file and ask me
what it's for.
```

**The one mistake.** The pull to say "just write the whole thing" is real — the AI *could* generate it all in a minute. That's passenger mode, and it's the one mistake that makes learning with AI worse than tutorials ever were. When you feel it, paste this instead of giving in:

```
I'm feeling the pull to just have you write everything for me. Remind me in one
paragraph what I'd be trading away, then let's do this one task with fewer
check-ins — but not zero. Understanding checks scale down; they don't turn off.
```

---

**Never ship a line of code you can't explain.**

Want the full experience instead of carrying these prompts around? The [skill pack](README.md) bakes all of this in — install once, then it's just `/start-project`, `/plan-journey`, and `/next-lesson`.
