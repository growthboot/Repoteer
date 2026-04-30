import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';

export class SettingsPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    const color = this.runtime.color;
    const colorEnabled = this.runtime.settings.color !== false;
    const alternateScreenEnabled = this.runtime.settings.alternateScreen !== false;
    const ai = this.runtime.settings.ai;
    const enabledProviders = ai.providers.filter((provider) => provider.enabled).length;
    const disabledProviders = ai.providers.length - enabledProviders;

    console.clear();
    console.log(color.bold('Settings'));
    console.log('');
    console.log(color.bold('General'));
    console.log('Alternate screen              ' + this.formatEnabled(alternateScreenEnabled));
    console.log('Color                         ' + this.formatEnabled(colorEnabled));
    console.log('');
    console.log(color.bold('AI'));
    console.log('Configured providers          ' + String(enabledProviders) + ' on, ' + String(disabledProviders) + ' off');
    console.log('Global max prompt size        ' + String(ai.globalMaxPromptCharacters) + ' characters');
    console.log('');
    formatActionColumns([
      color.bold('L.') + ' Toggle alternate screen',
      color.bold('T.') + ' Toggle color',
      color.bold('A.') + ' AI settings',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 't') {
      await this.toggleColor(colorEnabled);
      return;
    }

    if (key === 'l') {
      await this.toggleAlternateScreen(alternateScreenEnabled);
      return;
    }

    if (key === 'a') {
      await this.router.open('aiSettings');
      return;
    }

    await this.router.replace('settings');
  }

  async toggleColor(colorEnabled) {
    const next = this.runtime.settingsStore.setColor(!colorEnabled);
    this.runtime.settings = next;
    this.runtime.refreshColor();

    console.log('');
    console.log(this.runtime.color.green('Color ' + (next.color ? 'enabled.' : 'disabled.')));
    await promptLine('Press Enter to continue.');
    await this.router.replace('settings');
  }

  async toggleAlternateScreen(alternateScreenEnabled) {
    const next = this.runtime.settingsStore.setAlternateScreen(!alternateScreenEnabled);
    this.runtime.settings = next;
    this.runtime.terminal.setAlternateScreenEnabled(next.alternateScreen !== false);

    console.log('');
    console.log(this.runtime.color.green('Alternate screen ' + (next.alternateScreen ? 'enabled.' : 'disabled.')));
    await promptLine('Press Enter to continue.');
    await this.router.replace('settings');
  }

  formatEnabled(enabled) {
    return enabled ? this.runtime.color.green('On') : this.runtime.color.yellow('Off');
  }
}
