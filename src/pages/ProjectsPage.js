import { promptLine } from '../utils/input.js';
import { formatShortcut } from '../utils/format.js';

export class ProjectsPage {
  constructor({ runtime, router }) {
    this.runtime = runtime;
    this.router = router;
  }

  async show() {
    console.clear();
    console.log('Repoteer');
    console.log('');

    const snapshot = this.runtime.refreshSnapshot();
    const projects = snapshot.projects;

    if (projects.length === 0) {
      console.log('No projects added.');
    } else {
      console.log('   Project             + / -          net      modified       last commit');
      projects.forEach((project, index) => {
        const label = String(index + 1) + '.';
        const shortcut = formatShortcut(project.shortcut);
        const changes = this.formatChanges(project);
        const net = this.formatNet(project);
        const modified = project.warning ? 'warning' : this.formatRepoCount(project.repos.length);
        const lastCommit = this.formatLastCommit(project);
        console.log(label.padEnd(4) + project.name.padEnd(20) + changes.padEnd(15) + net.padEnd(9) + modified.padEnd(15) + lastCommit + '  ' + shortcut);

        if (project.warning) {
          console.log('    ' + project.warning);
        }
      });
    }

    console.log('');
    console.log('A. Add project');
    console.log('Q. Quit');
    console.log('');

    const answer = await promptLine('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'a') {
      await this.router.open('addProject');
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

    return '+' + String(project.totals.added) + ' / -' + String(project.totals.removed);
  }

  formatNet(project) {
    if (!project.totals) {
      return 'N/A';
    }

    const prefix = project.totals.net >= 0 ? '+' : '';
    return prefix + String(project.totals.net);
  }

  formatLastCommit(project) {
    return project.totals?.lastCommitAgo ?? 'N/A';
  }

  formatRepoCount(count) {
    return String(count) + ' ' + (count === 1 ? 'repo' : 'repos');
  }
}
