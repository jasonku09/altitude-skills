# The Knowledge Tree — learn to code by building (free skill pack)

Three Claude Code skills that implement the learning loop from the video *"How I would learn to code in 2026 (If I could start over)"*: pick a real project, plan it with learning as the primary objective, then build it one small, fully-understood step at a time.

The metaphor: concepts learned in isolation are loose leaves — hard to sort, easy to lose. A real project is a tree. The **trunk** is the project's core components, the **branches** are the build plan, and the **leaves** are every concept you learn along the way, attached where they belong.

## The three skills

| Skill | What it does | Video steps |
|---|---|---|
| `/start-project` | Interviews you for a project idea sized to your experience, defines the MVP, maps the trunk | 2–4 |
| `/plan-journey` | Walks every design decision with you (and checks you understand it), builds the sectioned learning plan, seeds your knowledge graph | 5–6 |
| `/next-lesson` | Executes one task: small code steps, fill-in-the-blank placeholders, predict-before-run, quizzes driven by your knowledge graph, graph update at the end | 7 |

Rather not install anything? [PROMPTS.md](PROMPTS.md) has the copy/paste version of every step.

All state lives in a `learning/` folder in your project — plain markdown you own:

- `learning/project.md` — your project, MVP, and trunk
- `learning/plan.md` — the sectioned plan with locked decisions
- `learning/knowledge-graph.md` — the living map of what you actually know
- `learning/file-map.md` — why every file and folder in your repo exists

## Install

**As a plugin** (recommended — updates with the repo):

```
/plugin marketplace add jasonku09/altitude-skills
/plugin install knowledge-tree@knowledge-tree
```

**Or copy the skills directly:**

```bash
git clone https://github.com/jasonku09/altitude-skills.git
cp -r altitude-skills/skills/* ~/.claude/skills/
```

Either way: open a new Claude Code session in an empty folder and run `/start-project`. That's it — no hooks, no config, no setup.

## Ground rules baked into the skills

- One small step at a time. The pause between lessons is the pedagogy.
- Predict before you run. A wrong prediction is the best teacher you'll meet.
- Quizzes come from *your* graph — you're never re-quizzed on what you've already demonstrated (and still remember).
- No mystery boxes: every file in your repo is either explained or explicitly parked. When a scaffold dumps fifteen files into your folder, you get the tour before you build on them.
- **Never ship a single line of code you cannot explain.**

## What these skills can't do

Skills are instructions — they tell the agent what to do. They can't *remember what you know*. The graph file helps, but nothing here schedules a review for the week you're about to forget something, notices you rubber-stamping diffs, or adapts quiz difficulty to your actual track record. You are your own coach, and the honest truth is that's the hard part.

I'm building an app that is that coach — same loop, with real mastery tracking, spaced review, and checkpoint gates that don't rely on your willpower. If you'd rather not be your own coach: **[waitlist link — TBD]**.

## License

MIT. Fork it, remix it, teach with it. PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
