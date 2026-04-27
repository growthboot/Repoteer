import { promptAction } from '../utils/input.js';
import { formatShortcut } from '../utils/format.js';
import { formatTable } from '../utils/table.js';

export class ProjectsPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Repoteer'));
    console.log('');

    const snapshot = this.runtime.refreshSnapshot();
    const projects = snapshot.projects;

    if (projects.length === 0) {
      console.log(color.dim('No projects added.'));
    } else {
      const rows = [
        ['', color.bold('Project'), color.bold('+ / -'), color.bold('net'), color.bold('modified'), color.bold('last commit'), color.bold('shortcut')]
      ];

      projects.forEach((project, index) => {
        const label = String(index + 1) + '.';
        const shortcut = color.dim(formatShortcut(project.shortcut));
        const changes = this.formatChanges(project);
        const net = this.formatNet(project);
        const modified = project.warning ? color.yellow('warning') : this.formatRepoCount(project.repos.length);
        const lastCommit = this.formatLastCommit(project);

        rows.push([label, project.name, changes, net, modified, lastCommit, shortcut]);
      });

      const formattedRows = formatTable(rows);
      console.log(formattedRows[0]);
      console.log('');
      formattedRows.slice(1).forEach((row) => console.log(row));

      projects.forEach((project) => {
        if (project.warning) {
          console.log('    ' + color.yellow(project.warning));
        }
      });
    }

    console.log('');
    console.log(color.bold('A.') + ' Add project');
    console.log(color.bold('S.') + ' Settings');
    console.log(color.bold('Q.') + ' Quit');
    console.log('');

    const answer = await promptAction('Action: ');

    const key = answer.trim().toLowerCase();

    if (key === 'a') {
      await this.router.open('addProject');
      return;
    }

    if (key === 's') {
      await this.router.open('settings');
      return;
    }

    if (key === 'q') {
      return;
    }

    await this.router.replace('projects');
  }

  formatChanges(project) {
    if (!project.totals) {
      return 'N/A';
    }

    const color = this.runtime.color;
    return color.green('+' + String(project.totals.added)) + ' / ' + color.red('-' + String(project.totals.removed));
  }

  formatNet(project) {
    if (!project.totals) {
      return 'N/A';
    }

    const color = this.runtime.color;
    const prefix = project.totals.net >= 0 ? '+' : '';
    const value = prefix + String(project.totals.net);

    return project.totals.net < 0 ? color.red(value) : color.green(value);
  }

  formatLastCommit(project) {
    return project.totals?.lastCommitAgo ?? 'N/A';
  }

  formatRepoCount(count) {
    return String(count) + ' ' + (count === 1 ? 'repo' : 'repos');
  }
}
