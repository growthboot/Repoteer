import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';

export class CommitConfirmPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const repo = this.findRepo();

    console.clear();
    console.log(color.bold('Confirm Commit'));
    console.log('');

    if (!repo) {
      console.log(color.yellow('Repo not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.router.back();
      return;
    }

    console.log('Title: ' + this.params.title);
    console.log('Body: ' + (this.params.body || ''));
    console.log('Repo: ' + repo.path);
    console.log('Changed files: ' + String(repo.modifiedFiles));
    console.log('');
    formatActionColumns([
      color.bold('C.') + ' Confirm',
      color.bold('T.') + ' Edit title',
      color.bold('E.') + ' Edit body',
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 't') {
      await this.editTitle();
      return;
    }

    if (key === 'e') {
      await this.editBody();
      return;
    }

    if (key === 'c') {
      await this.confirm(repo);
      return;
    }

    await this.router.replace('commitConfirm', this.params);
  }

  async editTitle() {
    const title = await promptLine('Title: ');

    await this.router.replace('commitConfirm', {
      ...this.params,
      title: title.trim() || this.params.title
    });
  }

  async editBody() {
    const body = await promptLine('Body: ');

    await this.router.replace('commitConfirm', {
      ...this.params,
      body
    });
  }

  async confirm(repo) {
    const color = this.runtime.color;
    const result = this.runtime.commitManager.commit(repo.path, this.params.title, this.params.body ?? '');

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('commitConfirm', this.params);
      return;
    }

    console.log(color.green('Commit created.'));
    this.runtime.refreshSnapshot();

    if (this.params.pushAfterCommit === true) {
      const answer = await promptLine('Push now? Type "yes" to confirm: ');

      if (answer.trim().toLowerCase() === 'yes') {
        const pushed = this.runtime.git.push(repo.path);

        if (!pushed.ok) {
          console.log(color.yellow(pushed.warning));
        } else {
          console.log(color.green('Push complete.'));
        }
      }
    }

    await promptLine('Press Enter to continue.');
    if (this.params.returnPage) {
      await this.router.backTo(this.params.returnPage, this.params.returnParams ?? null);
      return;
    }

    await this.router.back();
  }

  findRepo() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;

    return project?.repos.find((candidate) => candidate.path === this.params.repoPath) ?? null;
  }
}
