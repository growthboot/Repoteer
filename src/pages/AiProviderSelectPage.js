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
      color.bold('S.') + ' Settings',
      color.bold('B.') + ' Back'
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'b' || answer === '\u001b') {
      await this.router.back();
      return;
    }

    if (key === 's') {
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

    if (Number.isFinite(max) && max > 0) {
      return String(size) + ' / ' + String(max) + ' characters';
    }

    return String(size) + ' characters';
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
