import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatTable } from '../utils/table.js';

export class AiProviderSelectPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const tool = this.runtime.aiPromptManager.getTool(this.params.toolId);
    const providers = this.runtime.aiGateway.listRunnableProviders(this.runtime.settings);

    console.clear();

    if (!tool) {
      console.log(color.bold('AI tool not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log(color.bold('AI: ' + tool.title));
    console.log('');
    console.log('Repo: ' + this.formatRepoLabel());
    console.log('Payload size: ' + this.formatPayloadSize());
    console.log('Diff input: ' + (this.params.inputSummary || 'staged, unstaged tracked, and untracked text changes'));

    if (Array.isArray(this.params.payloadWarnings) && this.params.payloadWarnings.length > 0) {
      console.log('');
      this.params.payloadWarnings.forEach((warning) => console.log(color.yellow(warning)));
    }

    console.log('');
    console.log(color.bold('Choose where to send this prompt:'));
    console.log('');

    if (providers.length === 0) {
      console.log(color.dim('No runnable AI providers configured.'));
    } else {
      this.renderProviders(providers);
    }

    console.log('');
    formatActionColumns([
      color.bold('A.') + ' AI settings',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'a') {
      await this.router.open('aiSettings');
      return;
    }

    if (/^\d+$/.test(key)) {
      const provider = providers[Number(key) - 1] ?? null;

      if (provider) {
        await this.runProvider(provider);
        return;
      }
    }

    await this.router.replace('aiProviderSelect', this.params);
  }

  renderProviders(providers) {
    const color = this.runtime.color;
    const rows = [
      ['', color.bold('Provider'), color.bold('action'), color.bold('priority')]
    ];

    providers.forEach((provider, index) => {
      rows.push([
        String(index + 1) + '.',
        provider.title,
        provider.type === 'local' ? 'Ready' : 'Open URL',
        String(provider.priority)
      ]);
    });

    formatTable(rows).forEach((row) => console.log(row));
  }

  async runProvider(provider) {
    const params = this.runtime.aiGateway.getProviderPayload(
      this.params,
      provider,
      this.runtime.settings
    );

    if (provider.type === 'local') {
      await this.runLocalProvider(provider, params);
      return;
    }

    await this.runBrowserProvider(provider, params);
  }

  async runBrowserProvider(provider, params) {
    const color = this.runtime.color;
    const result = this.runtime.aiGateway.runBrowserProvider(
      provider,
      params.toolId,
      params.userPayload
    );

    console.log('');
    this.renderPayloadWarnings(params);

    if (result.copied) {
      console.log(color.green('Prompt copied.'));
    } else {
      console.log(color.yellow('Prompt was not copied automatically.'));
      console.log('');
      console.log(color.bold('Prompt:'));
      console.log(result.prompt);
    }

    if (result.opened) {
      console.log(color.green('Opened URL: ' + result.url));
    } else {
      console.log(color.yellow('Browser URL could not be opened automatically.'));
      console.log('URL: ' + result.url);
    }

    result.warnings.forEach((warning) => console.log(color.yellow(warning)));

    if (this.isCommitMessageTool(params.toolId)) {
      await this.promptForGeneratedCommitMessage(params);
      return;
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('aiProviderSelect', params);
  }

  async runLocalProvider(provider, params) {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Send to local AI provider'));
    console.log('');
    console.log('Provider: ' + provider.title);
    console.log('Endpoint: ' + this.formatEndpointHost(provider.endpointUrl));
    console.log('Model: ' + (provider.model || 'Not set'));
    console.log('');
    this.renderPayloadWarnings(params);

    const answer = await promptLine('Send prompt to this local endpoint? (yes/no): ');

    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('');
      console.log(color.yellow('Local request canceled.'));
      await promptLine('Press Enter to continue.');
      await this.router.replace('aiProviderSelect', params);
      return;
    }

    const result = await this.runtime.aiGateway.runLocalProvider(
      provider,
      params.toolId,
      params.userPayload
    );

    if (!result.ok) {
      console.log('');
      console.log(color.yellow(result.warning || 'Local provider request failed.'));
      await promptLine('Press Enter to continue.');
      await this.router.replace('aiProviderSelect', params);
      return;
    }

    if (this.isCommitMessageTool(params.toolId)) {
      const opened = await this.openCommitConfirmFromGeneratedResponse(result.content, params);

      if (!opened) {
        await promptLine('Press Enter to continue.');
        await this.router.replace('aiProviderSelect', params);
      }

      return;
    }

    await this.router.open('aiResult', {
      toolId: this.params.toolId,
      providerTitle: provider.title,
      projectName: params.projectName,
      repoName: params.repoName,
      repoPath: params.repoPath,
      result: result.content,
      selectionParams: params
    });
  }

  async promptForGeneratedCommitMessage(params) {
    const color = this.runtime.color;

    while (true) {
      console.log('');
      console.log(color.bold('Read generated commit message'));
      console.log('');
      console.log(color.dim('Paste the copied prompt into the AI provider, generate a response, copy it, then continue here.'));
      console.log('');
      formatActionColumns([
        color.bold('1.') + ' Read clipboard',
        color.bold('2.') + ' Paste manually',
        ...this.router.globalActionItems(color)
      ]).forEach((row) => console.log(row));
      console.log('');

      const answer = await promptAction('Action: ');
      const key = answer.trim().toLowerCase();

      if (key === 'b' || key === '\u001b') {
        await this.router.replace('aiProviderSelect', params);
        return;
      }

      if (await this.router.handleGlobalAction(key)) {
        return;
      }

      if (key === '1') {
        const read = this.runtime.clipboard.read();

        if (!read.ok) {
          console.log('');
          console.log(color.yellow(read.warning || 'Clipboard could not be read.'));
          continue;
        }

        const opened = await this.openCommitConfirmFromGeneratedResponse(read.text, params);

        if (opened) {
          return;
        }

        continue;
      }

      if (key === '2') {
        const response = await this.readManualGeneratedCommitMessage();
        const opened = await this.openCommitConfirmFromGeneratedResponse(response, params);

        if (opened) {
          return;
        }

        continue;
      }

      console.log('');
      console.log(color.yellow('Invalid selection: ' + answer));
    }
  }

  async readManualGeneratedCommitMessage() {
    const color = this.runtime.color;
    const lines = [];

    console.log('');
    console.log(color.bold('Paste generated commit message'));
    console.log(color.dim('Finish with a line containing only END.'));
    console.log('');

    while (true) {
      const line = await promptLine('');

      if (line.trim() === 'END') {
        break;
      }

      lines.push(line);
    }

    return lines.join('\n');
  }

  async openCommitConfirmFromGeneratedResponse(response, params) {
    const color = this.runtime.color;
    const parsed = this.runtime.commitManager.parseGeneratedCommitResponse(response);

    if (!parsed.ok) {
      console.log('');
      console.log(color.yellow(parsed.warning));
      console.log(color.dim('Expected format:'));
      console.log('Title: ...');
      console.log('Summary: ...');
      return false;
    }

    await this.router.open('commitConfirm', {
      projectName: params.projectName,
      repoPath: params.repoPath,
      title: parsed.title,
      body: parsed.body,
      pushAfterCommit: false,
      returnPage: 'repo',
      returnParams: {
        projectName: params.projectName,
        repoPath: params.repoPath
      }
    });

    return true;
  }

  isCommitMessageTool(toolId) {
    const tool = this.runtime.aiPromptManager.getTool(toolId);

    return tool?.outputMode === 'commit_message';
  }

  formatRepoLabel() {
    const projectName = this.params.projectName || '';
    const repoName = this.params.repoName || this.params.repoPath || '';

    if (projectName && repoName) {
      return projectName + ' / ' + repoName;
    }

    return projectName || repoName || 'Unknown repo';
  }

  formatPayloadSize() {
    const size = Number(this.params.payloadSize ?? String(this.params.userPayload ?? '').length);
    const max = Number(this.params.maxPromptCharacters ?? 0);

    if (this.params.promptLimitPending === true) {
      return String(size) + ' characters (provider limit applied after selection)';
    }

    if (Number.isFinite(max) && max > 0) {
      return String(size) + ' / ' + String(max) + ' characters';
    }

    return String(size) + ' characters';
  }

  renderPayloadWarnings(params) {
    const warnings = Array.isArray(params.payloadWarnings) ? params.payloadWarnings : [];

    if (warnings.length === 0) {
      return;
    }

    warnings.forEach((warning) => console.log(this.runtime.color.yellow(warning)));
    console.log('');
  }

  formatEndpointHost(endpointUrl) {
    try {
      const parsed = new URL(endpointUrl);
      return parsed.host + parsed.pathname;
    } catch {
      return endpointUrl || 'No endpoint';
    }
  }
}
