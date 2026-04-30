export class Router {
  constructor(runtime, pages) {
    this.runtime = runtime;
    this.pages = pages;
    this.stack = [];
    this.isQuitting = false;
  }

  async open(pageName, params = {}) {
    if (this.isQuitting) {
      return;
    }

    this.stack.push({ pageName, params });
    await this.renderCurrent();
  }

  async replace(pageName, params = {}) {
    if (this.isQuitting) {
      return;
    }

    if (this.stack.length === 0) {
      this.stack.push({ pageName, params });
    } else {
      this.stack[this.stack.length - 1] = { pageName, params };
    }

    await this.renderCurrent();
  }

  async back() {
    if (this.isQuitting) {
      return;
    }

    if (this.stack.length > 1) {
      this.stack.pop();
    }

    await this.renderCurrent();
  }

  async backTo(pageName, params = null) {
    if (this.isQuitting) {
      return;
    }

    let index = -1;

    for (let i = this.stack.length - 1; i >= 0; i -= 1) {
      if (this.stack[i].pageName === pageName) {
        index = i;
        break;
      }
    }

    if (index === -1) {
      await this.replace(pageName, params ?? {});
      return;
    }

    this.stack = this.stack.slice(0, index + 1);

    if (params !== null) {
      this.stack[index] = {
        pageName,
        params
      };
    }

    await this.renderCurrent();
  }

  async quit() {
    this.isQuitting = true;
    this.stack = [];
  }

  async refresh() {
    const current = this.current();

    if (!current) {
      return;
    }

    await this.replace(current.pageName, current.params);
  }

  async openSettings() {
    const current = this.current();

    if (current?.pageName === 'settings') {
      await this.replace('settings');
      return;
    }

    if (this.stack.some((entry) => entry.pageName === 'settings')) {
      await this.backTo('settings');
      return;
    }

    await this.open('settings');
  }

  async handleGlobalAction(key) {
    const normalized = String(key || '').trim().toLowerCase();

    if (normalized === 'q') {
      await this.quit();
      return true;
    }

    if (normalized === 'h') {
      await this.backTo('projects');
      return true;
    }

    if (normalized === 's') {
      await this.openSettings();
      return true;
    }

    if (normalized === 'r') {
      await this.refresh();
      return true;
    }

    if (normalized === 'b' || normalized === '\u001b') {
      await this.back();
      return true;
    }

    return false;
  }

  globalActionItems(color, options = {}) {
    const includeBack = options.back !== false;
    const actions = [
      color.bold('H.') + ' Home',
      color.bold('R.') + ' Refresh',
      color.bold('S.') + ' Settings',
      color.bold('Q.') + ' Quit'
    ];

    if (includeBack) {
      actions.push(color.bold('B.') + ' Back');
    }

    return actions;
  }

  current() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  async renderCurrent() {
    const current = this.current();

    if (!current) {
      return;
    }

    const Page = this.pages[current.pageName];

    if (!Page) {
      throw new Error('Unknown page: ' + current.pageName);
    }

    this.applyTerminalMode(Page);

    const page = new Page({
      runtime: this.runtime,
      router: this,
      params: current.params
    });

    await page.show();
  }

  applyTerminalMode(Page) {
    const terminal = this.runtime.terminal;

    if (!terminal) {
      return;
    }

    if (Page.scrollMode === 'normal') {
      terminal.exitAlternateScreen();
      return;
    }

    terminal.enterAlternateScreen();
  }
}
