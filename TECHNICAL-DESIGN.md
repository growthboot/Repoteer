# Repoteer Technical Design

Keep the app small, file-based, testable by hand, and easy to package across npm, Homebrew, Linux, macOS, and Windows. Runtime behavior must not depend on how the executable was installed. Once the user runs `repoteer`, the app follows the same rules everywhere.

Repoteer does not try to become a full Git management UI. It reads Git state, displays useful navigation screens, lets the user copy or summarize diffs, and allows carefully confirmed commit actions. Features that push the app toward broad repo management should be rejected.

## Runtime Model

Repoteer is a vanilla Node.js CLI using ES modules.

The project should use `import` and `export`, with `"type": "module"` in `package.json`.

The app should avoid large framework dependencies and generally avoid all dependencies if possible. Plain terminal input and output are preferred. Any dependency must justify itself by making the CLI simpler, safer, or more portable.

The app should be structured around small files, strong oop, modules, and helper files. A file should stay under roughly 600 lines. Passing that limit means the responsibility is probably too broad and should be split into a folder with smaller files. The saved data requires schema enforcement.

## Architecture Shape

The app has four main layers:

```text
src/
  app.js
  pages/
  router/
  modules/
  utils/
  config/
  storage/
  data/
```

`app.js` is the entrypoint. It loads config, loads storage, runs startup scan, creates shared runtime state, creates the router, and opens the first page.

`pages/` contains one file per CLI view.

`router/` handles screen transitions only.

`modules/` contains larger stateful or process-oriented units.

`utils/` contains small focused helpers.

`config/` handles config file discovery, loading, validation, and location changes.

`storage/` handles JSON persistence files such as projects and settings.

`data/` contains primitive hard-coded values that should have a single source of truth.

## Page Model

Each CLI screen is a page.

A page is an actual file. The page owns rendering for that screen and handles only the actions visible on that screen.

Suggested page files:

```text
src/pages/ProjectsPage.js
src/pages/AddProjectPage.js
src/pages/ProjectPage.js
src/pages/RepoPage.js
src/pages/DiffPage.js
src/pages/CommitConfirmPage.js
src/pages/BranchPage.js
src/pages/DeleteProjectPage.js
src/pages/SettingsPage.js
```

A page should not perform low-level Git commands directly. It should call a module.

A page should not read or write JSON files directly. It should call a storage module that enforces schema. 

A page should not know how other pages are instantiated beyond asking the router to navigate.

A page should return control through the router for back navigation, and cancel flows.

## Router

The router should be primitive.

It only needs to support:

```text
open(pageName, params)
back()
replace(pageName, params)
current()
```

The router owns the navigation stack.

Pages should not manually import and instantiate other pages unless there is a strong reason. The router should be the single place that maps page names to page classes.

Back navigation must be consistent. `B` and Escape should both return to the previous page where applicable.

The router must not own Git state, project state, or storage state. It only controls where the user is in the CLI.

## Runtime State

The app should create one shared runtime state object at startup.

This state lives in memory only.

Suggested shape:

```text
{
  config,
  settingsStore,
  projectsStore,
  scanner,
  git,
  clipboard,
  prompts
}
```

This object should be passed to pages and modules that need it.

Runtime state is not persistence. JSON files are the persistence layer.

## Utils

`utils/` should contain small, focused helpers.

Good examples:

```text
src/utils/menu.js
src/utils/table.js
src/utils/path.js
src/utils/json.js
src/utils/input.js
src/utils/terminal.js
src/utils/format.js
src/utils/validation.js
src/utils/errors.js
```

A util should usually export a few pure functions.

A util should not become a stateful service.

If a util starts needing many related functions, internal state, or orchestration logic, it should become a module.

## Modules

`modules/` should contain larger process-oriented units.

Good examples:

```text
src/modules/Git.js
src/modules/Scanner.js
src/modules/ProjectManager.js
src/modules/CommitManager.js
src/modules/BranchManager.js
src/modules/PromptManager.js
src/modules/Clipboard.js
```

A module must be a exported class.

A module may hold temporary in-memory state.

A module should have one clear responsibility.

`Scanner` should scan configured projects and repos.

`Git` should wrap Git commands and normalize results.

`ProjectManager` should validate and mutate project records through storage.

`CommitManager` should generate commit payloads and run confirmed commit actions.

`BranchManager` should list and switch existing local branches.

`PromptManager` should load and apply user-customized prompt text.

`Clipboard` should isolate platform clipboard behavior.

## Config Discovery

Repoteer must have a default config location, but the user must be able to redirect config to another location.

The default app folder should be based on the user home directory in .repoteer folder and must work on macOS, Linux, and Windows.

Default folder:

```text
~/.repoteer/
```

Default config pointer file:

```text
~/.repoteer/config.json
```

The config file may point to a different config file chosen by the user.

Suggested config shape:

```json
{
  "configPath": null,
  "storagePath": null
}
```

If `configPath` is null, use the default config file.

If `configPath` is set, load the real config from that location.

This gives the user control. They can put the real config in a repo if they want.

The app must avoid install-location config. It must never store runtime config in a Homebrew prefix, npm global package folder, or executable folder.

## Storage

Data is always either stored as an object or an array of objects.

Default storage folder:

```text
~/.repoteer/storage
```

The storage folder must be customizable in the settings.

Storage is JSON-file based.

The default storage folder is the same folder as the active config file unless the config defines a separate `storagePath`.

Storage files should be split by responsibility.

Suggested files:

```text
projects.json
settings.json
bookmarks.json
commands.json
prompts.json
```

Projects should not be stored inside settings.

Settings should not be stored inside projects.

Prompt text should not be duplicated across files.

Each storage file should have one reason to change.

The storage layer should create missing files with safe defaults.

The storage layer should fail gracefully if JSON is malformed. It should show a clear error and avoid overwriting broken user data automatically.

## Storage Location Changes

The Settings page must allow the user to change:

- config location
- storage location

When changing either location, Repoteer should offer to move existing files.

The user should be able to choose:

```text
move existing files
use new empty location
cancel
```

Repoteer must not delete the old files automatically.

Repoteer must not silently overwrite files at the new location.

If a target file already exists, Repoteer should warn and ask for explicit confirmation before replacing it.

Location changes should be written only after validation succeeds.

## Data Files

Primitive hard-coded values that are likely to be shared should live in `data/`.

Good examples:

```text
src/data/default-prompts.json
src/data/default-settings.json
```

These files create a single source of truth for values that are otherwise easy to duplicate.

Do not move values into JSON just because they exist. Use JSON when the values are shared, user-visible, or likely to change without changing logic.

## Git Operations

Git operations should be isolated behind `Git`.

Pages and managers should not shell out directly.

`Git` should support:

```text
detectRepo(path)
getStatus(repoPath)
getDiffStats(repoPath)
getFullDiff(repoPath)
getCurrentBranch(repoPath)
listLocalBranches(repoPath)
checkoutBranch(repoPath, branchName)
commit(repoPath, title, body)
push(repoPath)
getLastCommitAge(repoPath)
```

Git command failures must return structured errors. They should not crash the process unless the CLI itself is in an unrecoverable state.

Git errors should be shown on the relevant project or repo screen as warnings.

Branch data must always come from Git. It must not come from cached Repoteer state.

## Scanner

The scanner runs a full scan on startup.

The scanner should also be callable for one project or one repo after a mutation, such as branch checkout or commit.

The scanner should produce a normalized snapshot used by pages.

Suggested snapshot shape:

```text
{
  projects: [
    {
      name,
      path,
      shortcut,
      warning,
      totals,
      repos
    }
  ]
}
```

Repos should include:

```text
{
  name,
  path,
  branch,
  detached,
  warning,
  added,
  removed,
  net,
  modifiedFiles,
  lastCommitAgo,
  dirty
}
```

The snapshot is derived state. It should not be persisted as the source of truth.

Configured projects are persisted. Git scan results are recalculated.

## Commit Flow

No commit action can write Git data directly from the Repo page.

Commit actions must route through `CommitConfirmPage`.

The confirmation page must show:

```text
commit title
commit body
affected repo
changed file count
Confirm
Edit title
Edit body
Back / Cancel
```

`Hotfix commit` generates the initial title and body, then opens confirmation.

`Write a commit & push` is two phases:

```text
confirm and create commit
ask whether to push after commit succeeds
```

Push must never happen before the user confirms the commit.

## Branch Flow

Branch switching should be repo-local.

The Branch page should show existing local branches only.

The user may select by number or type the exact branch name.

If the repo is dirty, show a warning before checkout.

If Git refuses checkout, show the Git error and stay on the current branch.

After successful checkout, rescan that repo and return to the Repo page.

Repoteer must not support branch creation, deletion, rename, merge, rebase, pull, push, remote branch management, or arbitrary commit checkout from this flow.

## Settings

Settings should be persisted in `settings.json`.

Settings should include:

```text
api key reference or value strategy
default chat client
diff generation pre-prompt
security review pre-prompt
config location
storage location
```

Sensitive values need a separate design decision before implementation. If API keys are stored directly in JSON, the app must make that clear to the user. A later version may support environment variables or OS keychain integration, but that should not be added until the simple file model is working.

Do not store redudant git state in the settings, rely on git for git state.

## Manual Testing Strategy

Development should move in small milestones.

Each milestone should produce something manually testable in the terminal.

The project should keep a task list.

A task should not be marked done.

A task should be removed only after manual testing confirms it is finished.

After removing a task, the next task list should be reconsidered based on what was learned during testing.

This keeps the project grounded in actual CLI behavior instead of speculative architecture.

## Suggested Milestones

Absolutely no step should involve mock data.

Milestone 1 should create the basic app shell and router the projects page and the add projects page. the projects page should have none of the columns with the repo details yet because we dont have the data for it and we are not allowed to use mock data, if you want to make the columns and table util you can but put NA for the values

Milestone 2 create the pipeline to be able to get the data we need for the projects page data, dont build other other pages yet, lets work on the projects page where each column is like a milestone.

## Packaging Rule

Repoteer must behave the same regardless of package manager.

The app must not detect package manager to change runtime behavior.

No runtime rule should depend on whether Repoteer came from npm, Homebrew, or another installer.

## Rejection Rules

Reject a feature if it turns Repoteer into broad repo management.

Reject a feature if it requires package-manager-specific runtime behavior.

Reject a feature if it makes files large without improving clarity.

Reject a feature if it duplicates source-of-truth data.

Reject a feature if it hides Git failures from the user.

Reject a feature if it removes the explicit confirmation boundary before writing Git data.

Reject a feature if it created, modifies, or deletes a file outside of the project folder ~/.repoteer/ or configured alternatives