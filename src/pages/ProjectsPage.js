import { promptAction } from '../utils/input.js';
import { formatShortcut } from '../utils/format.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';

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
    const hideCleanProjects = this.runtime.projectsPageHideClean === true;
    const projects = hideCleanProjects ? snapshot.projects.filter((project) => {
      return this.shouldShowProjectWhenCleanHidden(project);
    }) : snapshot.projects;

    if (projects.length === 0) {
      const message = snapshot.projects.length === 0 ? 'No projects added.' : 'No projects with code changes.';
      console.log(color.dim(message));
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
    formatActionColumns([
      color.bold('T.') + ' ' + (hideCleanProjects ? 'Show all projects' : 'Hide projects without code changes'),
      color.bold('R.') + ' Refresh',
      color.bold('A.') + ' Add project',
      color.bold('S.') + ' Settings',
      color.bold('Q.') + ' Quit'
    ]).forEach((row) => console.log(row));
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

    if (key === 't') {
      this.runtime.projectsPageHideClean = !hideCleanProjects;
      await this.router.replace('projects');
      return;
    }

    if (key === 'r') {
      await this.router.replace('projects');
      return;
    }

    if (key === 'q') {
      return;
    }

    await this.router.replace('projects');
  }

  shouldShowProjectWhenCleanHidden(project) {
    return Boolean(project.warning) || (
      Boolean(project.totals) && (
        project.totals.added !== 0 ||
        project.totals.removed !== 0 ||
        project.totals.modifiedFiles !== 0
      )
    );
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
