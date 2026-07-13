import { gridChoices, promptAction } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { stripAnsi } from '../utils/color.js';

const HISTORY_PAGE_SIZE = 5;
const BODY_LABEL = 'Body: ';
const BODY_MAX_WIDTH = 96;

export class ProjectsHistoryPage {
  static scrollMode = 'normal';

  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const page = this.getPage();

    const history = this.getProjectsCommitHistory(page);

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('History: Projects'));
      console.log('Page: ' + String(page + 1));
      console.log('');

      history.warnings.forEach((warning) => {
        console.log(color.yellow(warning));
      });

      if (history.warnings.length > 0 && history.commits.length > 0) {
        console.log('');
      }

      if (history.commits.length === 0) {
        console.log(color.dim(page === 0 ? 'No commits found.' : 'No commits on this page.'));
      } else {
        this.renderCommits(history.commits, color, selectedKey);
      }

      console.log('');
      console.log(color.bold('Actions:'));
      console.log('');
      formatActionColumns([
        ...(history.hasNextPage ? [color.bold('N.') + ' Next page'] : []),
        ...(page > 0 ? [color.bold('P.') + ' Previous page'] : []),
        ...this.router.globalActionItems(color)
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Commit number/action: ', {
      choices: [
        ...history.commits.map((commit, index) => {
          return { key: String(index + 1), label: 'Commit: ' + (commit.title || commit.shortHash) };
        }),
        ...gridChoices([
          ...(history.hasNextPage ? [{ key: 'n', label: 'Next page' }] : []),
          ...(page > 0 ? [{ key: 'p', label: 'Previous page' }] : []),
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

    if (key === 'n' && history.hasNextPage) {
      await this.router.replace('projectsHistory', {
        ...this.params,
        page: page + 1
      });
      return;
    }

    if (key === 'p' && page > 0) {
      await this.router.replace('projectsHistory', {
        ...this.params,
        page: page - 1
      });
      return;
    }

    if (/^\d+$/.test(key)) {
      const commit = history.commits[Number(key) - 1] ?? null;

      if (commit) {
        await this.router.open('commitHistoryDetail', {
          projectName: commit.project.name,
          repoPath: commit.repo.path,
          commitHash: commit.hash,
          title: commit.title,
          body: commit.body
        });
        return;
      }
    }

    await this.router.replace('projectsHistory', this.params);
  }

  getProjectsCommitHistory(page) {
    const offset = page * HISTORY_PAGE_SIZE;
    const limit = offset + HISTORY_PAGE_SIZE + 1;
    const warnings = [];
    const commits = [];
    const snapshot = this.runtime.refreshSnapshot();

    snapshot.projects.forEach((project) => {
      if (project.warning) {
        warnings.push(project.name + ': ' + project.warning);
        return;
      }

      project.repos.forEach((repo) => {
        const history = this.runtime.git.getCommitHistory(repo.path, {
          page: 0,
          pageSize: limit
        });

        if (!history.ok) {
          warnings.push(project.name + ' / ' + repo.name + ': ' + history.warning);
          return;
        }

        history.commits.forEach((commit) => {
          commits.push({
            ...commit,
            project,
            repo
          });
        });
      });
    });

    commits.sort((a, b) => {
      const byTimestamp = (b.timestamp ?? 0) - (a.timestamp ?? 0);

      if (byTimestamp !== 0) {
        return byTimestamp;
      }

      return a.project.name.localeCompare(b.project.name) ||
        a.repo.name.localeCompare(b.repo.name) ||
        a.shortHash.localeCompare(b.shortHash);
    });

    return {
      commits: commits.slice(offset, offset + HISTORY_PAGE_SIZE),
      hasNextPage: commits.length > offset + HISTORY_PAGE_SIZE,
      warnings
    };
  }

  renderCommits(commits, color, selectedKey = null) {
    const bodyWidth = this.getBodyWidth();

    commits.forEach((commit, index) => {
      const hotkey = color.hotkey ?? color.bold;
      const number = hotkey(String(index + 1) + '.');
      const stats = color.green('+' + String(commit.added ?? 0)) + ' / ' + color.red('-' + String(commit.removed ?? 0));
      const bodyLines = this.wrapText(commit.body || '', bodyWidth);
      const date = commit.age ? commit.date + ' (' + commit.age + ')' : commit.date;

      const firstLine = number + ' ' + date + ' ' + commit.project.name + ' / ' + commit.repo.name + ' ' + commit.shortHash + ' ' + stats;
      console.log(String(selectedKey || '') === String(index + 1) ? color.selected(firstLine) : firstLine);
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
}
