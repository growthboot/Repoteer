import { spawnSync } from 'child_process';

export class FolderOpener {
  openFolder(folderPath) {
    const command = this.getFileExplorerCommand(folderPath);

    if (!command) {
      return {
        ok: false,
        warning: 'No compatible file explorer found.'
      };
    }

    return this.run(command, 'File explorer opener failed.');
  }

  openTerminal(folderPath) {
    const command = this.getTerminalCommand(folderPath);

    if (!command) {
      return {
        ok: false,
        warning: 'No compatible terminal opener found. Set $TERMINAL to your terminal executable.'
      };
    }

    return this.run(command, 'Terminal opener failed.');
  }

  getFileExplorerCommand(folderPath) {
    if (process.platform === 'darwin') {
      return { name: 'open', args: [folderPath] };
    }

    if (process.platform === 'win32') {
      return { name: 'cmd', args: ['/c', 'start', '', folderPath] };
    }

    return { name: 'xdg-open', args: [folderPath] };
  }

  getTerminalCommand(folderPath) {
    if (process.platform === 'darwin') {
      return {
        name: 'osascript',
        args: [
          '-e',
          'tell application "Terminal"',
          '-e',
          'activate',
          '-e',
          'do script ' + JSON.stringify('cd ' + shellQuote(folderPath)),
          '-e',
          'end tell'
        ]
      };
    }

    if (process.platform === 'win32') {
      return {
        name: 'cmd.exe',
        args: [
          '/c',
          'start',
          '',
          'cmd.exe',
          '/k',
          'cd /d "' + String(folderPath).replace(/"/g, '""') + '"'
        ]
      };
    }

    const terminal = process.env.TERMINAL;

    if (terminal) {
      return {
        name: terminal,
        args: ['-e', 'sh', '-lc', 'cd ' + shellQuote(folderPath) + '; exec sh']
      };
    }

    return {
      name: 'x-terminal-emulator',
      args: ['-e', 'sh', '-lc', 'cd ' + shellQuote(folderPath) + '; exec sh']
    };
  }

  run(command, defaultWarning) {
    const result = spawnSync(command.name, command.args, {
      encoding: 'utf8'
    });

    if (result.error) {
      return {
        ok: false,
        warning: result.error.message
      };
    }

    if (result.status !== 0) {
      return {
        ok: false,
        warning: result.stderr || defaultWarning
      };
    }

    return {
      ok: true,
      warning: null
    };
  }
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
