import { promptAction, promptLine } from '../utils/input.js';
import { formatBranchName, formatShortcut } from '../utils/format.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';
import { ProjectItemsPanel } from './ProjectItemsPanel.js';

export class ProjectPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    await this.showProject(this.params.projectName);
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
      await this.router.back();
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
      this.renderRepos(repos, color);
    }

    const itemsPanel = new ProjectItemsPanel({
      runtime: this.runtime,
      color,
      showProject: async (nextProjectName) => {
        await this.router.replace('project', { projectName: nextProjectName });
      },
      router: this.router
    });

    console.log('');
    itemsPanel.render(project.name);
    console.log('');
    formatActionColumns([
      color.bold('T.') + ' ' + (hideReposWithoutLineChanges ? 'Show all repos' : 'Hide repos without line changes'),
      color.bold('D.') + ' Delete project',
      color.bold('N.') + ' Rename project',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 't') {
      this.runtime.projectsPageHideReposWithoutLineChanges = !hideReposWithoutLineChanges;
      await this.router.replace('project', { projectName: project.name });
      return;
    }

    if (key === 'n') {
      await this.editProject(project);
      return;
    }

    if (key === 'd') {
      await this.deleteProject(project);
      return;
    }

    const selectedRepo = /^\d+$/.test(key) ? repos[Number(key) - 1] ?? null : null;

    if (selectedRepo) {
      await this.router.open('repo', {
        projectName: project.name,
        repoPath: selectedRepo.path
      });
      return;
    }

    if (await itemsPanel.handleAction(project, key)) {
      return;
    }

    await this.router.replace('project', { projectName: project.name });
  }

  renderRepos(repos, color) {
    const rows = [
      ['', color.bold('Repo'), color.bold('branch'), color.bold('+ / -'), color.bold('net'), color.bold('modified'), color.bold('last commit')]
    ];

    repos.forEach((repo, index) => {
      const prefix = repo.net >= 0 ? '+' : '';
      const net = prefix + String(repo.net);

      rows.push([
        String(index + 1) + '.',
        repo.name,
        formatBranchName(repo, color),
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

  async editProject(project) {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Edit Project: ' + project.name));
    console.log('');
    console.log(color.dim('Leave a value blank to keep the current value.'));
    console.log(color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const name = await promptLine('Name [' + project.name + ']: ');

    if (await this.handleEditNavigationInput(name, project.name)) {
      return;
    }

    const projectPath = await promptLine('Path [' + project.path + ']: ');

    if (await this.handleEditNavigationInput(projectPath, project.name)) {
      return;
    }

    const currentShortcut = project.shortcut ?? '';
    const shortcut = await promptLine('Shortcut [' + formatShortcut(project.shortcut) + ']: ');

    if (await this.handleEditNavigationInput(shortcut, project.name)) {
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
      await this.router.replace('project', { projectName: project.name });
      return;
    }

    if (result.project.name !== project.name) {
      this.runtime.bookmarksStore.renameProject(project.name, result.project.name);
      this.runtime.commandsStore.renameProject(project.name, result.project.name);
    }

    console.log(color.green('Project updated.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('project', { projectName: result.project.name });
  }

  async handleEditNavigationInput(value, projectName) {
    const key = value.trim().toLowerCase();

    if (key === 'q') {
      await this.router.quit();
      return true;
    }

    if (key === 'b') {
      await this.router.replace('project', { projectName });
      return true;
    }

    return false;
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
      await this.router.replace('project', { projectName: project.name });
      return;
    }

    const result = this.runtime.projectManager.deleteProject(project.name);

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.error));
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    this.runtime.bookmarksStore.deleteProject(project.name);
    this.runtime.commandsStore.deleteProject(project.name);

    console.log(color.green('Project deleted.'));
    await promptLine('Press Enter to continue.');
    await this.router.back();
  }

  shouldShowRepoWhenLineChangesHidden(repo) {
    return Boolean(repo.warning) || repo.added !== 0 || repo.removed !== 0;
  }

  formatModifiedFiles(count) {
    return String(count) + ' ' + (count === 1 ? 'file' : 'files');
  }
}
