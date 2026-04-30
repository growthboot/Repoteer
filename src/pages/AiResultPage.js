import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';

export class AiResultPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const tool = this.runtime.aiPromptManager.getTool(this.params.toolId);

    console.clear();
    console.log(color.bold('AI: ' + (tool?.title || 'Result') + ' result'));
    console.log('');
    console.log('Provider: ' + (this.params.providerTitle || 'Unknown provider'));
    console.log('Repo: ' + this.formatRepoLabel());
    console.log('');
    console.log(String(this.params.result || '').trim() || color.dim('No result content.'));
    console.log('');
    formatActionColumns([
      color.bold('C.') + ' Copy result',
      color.bold('A.') + ' Run again',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'a') {
      await this.router.back();
      return;
    }

    if (key === 'c') {
      await this.copyResult();
      return;
    }

    await this.router.replace('aiResult', this.params);
  }

  async copyResult() {
    const copied = this.runtime.clipboard.copy(String(this.params.result || ''));

    console.log('');

    if (!copied.ok) {
      console.log(this.runtime.color.yellow(copied.warning || 'Clipboard copy failed.'));
    } else {
      console.log(this.runtime.color.green('AI result copied.'));
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('aiResult', this.params);
  }

  formatRepoLabel() {
    const projectName = this.params.projectName || '';
    const repoName = this.params.repoName || this.params.repoPath || '';

    if (projectName && repoName) {
      return projectName + ' / ' + repoName;
    }

    return projectName || repoName || 'Unknown repo';
  }
}
