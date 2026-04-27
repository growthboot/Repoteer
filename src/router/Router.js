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

    const page = new Page({
      runtime: this.runtime,
      router: this,
      params: current.params
    });

    await page.show();
  }
}
