import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';

export class AiProviderEditPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const provider = this.runtime.settings.ai.providers.find((candidate) => candidate.id === this.params.providerId) ?? null;

    console.clear();

    if (!provider) {
      console.log(color.yellow('Provider not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log(color.bold('Edit AI Provider: ' + provider.title));
    console.log('');
    console.log('Type                 ' + this.formatType(provider.type));
    console.log('Enabled              ' + (provider.enabled ? 'On' : 'Off'));

    if (provider.type === 'local') {
      console.log('Endpoint             ' + (provider.endpointUrl || ''));
      console.log('Format               OpenAI-compatible chat completions');
      console.log('Model                ' + (provider.model || ''));
    } else {
      console.log('URL                  ' + (provider.url || ''));
    }

    console.log('Priority             ' + String(provider.priority));
    console.log('Max prompt size      ' + String(provider.maxPromptCharacters) + ' characters');
    console.log('');
    formatActionColumns(this.actionsForProvider(provider, color)).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 't') {
      await this.updateProvider(provider, { enabled: !provider.enabled }, 'Provider updated.');
      return;
    }

    if (key === 'u') {
      await this.changeUrl(provider);
      return;
    }

    if (key === 'o' && provider.type === 'local') {
      await this.changeModel(provider);
      return;
    }

    if (key === 'p') {
      await this.changePriority(provider);
      return;
    }

    if (key === 'm') {
      await this.changeMaxPromptCharacters(provider);
      return;
    }

    if (key === 'b' || answer === '\u001b') {
      await this.router.back();
      return;
    }

    await this.router.replace('aiProviderEdit', { providerId: provider.id });
  }

  actionsForProvider(provider, color) {
    const actions = [
      color.bold('T.') + ' Toggle enabled',
      color.bold('U.') + ' Change ' + (provider.type === 'local' ? 'endpoint URL' : 'URL')
    ];

    if (provider.type === 'local') {
      actions.push(color.bold('O.') + ' Change model');
    }

    actions.push(
      color.bold('P.') + ' Change priority',
      color.bold('M.') + ' Change max prompt size',
      color.bold('B.') + ' Back'
    );

    return actions;
  }

  async changeUrl(provider) {
    const label = provider.type === 'local' ? 'Endpoint URL' : 'URL';
    const current = provider.type === 'local' ? provider.endpointUrl : provider.url;
    const value = await promptLine(label + ' [' + current + ']: ');

    if (this.isCancel(value) || !value.trim()) {
      await this.router.replace('aiProviderEdit', { providerId: provider.id });
      return;
    }

    if (!this.isHttpUrl(value)) {
      await this.showWarning('URL must start with http:// or https://.', provider.id);
      return;
    }

    await this.updateProvider(
      provider,
      provider.type === 'local' ? { endpointUrl: value } : { url: value },
      'Provider updated.'
    );
  }

  async changeModel(provider) {
    const value = await promptLine('Model [' + (provider.model || '') + ']: ');

    if (this.isCancel(value)) {
      await this.router.replace('aiProviderEdit', { providerId: provider.id });
      return;
    }

    await this.updateProvider(provider, { model: value.trim() || provider.model }, 'Provider updated.');
  }

  async changePriority(provider) {
    const value = await promptLine('Priority [' + String(provider.priority) + ']: ');

    if (this.isCancel(value) || !value.trim()) {
      await this.router.replace('aiProviderEdit', { providerId: provider.id });
      return;
    }

    if (!/^-?\d+$/.test(value.trim())) {
      await this.showWarning('Priority must be a number.', provider.id);
      return;
    }

    await this.updateProvider(provider, { priority: value }, 'Provider updated.');
  }

  async changeMaxPromptCharacters(provider) {
    const value = await promptLine('Max prompt size [' + String(provider.maxPromptCharacters) + ']: ');

    if (this.isCancel(value) || !value.trim()) {
      await this.router.replace('aiProviderEdit', { providerId: provider.id });
      return;
    }

    if (!/^\d+$/.test(value.trim()) || Number(value.trim()) <= 0) {
      await this.showWarning('Max prompt size must be a positive number.', provider.id);
      return;
    }

    await this.updateProvider(provider, { maxPromptCharacters: value }, 'Provider updated.');
  }

  async updateProvider(provider, updates, message) {
    const updated = this.runtime.settingsStore.updateAiProvider(provider.id, updates);

    if (!updated) {
      await this.showWarning('Provider not found.', provider.id);
      return;
    }

    this.runtime.settings = this.runtime.settingsStore.get();

    console.log('');
    console.log(this.runtime.color.green(message));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiProviderEdit', { providerId: provider.id });
  }

  formatType(type) {
    return type === 'local' ? 'Local' : 'Browser';
  }

  isCancel(value) {
    return value.trim().toLowerCase() === 'q';
  }

  isHttpUrl(value) {
    return /^https?:\/\//.test(value.trim());
  }

  async showWarning(message, providerId) {
    console.log('');
    console.log(this.runtime.color.yellow(message));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiProviderEdit', { providerId });
  }
}
