import { spawnSync } from 'child_process';
import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns, formatColumnPairs } from '../utils/menu.js';

export class ProjectItemsPanel {
  constructor({ runtime, color, showProject, router = null }) {
    this.runtime = runtime;
    this.color = color;
    this.showProject = showProject;
    this.router = router;
  }

  render(projectName) {
    const bookmarks = this.runtime.bookmarksStore.listForProject(projectName);
    const commands = this.runtime.commandsStore.listForProject(projectName);

    this.renderProjectItems(bookmarks, commands);
  }

  async handleAction(project, key) {
    if (key === 'am') {
      await this.addBookmark(project);
      return true;
    }

    if (key === 'ac') {
      await this.addCommand(project);
      return true;
    }

    const bookmarkMatch = /^m([0-9]+)$/.exec(key);

    if (bookmarkMatch) {
      await this.showBookmark(project, Number(bookmarkMatch[1]) - 1);
      return true;
    }

    const commandMatch = /^c([0-9]+)$/.exec(key);

    if (commandMatch) {
      await this.showCommand(project, Number(commandMatch[1]) - 1);
      return true;
    }

    return false;
  }

  renderProjectItems(bookmarks, commands) {
    const pairs = [[this.color.bold('Bookmarks'), this.color.bold('Commands')]];
    const rowCount = Math.max(bookmarks.length + 1, commands.length + 1);

    for (let index = 0; index < rowCount; index += 1) {
      const bookmark = bookmarks[index] ?? null;
      const command = commands[index] ?? null;
      const left = bookmark
        ? this.color.bold('m' + String(index + 1) + '.') + ' ' + bookmark.title
        : index === bookmarks.length ? this.color.bold('am.') + ' Add bookmark' : '';
      const right = command
        ? this.color.bold('c' + String(index + 1) + '.') + ' ' + command.title
        : index === commands.length ? this.color.bold('ac.') + ' Add command' : null;

      pairs.push([left, right]);
    }

    formatColumnPairs(pairs).forEach((row) => console.log(row));
  }

  async addBookmark(project) {
    console.clear();
    console.log(this.color.bold('Add Bookmark: ' + project.name));
    console.log('');
    console.log(this.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title: ');

    if (await this.handleFormNavigationInput(title, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    const target = await promptLine('URL/path: ');

    if (await this.handleFormNavigationInput(target, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    const notes = await promptLine('Notes (optional): ');

    if (await this.handleFormNavigationInput(notes, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    if (!title.trim() || !target.trim()) {
      console.log('');
      console.log(this.color.yellow('Bookmark title and URL/path are required.'));
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    this.runtime.bookmarksStore.add(project.name, { title, target, notes });

    console.log('');
    console.log(this.color.green('Bookmark saved.'));
    await promptLine('Press Enter to continue.');
    await this.showProject(project.name);
  }

  async addCommand(project) {
    console.clear();
    console.log(this.color.bold('Add Command: ' + project.name));
    console.log('');
    console.log(this.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title: ');

    if (await this.handleFormNavigationInput(title, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    const command = await promptLine('Command: ');

    if (await this.handleFormNavigationInput(command, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    const workingDirectory = await promptLine('Working directory [' + project.path + ']: ');

    if (await this.handleFormNavigationInput(workingDirectory, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    const notes = await promptLine('Notes (optional): ');

    if (await this.handleFormNavigationInput(notes, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    if (!title.trim() || !command.trim()) {
      console.log('');
      console.log(this.color.yellow('Command title and command are required.'));
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    this.runtime.commandsStore.add(project.name, {
      title,
      command,
      workingDirectory: workingDirectory.trim() || project.path,
      notes
    });

    console.log('');
    console.log(this.color.green('Command saved.'));
    await promptLine('Press Enter to continue.');
    await this.showProject(project.name);
  }

  async showBookmark(project, index) {
    const bookmark = this.runtime.bookmarksStore.listForProject(project.name)[index] ?? null;

    console.clear();

    if (!bookmark) {
      console.log(this.color.yellow('Bookmark not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    console.log(this.color.bold('Bookmark: ' + bookmark.title));
    console.log('');
    console.log('URL/path: ' + bookmark.target);

    if (bookmark.notes) {
      console.log('Notes: ' + bookmark.notes);
    }

    console.log('');
    formatActionColumns([
      this.color.bold('O.') + ' Open',
      this.color.bold('E.') + ' Edit',
      this.color.bold('D.') + ' Delete',
      ...this.globalActionItems()
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.handleGlobalAction(key, project, async () => {
      await this.showBookmark(project, index);
    })) {
      return;
    }

    if (key === 'o') {
      this.openTarget(bookmark.target);
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.showBookmark(project, index);
      return;
    }

    if (key === 'e') {
      await this.editBookmark(project, index, bookmark);
      return;
    }

    if (key === 'd') {
      await this.deleteBookmark(project, index, bookmark);
      return;
    }

    await this.showProject(project.name);
  }

  async showCommand(project, index, notice = null) {
    const command = this.runtime.commandsStore.listForProject(project.name)[index] ?? null;

    console.clear();

    if (!command) {
      console.log(this.color.yellow('Command not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    console.log(this.color.bold('Command: ' + command.title));
    console.log('');
    console.log('Command: ' + command.command);
    console.log('Working directory: ' + command.workingDirectory);

    if (command.notes) {
      console.log('Notes: ' + command.notes);
    }

    if (notice) {
      console.log('');
      console.log(notice);
    }

    console.log('');
    formatActionColumns([
      this.color.bold('X.') + ' Run',
      this.color.bold('T.') + ' Open in terminal',
      this.color.bold('E.') + ' Edit',
      this.color.bold('D.') + ' Delete',
      ...this.globalActionItems()
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.handleGlobalAction(key, project, async () => {
      await this.showCommand(project, index);
    })) {
      return;
    }

    if (key === 'x') {
      const notice = await this.runCommand(command);
      await this.showCommand(project, index, notice);
      return;
    }

    if (key === 't') {
      this.openCommandInTerminal(command);
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.showCommand(project, index);
      return;
    }

    if (key === 'e') {
      await this.editCommand(project, index, command);
      return;
    }

    if (key === 'd') {
      await this.deleteCommand(project, index, command);
      return;
    }

    await this.showProject(project.name);
  }

  async editBookmark(project, index, bookmark) {
    console.clear();
    console.log(this.color.bold('Edit Bookmark: ' + bookmark.title));
    console.log('');
    console.log(this.color.dim('Leave a value blank to keep the current value.'));
    console.log(this.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title [' + bookmark.title + ']: ');

    if (await this.handleFormNavigationInput(title, async () => {
      await this.showBookmark(project, index);
    })) {
      return;
    }

    const target = await promptLine('URL/path [' + bookmark.target + ']: ');

    if (await this.handleFormNavigationInput(target, async () => {
      await this.showBookmark(project, index);
    })) {
      return;
    }

    const notes = await promptLine('Notes [' + bookmark.notes + ']: ');

    if (await this.handleFormNavigationInput(notes, async () => {
      await this.showBookmark(project, index);
    })) {
      return;
    }

    this.runtime.bookmarksStore.updateForProjectByIndex(project.name, index, {
      title: title.trim() || bookmark.title,
      target: target.trim() || bookmark.target,
      notes: notes.trim() || bookmark.notes
    });

    console.log('');
    console.log(this.color.green('Bookmark updated.'));
    await promptLine('Press Enter to continue.');
    await this.showBookmark(project, index);
  }

  async editCommand(project, index, command) {
    console.clear();
    console.log(this.color.bold('Edit Command: ' + command.title));
    console.log('');
    console.log(this.color.dim('Leave a value blank to keep the current value.'));
    console.log(this.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title [' + command.title + ']: ');

    if (await this.handleFormNavigationInput(title, async () => {
      await this.showCommand(project, index);
    })) {
      return;
    }

    const commandText = await promptLine('Command [' + command.command + ']: ');

    if (await this.handleFormNavigationInput(commandText, async () => {
      await this.showCommand(project, index);
    })) {
      return;
    }

    const workingDirectory = await promptLine('Working directory [' + command.workingDirectory + ']: ');

    if (await this.handleFormNavigationInput(workingDirectory, async () => {
      await this.showCommand(project, index);
    })) {
      return;
    }

    const notes = await promptLine('Notes [' + command.notes + ']: ');

    if (await this.handleFormNavigationInput(notes, async () => {
      await this.showCommand(project, index);
    })) {
      return;
    }

    this.runtime.commandsStore.updateForProjectByIndex(project.name, index, {
      title: title.trim() || command.title,
      command: commandText.trim() || command.command,
      workingDirectory: workingDirectory.trim() || command.workingDirectory,
      notes: notes.trim() || command.notes
    });

    console.log('');
    console.log(this.color.green('Command updated.'));
    await promptLine('Press Enter to continue.');
    await this.showCommand(project, index);
  }

  async deleteBookmark(project, index, bookmark) {
    console.clear();
    console.log(this.color.bold('Delete Bookmark: ' + bookmark.title + '?'));
    console.log('');
    const answer = await promptLine('Type "yes" to confirm: ');

    if (answer.trim().toLowerCase() === 'yes') {
      this.runtime.bookmarksStore.deleteForProjectByIndex(project.name, index);
      console.log('');
      console.log(this.color.green('Bookmark deleted.'));
      await promptLine('Press Enter to continue.');
    }

    await this.showProject(project.name);
  }

  async deleteCommand(project, index, command) {
    console.clear();
    console.log(this.color.bold('Delete Command: ' + command.title + '?'));
    console.log('');
    const answer = await promptLine('Type "yes" to confirm: ');

    if (answer.trim().toLowerCase() === 'yes') {
      this.runtime.commandsStore.deleteForProjectByIndex(project.name, index);
      console.log('');
      console.log(this.color.green('Command deleted.'));
      await promptLine('Press Enter to continue.');
    }

    await this.showProject(project.name);
  }

  openTarget(target) {
    const platform = process.platform;
    const opener = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = platform === 'win32' ? ['/c', 'start', '', target] : [target];
    const result = spawnSync(opener, args, {
      stdio: 'inherit'
    });

    if (result.error) {
      console.log('Open failed: ' + result.error.message);
    } else if (result.status !== 0) {
      console.log('Open failed.');
    }
  }

  async runCommand(command) {
    const terminal = this.runtime.terminal;

    if (terminal) {
      terminal.exitAlternateScreen();
    }

    console.log(this.color.bold('Running: ' + command.title));
    console.log('');
    console.log('Command: ' + command.command);
    console.log('Working directory: ' + command.workingDirectory);
    console.log('');

    let result = null;
    let notice = this.color.green('Command finished.');

    try {
      result = spawnSync(command.command, {
        cwd: command.workingDirectory,
        shell: true,
        stdio: 'inherit'
      });
    } catch (error) {
      notice = this.color.yellow('Command failed: ' + error.message);
    }

    if (result) {
      if (result.error) {
        notice = this.color.yellow('Command failed: ' + result.error.message);
      } else if (result.signal) {
        notice = this.color.yellow('Command stopped by signal ' + result.signal + '.');
      } else if (result.status !== 0) {
        notice = this.color.yellow('Command exited with status ' + String(result.status) + '.');
      }
    }

    if (terminal) {
      terminal.enterAlternateScreen();
    }

    return notice;
  }

  openCommandInTerminal(command) {
    const result = this.spawnTerminal(command);

    if (result.error) {
      console.log('Open terminal failed: ' + result.error.message);
    } else if (result.status !== 0) {
      console.log('Open terminal failed.');
    }
  }

  spawnTerminal(command) {
    if (process.platform === 'darwin') {
      return spawnSync('osascript', [
        '-e',
        'tell application "Terminal"',
        '-e',
        'activate',
        '-e',
        'do script ' + JSON.stringify('cd ' + shellQuote(command.workingDirectory) + ' && ' + command.command),
        '-e',
        'end tell'
      ], {
        stdio: 'inherit'
      });
    }

    if (process.platform === 'win32') {
      return spawnSync('cmd.exe', [
        '/c',
        'start',
        '',
        'cmd.exe',
        '/k',
        'cd /d "' + command.workingDirectory.replace(/"/g, '""') + '" && ' + command.command
      ], {
        stdio: 'inherit'
      });
    }

    const terminal = process.env.TERMINAL;

    if (terminal) {
      return spawnSync(terminal, [
        '-e',
        'sh',
        '-lc',
        'cd ' + shellQuote(command.workingDirectory) + ' && ' + command.command + '; exec sh'
      ], {
        stdio: 'inherit'
      });
    }

    for (const candidate of ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']) {
      const result = spawnSync(candidate, [
        '-e',
        'sh',
        '-lc',
        'cd ' + shellQuote(command.workingDirectory) + ' && ' + command.command + '; exec sh'
      ], {
        stdio: 'inherit'
      });

      if (!result.error) {
        return result;
      }
    }

    return {
      error: new Error('No terminal opener found. Set $TERMINAL to your terminal executable.')
    };
  }

  globalActionItems() {
    if (this.router) {
      return this.router.globalActionItems(this.color);
    }

    return [
      this.color.bold('H.') + ' Home',
      this.color.bold('R.') + ' Refresh',
      this.color.bold('S.') + ' Settings',
      this.color.bold('Q.') + ' Quit',
      this.color.bold('B.') + ' Back'
    ];
  }

  async handleGlobalAction(key, project, refresh) {
    if (key === 'b' || key === '\u001b') {
      await this.showProject(project.name);
      return true;
    }

    if (key === 'r') {
      await refresh();
      return true;
    }

    if (this.router && await this.router.handleGlobalAction(key)) {
      return true;
    }

    return false;
  }

  async handleFormNavigationInput(value, back) {
    const key = value.trim().toLowerCase();

    if (key === 'q') {
      if (this.router) {
        await this.router.quit();
      }
      return true;
    }

    if (key === 'b') {
      await back();
      return true;
    }

    return false;
  }
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
