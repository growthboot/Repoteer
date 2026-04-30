import { promptAction, promptLine } from '../utils/input.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';

export class ArchivePage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    const color = this.runtime.color;
    const projects = this.runtime.projectManager.listArchivedProjects()
      .sort((a, b) => a.name.localeCompare(b.name));

    console.clear();
    console.log(color.bold('Archived Projects'));
    console.log('');

    if (projects.length === 0) {
      console.log(color.dim('No archived projects.'));
    } else {
      const rows = [
        ['', color.bold('Project'), color.bold('path')]
      ];

      projects.forEach((project, index) => {
        rows.push([
          String(index + 1) + '.',
          project.name,
          project.path
        ]);
      });

      const formattedRows = formatTable(rows);
      console.log(formattedRows[0]);
      console.log('');
      formattedRows.slice(1).forEach((row) => console.log(row));
    }

    console.log('');
    formatActionColumns([
      '[0-9]U. Unarchive project',
      '[0-9]D. Delete project',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    const unarchiveMatch = key.match(/^(\d+)u$/);

    if (unarchiveMatch) {
      const project = projects[Number(unarchiveMatch[1]) - 1] ?? null;

      if (project) {
        this.runtime.projectManager.unarchiveProject(project.name);
      }

      await this.router.replace('archive');
      return;
    }

    const deleteMatch = key.match(/^(\d+)d$/);

    if (deleteMatch) {
      const project = projects[Number(deleteMatch[1]) - 1] ?? null;

      if (project) {
        await this.deleteProject(project);
        return;
      }
    }

    await this.router.replace('archive');
  }

  async deleteProject(project) {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Delete Project: ' + project.name + '?'));
    console.log('');
    console.log('This will remove it from Repoteer only.');
    console.log('No files will be deleted.');
    console.log('');

    const answer = await promptLine('Type "yes" to confirm: ');

    if (answer.trim().toLowerCase() !== 'yes') {
      await this.router.replace('archive');
      return;
    }

    const result = this.runtime.projectManager.deleteProject(project.name);

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.error));
      await promptLine('Press Enter to continue.');
      await this.router.replace('archive');
      return;
    }

    this.runtime.bookmarksStore.deleteProject(project.name);
    this.runtime.commandsStore.deleteProject(project.name);

    console.log(color.green('Project deleted.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('archive');
  }
}
