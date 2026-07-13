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

    let didRenderProgress = false;
    const snapshot = this.runtime.refreshSnapshot({
      onProgress: (progress) => {
        didRenderProgress = this.renderLoadingProgress(progress) || didRenderProgress;
      }
    });

    if (didRenderProgress) {
      console.clear();
      console.log(color.bold('Repoteer'));
      console.log('');
    }
    const hideCleanProjects = this.runtime.projectsPageHideClean === true;
    const orderedProjects = this.orderProjects(snapshot.projects);
    const projects = hideCleanProjects ? orderedProjects.filter((project) => {
      return this.shouldShowProjectWhenCleanHidden(project);
    }) : orderedProjects;

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('Repoteer'));
      console.log('');
      this.renderActivityGraph(orderedProjects);
      this.renderProjectsSummary(orderedProjects);
      console.log('');

      if (projects.length === 0) {
        const message = snapshot.projects.length === 0 ? 'No projects added.' : 'No projects with code changes.';
        console.log(color.dim(message));
      } else {
        this.renderProjectGroups(projects, selectedKey);
      }

      console.log('');
      formatActionColumns([
        'T. ' + (hideCleanProjects ? 'Show all projects' : 'Hide projects without code changes'),
        'A. Add project',
        'V. View archive',
        'Y. History',
        '[0-9]P. Pin/unpin project',
        '[0-9]A. Archive project',
        ...this.router.globalActionItems(color, { back: false })
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        ...projects.map((project, index) => {
          return { key: String(index + 1), label: 'Project: ' + project.name };
        }),
        { key: 't', label: hideCleanProjects ? 'Show all projects' : 'Hide projects without code changes' },
        { key: 'a', label: 'Add project' },
        { key: 'v', label: 'View archive' },
        { key: 'y', label: 'History' },
        ...(projects.length > 0 ? [
          { key: 'pinProject', numberedSuffix: 'p', label: 'Pin or unpin selected project' },
          { key: 'archiveProject', numberedSuffix: 'a', label: 'Archive selected project' }
        ] : []),
        ...this.router.globalActionChoices({ back: false })
      ],
      color,
      render
    });

    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'a') {
      await this.router.open('addProject');
      return;
    }

    if (key === 'v') {
      await this.router.open('archive');
      return;
    }

    if (key === 'y') {
      await this.router.open('projectsHistory', {
        page: 0
      });
      return;
    }

    if (key === 't') {
      this.runtime.projectsPageHideClean = !hideCleanProjects;
      await this.router.replace('projects');
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
    const snapshot = this.runtime.refreshSnapshot({
      repoProgressProjectName: projectName,
      onRepoProgress: (progress) => {
        this.renderRepoLoadingProgress(progress, projectName);
      }
    });
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

    const repos = hideReposWithoutLineChanges ? project.repos.filter((repo) => {
      return this.shouldShowRepoWhenLineChangesHidden(repo);
    }) : project.repos;

    const itemsPanel = new ProjectItemsPanel({
      runtime: this.runtime,
      color,
      showProject: async (nextProjectName) => {
        await this.showProject(nextProjectName);
      },
      router: this.router
    });

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('Project: ' + project.name));
      console.log('');

      if (project.warning) {
        console.log(color.yellow(project.warning));
      } else if (project.repos.length === 0) {
        console.log(color.dim('No Git repositories found.'));
      } else if (repos.length === 0) {
        console.log(color.dim('No repos with line changes.'));
      } else {
        this.renderLegacyRepoRows(repos, color, selectedKey);
      }

      console.log('');
      itemsPanel.render(project.name, selectedKey);
      console.log('');
      formatActionColumns([
        color.bold('B.') + ' Back',
        color.bold('T.') + ' ' + (hideReposWithoutLineChanges ? 'Show all repos' : 'Hide repos without line changes'),
        color.bold('D.') + ' Delete project',
        color.bold('N.') + ' Rename project',
        ...this.router.globalActionItems(color, { back: false })
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        ...repos.map((repo, index) => {
          return { key: String(index + 1), label: 'Repo: ' + repo.name };
        }),
        ...itemsPanel.actionChoices(project.name),
        { key: 'b', label: 'Back' },
        { key: 't', label: hideReposWithoutLineChanges ? 'Show all repos' : 'Hide repos without line changes' },
        { key: 'd', label: 'Delete project' },
        { key: 'n', label: 'Rename project' },
        ...this.router.globalActionChoices({ back: false })
      ],
      color,
      render
    });
    const key = answer.trim().toLowerCase();

    if (key === 'b' || key === '\u001b') {
      await this.router.replace('projects');
      return;
    }

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 't') {
      this.runtime.projectsPageHideReposWithoutLineChanges = !hideReposWithoutLineChanges;
      await this.showProject(project.name);
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
      await this.showProject(project.name);
      return;
    }

    if (result.project.name !== project.name) {
      this.runtime.bookmarksStore.renameProject(project.name, result.project.name);
      this.runtime.commandsStore.renameProject(project.name, result.project.name);
      this.runtime.clipboardItemsStore.renameProject(project.name, result.project.name);
    }
    console.log(color.green('Project updated.'));
    await promptLine('Press Enter to continue.');
    await this.showProject(result.project.name);
  }

  async handleEditNavigationInput(value, projectName) {
    const key = value.trim().toLowerCase();

    if (key === 'q') {
      await this.router.quit();
      return true;
    }

    if (key === 'b') {
      await this.showProject(projectName);
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
    this.runtime.clipboardItemsStore.deleteProject(project.name);

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

  renderProjectGroups(projects, selectedKey = null) {
    const pinnedProjects = projects.filter((project) => project.pinned === true);
    const unpinnedProjects = projects.filter((project) => project.pinned !== true);

    if (pinnedProjects.length > 0) {
      console.log(this.runtime.color.bold('Pinned Projects'));
      this.renderProjectRows(projects, pinnedProjects, selectedKey);
      console.log('');
    }

    if (unpinnedProjects.length > 0) {
      console.log(this.runtime.color.bold('Projects'));
      this.renderProjectRows(projects, unpinnedProjects, selectedKey);
    }

    projects.forEach((project) => {
      if (project.warning) {
        console.log('    ' + this.runtime.color.yellow(project.warning));
      }
    });
  }

  renderProjectRows(projects, rowsProjects, selectedKey = null) {
    const color = this.runtime.color;
    const rows = [
      ['', color.bold('Project'), color.bold('+ / -'), color.bold('net'), color.bold('modified'), color.bold('last commit'), color.bold('shortcut')]
    ];

    const rowProjects = [];

    projects.forEach((project) => {
      const hotkey = color.hotkey ?? color.bold;
      const label = hotkey(String(projects.indexOf(project) + 1) + '.');
      const shortcut = color.hotkey ? color.hotkey(formatShortcut(project.shortcut)) : color.dim(formatShortcut(project.shortcut));
      const changes = this.formatChanges(project);
      const net = this.formatNet(project);
      const modified = project.warning ? color.yellow('warning') : this.formatRepoCount(project.repos.length);
      const lastCommit = this.formatLastCommit(project);

      rowProjects.push(project);
      const projectKey = String(projects.indexOf(project) + 1);
      const isSelected = [projectKey, projectKey + 'p', projectKey + 'a'].includes(String(selectedKey || '').toLowerCase());

      rows.push(this.highlightRow([label, project.name, changes, net, modified, lastCommit, shortcut], isSelected));
    });

    const formattedRows = formatTable(rows, { leaderGap: color.dim('···') });
    const formattedProjectRows = new Map(rowProjects.map((project, index) => [project, formattedRows[index + 1]]));

    console.log(formattedRows[0]);
    console.log('');
    rowsProjects.forEach((project) => console.log(formattedProjectRows.get(project)));
  }

  highlightRow(cells, isSelected) {
    if (!isSelected || typeof this.runtime.color.selected !== 'function') {
      return cells;
    }

    return cells.map((cell) => this.runtime.color.selected(cell));
  }

  renderLegacyRepoRows(repos, color, selectedKey = null) {
    const rows = [
      ['', color.bold('Repo'), color.bold('+ / -'), color.bold('net'), color.bold('modified'), color.bold('last commit')]
    ];

    repos.forEach((repo, index) => {
      const hotkey = color.hotkey ?? color.bold;
      const prefix = repo.net >= 0 ? '+' : '';
      const net = prefix + String(repo.net);
      const cells = [
        hotkey(String(index + 1) + '.'),
        repo.name,
        color.green('+' + String(repo.added)) + ' / ' + color.red('-' + String(repo.removed)),
        repo.net < 0 ? color.red(net) : color.green(net),
        repo.warning ? color.yellow('warning') : this.formatModifiedFiles(repo.modifiedFiles),
        repo.lastCommitAgo ?? 'N/A'
      ];

      rows.push(this.highlightRow(cells, String(selectedKey || '') === String(index + 1)));
    });

    const formattedRows = formatTable(rows, { leaderGap: color.dim('···') });
    console.log(formattedRows[0]);
    console.log('');
    formattedRows.slice(1).forEach((row) => console.log(row));
  }

  renderProjectsSummary(projects) {
    const totals = this.sumProjectTotals(projects);

    console.log(
      this.runtime.color.bold('Total: ') +
      this.formatLineChanges(totals.added, totals.removed) +
      '  ' +
      this.runtime.color.bold('Net: ') +
      this.formatNetValue(totals.net)
    );
  }

  renderActivityGraph(projects) {
    const repos = projects.flatMap((project) => project.repos ?? []);
    const lines = this.runtime.activityGraph.renderForRepos(repos, {
      width: this.getTerminalWidth(),
      color: this.runtime.color
    });

    lines.forEach((line) => console.log(line));

    if (lines.length > 0) {
      console.log('');
    }
  }

  getTerminalWidth() {
    const stdoutWidth = Number(process.stdout.columns);
    const envWidth = Number(process.env.COLUMNS);
    const width = Number.isFinite(stdoutWidth) && stdoutWidth > 0 ? stdoutWidth : envWidth;

    return Number.isFinite(width) && width > 0 ? width : 80;
  }

  sumProjectTotals(projects) {
    return projects.reduce((totals, project) => {
      if (!project.totals) {
        return totals;
      }

      return {
        added: totals.added + project.totals.added,
        removed: totals.removed + project.totals.removed,
        net: totals.net + project.totals.net
      };
    }, {
      added: 0,
      removed: 0,
      net: 0
    });
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

    return this.formatLineChanges(project.totals.added, project.totals.removed);
  }

  formatLineChanges(added, removed) {
    const color = this.runtime.color;
    return color.green('+' + String(added)) + ' / ' + color.red('-' + String(removed));
  }

  formatNet(project) {
    if (!project.totals) {
      return 'N/A';
    }

    return this.formatNetValue(project.totals.net);
  }

  formatNetValue(net) {
    const color = this.runtime.color;
    const prefix = net >= 0 ? '+' : '';
    const value = prefix + String(net);

    return net < 0 ? color.red(value) : color.green(value);
  }

  renderLoadingProgress(progress) {
    if (!this.shouldRenderLoadingProgress()) {
      return false;
    }

    const color = this.runtime.color;
    const percent = Math.max(0, Math.min(100, progress.percent));
    const item = progress.projectName
      ? 'Loading project: ' + color.yellow(progress.projectName)
      : 'Loading projects...';

    console.clear();
    console.log(color.bold('Repoteer'));
    console.log('');
    console.log(color.dim('Scanning projects'));
    console.log('');
    console.log(this.formatLoadingBar(percent) + ' ' + color.green(String(percent).padStart(3, ' ') + '%'));
    console.log(color.dim(item));

    return true;
  }

  renderRepoLoadingProgress(progress, projectName) {
    if (!this.shouldRenderLoadingProgress()) {
      return false;
    }

    const color = this.runtime.color;
    const percent = Math.max(0, Math.min(100, progress.percent));
    const repoName = progress.repoName ?? 'repos...';

    console.clear();
    console.log(color.bold('Project: ' + projectName));
    console.log('');
    console.log(color.dim('Scanning repos'));
    console.log('');
    console.log(this.formatLoadingBar(percent) + ' ' + color.green(String(percent).padStart(3, ' ') + '%'));
    console.log(color.dim('Loading repo: ') + color.yellow(repoName));

    return true;
  }

  shouldRenderLoadingProgress() {
    return process.stdout.isTTY === true && process.stdin.isTTY === true;
  }

  formatLoadingBar(percent) {
    const color = this.runtime.color;
    const width = 30;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = color.green('='.repeat(filled)) + color.dim('-'.repeat(empty));

    return '[' + bar + ']';
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
