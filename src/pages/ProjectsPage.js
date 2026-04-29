import { promptAction, promptLine } from '../utils/input.js';
import { formatShortcut } from '../utils/format.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';
import { ProjectItemsPanel } from './ProjectItemsPanel.js';

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
    const orderedProjects = this.orderProjects(snapshot.projects);
    const projects = hideCleanProjects ? orderedProjects.filter((project) => {
      return this.shouldShowProjectWhenCleanHidden(project);
    }) : orderedProjects;

    if (projects.length === 0) {
      const message = snapshot.projects.length === 0 ? 'No projects added.' : 'No projects with code changes.';
      console.log(color.dim(message));
    } else {
      this.renderProjectGroups(projects);
    }

    console.log('');
    formatActionColumns([
      'T. ' + (hideCleanProjects ? 'Show all projects' : 'Hide projects without code changes'),
      'R. Refresh',
      'A. Add project',
      'V. View archive',
      '[0-9]P. Pin/unpin project',
      '[0-9]A. Archive project',
      'S. Settings',
      'Q. Quit'
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');

    const key = answer.trim().toLowerCase();

    if (key === 'a') {
      await this.router.open('addProject');
      return;
    }

    if (key === 'v') {
      await this.router.open('archive');
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

    const pinMatch = key.match(/^(\d+)p$/);

    if (pinMatch) {
      const project = projects[Number(pinMatch[1]) - 1] ?? null;

      if (project) {
        this.runtime.projectManager.setProjectPinned(project.name, project.pinned !== true);
      }

      await this.router.replace('projects');
      return;
    }

    const archiveMatch = key.match(/^(\d+)a$/);

    if (archiveMatch) {
      const project = projects[Number(archiveMatch[1]) - 1] ?? null;

      if (project) {
        this.runtime.projectManager.archiveProject(project.name);
      }

      await this.router.replace('projects');
      return;
    }

    const selectedProject = /^\d+$/.test(key)
      ? projects[Number(key) - 1] ?? null
      : projects.find((project) => {
        return project.shortcut && project.shortcut.toLowerCase() === key;
      }) ?? null;

    if (selectedProject) {
      await this.router.open('project', { projectName: selectedProject.name });
      return;
    }

    await this.router.replace('projects');
  }

  async showProject(projectName) {
    const color = this.runtime.color;
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === projectName) ?? null;
    const hideReposWithoutLineChanges = this.runtime.projectsPageHideReposWithoutLineChanges === true;

    console.clear();

    if (!project) {
      console.log(color.bold('Project not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.replace('projects');
      return;
    }

    console.log(color.bold('Project: ' + project.name));
    console.log('');

    const repos = hideReposWithoutLineChanges ? project.repos.filter((repo) => {
      return this.shouldShowRepoWhenLineChangesHidden(repo);
    }) : project.repos;

    if (project.warning) {
      console.log(color.yellow(project.warning));
    } else if (project.repos.length === 0) {
      console.log(color.dim('No Git repositories found.'));
    } else if (repos.length === 0) {
      console.log(color.dim('No repos with line changes.'));
    } else {
      const rows = [
        ['', color.bold('Repo'), color.bold('+ / -'), color.bold('net'), color.bold('modified'), color.bold('last commit')]
      ];

      repos.forEach((repo, index) => {
        const prefix = repo.net >= 0 ? '+' : '';
        const net = prefix + String(repo.net);

        rows.push([
          String(index + 1) + '.',
          repo.name,
          color.green('+' + String(repo.added)) + ' / ' + color.red('-' + String(repo.removed)),
          repo.net < 0 ? color.red(net) : color.green(net),
          repo.warning ? color.yellow('warning') : this.formatModifiedFiles(repo.modifiedFiles),
          repo.lastCommitAgo ?? 'N/A'
        ]);
      });

      const formattedRows = formatTable(rows);
      console.log(formattedRows[0]);
      console.log('');
      formattedRows.slice(1).forEach((row) => console.log(row));
    }

    const itemsPanel = new ProjectItemsPanel({
      runtime: this.runtime,
      color,
      showProject: async (nextProjectName) => {
        await this.showProject(nextProjectName);
      }
    });

    console.log('');
    itemsPanel.render(project.name);
    console.log('');
    formatActionColumns([
      color.bold('B.') + ' Back',
      color.bold('T.') + ' ' + (hideReposWithoutLineChanges ? 'Show all repos' : 'Hide repos without line changes'),
      color.bold('D.') + ' Delete project',
      color.bold('R.') + ' Rename project'
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'b' || key === '\u001b') {
      await this.router.replace('projects');
      return;
    }

    if (key === 't') {
      this.runtime.projectsPageHideReposWithoutLineChanges = !hideReposWithoutLineChanges;
      await this.showProject(project.name);
      return;
    }

    if (key === 'r') {
      await this.editProject(project);
      return;
    }

    if (key === 'd') {
      await this.deleteProject(project);
      return;
    }

    if (await itemsPanel.handleAction(project, key)) {
      return;
    }

    await this.showProject(project.name);
  }

  async editProject(project) {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Edit Project: ' + project.name));
    console.log('');
    console.log(color.dim('Leave a value blank to keep the current value.'));
    console.log(color.dim('Type "q" to cancel.'));
    console.log('');

    const name = await promptLine('Name [' + project.name + ']: ');

    if (name.trim().toLowerCase() === 'q') {
      await this.showProject(project.name);
      return;
    }

    const projectPath = await promptLine('Path [' + project.path + ']: ');

    if (projectPath.trim().toLowerCase() === 'q') {
      await this.showProject(project.name);
      return;
    }

    const currentShortcut = project.shortcut ?? '';
    const shortcut = await promptLine('Shortcut [' + formatShortcut(project.shortcut) + ']: ');

    if (shortcut.trim().toLowerCase() === 'q') {
      await this.showProject(project.name);
      return;
    }

    const result = this.runtime.projectManager.updateProject(project.name, {
      name: name.trim() || project.name,
      path: projectPath.trim() || project.path,
      shortcut: shortcut.trim() || currentShortcut
    });

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.error));
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    if (result.project.name !== project.name) {
      this.runtime.bookmarksStore.renameProject(project.name, result.project.name);
      this.runtime.commandsStore.renameProject(project.name, result.project.name);
    }
    console.log(color.green('Project updated.'));
    await promptLine('Press Enter to continue.');
    await this.showProject(result.project.name);
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
      await this.showProject(project.name);
      return;
    }

    const result = this.runtime.projectManager.deleteProject(project.name);

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.error));
      await promptLine('Press Enter to continue.');
      await this.router.replace('projects');
      return;
    }

    this.runtime.bookmarksStore.deleteProject(project.name);
    this.runtime.commandsStore.deleteProject(project.name);

    console.log(color.green('Project deleted.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('projects');
  }

  shouldShowRepoWhenLineChangesHidden(repo) {
    return Boolean(repo.warning) || repo.added !== 0 || repo.removed !== 0;
  }

  orderProjects(projects) {
    const pinnedProjects = projects
      .filter((project) => project.pinned === true)
      .sort((a, b) => a.name.localeCompare(b.name));
    const unpinnedProjects = projects
      .filter((project) => project.pinned !== true)
      .sort((a, b) => {
        const volumeDifference = this.getChangeVolume(b) - this.getChangeVolume(a);

        if (volumeDifference !== 0) {
          return volumeDifference;
        }

        return a.name.localeCompare(b.name);
      });

    return [...pinnedProjects, ...unpinnedProjects];
  }

  renderProjectGroups(projects) {
    const pinnedProjects = projects.filter((project) => project.pinned === true);
    const unpinnedProjects = projects.filter((project) => project.pinned !== true);

    if (pinnedProjects.length > 0) {
      console.log(this.runtime.color.bold('Pinned Projects'));
      this.renderProjectRows(projects, pinnedProjects);
      console.log('');
    }

    if (unpinnedProjects.length > 0) {
      console.log(this.runtime.color.bold('Projects'));
      this.renderProjectRows(projects, unpinnedProjects);
    }

    projects.forEach((project) => {
      if (project.warning) {
        console.log('    ' + this.runtime.color.yellow(project.warning));
      }
    });
  }

  renderProjectRows(projects, rowsProjects) {
    const color = this.runtime.color;
    const rows = [
      ['', color.bold('Project'), color.bold('+ / -'), color.bold('net'), color.bold('modified'), color.bold('last commit'), color.bold('shortcut')]
    ];

    rowsProjects.forEach((project) => {
      const label = String(projects.indexOf(project) + 1) + '.';
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
  }

  getChangeVolume(project) {
    if (!project.totals) {
      return 0;
    }

    return Math.abs(project.totals.added) + Math.abs(project.totals.removed);
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

  formatModifiedFiles(count) {
    return String(count) + ' ' + (count === 1 ? 'file' : 'files');
  }

  formatRepoCount(count) {
    return String(count) + ' ' + (count === 1 ? 'repo' : 'repos');
  }
}
