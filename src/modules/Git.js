import { spawnSync } from 'child_process';

export class Git {
  run(args, options = {}) {
    const result = spawnSync('git', args, {
      cwd: options.cwd,
      encoding: 'utf8'
    });

    if (result.error) {
      return {
        ok: false,
        stdout: '',
        stderr: result.error.message,
        status: null
      };
    }

    return {
      ok: result.status === 0,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      status: result.status
    };
  }

  detectRepo(targetPath) {
    const result = this.run(['-C', targetPath, 'rev-parse', '--show-toplevel', '--is-inside-work-tree']);

    if (!result.ok) {
      return {
        ok: false,
        repoPath: null,
        warning: result.stderr || 'Git repository not detected.'
      };
    }

    const [repoPath, insideWorkTree] = result.stdout.split(/\r?\n/);

    if (insideWorkTree !== 'true') {
      return {
        ok: false,
        repoPath: null,
        warning: 'Path is not inside a Git work tree.'
      };
    }

    return {
      ok: true,
      repoPath,
      warning: null
    };
  }
}
