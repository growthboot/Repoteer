import path from 'path';
import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns, formatColumnPairs } from '../utils/menu.js';
import { formatDiffForDisplay } from '../utils/diff.js';

const MAX_VISIBLE_DIFF_CHARS = 12000;

export class FilePage {
  static scrollMode = 'normal';

  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const { project, repo, file } = this.findProjectRepoAndFile();
    const fileName = String(this.params.file ?? '');

    console.clear();

    if (!project || !repo || !file) {
      console.log(color.bold('File not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log(color.bold('Repo: ' + project.name + ' / ' + repo.name));
    console.log(color.bold('File: ' + fileName));
    console.log('');

    if (repo.warning) {
      console.log(color.yellow(repo.warning));
      console.log('');
    }

    this.renderMetadata(repo.path, file, color);
    console.log('');

    const diff = this.runtime.git.getFileDiff(repo.path, file.file);

    if (!diff.ok) {
      console.log(color.yellow(diff.warning));
    } else if (!diff.diff) {
      console.log(color.dim('No diff.'));
    } else {
      const visible = diff.diff.length > MAX_VISIBLE_DIFF_CHARS
        ? diff.diff.slice(0, MAX_VISIBLE_DIFF_CHARS) + '\n\n[truncated]'
        : diff.diff;

      console.log(formatDiffForDisplay(visible, color));
    }

    console.log('');
    console.log(color.bold('Actions:'));
    console.log('');
    formatActionColumns([
      color.bold('C.') + ' Copy file diff',
      color.bold('D.') + ' Discard file changes',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'c') {
      await this.copyFileDiff(diff);
      return;
    }

    if (key === 'd') {
      await this.confirmDiscard(repo.path, file.file);
      return;
    }

    await this.router.replace('file', this.params);
  }

  renderMetadata(repoPath, file, color) {
    const metadata = this.runtime.git.getFileMetadata(repoPath, file.file);
    const prefix = file.net >= 0 ? '+' : '';
    const net = prefix + String(file.net);

    if (!metadata.ok) {
      console.log(color.yellow(metadata.warning));
    }

    formatColumnPairs([
      ['Created: ' + metadata.created, 'Modified: ' + metadata.modified],
      ['+ / -: ' + color.green('+' + String(file.added)) + ' / ' + color.red('-' + String(file.removed)), 'Net: ' + (file.net < 0 ? color.red(net) : color.green(net))],
      ['Last commit: ' + (file.lastCommitAgo ?? 'N/A'), 'State: ' + metadata.state]
    ]).forEach((row) => console.log(row));
  }

  async copyFileDiff(diff) {
    const color = this.runtime.color;

    console.log('');

    if (!diff.ok) {
      console.log(color.yellow(diff.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('file', this.params);
      return;
    }

    const copied = this.runtime.clipboard.copy(diff.diff);

    if (!copied.ok) {
      console.log(color.yellow(copied.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('file', this.params);
      return;
    }

    console.log(color.green('File diff copied.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('file', this.params);
  }

  async confirmDiscard(repoPath, file) {
    const color = this.runtime.color;

    console.clear();
    console.log(color.bold('Discard File Changes'));
    console.log('');
    console.log('File: ' + file);
    console.log('');
    console.log('This will discard local changes for this file only.');
    console.log('Untracked files will be deleted.');
    console.log('');

    const confirmation = await promptLine('Type "yes" to confirm: ');

    if (confirmation.trim().toLowerCase() !== 'yes') {
      console.log('');
      console.log(color.dim('Discard canceled.'));
      await promptLine('Press Enter to continue.');
      await this.router.replace('file', this.params);
      return;
    }

    const result = this.runtime.git.discardFileChanges(repoPath, file);

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('file', this.params);
      return;
    }

    console.log(color.green('File changes discarded.'));
    await promptLine('Press Enter to continue.');
    await this.router.back();
  }

  findProjectRepoAndFile() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;
    const repoPath = path.resolve(this.params.repoPath ?? '');
    const repo = project?.repos.find((candidate) => path.resolve(candidate.path) === repoPath) ?? null;

    if (!repo) {
      return { project, repo: null, file: null };
    }

    const fileStats = this.runtime.git.getFileDiffStats(repo.path);

    if (!fileStats.ok) {
      return { project, repo, file: null };
    }

    const file = fileStats.files.find((candidate) => candidate.file === this.params.file) ?? null;

    return { project, repo, file };
  }
}
