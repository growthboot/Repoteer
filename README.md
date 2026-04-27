# Repoteer

**Repoteer — See everything changing across your projects.**

Repoteer is a CLI for navigating code changes across multiple projects and repositories.

It gives you a real-time overview of where changes are happening, and lets you zoom from project → repo → diff instantly.

Repoteer helps you answer:

* Which projects are active right now?
* Where are the largest changes?
* What should I review first?
* What tools, commands, and context are tied to this project?

Repoteer is not a repo-level Git UI like lazygit. It sits above your repositories and helps you move across projects.

---

## Core Features

* Track multiple local projects
* Scan projects for Git repositories automatically
* Show change volume (+ / - lines) across all projects
* Drill down from project → repo → diff
* Fast keyboard-driven navigation

---

## Optional Features

* Generate AI summaries from diffs
* Generate commit message suggestions
* Copy diffs for external tools (ChatGPT, etc.)
* Save bookmarks related to projects
* Save commands related to projects

AI is optional. Repoteer is fully usable without it.

---

## Why Repoteer exists

You don’t have one repo anymore.

You have multiple projects, each with multiple repos, all changing at the same time.

There’s no good way to answer:

* What changed today across all my projects?
* Which project is actually active?
* Where should I look first?
* What needs to be committed right now?

You’re missing a clear, project-level view.

Repoteer fixes that.

Open it, and you immediately see where changes are happening across your projects, and can drill straight into what matters.

---

## Install

```bash
# coming soon
```

---

## Usage

```bash
repoteer
```

---

## Philosophy

Repoteer is:

* Fast
* Local-only
* Project-oriented
* Focused on project-level git awareness

Repoteer is not:

* A repo-level Git UI (like lazygit)
* A batch automation tool
* A full Git management interface

Another way to look at it:
lazygit → operate inside a repo
Repoteer → decide which project / repo to even open

---

## License

MIT
