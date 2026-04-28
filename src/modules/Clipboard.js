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
}
