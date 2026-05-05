import { spawnSync } from 'child_process';
import { promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatTable } from '../utils/table.js';

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
    const clipboardItems = this.runtime.clipboardItemsStore.listForProject(projectName);

    this.renderProjectItems(bookmarks, commands, clipboardItems);
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

    if (key === 'ap') {
      await this.addClipboardItem(project);
      return true;
    }

    const clipboardCopyMatch = /^p([0-9]+)$/.exec(key);

    if (clipboardCopyMatch) {
      await this.copyClipboardItem(project, Number(clipboardCopyMatch[1]) - 1);
      return true;
    }

    const clipboardViewMatch = /^vp([0-9]+)$/.exec(key);

    if (clipboardViewMatch) {
      await this.showClipboardItem(project, Number(clipboardViewMatch[1]) - 1);
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

  renderProjectItems(bookmarks, commands, clipboardItems) {
    const rows = [[this.color.bold('Bookmarks'), this.color.bold('Commands'), this.color.bold('Clipboard')]];
    const rowCount = Math.max(bookmarks.length + 1, commands.length + 1, clipboardItems.length + 1);

    for (let index = 0; index < rowCount; index += 1) {
      const bookmark = bookmarks[index] ?? null;
      const command = commands[index] ?? null;
      const clipboardItem = clipboardItems[index] ?? null;
      const bookmarkCell = bookmark
        ? this.color.bold('m' + String(index + 1) + '.') + ' ' + bookmark.title
        : index === bookmarks.length ? this.color.bold('am.') + ' Add bookmark' : '';
      const commandCell = command
        ? this.color.bold('c' + String(index + 1) + '.') + ' ' + command.title
        : index === commands.length ? this.color.bold('ac.') + ' Add command' : '';
      const clipboardCell = clipboardItem
        ? this.color.bold('p' + String(index + 1) + '.') + ' ' + clipboardItem.title
        : index === clipboardItems.length ? this.color.bold('ap.') + ' Add clipboard' : '';

      rows.push([bookmarkCell, commandCell, clipboardCell]);
    }

    formatTable(rows).forEach((row) => console.log(row));
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

  async addClipboardItem(project) {
    console.clear();
    console.log(this.color.bold('Add Clipboard: ' + project.name));
    console.log('');
    console.log(this.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title: ');

    if (await this.handleFormNavigationInput(title, async () => {
      await this.showProject(project.name);
    })) {
      return;
    }

    console.log('Text:');
    console.log(this.color.dim('Paste/type lines. Enter "." on its own line to finish.'));

    const text = await this.promptMultilineText();

    if (await this.handleFormNavigationInput(text, async () => {
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

    if (!title.trim() || !text.trim()) {
      console.log('');
      console.log(this.color.yellow('Clipboard title and text are required.'));
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    this.runtime.clipboardItemsStore.add(project.name, { title, text, notes });

    console.log('');
    console.log(this.color.green('Clipboard item saved.'));
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

  async copyClipboardItem(project, index, pause = true) {
    const item = this.runtime.clipboardItemsStore.listForProject(project.name)[index] ?? null;

    if (!item) {
      console.log('');
      console.log(this.color.yellow('Clipboard item not found.'));
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    const copied = this.runtime.clipboard.copy(item.text);

    console.log('');

    if (!copied.ok) {
      console.log(this.color.yellow(copied.warning || 'Clipboard copy failed.'));
    } else {
      console.log(this.color.green('Clipboard copied: ' + item.title));
    }

    if (pause) {
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
    }
  }

  async showClipboardItem(project, index) {
    const item = this.runtime.clipboardItemsStore.listForProject(project.name)[index] ?? null;

    console.clear();

    if (!item) {
      console.log(this.color.yellow('Clipboard item not found.'));
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.showProject(project.name);
      return;
    }

    console.log(this.color.bold('Clipboard: ' + item.title));
    console.log('');
    console.log('Text:');
    console.log(item.text);

    if (item.notes) {
      console.log('');
      console.log('Notes: ' + item.notes);
    }

    console.log('');
    formatActionColumns([
      this.color.bold('C.') + ' Copy',
      this.color.bold('E.') + ' Edit',
      this.color.bold('D.') + ' Delete',
      ...this.globalActionItems()
    ]).forEach((row) => console.log(row));
    console.log('');

    const answer = await promptAction('Action: ');
    const key = answer.trim().toLowerCase();

    if (await this.handleGlobalAction(key, project, async () => {
      await this.showClipboardItem(project, index);
    })) {
      return;
    }

    if (key === 'c') {
      await this.copyClipboardItem(project, index, false);
      await promptLine('Press Enter to continue.');
      await this.showClipboardItem(project, index);
      return;
    }

    if (key === 'e') {
      await this.editClipboardItem(project, index, item);
      return;
    }

    if (key === 'd') {
      await this.deleteClipboardItem(project, index, item);
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

  async editClipboardItem(project, index, item) {
    console.clear();
    console.log(this.color.bold('Edit Clipboard: ' + item.title));
    console.log('');
    console.log(this.color.dim('Leave a value blank to keep the current value.'));
    console.log(this.color.dim('Type "b" to go back. Type "q" to quit.'));
    console.log('');

    const title = await promptLine('Title [' + item.title + ']: ');

    if (await this.handleFormNavigationInput(title, async () => {
      await this.showClipboardItem(project, index);
    })) {
      return;
    }

    console.log('Text:');
    console.log(this.color.dim('Leave blank to keep current text. Enter "." on its own line to finish.'));

    const text = await this.promptMultilineText();

    if (await this.handleFormNavigationInput(text, async () => {
      await this.showClipboardItem(project, index);
    })) {
      return;
    }

    const notes = await promptLine('Notes [' + item.notes + ']: ');

    if (await this.handleFormNavigationInput(notes, async () => {
      await this.showClipboardItem(project, index);
    })) {
      return;
    }

    this.runtime.clipboardItemsStore.updateForProjectByIndex(project.name, index, {
      title: title.trim() || item.title,
      text: text.trim() ? text : item.text,
      notes: notes.trim() || item.notes
    });

    console.log('');
    console.log(this.color.green('Clipboard item updated.'));
    await promptLine('Press Enter to continue.');
    await this.showClipboardItem(project, index);
  }

  async deleteClipboardItem(project, index, item) {
    console.clear();
    console.log(this.color.bold('Delete Clipboard: ' + item.title + '?'));
    console.log('');
    const answer = await promptLine('Type "yes" to confirm: ');

    if (answer.trim().toLowerCase() === 'yes') {
      this.runtime.clipboardItemsStore.deleteForProjectByIndex(project.name, index);
      console.log('');
      console.log(this.color.green('Clipboard item deleted.'));
      await promptLine('Press Enter to continue.');
    }

    await this.showProject(project.name);
  }

  async promptMultilineText() {
    const lines = [];

    while (true) {
      const line = await promptLine('> ');

      if (line === '.') {
        break;
      }

      lines.push(line);
    }

    return lines.join('\n');
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
