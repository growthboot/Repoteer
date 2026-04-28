# Repoteer AI Tooling Specification

This file defines Repoteer's AI tooling behavior. It extends `SPEC.md` and `TECHNICAL-DESIGN.md` without redefining the core navigation, commit confirmation, branch, storage, or Git rules already documented there.

`SPEC.md` remains the source of truth for the main CLI screens and Git safety boundaries. This file owns the AI settings, AI gateway, prompt packaging, provider selection, and AI-ready diff preparation rules.

`AI-SPEC2.md` owns API keys, encrypted sensitive settings, credentialed cloud API providers, and credentialed local-provider auth. That work is explicitly deferred to a later version and should not be implemented while working from this file.

## Scope

Repoteer should have a generic AI toolbelt that can be reused by multiple AI-assisted features.

Initial AI tools:

* Commit review
* Diff summary
* Security review

Commit review replaces the older "generate commit message" idea as the primary AI commit use case. Commit writing must still go through the existing confirmation boundary from `SPEC.md`.

AI remains optional. Repoteer must be fully usable with no AI providers configured.

## Design Goals

* Keep AI behavior local and explicit.
* Let users choose the AI target right before running an AI tool.
* Support local model providers and browser chat providers through the same gateway.
* Keep each AI use case modular by changing prompts and labels, not by duplicating flow logic.
* Avoid sending binary, media, image, base64, or unreadable data to AI providers.
* Truncate oversized prompt data internally while making truncation visible to the AI.

## Non-Goals

Do not implement:

* Background AI scans
* Automatic commits from AI output
* Automatic pushes from AI output
* Provider-specific UI screens for each AI action
* Extension-based browser automation
* Hidden use of a provider without a selection step
* Binary or media prompt ingestion
* Generated files or bundled output edits as part of this spec

## AI Toolbelt Model

Each AI tool should be represented as a generic tool definition.

Suggested shape:

```text
{
  id,
  title,
  description,
  systemPromptId,
  prePromptId,
  payloadBuilderId,
  internalMessages,
  outputMode
}
```

Definitions should be data-driven enough that adding a new AI tool usually means adding prompts, labels, and a payload builder. The provider gateway should not need a custom page for each new AI tool.

The first tool definitions should be:

```text
commit_review
diff_summary
security_review
```

## Prompt Layers

AI prompts should be composed from these layers:

```text
system prompt
pre-prompt
internal message
user payload
```

Rules:

* System prompts guide the agent through the task and define the output contract.
* Browser chat providers do not have a separate system prompt channel.
* Browser chat prompts should be composed as one copied prompt: system prompt \n\n pre-prompt \n\n user payload.
* Pre-prompts boot up the task work process for a specific AI tool.
* Pre-prompts are sent with the first chunk of user data, not as standalone provider configuration.
* Internal messages are app-owned helper text for the selected tool.
* User payload contains the prepared diff and context.
* Prompt text must not be duplicated inside `settings.json`.
* Default prompt text should have a single source of truth.

Commit review, diff summary and security review should have their own system prompts and pre-prompts.

## Provider Types

Repoteer should support two provider classes in this version:

```text
local
browser
```

Credentialed API providers such as OpenAI, Gemini, and Anthropic are deferred to `AI-SPEC2.md`.

Local providers:

* OpenAI-compatible local HTTP endpoint
* Optional model name

Browser providers:

* ChatGPT temporary chat
* Gemini web app
* User-defined browser URLs

The browser provider list should include these defaults:

```text
https://chatgpt.com/?temporary-chat=true
https://gemini.google.com/app
```

The user may add, edit, enable, disable, delete, and reprioritize AI methods, like browser urls or local model endpoints, or later (not in this version) api keys

## Local Model Strategy

Local model support should be a pragmatic catch-all, not a full local-model management system.

The first local provider shape should assume an OpenAI-compatible chat completions endpoint. This covers common local runners without making Repoteer responsible for installing, starting, or managing them.

Suggested local endpoint examples:

```text
http://127.0.0.1:11434/v1/chat/completions
http://127.0.0.1:1234/v1/chat/completions
http://localhost:8080/v1/chat/completions
```

Rules:

* Repoteer should not start or stop local model servers.
* Repoteer should not download models.
* Repoteer should not discover local model servers automatically.
* The user supplies the endpoint URL.
* The endpoint URL must start with `http://` or `https://`.
* The request format should default to OpenAI-compatible chat completions.
* The first version should stay on the lowest-complexity local path: OpenAI-compatible endpoints only.
* Ollama may be supported through its OpenAI-compatible endpoint if that works with the same request format.
* Do not add a separate Ollama-native request path unless the OpenAI-compatible path proves insufficient.
* The user may set a model name if their local server requires one.
* Authenticated local providers are deferred to `AI-SPEC2.md`.
* Local provider failures should show the HTTP or connection error and keep the user in Repoteer.
* Local providers should use the same prompt building, truncation, and result rendering as other runnable AI providers.

## Provider Priority

Every provider choice should have a numeric priority.

Rules:

* Lower priority number appears earlier.
* Equal priority is resolved by provider title alphabetically.
* Priority only controls ordering on the AI provider selection page.
* Priority must not auto-select a provider.
* Disabled providers are hidden from runnable choices but visible in settings.
* Providers that need setup are visible in settings only.
* The AI provider selection page must show runnable providers only.

## Prompt Size Settings

Repoteer should support a global default prompt size and per-choice overrides.

Default global max prompt size:

```text
15000 characters
```

Rules:

* The global setting applies to every AI choice unless that choice has an override.
* Each local provider may define its own max prompt size.
* Each browser provider may define its own max prompt size.
* Max prompt size applies to the user payload only.
* User payload size should be counted after diff preparation and before final prompt composition.
* System prompt, pre-prompt, and internal messages do not count toward the max prompt size.
* Truncation should target the diff payload first.
* System prompt and pre-prompt should be preserved whenever possible.
* The truncation marker must be visible in the prompt:

```text
...TRUNCATED_DIFF_DATA...
```

The marker tells the AI that some diff content is intentionally missing.

## Diff Preparation

AI-ready diffs are not the same thing as display diffs or copied full diffs.

AI-ready diff generation should:

* Include staged changes.
* Include unstaged tracked changes.
* Include untracked files when they are text-like.
* Exclude binary files.
* Exclude media files.
* Exclude image files.
* Exclude base64-like payloads.
* Exclude unreadable or likely non-text content.
* Avoid relying only on file extensions.
* Preserve enough file path and hunk context for the AI to understand the change.
* Clearly mark omitted files.

Binary and media detection should use Git and content heuristics when possible. Extension checks may be used as a supporting signal, but not as the only signal.

Suggested omission text:

```text
[Omitted non-text diff: path/to/file.png]
[Omitted likely base64 data: path/to/file.txt]
```

Suggested truncation inside a large diff:

```text
diff --git a/src/example.js b/src/example.js
@@ ...
 const keep = true;

...TRUNCATED_DIFF_DATA...

@@ ...
 export function stillVisible() {}
```

## AI Gateway

Any AI action should open a provider selection page before it runs.

The gateway receives:

```text
tool id
repo context
prepared payload summary
return page
```

The gateway should:

* Show the selected AI tool name.
* Show runnable AI choices ordered by priority.
* Hide unavailable choices from the provider selection page.
* Keep unavailable provider setup visible only in settings.
* Let the user open settings from the selection page.
* Let the user go back without running the tool.
* Never send a prompt to a local endpoint or open a browser URL without explicit user action.

## Settings Page Mock

```text
Settings

General
Color                         On

AI
Configured providers        4 on, 1 off
Global max prompt size      15000 characters

Actions
T. Toggle color
A. AI settings
B. Back
```

Rules:

* Settings stays one entry point, but AI settings can open focused edit screens.
* The main settings page should not carry the full AI provider table.
* The main settings page should show only a compact AI status and an action to open AI settings.
* Provider management, prompt editing, and max prompt size controls live on the AI settings page.

## AI Settings Page Mock

```text
AI Settings

Global max prompt size        15000 characters

Providers
1. LM Studio local            On    priority 35    http://127.0.0.1:1234    max 12000
2. Ollama OpenAI-compatible  Off   priority 36    http://127.0.0.1:11434    max 8000
3. ChatGPT temporary chat     On    priority 40    max 15000
4. Gemini web app             On    priority 50    max 15000
5. Custom web chat            Off   priority 60    max 8000

Prompts
D. Diff summary prompt
C. Commit review prompt
S. Security review prompt

Actions
G. Set global max prompt size
A. Add browser URL
L. Add local model
E. Edit provider
P. Change provider priority
M. Set provider max prompt size
B. Back
```

Rules:

* The AI settings page owns provider management.
* Providers should be shown in one combined list ordered by priority.
* Provider rows should show readiness clearly.
* Editing a provider should expose enable or disable, priority, and max prompt size.
* Local model editing should expose endpoint URL, model name, priority, and max prompt size.
* Browser URL editing should validate that the URL starts with `http://` or `https://`.
* Prompt editing should be per tool, not per provider.

## Provider Edit Mock

```text
Edit AI Provider: LM Studio local

Type                 Local
Enabled              On
Endpoint             http://127.0.0.1:1234/v1/chat/completions
Format               OpenAI-compatible chat completions
Model                local-model
Priority             35
Max prompt size      12000 characters

T. Toggle enabled
U. Change endpoint URL
O. Change model
P. Change priority
M. Change max prompt size
D. Delete
B. Back
```

For a browser provider:

```text
Edit AI Provider: ChatGPT temporary chat

Type                 Browser
Enabled              On
URL                  https://chatgpt.com/?temporary-chat=true
Priority             40
Max prompt size      15000 characters

T. Toggle enabled
U. Change URL
P. Change priority
M. Change max prompt size
D. Delete
B. Back
```

## AI Provider Selection Mock

```text
AI: Commit review

Repo: AppVideoStudio / frontend
Payload size: 10482 / 15000 characters
Diff input: staged, unstaged, and untracked text changes

Choose where to send this prompt:

1. LM Studio local            Ready       priority 35
2. ChatGPT temporary chat     Open URL    priority 40
3. Gemini web app             Open URL    priority 50

S. Settings
B. Back
```

Local choice behavior:

* Show the endpoint host and model before sending.
* Ask for confirmation before sending the prompt to the local endpoint.
* Render the response in the same result page used by AI providers.
* Connection failures, non-2xx responses, and invalid response shapes should show clear warnings.
* Local choices should not fall back to cloud providers automatically.

Browser choice behavior:

* Prepare the prompt for copying.
* Copy the prompt to clipboard when possible, then open the configured URL automatically.
* Do not ask for a second confirmation after the browser choice is selected.
* If opening the URL fails, show the URL and keep the prompt copied if copy worked.
* If clipboard copy fails, show a warning and let the user copy manually if the terminal allows it.

## AI Result Mock

```text
AI: Commit review result

Provider: LM Studio local
Repo: AppVideoStudio / frontend

Summary:
...

Findings:
...

C. Copy result
R. Run again
B. Back
```

AI output is advisory. It must not directly mutate Git state.

## Commit Review Tool

Commit review should inspect the prepared diff and return review output, not a final commit message.

Expected output:

```text
Summary
Findings
Risk notes
Suggested manual checks
```

Rules:

* The tool should tell the AI that data may be truncated.
* The tool should tell the AI not to invent unseen files or unshown hunks.
* The tool should favor concrete risks over generic advice.
* The tool should never bypass `CommitConfirmPage`.
* The tool should never run `git commit`.

## Storage Shape

This is a proposed shape for review, not an implementation requirement yet.

```json
{
  "color": true,
  "ai": {
    "globalMaxPromptCharacters": 15000,
    "providers": [
      {
        "id": "chatgpt-temp",
        "type": "browser",
        "title": "ChatGPT temporary chat",
        "enabled": true,
        "priority": 40,
        "url": "https://chatgpt.com/?temporary-chat=true",
        "maxPromptCharacters": 15000
      },
      {
        "id": "lm-studio-local",
        "type": "local",
        "title": "LM Studio local",
        "enabled": false,
        "priority": 35,
        "endpointUrl": "http://127.0.0.1:1234/v1/chat/completions",
        "requestFormat": "openai-compatible-chat",
        "model": "local-model",
        "maxPromptCharacters": 12000
      }
    ]
  }
}
```

Prompt text should use a separate prompt store or data source as described in `TECHNICAL-DESIGN.md`.

## Implementation Notes For Later

Likely modules:

```text
src/modules/AiGateway.js
src/modules/AiPromptBuilder.js
src/modules/AiDiffBuilder.js
src/modules/AiProviderManager.js
```

Likely pages:

```text
src/pages/AiProviderSelectPage.js
src/pages/AiResultPage.js
src/pages/AiProviderEditPage.js
```

These are not required to be exact filenames. The important boundary is that pages own rendering, modules own process logic, and storage owns schema validation.

## Implementation Milestones

These milestones implement this file only. Do not implement `AI-SPEC2.md` in these milestones.

General milestone rules:

* Start every milestone by reading `README.md`, `SPEC.md`, `TECHNICAL-DESIGN.md`, and `AI-SPEC.md`.
* Do not modify `AI-SPEC2.md` unless the milestone explicitly says to.
* Do not modify generated or dist files.
* Keep each milestone manually testable from the CLI.
* Keep AI optional. Repoteer must still work with no runnable AI providers.
* Keep existing Git safety boundaries. AI output must not commit, push, stage, or modify repo files.

### Milestone 1: AI Settings Foundation

Goal:

Add persistent AI settings and a dedicated AI settings page opened from the existing Settings page.

Scope:

* Extend settings storage with AI defaults.
* Add default browser providers and default no-secret local providers.
* Add global max prompt size with default `15000`.
* Add provider enable or disable, priority, and max prompt size editing.
* Add browser URL creation and editing.
* Add local endpoint creation and editing.
* Keep credentialed API providers and encrypted secrets out of scope.

Acceptance:

* Main Settings page still shows color and opens AI settings.
* AI Settings shows one combined provider list ordered by priority.
* Disabled providers stay visible in AI Settings.
* Provider edits persist across CLI restarts.
* `npm run check` and the smoke path for settings pass.

Handoff prompt:

```text
I am working in /Users/andrewdear/Development/Repoteer. Read README.md, SPEC.md, TECHNICAL-DESIGN.md, and AI-SPEC.md completely first, dont skip anything. Implement only Milestone 1 from AI-SPEC.md: AI settings foundation. Do not implement AI-SPEC2.md. Do not add cloud API keys, encrypted settings, or credentialed auth. Do not modify dist or generated files.

Add persistent AI settings to settings.json through the storage layer, with defaults for globalMaxPromptCharacters, browser providers, and no-secret local providers. Add an AI Settings page opened from the existing Settings page. The main Settings page should stay compact. The AI Settings page should show one provider list ordered by priority and support editing enabled state, priority, max prompt size, browser URLs, and local endpoint/model fields. Keep the implementation small and consistent with the existing page/router/storage patterns.

Verify with npm run check and the relevant smoke coverage. If smoke coverage does not exist, add focused smoke coverage for the settings navigation and persistence path.
```

### Milestone 2: Prompt And Tool Definitions

Goal:

Create reusable AI tool definitions and prompt storage without wiring provider execution yet.

Scope:

* Add definitions for `commit_review`, `diff_summary`, and `security_review`.
* Add default system prompts and pre-prompts with one source of truth.
* Add prompt loading through a module or storage layer that matches `TECHNICAL-DESIGN.md`.
* Add prompt editing from AI Settings.
* Preserve browser composition semantics: system prompt, pre-prompt, then user payload in one copied prompt.

Acceptance:

* Each AI tool has a system prompt and pre-prompt.
* Prompt text is not duplicated in `settings.json`.
* Prompt edits persist and can be reset or safely defaulted.
* No provider call or browser open happens in this milestone.
* `npm run check` and focused smoke coverage pass.

Handoff prompt:

```text
I am working in /Users/andrewdear/Development/Repoteer. Read README.md, SPEC.md, TECHNICAL-DESIGN.md, and AI-SPEC.md first. Implement only Milestone 2 from AI-SPEC.md: prompt and tool definitions. Do not implement AI-SPEC2.md. Do not modify dist or generated files.

Create reusable AI tool definitions for commit_review, diff_summary, and security_review. Add default system prompts and pre-prompts with a single source of truth, then load them through a small module or storage layer that follows the existing architecture. Add prompt editing from AI Settings. Browser prompt packaging must compose one copied prompt as system prompt, blank line, pre-prompt, blank line, user payload. Do not wire provider selection, browser opening, local HTTP calls, or AI result pages yet.

Verify with npm run check and focused smoke coverage for prompt loading and prompt editing.
```

### Milestone 3: AI Diff Payload Builder

Goal:

Build the AI-ready payload generator for changed repo content.

Scope:

* Include staged changes.
* Include unstaged tracked changes.
* Include untracked text-like files.
* Exclude binary, media, image, base64-like, unreadable, and likely non-text content.
* Avoid relying only on file extensions.
* Apply max prompt size to the user payload only.
* Truncate diff payloads with `...TRUNCATED_DIFF_DATA...`.
* Clearly mark omitted files.

Acceptance:

* The payload builder returns structured success or warning results.
* The payload says when data was omitted or truncated.
* Payload size excludes system prompt, pre-prompt, and internal messages.
* Existing full diff copy behavior is not changed.
* Tests or smoke coverage include staged, unstaged tracked, untracked text, binary omission, and truncation.

Handoff prompt:

```text
I am working in /Users/andrewdear/Development/Repoteer. Read README.md, SPEC.md, TECHNICAL-DESIGN.md, and AI-SPEC.md first. Implement only Milestone 3 from AI-SPEC.md: AI diff payload builder. Do not implement AI-SPEC2.md. Do not modify dist or generated files.

Add an AI-ready diff payload builder that includes staged changes, unstaged tracked changes, and untracked text-like files. Exclude binary, media, image, base64-like, unreadable, and likely non-text content without relying only on file extensions. Apply max prompt size to the user payload only, not system prompt or pre-prompt text. When truncating, preserve useful file and hunk context and insert ...TRUNCATED_DIFF_DATA... where content was removed. Clearly mark omitted files. Do not change the existing full diff display or copy behavior.

Verify with npm run check and focused tests or smoke coverage using temporary git repos for staged, unstaged, untracked, omitted, and truncated payloads.
```

### Milestone 4: AI Gateway And Browser Flow

Goal:

Add the provider selection page and browser-provider execution path.

Scope:

* Add generic AI gateway routing.
* Add provider selection page for an AI tool and repo context.
* Show runnable providers only, ordered by priority.
* Keep unavailable providers visible only in AI Settings.
* Let the user open AI Settings from the selection page.
* For browser providers, compose the prompt, copy it, and open the URL automatically.
* Do not add local HTTP execution yet.

Acceptance:

* Selection page shows tool name, repo, payload size, diff input summary, and runnable providers.
* Disabled and unavailable providers do not appear on the picker.
* Browser provider selection copies the composed prompt and opens the URL automatically.
* Browser open and clipboard failures show warnings without crashing.
* `B` and Escape return cleanly.

Handoff prompt:

```text
I am working in /Users/andrewdear/Development/Repoteer. Read README.md, SPEC.md, TECHNICAL-DESIGN.md, and AI-SPEC.md first. Implement only Milestone 4 from AI-SPEC.md: AI gateway and browser flow. Do not implement AI-SPEC2.md. Do not modify dist or generated files.

Add a generic AI gateway and provider selection page that receives a tool id, repo context, prepared payload summary, and return page. The picker must show runnable providers only, ordered by priority, and allow opening AI Settings. For browser providers, build the composed prompt as system prompt, blank line, pre-prompt, blank line, user payload. Copy it to clipboard when possible, then open the configured URL automatically. Handle clipboard and browser-open failures as warnings. Do not add local HTTP execution in this milestone.

Verify with npm run check and focused smoke coverage for picker ordering, hidden disabled providers, browser copy/open behavior, and back navigation.
```

### Milestone 5: Local Provider Execution

Goal:

Add no-secret local endpoint execution for OpenAI-compatible chat completions.

Scope:

* Use configured local endpoint URL and optional model name.
* Use OpenAI-compatible chat completions request shape.
* Ask for confirmation before sending to the local endpoint.
* Render responses in an AI result page.
* Handle connection failures, non-2xx responses, and invalid response shapes.
* Do not add auth headers, API keys, or encryption.

Acceptance:

* Local provider selection shows endpoint host and model before sending.
* User can cancel before the HTTP request.
* Successful local response renders in AI Result page.
* Result page supports copy, run again, and back.
* Local failures are shown as warnings and keep the user inside Repoteer.

Handoff prompt:

```text
I am working in /Users/andrewdear/Development/Repoteer. Read README.md, SPEC.md, TECHNICAL-DESIGN.md, and AI-SPEC.md first. Implement only Milestone 5 from AI-SPEC.md: local provider execution. Do not implement AI-SPEC2.md. Do not modify dist or generated files.

Add no-secret local model execution for OpenAI-compatible chat completions. Use the configured endpoint URL and optional model name. Show endpoint host and model before sending, and ask for confirmation before making the HTTP request. Render successful responses in a reusable AI Result page with copy, run again, and back actions. Handle connection failures, non-2xx responses, and invalid response shapes as warnings. Do not add auth headers, cloud API providers, API keys, or encrypted settings.

Verify with npm run check and focused tests or smoke coverage. Use a local stub server or controllable test double for success, non-2xx, invalid response, and connection failure cases.
```

### Milestone 6: Wire Initial AI Tools

Goal:

Expose the first AI tools through the existing CLI screens.

Scope:

* Wire commit review from the repo flow.
* Wire diff summary from the diff flow.
* Wire security review from the relevant repo or diff flow.
* Ensure commit review replaces commit-message generation behavior for this AI path.
* Keep existing commit confirmation and hotfix behavior intact.
* Keep AI output advisory only.

Acceptance:

* User can run commit review on all staged, unstaged tracked, and untracked text changes.
* User can run diff summary from the diff-oriented flow.
* User can run security review without changing Git state.
* AI output never commits, stages, pushes, or modifies repo files.
* Existing commit confirm, hotfix commit, copy full diff, and diff view flows still work.
* `npm run check` and full smoke coverage pass.

Handoff prompt:

```text
I am working in /Users/andrewdear/Development/Repoteer. Read README.md, SPEC.md, TECHNICAL-DESIGN.md, and AI-SPEC.md first. Implement only Milestone 6 from AI-SPEC.md: wire initial AI tools. Do not implement AI-SPEC2.md. Do not modify dist or generated files.

Wire the implemented AI gateway into the CLI screens for commit_review, diff_summary, and security_review. Commit review should inspect all staged, unstaged tracked, and untracked text changes and return advisory review output, not a commit message. Diff summary should be reachable from the diff-oriented flow. Security review should use the same provider gateway and payload builder. Preserve existing commit confirmation, hotfix commit, copy full diff, and diff view behavior. AI output must never commit, stage, push, or modify repository files.

Verify with npm run check and full smoke coverage. Add focused smoke coverage for each AI tool entry point and for ensuring AI paths do not mutate Git state.
```
