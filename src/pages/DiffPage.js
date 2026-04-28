import { promptAction, promptLine } from '../utils/input.js';
import { formatDiffForDisplay } from '../utils/diff.js';

const MAX_VISIBLE_DIFF_CHARS = 12000;

export class DiffPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const repo = this.findRepo();
    const title = repo ? repo.name : 'repo';

    console.clear();
    console.log(color.bold('Repo: ' + title + ' (diff)'));
    console.log('');

    const result = repo ? this.runtime.git.getFullDiff(repo.path) : {
      ok: false,
      diff: '',
      warning: 'Repo not found.'
    };

    if (!result.ok) {
      console.log(color.yellow(result.warning));
    } else if (!result.diff) {
      console.log(color.dim('No diff.'));
    } else {
      const visible = result.diff.length > MAX_VISIBLE_DIFF_CHARS
        ? result.diff.slice(0, MAX_VISIBLE_DIFF_CHARS) + '\n\n[truncated]'
        : result.diff;

      console.log(formatDiffForDisplay(visible, color));
    }

    console.log('');
    console.log(color.bold('B.') + ' Back');
    console.log(color.bold('C.') + ' Copy full diff');
    console.log(color.bold('S.') + ' Generate summary');
    console.log(color.bold('E.') + ' Security review');
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (key === 'b' || key === '\u001b') {
      await this.router.back();
      return;
    }

    if (key === 'c') {
      await this.copyFullDiff(result);
      return;
    }

    if (key === 's' && repo) {
      await this.openAiTool(repo, 'diff_summary');
      return;
    }

    if (key === 'e' && repo) {
      await this.openAiTool(repo, 'security_review');
      return;
    }

    await this.router.replace('diff', this.params);
  }

  async copyFullDiff(result) {
    const color = this.runtime.color;

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('diff', this.params);
      return;
    }

    const copied = this.runtime.clipboard.copy(result.diff);

    if (!copied.ok) {
      console.log(color.yellow(copied.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('diff', this.params);
      return;
    }

    console.log(color.green('Full diff copied.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('diff', this.params);
  }

  findRepo() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;

    return project?.repos.find((candidate) => candidate.path === this.params.repoPath) ?? null;
  }

  async openAiTool(repo, toolId) {
    await this.runtime.aiGateway.openRepoTool(this.router, {
      toolId,
      projectName: this.params.projectName,
      repo,
      settings: this.runtime.settings,
      returnPage: 'diff'
    });
  }
}
