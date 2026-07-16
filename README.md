# Altitude — learn to code by building (free skill pack)

Four Claude Code skills that turn an AI coding agent into a tutor instead of a ghostwriter: pick a real project (or adopt one you've already built), plan it with learning as the primary objective, then build it one small, fully-understood step at a time.

The metaphor: concepts learned in isolation are loose leaves — hard to sort, easy to lose. A real project is a tree. The **trunk** is the project's core components, the **branches** are the build plan, and the **leaves** are every concept you learn along the way, attached where they belong.

## The four skills

| Skill | What it does |
|---|---|
| `/start-project` | Interviews you for a project idea sized to your experience, defines the MVP, maps the trunk |
| `/plan-journey` | Walks every design decision with you (and checks you understand it), builds the sectioned learning plan, seeds your knowledge graph |
| `/next-lesson` | Executes one task: small code steps, fill-in-the-blank placeholders, predict-before-run, quizzes driven by your knowledge graph, graph update at the end |
| `/adopt-project` | Already have a project? Honest triage, an understanding inventory, a file map with no mystery boxes, and a forward plan with reclaim tasks — replaces the first two skills, feeds the same `/next-lesson` loop |

Rather not install anything? [PROMPTS.md](PROMPTS.md) has the copy/paste version of every step.

## Already started a project?

If you've got an existing codebase — especially one an AI wrote for you that you can't fully explain — don't start over. Run `/adopt-project` in that folder. It triages the project honestly (adopt it, trim it first, or — rarely — rebuild with your old repo as the spec), inventories what you actually understand (an inventory, not an exam), maps every file so nothing on disk is a mystery box, and writes a plan that keeps building your app forward while you reclaim the code you already have, piece by piece. From there, `/next-lesson` works exactly the same.

All state lives in a `learning/` folder in your project — plain markdown you own:

- `learning/project.md` — your project, MVP, and trunk
- `learning/plan.md` — the sectioned plan with locked decisions
- `learning/knowledge-graph.md` — the living map of what you actually know
- `learning/file-map.md` — why every file and folder in your repo exists

## Install

**As a plugin** (recommended — updates with the repo):

```
/plugin marketplace add jasonku09/altitude-skills
/plugin install altitude@altitude
```

**Or copy the skills directly:**

```bash
git clone https://github.com/jasonku09/altitude-skills.git
cp -r altitude-skills/skills/* ~/.claude/skills/
```

Either way: open a new Claude Code session in an empty folder and run `/start-project`. That's it — no hooks, no config, no setup.

**Using Codex or Cursor instead?** These skills use the open [Agent Skills](https://agentskills.io) format, which both support — only the target folder changes:

```bash
git clone https://github.com/jasonku09/altitude-skills.git
cp -r altitude-skills/skills/* ~/.codex/skills/    # Codex (invoke with $start-project, or /skills to list)
cp -r altitude-skills/skills/* ~/.cursor/skills/   # Cursor (pick via / in Agent chat, or automatic)
```

And [PROMPTS.md](PROMPTS.md) works with any agent at all, no install needed.

## How to use it

- **Starting from zero?** Make an empty folder, open Claude Code in it, run `/start-project`. When it's done, run `/plan-journey`. One sitting each.
- **Already have a codebase?** Open Claude Code in that folder and run `/adopt-project` instead — it replaces both of the above.
- **From then on, it's `/next-lesson`, over and over.** That's the whole loop, for months. One lesson is one small task — expect 30–60 minutes, 3–5 sittings a week.
- **One lesson per sitting — really.** Don't binge five in a night. The gap between sessions is where memory consolidates, and it's exactly what the next lesson's review quiz tests. Hungry for more is the perfect place to stop.
- **Start each sitting in a fresh session.** Everything the tutor needs to remember lives in `learning/` — a brand-new session picks up exactly where the last one left off.
- **Do the typing yourself.** When the tutor dictates a command, you run it in your terminal. When it leaves `TODO(you)` blanks, fill them in your editor and hit save — it's watching the file, not the chat.
- **Answer quizzes from your head, in your own words.** Don't look it up first. A wrong answer isn't a failure — it's the data that decides what gets taught next.
- **Life happens — bring it to the lesson.** Broke something on your own? Say so; that's a lesson, and a good one. Want a feature that isn't in the plan? Ask; the plan is a living backlog, not a contract.
- **Read your `learning/` files anytime; let the lessons write them.** Graph statuses only move on demonstrated evidence — promoting yourself to `understood` by hand just cheats the quizzes that keep you honest.

## Ground rules baked into the skills

- One small step at a time. The pause between lessons is the pedagogy.
- Predict before you run. A wrong prediction is the best teacher you'll meet.
- Quizzes come from *your* graph — you're never re-quizzed on what you've already demonstrated (and still remember).
- No mystery boxes: every file in your repo is either explained or explicitly parked. When a scaffold dumps fifteen files into your folder, you get the tour before you build on them.
- **Never ship a single line of code you cannot explain.**

## The one thing these skills can't do

The `learning/` folder is the agent's memory of what you know: every session reads it, quizzes come from it, and nothing in it changes without evidence. What no skill can do is **start a session on its own**. Spaced repetition works because reviews arrive on the forgetting curve's schedule — right when a concept is about to fade — and these skills can only review you when you show up. The scheduling loop is you.

I'm building an app that closes that loop: same method, but the review schedule runs for you — it notices what's about to fade and comes to you. If you'd rather not be your own scheduler, watch this repo — the waitlist link lands here soon.

## License

MIT. Fork it, remix it, teach with it. PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
