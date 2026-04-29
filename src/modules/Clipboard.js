import { spawnSync } from 'child_process';

export class Clipboard {
  copy(text) {
    const command = this.getCommand();

    if (!command) {
      return {
        ok: false,
        warning: 'No compatible clipboard command found.'
      };
    }

    const result = spawnSync(command.name, command.args, {
      input: text,
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
        warning: result.stderr || 'Clipboard command failed.'
      };
    }

    return {
      ok: true,
      warning: null
    };
  }

  read() {
    const command = this.getReadCommand();

    if (!command) {
      return {
        ok: false,
        text: '',
        warning: 'No compatible clipboard read command found.'
      };
    }

    const result = spawnSync(command.name, command.args, {
      encoding: 'utf8'
    });

    if (result.error) {
      return {
        ok: false,
        text: '',
        warning: result.error.message
      };
    }

    if (result.status !== 0) {
      return {
        ok: false,
        text: '',
        warning: result.stderr || 'Clipboard read command failed.'
      };
    }

    return {
      ok: true,
      text: result.stdout,
      warning: null
    };
  }

  getCommand() {
    if (process.platform === 'darwin') {
      return { name: 'pbcopy', args: [] };
    }

    if (process.platform === 'win32') {
      return { name: 'clip', args: [] };
    }

    if (process.env.WAYLAND_DISPLAY) {
      return { name: 'wl-copy', args: [] };
    }

    return { name: 'xclip', args: ['-selection', 'clipboard'] };
  }

  getReadCommand() {
    if (process.platform === 'darwin') {
      return { name: 'pbpaste', args: [] };
    }

    if (process.platform === 'win32') {
      return { name: 'powershell.exe', args: ['-NoProfile', '-Command', 'Get-Clipboard'] };
    }

    if (process.env.WAYLAND_DISPLAY) {
      return { name: 'wl-paste', args: ['--no-newline'] };
    }

    return { name: 'xclip', args: ['-selection', 'clipboard', '-o'] };
  }
}
