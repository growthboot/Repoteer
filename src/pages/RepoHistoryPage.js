import path from 'path';
import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { stripAnsi } from '../utils/color.js';

const HISTORY_PAGE_SIZE = 5;
const BODY_LABEL = 'Body: ';
const BODY_MAX_WIDTH = 96;

export class RepoHistoryPage {
  static scrollMode = 'normal';

  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const { project, repo } = this.findProjectAndRepo();
    const page = this.getPage();

    console.clear();

    if (!project || !repo) {
      console.log(color.bold('Repo not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log(color.bold('History: ' + project.name + ' / ' + repo.name));
    console.log('Page: ' + String(page + 1));
    console.log('');

    const history = this.runtime.git.getCommitHistory(repo.path, {
      page,
      pageSize: HISTORY_PAGE_SIZE
    });

    if (!history.ok) {
      console.log(color.yellow(history.warning));
    } else if (history.commits.length === 0) {
      console.log(color.dim(page === 0 ? 'No commits found.' : 'No commits on this page.'));
    } else {
      this.renderCommits(history.commits, color);
    }

    console.log('');
    console.log(color.bold('Actions:'));
    console.log('');
    formatActionColumns([
      ...(history.ok && history.hasNextPage ? [color.bold('N.') + ' Next page'] : []),
      ...(history.ok && page > 0 ? [color.bold('P.') + ' Previous page'] : []),
      ...this.router.globalActionItems(color)
    ], { color }).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Commit number/action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'n' && history.ok && history.hasNextPage) {
      await this.router.replace('repoHistory', {
        ...this.params,
        page: page + 1
      });
      return;
    }

    if (key === 'p' && history.ok && page > 0) {
      await this.router.replace('repoHistory', {
        ...this.params,
        page: page - 1
      });
      return;
    }

    if (/^\d+$/.test(key) && history.ok) {
      const commit = history.commits[Number(key) - 1] ?? null;

      if (commit) {
        await this.router.open('commitHistoryDetail', {
          projectName: project.name,
          repoPath: repo.path,
          commitHash: commit.hash,
          title: commit.title,
          body: commit.body
        });
        return;
      }
    }

    await this.router.replace('repoHistory', this.params);
  }

  renderCommits(commits, color) {
    const bodyWidth = this.getBodyWidth();

    commits.forEach((commit, index) => {
      const hotkey = color.hotkey ?? color.bold;
      const number = hotkey(String(index + 1) + '.');
      const stats = color.green('+' + String(commit.added ?? 0)) + ' / ' + color.red('-' + String(commit.removed ?? 0));
      const bodyLines = this.wrapText(commit.body || '', bodyWidth);

      console.log(number + ' ' + commit.date + ' ' + commit.shortHash + ' ' + stats);
      console.log('Title: ' + (commit.title || '(no title)'));
      console.log(BODY_LABEL + bodyLines[0]);

      bodyLines.slice(1).forEach((line) => {
        console.log(' '.repeat(BODY_LABEL.length) + line);
      });

      if (index < commits.length - 1) {
        console.log('');
      }
    });
  }

  getTerminalWidth() {
    const stdoutWidth = Number(process.stdout.columns);
    const envWidth = Number(process.env.COLUMNS);
    const width = Number.isFinite(stdoutWidth) && stdoutWidth > 0 ? stdoutWidth : envWidth;

    return Number.isFinite(width) && width > 0 ? width : 100;
  }

  getBodyWidth() {
    const available = this.getTerminalWidth() - BODY_LABEL.length;

    return Math.max(32, Math.min(BODY_MAX_WIDTH, available));
  }

  wrapText(value, width) {
    const text = String(value || '').trim();

    if (!text) {
      return [''];
    }

    const lines = [];
    let line = '';

    for (const word of text.split(/\s+/)) {
      if (stripAnsi(word).length > width) {
        if (line) {
          lines.push(line);
          line = '';
        }

        this.splitLongWord(word, width).forEach((part) => lines.push(part));
        continue;
      }

      const next = line ? line + ' ' + word : word;

      if (stripAnsi(next).length > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }

    if (line) {
      lines.push(line);
    }

    return lines.length > 0 ? lines : [''];
  }

  splitLongWord(word, width) {
    const parts = [];
    const text = String(word);

    for (let index = 0; index < text.length; index += width) {
      parts.push(text.slice(index, index + width));
    }

    return parts;
  }

  getPage() {
    return Math.max(0, Number.parseInt(String(this.params.page ?? 0), 10) || 0);
  }

  findProjectAndRepo() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;
    const repoPath = path.resolve(this.params.repoPath ?? '');
    const repo = project?.repos.find((candidate) => path.resolve(candidate.path) === repoPath) ?? null;

    return { project, repo };
  }
}
