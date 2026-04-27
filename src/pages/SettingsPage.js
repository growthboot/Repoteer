import { promptAction, promptLine } from '../utils/input.js';

export class SettingsPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    const color = this.runtime.color;
    const colorEnabled = this.runtime.settings.color !== false;

    console.clear();
    console.log(color.bold('Settings'));
    console.log('');
    console.log('Color: ' + this.formatEnabled(colorEnabled));
    console.log('');
    console.log(color.bold('T.') + ' Toggle color');
    console.log(color.bold('B.') + ' Back');
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 't') {
      await this.toggleColor(colorEnabled);
      return;
    }

    if (key === 'b' || answer === '\u001b') {
      await this.router.back();
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

  formatEnabled(enabled) {
    return enabled ? this.runtime.color.green('On') : this.runtime.color.yellow('Off');
  }
}
