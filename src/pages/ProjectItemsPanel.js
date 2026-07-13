import { spawnSync } from 'child_process';
import path from 'path';
import { closeInput, promptAction, promptLine } from '../utils/input.js';
import { formatActionColumns } from '../utils/menu.js';
import { formatTable } from '../utils/table.js';

export class ProjectItemsPanel {
  constructor({ runtime, color, showProject, router = null }) {
    this.runtime = runtime;
    this.color = color;
    this.showProject = showProject;
    this.router = router;
  }

  render(projectName, selectedKey = null) {
    const bookmarks = this.runtime.bookmarksStore.listForProject(projectName);
    const commands = this.runtime.commandsStore.listForProject(projectName);
    const clipboardItems = this.runtime.clipboardItemsStore.listForProject(projectName);

    this.renderProjectItems(bookmarks, commands, clipboardItems, selectedKey);
  }

  actionChoices(projectName) {
    const bookmarks = this.runtime.bookmarksStore.listForProject(projectName);
    const commands = this.runtime.commandsStore.listForProject(projectName);
    const clipboardItems = this.runtime.clipboardItemsStore.listForProject(projectName);
    const choices = [];
    const rowCount = Math.max(bookmarks.length + 1, commands.length + 1, clipboardItems.length + 1);

    for (let index = 0; index < rowCount; index += 1) {
      const bookmark = bookmarks[index] ?? null;
      const command = commands[index] ?? null;
      const clipboardItem = clipboardItems[index] ?? null;

      if (bookmark) {
        choices.push({ key: 'm' + String(index + 1), label: 'Bookmark: ' + bookmark.title });
      } else if (index === bookmarks.length) {
        choices.push({ key: 'am', label: 'Add bookmark' });
      }

      if (command) {
        choices.push({ key: 'c' + String(index + 1), label: 'Command: ' + command.title });
      } else if (index === commands.length) {
        choices.push({ key: 'ac', label: 'Add command' });
      }

      if (clipboardItem) {
        choices.push({ key: 'p' + String(index + 1), label: 'Copy clipboard: ' + clipboardItem.title });
      } else if (index === clipboardItems.length) {
        choices.push({ key: 'ap', label: 'Add clipboard' });
      }
    }

    return choices;
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

  renderProjectItems(bookmarks, commands, clipboardItems, selectedKey = null) {
    const rows = [[this.color.bold('Bookmarks'), this.color.bold('Commands'), this.color.bold('Clipboard')]];
    const rowCount = Math.max(bookmarks.length + 1, commands.length + 1, clipboardItems.length + 1);

    for (let index = 0; index < rowCount; index += 1) {
      const hotkey = this.color.hotkey ?? this.color.bold;
      const bookmark = bookmarks[index] ?? null;
      const command = commands[index] ?? null;
      const clipboardItem = clipboardItems[index] ?? null;
      const bookmarkCell = bookmark
        ? hotkey('m' + String(index + 1) + '.') + ' ' + bookmark.title
        : index === bookmarks.length ? hotkey('am.') + ' Add bookmark' : '';
      const commandCell = command
        ? hotkey('c' + String(index + 1) + '.') + ' ' + command.title
        : index === commands.length ? hotkey('ac.') + ' Add command' : '';
      const clipboardCell = clipboardItem
        ? hotkey('p' + String(index + 1) + '.') + ' ' + clipboardItem.title
        : index === clipboardItems.length ? hotkey('ap.') + ' Add clipboard' : '';

      rows.push([
        this.highlightCell(bookmarkCell, this.isSelectedProjectItem(selectedKey, 'm', index, bookmark, bookmarks)),
        this.highlightCell(commandCell, this.isSelectedProjectItem(selectedKey, 'c', index, command, commands)),
        this.highlightCell(clipboardCell, this.isSelectedProjectItem(selectedKey, 'p', index, clipboardItem, clipboardItems))
      ]);
    }

    formatTable(rows).forEach((row) => console.log(row));
  }

  isSelectedProjectItem(selectedKey, prefix, index, item, items) {
    const selected = String(selectedKey || '').toLowerCase();

    if (item) {
      const itemKey = prefix + String(index + 1);
      return selected === itemKey || selected === 'v' + itemKey;
    }

    if (index !== items.length) {
      return false;
    }

    return selected === 'a' + prefix;
  }

  highlightCell(cell, isSelected) {
    if (!cell || !isSelected || typeof this.color.selected !== 'function') {
      return cell;
    }

    return this.color.selected(cell);
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

    const render = (selectedKey = null) => {
      console.clear();
      console.log(this.color.bold('Bookmark: ' + bookmark.title));
      console.log('');
      console.log('URL/path: ' + bookmark.target);

      if (bookmark.notes) {
        console.log('Notes: ' + bookmark.notes);
      }

      console.log('');
      formatActionColumns([
        this.color.bold('O.') + ' Open',
        this.color.bold('C.') + ' Copy',
        this.color.bold('E.') + ' Edit',
        this.color.bold('D.') + ' Delete',
        ...this.globalActionItems()
      ], { color: this.color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        { key: 'o', label: 'Open' },
        { key: 'c', label: 'Copy' },
        { key: 'e', label: 'Edit' },
        { key: 'd', label: 'Delete' },
        ...this.globalActionChoices()
      ],
      color: this.color,
      render
    });
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

    if (key === 'c') {
      await this.copyBookmarkTarget(bookmark);
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

    const render = (selectedKey = null) => {
      console.clear();
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
        this.color.bold('C.') + ' Copy',
        this.color.bold('E.') + ' Edit',
        this.color.bold('D.') + ' Delete',
        ...this.globalActionItems()
      ], { color: this.color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        { key: 'x', label: 'Run' },
        { key: 't', label: 'Open in terminal' },
        { key: 'c', label: 'Copy' },
        { key: 'e', label: 'Edit' },
        { key: 'd', label: 'Delete' },
        ...this.globalActionChoices()
      ],
      color: this.color,
      render
    });
    const key = answer.trim().toLowerCase();

    if (await this.handleGlobalAction(key, project, async () => {
      await this.showCommand(project, index);
    })) {
      return;
    }

    if (key === 'x') {
      const notice = await this.runCommand(command);
      await this.returnAfterCommandRun(project, index, notice);
      return;
    }

    if (key === 't') {
      this.openCommandInTerminal(command);
      console.log('');
      await promptLine('Press Enter to continue.');
      await this.showCommand(project, index);
      return;
    }

    if (key === 'c') {
      await this.copyCommand(command);
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

  async copyBookmarkTarget(bookmark) {
    const copied = this.runtime.clipboard.copy(bookmark.target);

    console.log('');

    if (!copied.ok) {
      console.log(this.color.yellow(copied.warning || 'Clipboard copy failed.'));
    } else {
      console.log(this.color.green('Link copied: ' + bookmark.title));
    }
  }

  async copyCommand(command) {
    const copied = this.runtime.clipboard.copy(command.command);

    console.log('');

    if (!copied.ok) {
      console.log(this.color.yellow(copied.warning || 'Clipboard copy failed.'));
    } else {
      console.log(this.color.green('Command copied: ' + command.title));
    }
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

    const render = (selectedKey = null) => {
      console.clear();
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
      ], { color: this.color, selectedKey }).forEach((row) => console.log(row));
      console.log('');
    };

    render(null);

    const answer = await promptAction('Action: ', {
      choices: [
        { key: 'c', label: 'Copy' },
        { key: 'e', label: 'Edit' },
        { key: 'd', label: 'Delete' },
        ...this.globalActionChoices()
      ],
      color: this.color,
      render
    });
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
      closeInput();
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

    console.log('');
    console.log(notice);

    await this.waitForCommandReview();

    if (terminal) {
      terminal.enterAlternateScreen();
    }

    return notice;
  }

  async waitForCommandReview() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return;
    }

    process.stdout.write('Press any key to return to Repoteer.');

    await new Promise((resolve) => {
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw === true;

      const done = () => {
        stdin.off('data', done);

        if (typeof stdin.setRawMode === 'function') {
          stdin.setRawMode(wasRaw);
        }

        stdin.pause();
        process.stdout.write('\n');
        resolve();
      };

      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(true);
      }

      stdin.resume();
      stdin.once('data', done);
    });
  }

  async returnAfterCommandRun(project, index, notice) {
    await this.showCommand(project, index, notice);
  }

  findCommandRepo(project, command) {
    const commandDirectory = path.resolve(command.workingDirectory ?? '');
    const repos = project.repos ?? [];
    const matches = repos.filter((repo) => {
      const repoPath = path.resolve(repo.path);
      return commandDirectory === repoPath || commandDirectory.startsWith(repoPath + path.sep);
    });

    return matches.sort((a, b) => path.resolve(b.path).length - path.resolve(a.path).length)[0] ?? null;
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

  globalActionChoices() {
    if (this.router) {
      return this.router.globalActionChoices();
    }

    return [
      { key: 'h', label: 'Home' },
      { key: 'r', label: 'Refresh' },
      { key: 's', label: 'Settings' },
      { key: 'q', label: 'Quit' },
      { key: 'b', label: 'Back' }
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
