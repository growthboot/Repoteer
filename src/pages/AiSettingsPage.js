import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatTable } from '../utils/table.js';

export class AiSettingsPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    const color = this.runtime.color;
    const ai = this.runtime.settings.ai;
    const providers = this.sortedProviders(ai.providers);

    console.clear();
    console.log(color.bold('AI Settings'));
    console.log('');
    console.log('Global max prompt size: ' + String(ai.globalMaxPromptCharacters) + ' characters');
    console.log('');
    console.log(color.bold('Providers'));

    if (providers.length === 0) {
      console.log(color.dim('No AI providers configured.'));
    } else {
      this.renderProviders(providers, ai.globalMaxPromptCharacters);
    }

    console.log('');
    console.log(color.bold('Prompts'));
    this.runtime.aiPromptManager.listTools().forEach((tool) => {
      console.log(color.bold(this.promptActionForTool(tool.id).toUpperCase() + '.') + ' ' + tool.title + ' prompt');
    });
    console.log('');
    formatActionColumns([
      color.bold('G.') + ' Set global max prompt size',
      color.bold('A.') + ' Add browser URL',
      color.bold('L.') + ' Add local model',
      color.bold('E.') + ' Edit provider',
      color.bold('B.') + ' Back'
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'g') {
      await this.setGlobalMaxPromptCharacters();
      return;
    }

    if (key === 'a') {
      await this.addBrowserProvider();
      return;
    }

    if (key === 'l') {
      await this.addLocalProvider();
      return;
    }

    if (key === 'e') {
      await this.openProviderEdit(providers);
      return;
    }

    if (/^\d+$/.test(key)) {
      const provider = providers[Number(key) - 1] ?? null;

      if (provider) {
        await this.router.open('aiProviderEdit', { providerId: provider.id });
        return;
      }
    }

    const selectedTool = this.runtime.aiPromptManager.listTools().find((tool) => {
      return this.promptActionForTool(tool.id) === key;
    }) ?? null;

    if (selectedTool) {
      await this.router.open('aiPromptEdit', { toolId: selectedTool.id });
      return;
    }

    if (key === 'b' || answer === '\u001b') {
      await this.router.back();
      return;
    }

    await this.router.replace('aiSettings');
  }

  renderProviders(providers, globalMaxPromptCharacters) {
    const color = this.runtime.color;
    const rows = [
      ['', color.bold('Provider'), color.bold('state'), color.bold('priority'), color.bold('target'), color.bold('max')]
    ];

    providers.forEach((provider, index) => {
      rows.push([
        String(index + 1) + '.',
        provider.title,
        this.formatEnabled(provider.enabled),
        String(provider.priority),
        this.formatTarget(provider),
        String(provider.maxPromptCharacters || globalMaxPromptCharacters)
      ]);
    });

    formatTable(rows).forEach((row) => console.log(row));
  }

  async setGlobalMaxPromptCharacters() {
    const current = this.runtime.settings.ai.globalMaxPromptCharacters;
    const value = await promptLine('Global max prompt size [' + String(current) + ']: ');

    if (this.isCancel(value)) {
      await this.router.replace('aiSettings');
      return;
    }

    if (!value.trim()) {
      await this.router.replace('aiSettings');
      return;
    }

    if (!this.isPositiveInteger(value)) {
      await this.showWarning('Max prompt size must be a positive number.');
      return;
    }

    this.runtime.settings = this.runtime.settingsStore.setAiGlobalMaxPromptCharacters(value);
    console.log('');
    console.log(this.runtime.color.green('AI settings updated.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiSettings');
  }

  async addBrowserProvider() {
    console.clear();
    console.log(this.runtime.color.bold('Add Browser AI Provider'));
    console.log('');
    console.log(this.runtime.color.dim('Type "q" to cancel.'));
    console.log('');

    const title = await promptLine('Title: ');
    if (this.isCancel(title)) return await this.router.replace('aiSettings');

    const url = await promptLine('URL: ');
    if (this.isCancel(url)) return await this.router.replace('aiSettings');

    const priority = await promptLine('Priority [60]: ');
    if (this.isCancel(priority)) return await this.router.replace('aiSettings');

    const maxPromptCharacters = await promptLine('Max prompt size [' + String(this.runtime.settings.ai.globalMaxPromptCharacters) + ']: ');
    if (this.isCancel(maxPromptCharacters)) return await this.router.replace('aiSettings');

    if (!title.trim()) {
      await this.showWarning('Provider title is required.');
      return;
    }

    if (!this.isHttpUrl(url)) {
      await this.showWarning('URL must start with http:// or https://.');
      return;
    }

    if (priority.trim() && !this.isInteger(priority)) {
      await this.showWarning('Priority must be a number.');
      return;
    }

    if (maxPromptCharacters.trim() && !this.isPositiveInteger(maxPromptCharacters)) {
      await this.showWarning('Max prompt size must be a positive number.');
      return;
    }

    this.runtime.settingsStore.addAiBrowserProvider({
      title,
      url,
      priority: priority.trim() || 60,
      maxPromptCharacters: maxPromptCharacters.trim() || this.runtime.settings.ai.globalMaxPromptCharacters
    });
    this.runtime.settings = this.runtime.settingsStore.get();

    console.log('');
    console.log(this.runtime.color.green('Browser provider saved.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiSettings');
  }

  async addLocalProvider() {
    console.clear();
    console.log(this.runtime.color.bold('Add Local AI Provider'));
    console.log('');
    console.log(this.runtime.color.dim('Type "q" to cancel.'));
    console.log('');

    const title = await promptLine('Title: ');
    if (this.isCancel(title)) return await this.router.replace('aiSettings');

    const endpointUrl = await promptLine('Endpoint URL: ');
    if (this.isCancel(endpointUrl)) return await this.router.replace('aiSettings');

    const model = await promptLine('Model (optional): ');
    if (this.isCancel(model)) return await this.router.replace('aiSettings');

    const priority = await promptLine('Priority [60]: ');
    if (this.isCancel(priority)) return await this.router.replace('aiSettings');

    const maxPromptCharacters = await promptLine('Max prompt size [' + String(this.runtime.settings.ai.globalMaxPromptCharacters) + ']: ');
    if (this.isCancel(maxPromptCharacters)) return await this.router.replace('aiSettings');

    if (!title.trim()) {
      await this.showWarning('Provider title is required.');
      return;
    }

    if (!this.isHttpUrl(endpointUrl)) {
      await this.showWarning('Endpoint URL must start with http:// or https://.');
      return;
    }

    if (priority.trim() && !this.isInteger(priority)) {
      await this.showWarning('Priority must be a number.');
      return;
    }

    if (maxPromptCharacters.trim() && !this.isPositiveInteger(maxPromptCharacters)) {
      await this.showWarning('Max prompt size must be a positive number.');
      return;
    }

    this.runtime.settingsStore.addAiLocalProvider({
      title,
      endpointUrl,
      model,
      priority: priority.trim() || 60,
      maxPromptCharacters: maxPromptCharacters.trim() || this.runtime.settings.ai.globalMaxPromptCharacters
    });
    this.runtime.settings = this.runtime.settingsStore.get();

    console.log('');
    console.log(this.runtime.color.green('Local provider saved.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiSettings');
  }

  async openProviderEdit(providers) {
    const answer = await promptLine('Provider number: ');

    if (this.isCancel(answer)) {
      await this.router.replace('aiSettings');
      return;
    }

    const provider = providers[Number(answer.trim()) - 1] ?? null;

    if (!provider) {
      await this.showWarning('Provider not found.');
      return;
    }

    await this.router.open('aiProviderEdit', { providerId: provider.id });
  }

  sortedProviders(providers) {
    return [...providers].sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.title.localeCompare(right.title);
    });
  }

  formatEnabled(enabled) {
    return enabled ? this.runtime.color.green('On') : this.runtime.color.yellow('Off');
  }

  formatTarget(provider) {
    if (provider.type === 'local') {
      return provider.endpointUrl || 'No endpoint';
    }

    return provider.url || 'No URL';
  }

  isCancel(value) {
    return value.trim().toLowerCase() === 'q';
  }

  isHttpUrl(value) {
    return /^https?:\/\//.test(value.trim());
  }

  isInteger(value) {
    return /^-?\d+$/.test(value.trim());
  }

  isPositiveInteger(value) {
    return /^\d+$/.test(value.trim()) && Number(value.trim()) > 0;
  }

  promptActionForTool(toolId) {
    if (toolId === 'diff_summary') {
      return 'd';
    }

    if (toolId === 'commit_review') {
      return 'c';
    }

    if (toolId === 'commit_message') {
      return 'm';
    }

    if (toolId === 'security_review') {
      return 's';
    }

    return '';
  }

  async showWarning(message) {
    console.log('');
    console.log(this.runtime.color.yellow(message));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiSettings');
  }
}
