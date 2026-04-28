# Repoteer Deferred AI Credentials Specification

This file defines deferred AI credential work for Repoteer.

Do not implement this file while working on the first AI tooling pass in `AI-SPEC.md`. `AI-SPEC.md` covers the easier current version. This file is for a later version that adds cloud API keys, encrypted sensitive settings, and credentialed provider auth.

## Scope

This file owns:

* API keys
* Encrypted sensitive settings
* Cloud API providers
* Credentialed local provider auth
* Password-based secret unlock behavior
* Secret storage shape

This file does not redefine the AI toolbelt, prompt layers, diff truncation, browser provider flow, or no-secret local model flow from `AI-SPEC.md`.

## Deferred Provider Classes

Credentialed API providers:

* OpenAI
* Gemini
* Anthropic

Credentialed local providers:

* Local OpenAI-compatible endpoints that require an auth header
* Any future local provider token or credential

Credentialed providers should use the same AI gateway, prompt building, prompt-size limits, diff preparation, and result rendering defined in `AI-SPEC.md`.

## API Key Strategy

API providers need a key source, not just a provider name.

Supported key source types:

```text
environment variable
encrypted local secret
not configured
```

Rules:

* Environment variable references avoid writing the raw key into Repoteer storage.
* Encrypted local secrets are allowed for users who want Repoteer to remember provider credentials.
* Raw API keys must not be stored in plaintext settings.
* API keys must never be printed in full.
* API keys must never be included in copied prompts.
* API keys must never be included in logs or warning text.
* Disabled providers must not be shown as runnable AI choices.
* Enabled API providers without a usable key should show as needing setup, not as runnable choices.
* Enabled local providers without required auth should show as needing setup, not as runnable choices.

Suggested key display:

```text
OpenAI       Enabled   Env OPENAI_API_KEY       Ready
Gemini       Enabled   Encrypted local key      Locked
Anthropic    Disabled  Not configured           Off
```

## Encrypted Sensitive Settings

Encrypted settings are for secrets that should be saved locally but not readable as plaintext from Repoteer's JSON files.

Sensitive values that may use encrypted storage:

* API keys
* Local provider auth header values
* Any future provider token or credential

Rules:

* Non-sensitive settings remain normal JSON settings.
* Repoteer should offer encrypted storage for sensitive settings such as API keys and local endpoint auth values.
* Raw sensitive values must not be stored in plaintext settings.
* Encrypted settings may live in `settings.json` as encrypted blobs, or in a separate storage file if that keeps schema validation cleaner.
* Encrypted blobs should include enough metadata to support safe decryption, such as algorithm, salt, nonce or IV, and key-derivation parameters.
* Repoteer should use current, standard Node.js cryptography primitives rather than a custom encryption scheme.
* Repoteer should not silently discard encrypted settings if unlock fails.

## Password Model

Encrypted settings should be unlocked with a user-entered password that is never stored.

Rules:

* The user chooses a password when first saving an encrypted secret.
* The password is never stored.
* The user enters the password when encrypted settings are needed.
* A successful unlock is remembered only in memory.
* The password or derived unlock material may be remembered in memory until the CLI exits.
* Closing the CLI clears the remembered unlock state.
* If the user enters the wrong password, Repoteer should show a clear warning and leave encrypted providers unavailable.
* The encryption password must not be logged, copied, displayed, or persisted.
* Changing the encryption password should require the old password first.
* There should be a visible way to lock encrypted settings again before quitting.

## Settings Page Additions

These settings are deferred and should not appear in the first `AI-SPEC.md` implementation.

```text
API providers
1. OpenAI       On    priority 10    Env OPENAI_API_KEY       max global
2. Gemini       Off   priority 20    Not configured           max global
3. Anthropic    On    priority 30    Encrypted key locked     max 12000

Actions
K. Unlock encrypted settings
```

Provider rows should show readiness without exposing secrets.

## API Provider Edit Mock

```text
Edit AI Provider: OpenAI

Type                 API
Enabled              On
Key source           Encrypted local secret
Secret state         Locked
Priority             10
Max prompt size      Global default

T. Toggle enabled
K. Change key source
S. Save encrypted secret
U. Unlock encrypted settings
P. Change priority
M. Change max prompt size
B. Back
```

Environment-variable key source:

```text
Edit AI Provider: OpenAI

Type                 API
Enabled              On
Key source           Environment variable
Variable             OPENAI_API_KEY
Priority             10
Max prompt size      Global default

T. Toggle enabled
K. Change key source
V. Change variable name
P. Change priority
M. Change max prompt size
B. Back
```

## Credentialed Local Provider Edit Mock

```text
Edit AI Provider: Local secure endpoint

Type                 Local
Enabled              On
Endpoint             http://127.0.0.1:8080/v1/chat/completions
Format               OpenAI-compatible chat completions
Model                local-model
Auth                 Encrypted local header
Secret state         Locked
Priority             35
Max prompt size      12000 characters

T. Toggle enabled
U. Change endpoint URL
O. Change model
A. Change auth
S. Save encrypted secret
K. Unlock encrypted settings
P. Change priority
M. Change max prompt size
D. Delete
B. Back
```

## AI Provider Selection Additions

Credentialed providers should appear in the AI provider picker only when they are runnable, or when showing unavailable setup state helps the user fix configuration.

```text
AI: Commit review

Repo: AppVideoStudio / frontend
Prompt size: 10482 / 15000 characters
Diff input: staged and untracked text changes

Choose where to send this prompt:

1. OpenAI API                 Ready       priority 10
2. Anthropic API              Locked      priority 30
3. Local secure endpoint      Locked      priority 35
4. ChatGPT temporary chat     Open URL    priority 40

S. Settings
K. Unlock encrypted settings
B. Back
```

API choice behavior:

* Show the provider and model before sending.
* Ask for confirmation before the first API call from that page.
* Render the response in a result page with copy and back actions.
* API failures should show the provider error and keep the user in Repoteer.

Credentialed local choice behavior:

* Show the endpoint host and model before sending.
* Ask for confirmation before sending the prompt to the local endpoint.
* Render the response in the same result page used by API providers.
* Connection failures, non-2xx responses, and invalid response shapes should show clear warnings.
* Local choices should not fall back to cloud providers automatically.

## Storage Shape

This is a proposed shape for review, not an implementation requirement yet.

```json
{
  "color": true,
  "ai": {
    "globalMaxPromptCharacters": 15000,
    "providers": [
      {
        "id": "openai",
        "type": "api",
        "title": "OpenAI",
        "enabled": true,
        "priority": 10,
        "keySource": {
          "type": "encrypted",
          "secretId": "openai-api-key"
        },
        "maxPromptCharacters": null
      },
      {
        "id": "anthropic",
        "type": "api",
        "title": "Anthropic",
        "enabled": false,
        "priority": 30,
        "keySource": {
          "type": "env",
          "name": "ANTHROPIC_API_KEY"
        },
        "maxPromptCharacters": 12000
      },
      {
        "id": "local-secure-endpoint",
        "type": "local",
        "title": "Local secure endpoint",
        "enabled": false,
        "priority": 35,
        "endpointUrl": "http://127.0.0.1:8080/v1/chat/completions",
        "requestFormat": "openai-compatible-chat",
        "model": "local-model",
        "auth": {
          "type": "encrypted-header",
          "headerName": "Authorization",
          "secretId": "local-secure-endpoint-auth"
        },
        "maxPromptCharacters": 12000
      }
    ],
    "encryptedSecrets": {
      "state": "locked",
      "items": [
        {
          "id": "openai-api-key",
          "algorithm": "review-before-implementation",
          "salt": "stored salt",
          "nonce": "stored nonce",
          "ciphertext": "encrypted value"
        },
        {
          "id": "local-secure-endpoint-auth",
          "algorithm": "review-before-implementation",
          "salt": "stored salt",
          "nonce": "stored nonce",
          "ciphertext": "encrypted value"
        }
      ]
    }
  }
}
```

## Review Questions

Before this deferred work starts, confirm:

* Should encrypted secrets live inside `settings.json`, or in a separate `secrets.json` file?
* Should environment variables and encrypted local secrets both ship in the first credentialed-provider version?
* Should credentialed providers appear in the picker while locked, or only after encrypted settings are unlocked?
* Should the password be requested at app startup when encrypted providers exist, or only when a locked provider is selected?
* Should local provider auth support arbitrary header names in v1, or only `Authorization`?
