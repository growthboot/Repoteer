import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatTable } from '../utils/table.js';
import { normalizeRelativePath } from '../utils/pathFilters.js';

export class CommitSummaryExclusionsPage {
  constructor({ runtime, router, params }) {
    this.runtime = runtime;
    this.router = router;
    this.params = params;
  }

  async show() {
    const color = this.runtime.color;
    const repoPath = this.params.repoPath;
    const projectName = this.params.projectName ?? '';
    const excludedPaths = this.runtime.settingsStore.listCommitSummaryExcludedPaths(repoPath);

    const render = (selectedKey = null) => {
      console.clear();
      console.log(color.bold('Commit Summary Exclusions'));
      console.log('');
      console.log('Repo: ' + [projectName, repoPath].filter(Boolean).join(' / '));
      console.log('');

      if (excludedPaths.length === 0) {
        console.log(color.dim('No excluded paths.'));
      } else {
        this.renderExcludedPaths(excludedPaths, selectedKey);
      }

      console.log('');
      console.log(color.dim('These paths are left out of Generate commit prompts and are not disclosed as omitted files.'));
      console.log('');
      formatActionColumns([
        color.bold('A.') + ' Add path',
        color.bold('E.') + ' Edit path',
        color.bold('D.') + ' Delete path',
        color.bold('C.') + ' Clear list',
        ...this.router.globalActionItems(color)
      ], { color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        ...excludedPaths.map((relativePath, index) => {
          return { key: String(index + 1), label: 'Edit: ' + relativePath };
        }),
        { key: 'a', label: 'Add path' },
        { key: 'e', label: 'Edit path' },
        { key: 'd', label: 'Delete path' },
        { key: 'c', label: 'Clear list' },
        ...this.router.globalActionChoices()
      ],
      color,
      render
    });
    const key = answer.trim().toLowerCase();

    if (await this.router.handleGlobalAction(key)) {
      return;
    }

    if (key === 'a') {
      await this.addPath();
      return;
    }

    if (key === 'e') {
      await this.editPath(excludedPaths);
      return;
    }

    if (key === 'd') {
      await this.deletePath(excludedPaths);
      return;
    }

    if (key === 'c') {
      await this.clearPaths(excludedPaths);
      return;
    }

    if (/^\d+$/.test(key)) {
      await this.editPath(excludedPaths, Number(key) - 1);
      return;
    }

    await this.router.replace('commitSummaryExclusions', this.params);
  }

  renderExcludedPaths(excludedPaths, selectedKey = null) {
    const color = this.runtime.color;
    const hotkey = color.hotkey ?? color.bold;
    const rows = [
      ['', color.bold('Relative path')]
    ];

    excludedPaths.forEach((relativePath, index) => {
      const cells = [
        hotkey(String(index + 1) + '.'),
        relativePath
      ];

      rows.push(this.highlightRow(cells, String(selectedKey || '') === String(index + 1)));
    });

    formatTable(rows, { leaderGap: color.dim('···') }).forEach((row) => console.log(row));
  }

  highlightRow(cells, isSelected) {
    if (!isSelected || typeof this.runtime.color.selected !== 'function') {
      return cells;
    }

    return cells.map((cell) => this.runtime.color.selected(cell));
  }

  async addPath() {
    console.clear();
    console.log(this.runtime.color.bold('Add Commit Summary Exclusion'));
    console.log('');
    console.log(this.runtime.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const value = await promptLine('Relative path: ');

    if (await this.handleFormNavigationInput(value)) {
      return;
    }

    const normalized = normalizeRelativePath(value);

    if (!normalized) {
      await this.showWarning('Enter a relative file or directory path.');
      return;
    }

    this.runtime.settingsStore.addCommitSummaryExcludedPath(this.params.repoPath, normalized);
    this.runtime.settings = this.runtime.settingsStore.get();

    console.log('');
    console.log(this.runtime.color.green('Excluded path saved.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('commitSummaryExclusions', this.params);
  }

  async editPath(excludedPaths, index = null) {
    const selectedIndex = index ?? await this.promptPathIndex('Path number: ', excludedPaths);

    if (selectedIndex === null) {
      return;
    }

    const current = excludedPaths[selectedIndex];

    if (!current) {
      await this.showWarning('Path not found.');
      return;
    }

    const value = await promptLine('Relative path [' + current + ']: ');

    if (await this.handleFormNavigationInput(value)) {
      return;
    }

    if (!value.trim()) {
      await this.router.replace('commitSummaryExclusions', this.params);
      return;
    }

    const normalized = normalizeRelativePath(value);

    if (!normalized) {
      await this.showWarning('Enter a relative file or directory path.');
      return;
    }

    this.runtime.settingsStore.updateCommitSummaryExcludedPath(this.params.repoPath, selectedIndex, normalized);
    this.runtime.settings = this.runtime.settingsStore.get();

    console.log('');
    console.log(this.runtime.color.green('Excluded path updated.'));
    await promptLine('Press Enter to continue.');
    await this.router.replace('commitSummaryExclusions', this.params);
  }

  async deletePath(excludedPaths) {
    const selectedIndex = await this.promptPathIndex('Path number to delete: ', excludedPaths);

    if (selectedIndex === null) {
      return;
    }

    const answer = await promptLine('Type "yes" to delete ' + excludedPaths[selectedIndex] + ': ');

    if (await this.handleFormNavigationInput(answer)) {
      return;
    }

    if (answer.trim().toLowerCase() === 'yes') {
      this.runtime.settingsStore.deleteCommitSummaryExcludedPath(this.params.repoPath, selectedIndex);
      this.runtime.settings = this.runtime.settingsStore.get();
      console.log('');
      console.log(this.runtime.color.green('Excluded path deleted.'));
    } else {
      console.log('');
      console.log(this.runtime.color.yellow('Delete canceled.'));
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('commitSummaryExclusions', this.params);
  }

  async clearPaths(excludedPaths) {
    if (excludedPaths.length === 0) {
      await this.showWarning('There are no excluded paths to clear.');
      return;
    }

    const answer = await promptLine('Type "yes" to clear all excluded paths: ');

    if (await this.handleFormNavigationInput(answer)) {
      return;
    }

    if (answer.trim().toLowerCase() === 'yes') {
      this.runtime.settingsStore.clearCommitSummaryExcludedPaths(this.params.repoPath);
      this.runtime.settings = this.runtime.settingsStore.get();
      console.log('');
      console.log(this.runtime.color.green('Excluded paths cleared.'));
    } else {
      console.log('');
      console.log(this.runtime.color.yellow('Clear canceled.'));
    }

    await promptLine('Press Enter to continue.');
    await this.router.replace('commitSummaryExclusions', this.params);
  }

  async promptPathIndex(label, excludedPaths) {
    if (excludedPaths.length === 0) {
      await this.showWarning('There are no excluded paths.');
      return null;
    }

    const answer = await promptLine(label);

    if (await this.handleFormNavigationInput(answer)) {
      return null;
    }

    const index = Number(answer.trim()) - 1;

    if (!Number.isInteger(index) || index < 0 || index >= excludedPaths.length) {
      await this.showWarning('Path not found.');
      return null;
    }

    return index;
  }

  async handleFormNavigationInput(value) {
    const key = value.trim().toLowerCase();

    if (key === 'q') {
      await this.router.quit();
      return true;
    }

    if (key === 'b') {
      await this.router.replace('commitSummaryExclusions', this.params);
      return true;
    }

    return false;
  }

  async showWarning(message) {
    console.log('');
    console.log(this.runtime.color.yellow(message));
    await promptLine('Press Enter to continue.');
    await this.router.replace('commitSummaryExclusions', this.params);
  }
}
