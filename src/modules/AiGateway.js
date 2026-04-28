export class AiGateway {
  constructor({ aiPromptManager, clipboard, browserOpener, localAiClient }) {
    this.aiPromptManager = aiPromptManager;
    this.clipboard = clipboard;
    this.browserOpener = browserOpener;
    this.localAiClient = localAiClient;
  }

  async openProviderSelection(router, params) {
    await router.open('aiProviderSelect', this.normalizeSelectionParams(params));
  }

  listRunnableProviders(settings) {
    const providers = settings?.ai?.providers;

    if (!Array.isArray(providers)) {
      return [];
    }

    return providers
      .filter((provider) => {
        if (provider?.enabled !== true) {
          return false;
        }

        if (provider.type === 'browser') {
          return /^https?:\/\//.test(String(provider.url || ''));
        }

        if (provider.type === 'local') {
          return /^https?:\/\//.test(String(provider.endpointUrl || ''));
        }

        return false;
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        return left.title.localeCompare(right.title);
      });
  }

  runBrowserProvider(provider, toolId, userPayload) {
    const prompt = this.aiPromptManager.composeBrowserPrompt(toolId, userPayload);
    const warnings = [];

    if (prompt === null) {
      return {
        ok: false,
        copied: false,
        opened: false,
        prompt: '',
        warnings: ['AI tool prompt was not found.'],
        url: provider.url
      };
    }

    const copy = this.clipboard.copy(prompt);

    if (!copy.ok) {
      warnings.push(copy.warning || 'Clipboard copy failed.');
    }

    const open = this.browserOpener.open(provider.url);

    if (!open.ok) {
      warnings.push(open.warning || 'Browser open failed.');
    }

    return {
      ok: warnings.length === 0,
      copied: copy.ok,
      opened: open.ok,
      prompt,
      warnings,
      url: provider.url
    };
  }

  async runLocalProvider(provider, toolId, userPayload) {
    const prompt = this.composeLocalPrompt(toolId, userPayload);

    if (!prompt) {
      return {
        ok: false,
        content: '',
        warning: 'AI tool prompt was not found.'
      };
    }

    return await this.localAiClient.sendChatCompletion(provider, prompt);
  }

  composeLocalPrompt(toolId, userPayload) {
    const prompt = this.aiPromptManager.getToolPrompt(toolId);

    if (!prompt) {
      return null;
    }

    const internalMessages = prompt.tool.internalMessages?.length
      ? '\n\n' + prompt.tool.internalMessages.join('\n')
      : '';

    return {
      system: prompt.systemPrompt + internalMessages,
      user: [
        prompt.prePrompt,
        String(userPayload ?? '')
      ].join('\n\n')
    };
  }

  normalizeSelectionParams(params) {
    const payload = params.payload ?? params.payloadResult ?? {};

    return {
      toolId: params.toolId,
      projectName: params.projectName ?? params.project?.name ?? '',
      repoName: params.repoName ?? params.repo?.name ?? '',
      repoPath: params.repoPath ?? params.repo?.path ?? '',
      returnPage: params.returnPage ?? null,
      userPayload: String(params.userPayload ?? payload.payload ?? ''),
      payloadSize: Number(params.payloadSize ?? payload.size ?? String(payload.payload ?? '').length),
      maxPromptCharacters: Number(params.maxPromptCharacters ?? payload.maxPromptCharacters ?? 0),
      inputSummary: String(params.inputSummary ?? payload.inputSummary ?? 'staged, unstaged tracked, and untracked text changes'),
      payloadWarnings: Array.isArray(params.payloadWarnings)
        ? params.payloadWarnings
        : Array.isArray(payload.warnings)
          ? payload.warnings
          : []
    };
  }
}
