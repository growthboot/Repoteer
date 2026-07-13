import path from 'path';
import { gridChoices, promptAction, promptLine } from '../utils/input.js';
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

    const branches = this.runtime.branchManager.listLocalBranches(repo.path);

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('Switch Branch: ' + project.name + ' / ' + repo.name));
      console.log('');
      console.log('Current branch: ' + formatBranchName(repo, color));
      console.log('');

      if (repo.warning) {
        console.log(color.yellow(repo.warning));
        console.log('');
      }

      if (!branches.ok) {
        console.log(color.yellow(branches.warning));
      } else if (branches.branches.length === 0) {
        console.log(color.dim('No local branches found.'));
      } else {
        this.renderBranches(branches.branches, repo, color, selectedKey);
      }

      console.log('');
      formatActionColumns([
        ...this.router.globalActionItems(color)
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Branch number/name: ', {
      choices: [
        ...(branches.ok ? branches.branches.map((branch, index) => {
          return { key: String(index + 1), label: 'Branch: ' + branch };
        }) : []),
        ...gridChoices(this.router.globalActionChoices())
      ],
      color,
      render
    });
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

  renderBranches(branches, repo, color, selectedKey = null) {
    const rows = [
      ['', color.bold('Branch'), color.bold('state')]
    ];

    branches.forEach((branch, index) => {
      const hotkey = color.hotkey ?? color.bold;

      const cells = [
        hotkey(String(index + 1) + '.'),
        formatBranchValue(branch, color),
        !repo.detached && repo.branch === branch ? color.green('current') : ''
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
