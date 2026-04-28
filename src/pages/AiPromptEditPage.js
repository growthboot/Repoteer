import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';

export class AiPromptEditPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const prompt = this.runtime.aiPromptManager.getToolPrompt(this.params.toolId);

    console.clear();

    if (!prompt) {
      console.log(color.yellow('AI tool not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log(color.bold('AI Prompt: ' + prompt.tool.title));
    console.log('');
    console.log(color.bold('System prompt'));
    console.log(prompt.systemPrompt);
    console.log('');
    console.log(color.bold('Pre-prompt'));
    console.log(prompt.prePrompt);
    console.log('');
    formatActionColumns([
      color.bold('Y.') + ' Edit system prompt',
      color.bold('P.') + ' Edit pre-prompt',
      color.bold('R.') + ' Reset prompts',
      color.bold('B.') + ' Back'
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'y') {
      await this.editPrompt(prompt.tool.id, 'system', 'System prompt');
      return;
    }

    if (key === 'p') {
      await this.editPrompt(prompt.tool.id, 'pre', 'Pre-prompt');
      return;
    }

    if (key === 'r') {
      await this.resetPrompts(prompt.tool.id);
      return;
    }

    if (key === 'b' || answer === '\u001b') {
      await this.router.back();
      return;
    }

    await this.router.replace('aiPromptEdit', { toolId: this.params.toolId });
  }

  async editPrompt(toolId, field, label) {
    console.clear();
    console.log(this.runtime.color.bold('Edit ' + label));
    console.log('');
    console.log(this.runtime.color.dim('Enter one line. Type "q" to cancel.'));
    console.log('');

    const value = await promptLine(label + ': ');

    if (value.trim().toLowerCase() === 'q') {
      await this.router.replace('aiPromptEdit', { toolId });
      return;
    }

    if (!value.trim()) {
      console.log('');
      console.log(this.runtime.color.yellow(label + ' is required.'));
      await promptLine('Press Enter to continue.');
      await this.router.replace('aiPromptEdit', { toolId });
      return;
    }

    this.runtime.aiPromptManager.setToolPrompt(toolId, field, value);

    console.log('');
    console.log(this.runtime.color.green('Prompt updated.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('aiPromptEdit', { toolId });
  }

  async resetPrompts(toolId) {
    console.clear();
    console.log(this.runtime.color.bold('Reset AI Prompt?'));
    console.log('');
    console.log('This will restore the default system prompt and pre-prompt for this tool.');
    console.log('');

    const answer = await promptLine('Type "yes" to confirm: ');

    if (answer.trim().toLowerCase() === 'yes') {
      this.runtime.aiPromptManager.resetToolPrompt(toolId, 'system');
      this.runtime.aiPromptManager.resetToolPrompt(toolId, 'pre');
      console.log('');
      console.log(this.runtime.color.green('Prompt reset.'));
      await promptLine('Press Enter to continue.');
    }

    await this.router.replace('aiPromptEdit', { toolId });
  }
}
