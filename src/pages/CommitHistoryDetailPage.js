import path from 'path';
import { promptAction, promptLine } from '../utils/input.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';

export class CommitHistoryDetailPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const { project, repo } = this.findProjectAndRepo();

    console.clear();

    if (!project || !repo || !this.params.commitHash) {
      console.log(color.bold('Commit not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log(color.bold('Commit: ' + project.name + ' / ' + repo.name));
    console.log('');
    console.log('Title: ' + (this.params.title || '(no title)'));
    console.log('Body: ' + (this.params.body || ''));
    console.log('');

    const changes = this.runtime.git.getCommitChanges(repo.path, this.params.commitHash);

    if (!changes.ok) {
      console.log(color.yellow(changes.warning));
    } else if (changes.files.length === 0) {
      console.log(color.dim('No changed files found.'));
    } else {
      this.renderFiles(changes.files, color);
    }

    console.log('');
    console.log(color.bold('Actions:'));
    console.log('');
    formatActionColumns([
      ...this.router.globalActionItems(color)
    ], { color }).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    await this.router.replace('commitHistoryDetail', this.params);
  }

  renderFiles(files, color) {
    const rows = [
      [color.bold('File'), color.bold('+ / -'), color.bold('net')]
    ];

    files.forEach((file) => {
      const prefix = file.net >= 0 ? '+' : '';
      const net = prefix + String(file.net);

      rows.push([
        file.file,
        color.green('+' + String(file.added)) + ' / ' + color.red('-' + String(file.removed)),
        file.net < 0 ? color.red(net) : color.green(net)
      ]);
    });

    formatTable(rows).forEach((row) => console.log(row));
  }

  findProjectAndRepo() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;
    const repoPath = path.resolve(this.params.repoPath ?? '');
    const repo = project?.repos.find((candidate) => path.resolve(candidate.path) === repoPath) ?? null;

    return { project, repo };
  }
}
