import path from 'path';
import { gridChoices, promptAction, promptLine } from '../utils/input.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatBranchName } from '../utils/format.js';

export class RepoPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const { project, repo } = this.findProjectAndRepo();

    console.clear();

    if (!project || !repo) {
      console.log(color.bold('Repo not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    const fileStats = this.runtime.git.getFileDiffStats(repo.path);

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('Repo: ' + project.name + ' / ' + repo.name));
      console.log('Branch: ' + formatBranchName(repo, color));
      this.renderPushStatus(repo, color);
      console.log('');
      this.renderActivityGraph(repo);

      if (repo.warning) {
        console.log(color.yellow(repo.warning));
        console.log('');
      }

      if (!fileStats.ok) {
        console.log(color.yellow(fileStats.warning));
      } else if (fileStats.files.length === 0) {
        console.log(color.dim('No file changes.'));
      } else {
        this.renderFiles(fileStats.files, color, selectedKey);
      }

      console.log('');
      console.log(color.bold('Actions:'));
      console.log('');
      formatActionColumns([
        color.bold('V.') + ' View full diff',
        color.bold('C.') + ' Copy full diff',
        color.bold('A.') + ' Commit review',
        color.bold('E.') + ' Security review',
        color.bold('M.') + ' Generate commit',
        color.bold('X.') + ' Commit summary exclusions',
        color.bold('F.') + ' Hotfix commit & push',
        color.bold('P.') + ' Write a commit & push',
        ...(repo.ahead > 0 ? [color.bold('U.') + ' Push unpushed commits'] : []),
        color.bold('T.') + ' Open repo in terminal',
        color.bold('O.') + ' Open repo in ' + this.formatFileExplorerName(),
        color.bold('W.') + ' Switch branch',
        color.bold('Y.') + ' History',
        ...this.router.globalActionItems(color)
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        ...(fileStats.ok ? fileStats.files.map((file, index) => {
          return { key: String(index + 1), label: 'File: ' + file.file };
        }) : []),
        ...gridChoices([
          { key: 'v', label: 'View full diff' },
          { key: 'c', label: 'Copy full diff' },
          { key: 'a', label: 'Commit review' },
          { key: 'e', label: 'Security review' },
          { key: 'm', label: 'Generate commit' },
          { key: 'x', label: 'Commit summary exclusions' },
          { key: 'f', label: 'Hotfix commit and push' },
          { key: 'p', label: 'Write a commit and push' },
          ...(repo.ahead > 0 ? [{ key: 'u', label: 'Push unpushed commits' }] : []),
          { key: 't', label: 'Open repo in terminal' },
          { key: 'o', label: 'Open repo in ' + this.formatFileExplorerName() },
          { key: 'w', label: 'Switch branch' },
          { key: 'y', label: 'History' },
          ...this.router.globalActionChoices()
        ])
      ],
      color,
      render
    });
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'w') {
      await this.router.open('branch', {
        projectName: project.name,
        repoPath: repo.path
      });
      return;
    }

    if (key === 'y') {
      await this.router.open('repoHistory', {
        projectName: project.name,
        repoPath: repo.path,
        page: 0
      });
      return;
    }

    if (/^\d+$/.test(key) && fileStats.ok) {
      const selectedFile = fileStats.files[Number(key) - 1] ?? null;

      if (selectedFile) {
        await this.router.open('file', {
          projectName: project.name,
          repoPath: repo.path,
          file: selectedFile.file
        });
        return;
      }
    }

    if (key === 'v') {
      await this.router.open('diff', {
        projectName: project.name,
        repoPath: repo.path
      });
      return;
    }

    if (key === 'c') {
      await this.copyFullDiff(repo.path);
      return;
    }

    if (key === 'a') {
      await this.openAiTool(project, repo, 'commit_review');
      return;
    }

    if (key === 'e') {
      await this.openAiTool(project, repo, 'security_review');
      return;
    }

    if (key === 'f') {
      const payload = this.runtime.commitManager.createHotfixPayload(repo);
      await this.openCommitConfirm(project, repo, payload, true);
      return;
    }

    if (key === 'm') {
      await this.openAiTool(project, repo, 'commit_message');
      return;
    }

    if (key === 'x') {
      await this.router.open('commitSummaryExclusions', {
        projectName: project.name,
        repoPath: repo.path
      });
      return;
    }

    if (key === 'p') {
      const payload = this.runtime.commitManager.createDefaultPayload(repo);
      await this.openCommitConfirm(project, repo, payload, true);
      return;
    }

    if (key === 't') {
      await this.openRepoTerminal(repo);
      return;
    }

    if (key === 'o') {
      await this.openRepoFolder(repo);
      return;
    }

    if (key === 'u' && repo.ahead > 0) {
      await this.pushRepo(repo);
      return;
    }

    await this.router.replace('repo', this.params);
  }

  renderPushStatus(repo, color) {
    if (!repo.upstream) {
      console.log('Push: no upstream');
      return;
    }

    if (repo.ahead > 0) {
      console.log(color.yellow('Push: ' + String(repo.ahead) + ' unpushed commit(s) to ' + repo.upstream));
      return;
    }

    if (repo.behind > 0) {
      console.log(color.yellow('Push: remote has ' + String(repo.behind) + ' commit(s) not in this branch'));
      return;
    }

    console.log('Push: up to date with ' + repo.upstream);
  }

  renderActivityGraph(repo) {
    const lines = this.runtime.activityGraph.renderForRepos([repo], {
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

  renderFiles(files, color, selectedKey = null) {
    const rows = [
      ['', color.bold('File'), color.bold('+ / -'), color.bold('net'), color.bold('last commit')]
    ];

    files.forEach((file, index) => {
      const hotkey = color.hotkey ?? color.bold;
      const prefix = file.net >= 0 ? '+' : '';
      const net = prefix + String(file.net);

      const cells = [
        hotkey(String(index + 1) + '.'),
        file.file,
        color.green('+' + String(file.added)) + ' / ' + color.red('-' + String(file.removed)),
        file.net < 0 ? color.red(net) : color.green(net),
        file.lastCommitAgo ?? 'N/A'
      ];

      rows.push(this.highlightRow(cells, String(selectedKey || '') === String(index + 1)));
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

  async copyFullDiff(repoPath) {
    const color = this.runtime.color;
    const diff = this.runtime.git.getFullDiff(repoPath);

    console.log('');

    if (!diff.ok) {
      console.log(color.yellow(diff.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('repo', this.params);
      return;
    }

    const copied = this.runtime.clipboard.copy(diff.diff);

    if (!copied.ok) {
      console.log(color.yellow(copied.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('repo', this.params);
      return;
    }

    console.log(color.green('Full diff copied.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('repo', this.params);
  }

  async openRepoTerminal(repo) {
    const color = this.runtime.color;
    const opened = this.runtime.folderOpener.openTerminal(repo.path);

    console.log('');

    if (!opened.ok) {
      console.log(color.yellow(opened.warning || 'Open terminal failed.'));
    } else {
      console.log(color.green('Repo opened in terminal.'));
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('repo', this.params);
  }

  async openRepoFolder(repo) {
    const color = this.runtime.color;
    const opened = this.runtime.folderOpener.openFolder(repo.path);

    console.log('');

    if (!opened.ok) {
      console.log(color.yellow(opened.warning || 'Open folder failed.'));
    } else {
      console.log(color.green('Repo opened in ' + this.formatFileExplorerName() + '.'));
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('repo', this.params);
  }

  formatFileExplorerName() {
    return process.platform === 'darwin' ? 'Finder' : 'file explorer';
  }

  async pushRepo(repo) {
    const color = this.runtime.color;
    const pushed = this.runtime.git.push(repo.path);

    console.log('');

    if (!pushed.ok) {
      console.log(color.yellow(pushed.warning));
    } else {
      console.log(color.green('Push complete.'));

      if (pushed.warning) {
        console.log(color.yellow(pushed.warning));
      }

      this.runtime.refreshSnapshot();
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('repo', this.params);
  }

  async openCommitConfirm(project, repo, payload, pushAfterCommit) {
    await this.router.open('commitConfirm', {
      projectName: project.name,
      repoPath: repo.path,
      title: payload.title,
      body: payload.body,
      pushAfterCommit,
      returnPage: 'project',
      returnParams: {
        projectName: project.name
      }
    });
  }

  async openAiTool(project, repo, toolId) {
    await this.runtime.aiGateway.openRepoTool(this.router, {
      toolId,
      project,
      repo,
      settings: this.runtime.settings,
      settingsStore: this.runtime.settingsStore,
      returnPage: 'repo'
    });
  }

  findProjectAndRepo() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;
    const repoPath = path.resolve(this.params.repoPath ?? '');
    const repo = project?.repos.find((candidate) => path.resolve(candidate.path) === repoPath) ?? null;

    return { project, repo };
  }
}
