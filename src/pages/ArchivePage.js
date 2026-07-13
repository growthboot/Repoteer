import { gridChoices, promptAction, promptLine } from '../utils/input.js';
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
    const projectChoices = projects.flatMap((project, index) => {
      const key = String(index + 1);
      const navigationRow = {};

      return [
        { key: key + 'u', label: 'Unarchive: ' + project.name, navigationRow, navigationColumn: 0 },
        { key: key + 'd', label: 'Delete: ' + project.name, navigationRow, navigationColumn: 1 }
      ];
    });

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('Archived Projects'));
      console.log('');

      if (projects.length === 0) {
        console.log(color.dim('No archived projects.'));
      } else {
        this.renderProjects(projects, selectedKey);
      }

      console.log('');
      formatActionColumns([
        '[0-9]U. Unarchive project',
        '[0-9]D. Delete project',
        ...this.router.globalActionItems(color)
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        ...projectChoices,
        ...gridChoices(this.router.globalActionChoices())
      ],
      color,
      render
    });
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

  renderProjects(projects, selectedKey = null) {
    const color = this.runtime.color;
    const rows = [
      ['', color.bold('Project'), color.bold('path')]
    ];

    projects.forEach((project, index) => {
      const hotkey = color.hotkey ?? color.bold;
      const key = String(index + 1);
      const cells = [
        hotkey(key + '.'),
        project.name,
        project.path
      ];

      rows.push(this.highlightRow(cells, [key + 'u', key + 'd'].includes(String(selectedKey || '').toLowerCase())));
    });

    const formattedRows = formatTable(rows, { leaderGap: color.dim('···') });
    console.log(formattedRows[0]);
    console.log('');
    formattedRows.slice(1).forEach((row) => console.log(row));
  }

  highlightRow(cells, isSelected) {
    if (!isSelected || typeof this.runtime.color.selected !== 'function') {
      return cells;
    }

    return cells.map((cell) => this.runtime.color.selected(cell));
  }
}
