# Repoteer

**Project-level Git change navigation for people working across multiple repos.**

Repoteer is a local-first terminal app that shows what is changing across your projects, then lets you drill from project to repo to file diff without opening every repository one by one.

It is built for developers who keep several projects active at once and need a fast answer to: **where should I look first?**

## Features

- Track multiple local projects from one CLI
- Automatically discover Git repositories inside each project
- See added, removed, net, modified file, branch, and commit recency data
- Drill down from project list to project, repo, file, diff, and commit history views
- Copy full diffs or file diffs to the clipboard
- Switch existing local branches with dirty-repo warnings
- Save project-level bookmarks, commands, and clipboard snippets
- Archive, pin, rename, and delete Repoteer project entries without deleting files
- Generate optional AI-assisted commit reviews, commit messages, diff summaries, and security reviews

Repoteer does not replace repo-level Git tools like lazygit. It sits one level above them: lazygit helps you operate inside a repo; Repoteer helps you decide which project or repo deserves attention.

## Install

Repoteer is a Node.js CLI.

Clone the repository, link the package, then run Repoteer:

    git clone https://github.com/growthboot/repoteer.git
    cd repoteer
    npm link
    repoteer

For local development without linking:

    npm start

## Requirements

- Node.js with ES module support
- Git available on your PATH
- A basic terminal

Repoteer stores its local data in `~/.repoteer/storage`.

It does not scan at install time and does not modify your shell profile.

## Usage

Start Repoteer with `repoteer`.

Add a project from the home screen with `A. Add project`.

A project path must be absolute and must already exist. Repoteer scans that path for Git repositories and shows change totals across the discovered repos.

Common navigation:

- `H` Home
- `R` Refresh
- `S` Settings
- `B` Back
- `Q` Quit

Typical flow: `Projects -> Project -> Repo -> File/Diff`.

## AI support

AI features are optional.

Repoteer can prepare grounded prompts from your local Git diffs for commit review, commit message generation, diff summary, and security review.

Supported provider styles include browser-based tools and local OpenAI-compatible chat endpoints such as LM Studio or Ollama. AI output is advisory. Repoteer does not let AI stage, commit, push, or edit files directly.

## Safety model

Repoteer is intentionally narrow:

- Local project data stays on your machine
- Project deletion only removes Repoteer’s saved project entry
- Git commit actions require confirmation before writing Git data
- Push actions require a separate confirmation step
- Branch switching is limited to existing local branches
- Git failures are shown as warnings instead of being hidden or auto-resolved

## Development

Run syntax checks and smoke tests with `npm run check` and `npm run smoke`.

The package entrypoint is `bin/repoteer.js`.

The app runtime starts at `src/app.js`.

## Project status

Repoteer is early, usable, and actively evolving. The core direction is stable: project-level Git awareness, fast keyboard navigation, and local-first behavior.

## Contributing

Issues, ideas are welcome. Pull requests are not accepted without prior authorization.

## License

Repoteer is free and open-source software released under the MIT License. See [LICENSE](LICENSE).
