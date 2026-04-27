import fs from 'fs';
import path from 'path';
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

  getDiffStats(repoPath) {
    const unstaged = this.run(['-C', repoPath, 'diff', '--numstat', '--no-ext-diff']);
    const staged = this.run(['-C', repoPath, 'diff', '--cached', '--numstat', '--no-ext-diff']);
    const status = this.run(['-C', repoPath, 'status', '--porcelain']);
    const untracked = this.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard']);

    for (const result of [unstaged, staged, status, untracked]) {
      if (!result.ok) {
        return {
          ok: false,
          added: 0,
          removed: 0,
          net: 0,
          modifiedFiles: 0,
          dirty: false,
          warning: result.stderr || 'Git diff stats failed.'
        };
      }
    }

    const trackedStats = this.combineStats([
      this.parseNumstat(unstaged.stdout),
      this.parseNumstat(staged.stdout)
    ]);
    const untrackedFiles = this.parseLines(untracked.stdout);
    const untrackedAdded = untrackedFiles.reduce((total, file) => {
      return total + this.countFileLines(path.join(repoPath, file));
    }, 0);
    const added = trackedStats.added + untrackedAdded;
    const removed = trackedStats.removed;
    const modifiedFiles = this.parseLines(status.stdout).length;

    return {
      ok: true,
      added,
      removed,
      net: added - removed,
      modifiedFiles,
      dirty: modifiedFiles > 0,
      warning: null
    };
  }

  getLastCommitAge(repoPath) {
    const result = this.run(['-C', repoPath, 'log', '-1', '--format=%ct']);

    if (!result.ok) {
      return {
        ok: false,
        timestamp: null,
        age: null,
        warning: result.stderr || 'Last commit not available.'
      };
    }

    const timestamp = Number(result.stdout) * 1000;

    if (!Number.isFinite(timestamp)) {
      return {
        ok: false,
        timestamp: null,
        age: null,
        warning: 'Last commit timestamp was invalid.'
      };
    }

    return {
      ok: true,
      timestamp,
      age: this.formatAge(Date.now() - timestamp),
      warning: null
    };
  }

  parseNumstat(output) {
    return this.parseLines(output).reduce((stats, line) => {
      const [added, removed] = line.split('\t');

      return {
        added: stats.added + this.parseNumstatNumber(added),
        removed: stats.removed + this.parseNumstatNumber(removed)
      };
    }, { added: 0, removed: 0 });
  }

  parseNumstatNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  combineStats(statsList) {
    return statsList.reduce((total, stats) => {
      return {
        added: total.added + stats.added,
        removed: total.removed + stats.removed
      };
    }, { added: 0, removed: 0 });
  }

  parseLines(output) {
    if (!output) {
      return [];
    }

    return output.split(/\r?\n/).filter(Boolean);
  }

  countFileLines(filePath) {
    try {
      const stats = fs.statSync(filePath);

      if (!stats.isFile()) {
        return 0;
      }

      const content = fs.readFileSync(filePath);

      if (content.includes(0)) {
        return 0;
      }

      const text = content.toString('utf8');

      if (!text) {
        return 0;
      }

      return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
    } catch {
      return 0;
    }
  }

  formatAge(milliseconds) {
    const minutes = Math.max(0, Math.floor(milliseconds / 60000));

    if (minutes < 1) {
      return 'now';
    }

    if (minutes < 60) {
      return String(minutes) + 'm ago';
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return String(hours) + 'h ago';
    }

    const days = Math.floor(hours / 24);

    if (days < 365) {
      return String(days) + 'd ago';
    }

    return String(Math.floor(days / 365)) + 'y ago';
  }
}
