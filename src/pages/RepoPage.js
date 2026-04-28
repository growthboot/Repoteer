import path from 'path';
import { promptAction, promptLine } from '../utils/input.js';
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

    console.log(color.bold('Repo: ' + project.name + ' / ' + repo.name));
    console.log('Branch: ' + formatBranchName(repo, color));
    console.log('');

    if (repo.warning) {
      console.log(color.yellow(repo.warning));
      console.log('');
    }

    const fileStats = this.runtime.git.getFileDiffStats(repo.path);

    if (!fileStats.ok) {
      console.log(color.yellow(fileStats.warning));
    } else if (fileStats.files.length === 0) {
      console.log(color.dim('No file changes.'));
    } else {
      this.renderFiles(fileStats.files, color);
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
      color.bold('H.') + ' Hotfix commit',
      color.bold('P.') + ' Write a commit & push',
      color.bold('S.') + ' Switch branch',
      color.bold('B.') + ' Back',
      color.bold('R.') + ' Refresh'
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'b' || key === '\u001b') {
      await this.router.back();
      return;
    }

    if (key === 'r') {
      await this.router.replace('repo', this.params);
      return;
    }

    if (key === 's') {
      await this.router.open('branch', {
        projectName: project.name,
        repoPath: repo.path
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

    if (key === 'h') {
      const payload = this.runtime.commitManager.createHotfixPayload(repo);
      await this.openCommitConfirm(project, repo, payload, false);
      return;
    }

    if (key === 'm') {
      const payload = this.runtime.commitManager.createDefaultPayload(repo);
      await this.openCommitConfirm(project, repo, payload, false);
      return;
    }

    if (key === 'p') {
      const payload = this.runtime.commitManager.createDefaultPayload(repo);
      await this.openCommitConfirm(project, repo, payload, true);
      return;
    }

    await this.router.replace('repo', this.params);
  }

  renderFiles(files, color) {
    const rows = [
      ['', color.bold('File'), color.bold('+ / -'), color.bold('net'), color.bold('last commit')]
    ];

    files.forEach((file, index) => {
      const prefix = file.net >= 0 ? '+' : '';
      const net = prefix + String(file.net);

      rows.push([
        String(index + 1) + '.',
        file.file,
        color.green('+' + String(file.added)) + ' / ' + color.red('-' + String(file.removed)),
        file.net < 0 ? color.red(net) : color.green(net),
        file.lastCommitAgo ?? 'N/A'
      ]);
    });

    const formattedRows = formatTable(rows);
    console.log(formattedRows[0]);
    console.log('');
    formattedRows.slice(1).forEach((row) => console.log(row));
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

  async openCommitConfirm(project, repo, payload, pushAfterCommit) {
    await this.router.open('commitConfirm', {
      projectName: project.name,
      repoPath: repo.path,
      title: payload.title,
      body: payload.body,
      pushAfterCommit
    });
  }

  async openAiTool(project, repo, toolId) {
    await this.runtime.aiGateway.openRepoTool(this.router, {
      toolId,
      project,
      repo,
      settings: this.runtime.settings,
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
