import path from 'path';
import { promptAction, promptLine } from '../utils/input.js';
import { formatTable } from '../utils/table.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatBranchName, formatBranchValue } from '../utils/format.js';

export class BranchPage {
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

    console.log(color.bold('Switch Branch: ' + project.name + ' / ' + repo.name));
    console.log('');
    console.log('Current branch: ' + formatBranchName(repo, color));
    console.log('');

    if (repo.warning) {
      console.log(color.yellow(repo.warning));
      console.log('');
    }

    const branches = this.runtime.branchManager.listLocalBranches(repo.path);

    if (!branches.ok) {
      console.log(color.yellow(branches.warning));
    } else if (branches.branches.length === 0) {
      console.log(color.dim('No local branches found.'));
    } else {
      this.renderBranches(branches.branches, repo, color);
    }

    console.log('');
    formatActionColumns([
      ...this.router.globalActionItems(color)
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Branch number/name: ');
    const key = answer.trim();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (!branches.ok) {
      await this.router.replace('branch', this.params);
      return;
    }

    const branchName = this.resolveBranchSelection(key, branches.branches);

    if (!branchName) {
      console.log('');
      console.log(color.yellow('Branch not found.'));
      await promptLine('Press Enter to continue.');
      await this.router.replace('branch', this.params);
      return;
    }

    if (!repo.detached && repo.branch === branchName) {
      console.log('');
      console.log(color.dim('Already on branch: ' + branchName));
      await promptLine('Press Enter to continue.');
      await this.router.replace('branch', this.params);
      return;
    }

    await this.confirmAndSwitch(repo, branchName);
  }

  renderBranches(branches, repo, color) {
    const rows = [
      ['', color.bold('Branch'), color.bold('state')]
    ];

    branches.forEach((branch, index) => {
      rows.push([
        String(index + 1) + '.',
        formatBranchValue(branch, color),
        !repo.detached && repo.branch === branch ? color.green('current') : ''
      ]);
    });

    const formattedRows = formatTable(rows);
    console.log(formattedRows[0]);
    console.log('');
    formattedRows.slice(1).forEach((row) => console.log(row));
  }

  async confirmAndSwitch(repo, branchName) {
    const color = this.runtime.color;

    if (repo.dirty) {
      console.clear();
      console.log(color.bold('Switch Branch'));
      console.log('');
      console.log('Current branch: ' + formatBranchName(repo, color));
      console.log('Target branch: ' + formatBranchValue(branchName, color));
      console.log('');
      console.log(color.yellow('This repo has uncommitted changes.'));
      console.log('Git may refuse checkout if changes conflict.');
      console.log('');

      const answer = await promptLine('Type "yes" to switch branches: ');

      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('');
        console.log(color.dim('Branch switch canceled.'));
        await promptLine('Press Enter to continue.');
        await this.router.replace('branch', this.params);
        return;
      }
    }

    const result = this.runtime.branchManager.checkoutExistingLocalBranch(repo.path, branchName);

    console.log('');

    if (!result.ok) {
      console.log(color.yellow(result.warning));
      await promptLine('Press Enter to continue.');
      await this.router.replace('branch', this.params);
      return;
    }

    this.runtime.refreshSnapshot();
    console.log(color.green('Switched to branch: ') + formatBranchValue(branchName, color));
    await promptLine('Press Enter to continue.');
    await this.router.back();
  }

  resolveBranchSelection(value, branches) {
    if (/^\d+$/.test(value)) {
      return branches[Number(value) - 1] ?? null;
    }

    return branches.includes(value) ? value : null;
  }

  findProjectAndRepo() {
    const snapshot = this.runtime.refreshSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.name === this.params.projectName) ?? null;
    const repoPath = path.resolve(this.params.repoPath ?? '');
    const repo = project?.repos.find((candidate) => path.resolve(candidate.path) === repoPath) ?? null;

    return { project, repo };
  }
}
