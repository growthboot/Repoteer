import { promptLine } from '../utils/input.js';

export class AddProjectPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Add Project'));
    console.log('');
    console.log(color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const name = await this.ask('Name: ');
    if (name === null) return;

    const projectPath = await this.ask('Path: ');
    if (projectPath === null) return;

    const shortcut = await this.ask('Shortcut (optional): ');
    if (shortcut === null) return;

    const result = this.runtime.projectManager.addProject({
      name,
      path: projectPath,
      shortcut
    });

    if (!result.ok) {
      console.log('');
      console.log(color.yellow(result.error));
      await promptLine('Press Enter to continue.');
      await this.router.replace('addProject');
      return;
    }

    console.log('');
    console.log(color.green('Project saved.'));
    await promptLine('Press Enter to continue.');
    await this.router.back();
  }

  async ask(label) {
    const value = await promptLine(label);
    const key = value.trim().toLowerCase();

    if (key === 'q') {
      await this.router.quit();
      return null;
    }

    if (key === 'b') {
      await this.router.back();
      return null;
    }

    return value;
  }
}
