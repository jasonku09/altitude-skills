# Altitude — learn to code by building

Five Agent skills that turn an AI coding agent into a tutor instead of a ghostwriter: begin a journey planned with Altitude, or use the standalone free method to pick (or adopt) a real project and plan it locally — then build it one small, fully-understood step at a time.

## Where it takes you

Wherever you're starting from, the destination is the same — a real product you can explain line by line:

- **Nothing yet** → from an empty folder to a deployed MVP you built yourself, understanding every line as it's written.
- **A project you can't fully explain** (an AI wrote it, or a tutorial carried you) → to a deployed MVP, plus ownership of what's already there: the plan keeps building your app forward while you reclaim the code you didn't write, piece by piece.
- **A shipped MVP** → keep shipping new features with a tutor at your side — each one placed in the plan, built in small steps, and understood before it goes out.

The metaphor: concepts learned in isolation are loose leaves — hard to sort, easy to lose. A real project is a tree. The **trunk** is the project's core components, the **branches** are the build plan, and the **leaves** are every concept you learn along the way, attached where they belong.

## The five skills

| Skill | What it does |
|---|---|
| `/begin` | Starts a journey planned on the Altitude web app, binds it to a local workshop, writes its plan locally, and rolls into the first task |
| `/start-project` | Interviews you for a project idea sized to your experience, defines the MVP, maps the trunk |
| `/plan-journey` | Walks every design decision with you (and checks you understand it), builds the sectioned learning plan, seeds your knowledge graph |
| `/next-lesson` | Executes one task in either mode: local plans keep evidence in your knowledge graph; bound subscriber journeys sync progress and mastery with Altitude |
| `/adopt-project` | Already have a project? Honest triage, an understanding inventory, a file map with no mystery boxes, and a forward plan with reclaim tasks — replaces the first two skills, feeds the same `/next-lesson` loop |

Rather not install anything? [PROMPTS.md](PROMPTS.md) has the copy/paste version of the standalone free method.

## Already started a project?

If you've got an existing codebase — especially one an AI wrote for you that you can't fully explain — don't start over. Run `/adopt-project` in that folder. It triages the project honestly (adopt it, trim it first, or — rarely — rebuild with your old repo as the spec), inventories what you actually understand (an inventory, not an exam), maps every file so nothing on disk is a mystery box, and writes a plan that keeps building your app forward while you reclaim the code you already have, piece by piece. From there, `/next-lesson` works exactly the same.

In the standalone free method, all state lives in a `learning/` folder in your project — plain markdown you own:

- `learning/project.md` — your project, MVP, and trunk
- `learning/plan.md` — the sectioned plan with locked decisions
- `learning/knowledge-graph.md` — the living map of what you actually know
- `learning/file-map.md` — why every file and folder in your repo exists

The free method is complete and works standalone: `/start-project` + `/plan-journey` (or `/adopt-project`), then `/next-lesson`. An Altitude subscription adds a journey planned on the web, the server-side learning map, scheduled reviews, and progression gates. `/begin` materializes that journey as a readable local `learning/plan.md`; `/next-lesson` refreshes it and syncs completed tasks while you remain entitled. If a subscription pauses, the local plan remains yours and lessons continue in free mode with local knowledge-graph evidence.

## Install

**As a plugin** (recommended — it updates with the repo). Open a terminal and run `claude` to start Claude Code:

```bash
claude
```

Then type these two lines inside that session:

```
/plugin marketplace add jasonku09/altitude-skills
/plugin install altitude@altitude
```

`/plugin` exists only in the terminal app. Pasted into an IDE extension's chat panel it answers "plugin isn't available in this environment" — that's the wrong window, not a broken install. (The VS Code and JetBrains extensions are documented to have their own graphical `/plugins` manager — note the plural — which should also get you there; the terminal route above is the one we test.)

**When the install asks where to put the plugin, choose the user scope** — the "for yourself, across all projects" option. Your first lesson makes a brand-new project folder, and a project- or local-scoped install writes into the folder you're standing in right now, so it would stay behind exactly when the skills are needed. If the install summary asks you to run `/reload-plugins`, run it; newer versions activate the plugin in place and tell you "Plugin is now active" instead.

In Codex, run both lines in your terminal:

```bash
codex plugin marketplace add jasonku09/altitude-skills
codex plugin add altitude@altitude
```

The first `codex` launch after installing shows a one-time "Hooks need review" prompt — choose **Trust all and continue** to enable Altitude's session hooks. (They stay dormant outside bound journey projects; see below.)

The plugin also bundles Altitude's session hooks (`hooks/`). They stay fully dormant unless you're working inside a project bound to a subscribed journey (`altitude bind` / `/altitude:begin`) — no events, gates, or context injection anywhere else. With a bound project, they capture session evidence for your journey and run the plan/diff/retro gates. Gates fail open: a crashed hook never blocks your work. The `/altitude:connect` and `/altitude:status` skills manage the link.

Once it's installed: for the free standalone method, open a new Claude Code session in an empty folder and run `/start-project`. If you planned a subscribed journey on Altitude, install its CLI, connect with `/altitude:connect`, and run `/altitude:begin` instead.

**Or copy the skills directly** — for the free standalone method only (Claude Code):

```bash
git clone https://github.com/jasonku09/altitude-skills.git
cp -r altitude-skills/skills/* ~/.claude/skills/
```

That copies the skills and nothing else: **no session hooks**, and no auto-update (re-run the clone + copy for new versions). The free method needs neither, so this route is complete for `/start-project` → `/plan-journey` → `/next-lesson`. **With an Altitude subscription, install the plugin instead.** The hooks are what capture session evidence and run the gates, they live outside `skills/`, and a copied install has no `/altitude:` commands to connect or begin with — and nothing would tell you: gates fail open, so the only symptom is a learning map that never fills.

**Using Cursor instead?** These skills use the open [Agent Skills](https://agentskills.io) format, which Cursor supports — copy them in for the free standalone method:

```bash
git clone https://github.com/jasonku09/altitude-skills.git
cp -r altitude-skills/skills/* ~/.cursor/skills/   # pick via / in Agent chat, or automatic
```

Same caveats as the copy above, plus one more: Cursor has no Altitude hooks at all, so a subscribed journey needs Claude Code or Codex. And [PROMPTS.md](PROMPTS.md) works with any agent at all, no install needed.

## How to use it

- **Starting from zero?** Make an empty folder, open Claude Code in it, run `/start-project`. When it's done, run `/plan-journey`. One sitting each.
- **Starting a journey planned on Altitude?** Connect your account, run `/begin`, and follow the folder and binding steps. It takes you straight into the first server-planned task.
- **Already have a codebase?** Open Claude Code in that folder and run `/adopt-project` instead — it replaces both of the above.
- **From then on, it's `/next-lesson`, over and over.** That's the whole loop in both free and paid modes, for months. One lesson is one small task — expect 30–60 minutes, 3–5 sittings a week.
- **One lesson per sitting — really.** Don't binge five in a night. The gap between sessions is where memory consolidates, and it's exactly what the next lesson's review quiz tests. Hungry for more is the perfect place to stop.
- **Start each sitting in a fresh session.** In free mode, the tutor picks up from `learning/`; in paid mode, it refreshes the bound journey first. Either route restores exactly where you left off.
- **Do the typing yourself.** When the tutor dictates a command, you run it in your terminal. When it leaves `TODO(you)` blanks, fill them in your editor and hit save — it's watching the file, not the chat.
- **Answer quizzes from your head, in your own words.** Don't look it up first. A wrong answer isn't a failure — it's the data that decides what gets taught next.
- **Life happens — bring it to the lesson.** Broke something on your own? Say so; that's a lesson, and a good one. Want a feature that isn't in the plan? Ask; the plan is a living backlog, not a contract.
- **Read your `learning/` files anytime; let the lessons write them.** In free mode, graph statuses move only on demonstrated evidence. In paid mode, `plan.md` is a readable projection of the server journey, so park ideas in a lesson or edit the journey on the web.

## Ground rules baked into the skills

- One small step at a time. The pause between lessons is the pedagogy.
- Predict before you run. A wrong prediction is the best teacher you'll meet.
- Quizzes come from your evidence — the local graph in free mode or your server-side learning map in paid mode — so demonstrated, still-fresh concepts do not become busywork.
- No mystery boxes: every file in your repo is either explained or explicitly parked. When a scaffold dumps fifteen files into your folder, you get the tour before you build on them.
- **Never ship a single line of code you cannot explain.**

## The free method's one limitation

In the standalone method, the `learning/` folder is the agent's memory of what you know: every session reads it, quizzes come from it, and nothing changes without evidence. A local skill cannot **start a session on its own**, so the scheduling loop is you.

An Altitude subscription adds that server loop: the journey, learning map, scheduled reviews, and progression gates live with your account while the readable plan stays in your project. The teaching method itself remains available here for free.

## License

MIT. Fork it, remix it, teach with it. PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
