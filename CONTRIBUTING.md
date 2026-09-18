# Contributing

The skills are plain markdown — if you can write clearly, you can contribute. The bar for every change: **would this help a complete beginner understand what they're building?**

## Good first contributions

- **New project archetypes** — worked "trunk" examples for common first projects (habit tracker, price-watcher, portfolio site, Discord bot) that `start-project` can point to for sizing.
- **Lesson improvements** — places where `next-lesson` moves too fast, quizzes that were too easy or unfair, better predict-before-run moments. Real session transcripts (with your permission) are gold.
- **Install lanes** — you got the skills working in an agent not listed in the README? PR the instructions and we'll add it to the compatibility table.
- **Plain-language glosses** — any technical term a skill uses without defining it for a first-time learner is a bug. File it or fix it.

## Ground rules for changes

- Keep the voice: patient senior engineer, plain language, no hype.
- The loop is not negotiable: small steps, predict-before-run, quiz-before-moving-on, graph update at the end. Two things are exempt, and both are owned elsewhere: a concept the learner already knows — `next-lesson`'s concept roles and prior-knowledge rule govern that — and a bound journey's server-authored task requirements, which override the hands-on defaults for that lesson (`skills/next-lesson/references/paid-mode.md`; the client versions that carry them are recorded in [WORKSHOP-COMPATIBILITY.md](WORKSHOP-COMPATIBILITY.md)). Changes that speed things up by skipping understanding will be declined.
- One skill = one job. Cross-cutting features probably belong in an issue discussion first.

## How

Open an issue describing the change, or just PR it if it's small. Everything is MIT — by contributing you agree your contribution is too.
