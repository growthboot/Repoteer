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

    const promptTools = this.runtime.aiPromptManager.listTools();
    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('AI Settings'));
      console.log('');
      console.log('Global max prompt size: ' + String(ai.globalMaxPromptCharacters) + ' characters');
      console.log('');
      console.log(color.bold('Providers'));

      if (providers.length === 0) {
        console.log(color.dim('No AI providers configured.'));
      } else {
        this.renderProviders(providers, ai.globalMaxPromptCharacters, selectedKey);
      }

      console.log('');
      console.log(color.bold('Prompts'));
      promptTools.forEach((tool) => {
        const key = this.promptActionForTool(tool.id);
        const row = color.bold(key.toUpperCase() + '.') + ' ' + tool.title + ' prompt';
        console.log(String(selectedKey || '').toLowerCase() === key ? color.selected(row) : row);
      });
      console.log('');
      formatActionColumns([
        color.bold('G.') + ' Set global max prompt size',
        color.bold('A.') + ' Add browser URL',
        color.bold('L.') + ' Add local model',
        color.bold('E.') + ' Edit provider',
        ...this.router.globalActionItems(color)
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        ...providers.map((provider, index) => {
          return { key: String(index + 1), label: 'Provider: ' + provider.title };
        }),
        ...promptTools.map((tool) => {
          return { key: this.promptActionForTool(tool.id), label: tool.title + ' prompt' };
        }),
        { key: 'g', label: 'Set global max prompt size' },
        { key: 'a', label: 'Add browser URL' },
        { key: 'l', label: 'Add local model' },
        { key: 'e', label: 'Edit provider' },
        ...this.router.globalActionChoices()
      ],
      color,
      render
    });
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

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

    const selectedTool = promptTools.find((tool) => {
      return this.promptActionForTool(tool.id) === key;
    }) ?? null;

    if (selectedTool) {
      await this.router.open('aiPromptEdit', { toolId: selectedTool.id });
      return;
    }

    await this.router.replace('aiSettings');
  }

  renderProviders(providers, globalMaxPromptCharacters, selectedKey = null) {
    const color = this.runtime.color;
    const rows = [
      ['', color.bold('Provider'), color.bold('state'), color.bold('priority'), color.bold('target'), color.bold('max')]
    ];

    providers.forEach((provider, index) => {
      const hotkey = color.hotkey ?? color.bold;

      const cells = [
        hotkey(String(index + 1) + '.'),
        provider.title,
        this.formatEnabled(provider.enabled),
        String(provider.priority),
        this.formatTarget(provider),
        String(provider.maxPromptCharacters || globalMaxPromptCharacters)
      ];

      rows.push(this.highlightRow(cells, String(selectedKey || '') === String(index + 1)));
    });

    formatTable(rows, { leaderGap: color.dim('···') }).forEach((row) => console.log(row));
  }

  highlightRow(cells, isSelected) {
    if (!isSelected || typeof this.runtime.color.selected !== 'function') {
      return cells;
    }

    return cells.map((cell) => this.runtime.color.selected(cell));
  }

  async setGlobalMaxPromptCharacters() {
    const current = this.runtime.settings.ai.globalMaxPromptCharacters;
    const value = await promptLine('Global max prompt size [' + String(current) + ']: ');

    if (await this.handleFormNavigationInput(value)) {
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
    console.log(this.runtime.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title: ');
    if (await this.handleFormNavigationInput(title)) return;

    const url = await promptLine('URL: ');
    if (await this.handleFormNavigationInput(url)) return;

    const priority = await promptLine('Priority [60]: ');
    if (await this.handleFormNavigationInput(priority)) return;

    const maxPromptCharacters = await promptLine('Max prompt size [' + String(this.runtime.settings.ai.globalMaxPromptCharacters) + ']: ');
    if (await this.handleFormNavigationInput(maxPromptCharacters)) return;

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
    console.log(this.runtime.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title: ');
    if (await this.handleFormNavigationInput(title)) return;

    const endpointUrl = await promptLine('Endpoint URL: ');
    if (await this.handleFormNavigationInput(endpointUrl)) return;

    const model = await promptLine('Model (optional): ');
    if (await this.handleFormNavigationInput(model)) return;

    const priority = await promptLine('Priority [60]: ');
    if (await this.handleFormNavigationInput(priority)) return;

    const maxPromptCharacters = await promptLine('Max prompt size [' + String(this.runtime.settings.ai.globalMaxPromptCharacters) + ']: ');
    if (await this.handleFormNavigationInput(maxPromptCharacters)) return;

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

    if (await this.handleFormNavigationInput(answer)) {
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

  async handleFormNavigationInput(value) {
    const key = value.trim().toLowerCase();

    if (key === 'q') {
      await this.router.quit();
      return true;
    }

    if (key === 'b') {
      await this.router.replace('aiSettings');
      return true;
    }

    return false;
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
      return 'v';
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
