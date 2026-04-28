import { spawnSync } from 'child_process';

export class BrowserOpener {
  open(url) {
    const command = this.getCommand(url);

    if (!command) {
      return {
        ok: false,
        warning: 'No compatible browser opener found.'
      };
    }

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
        warning: result.stderr || 'Browser opener failed.'
      };
    }

    return {
      ok: true,
      warning: null
    };
  }

  getCommand(url) {
    if (!/^https?:\/\//.test(String(url || ''))) {
      return null;
    }

    if (process.platform === 'darwin') {
      return { name: 'open', args: [url] };
    }

    if (process.platform === 'win32') {
      return { name: 'cmd', args: ['/c', 'start', '', url] };
    }

    return { name: 'xdg-open', args: [url] };
  }
}
