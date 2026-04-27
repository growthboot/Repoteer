import { promptLine } from '../utils/input.js';

export class AddProjectPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    console.clear();
    console.log('Add Project');
    console.log('');
    console.log('Type "q" to cancel.');
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
      console.log(result.error);
      await promptLine('Press Enter to continue.');
      await this.router.replace('addProject');
      return;
    }

    console.log('');
    console.log('Project saved.');
    await promptLine('Press Enter to continue.');
    await this.router.back();
  }

  async ask(label) {
    const value = await promptLine(label);

    if (value.trim().toLowerCase() === 'q') {
      await this.router.back();
      return null;
    }

    return value;
  }
}
