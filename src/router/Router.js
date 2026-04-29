export class Router {
  constructor(runtime, pages) {
    this.runtime = runtime;
    this.pages = pages;
    this.stack = [];
  }

  async open(pageName, params = {}) {
    this.stack.push({ pageName, params });
    await this.renderCurrent();
  }

  async replace(pageName, params = {}) {
    if (this.stack.length === 0) {
      this.stack.push({ pageName, params });
    } else {
      this.stack[this.stack.length - 1] = { pageName, params };
    }

    await this.renderCurrent();
  }

  async back() {
    if (this.stack.length > 1) {
      this.stack.pop();
    }

    await this.renderCurrent();
  }

  async backTo(pageName, params = null) {
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
