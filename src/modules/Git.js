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

  getFileDiffStats(repoPath) {
    const unstaged = this.run(['-C', repoPath, 'diff', '--numstat', '--no-ext-diff']);
    const staged = this.run(['-C', repoPath, 'diff', '--cached', '--numstat', '--no-ext-diff']);
    const status = this.run(['-C', repoPath, 'status', '--porcelain']);
    const untracked = this.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard']);

    for (const result of [unstaged, staged, status, untracked]) {
      if (!result.ok) {
        return {
          ok: false,
          files: [],
          warning: result.stderr || 'Git file diff stats failed.'
        };
      }
    }

    const files = new Map();

    for (const line of [...this.parseLines(unstaged.stdout), ...this.parseLines(staged.stdout)]) {
      const parsed = this.parseNumstatLine(line);

      if (!parsed) {
        continue;
      }

      const current = files.get(parsed.file) ?? {
        file: parsed.file,
        added: 0,
        removed: 0
      };

      current.added += parsed.added;
      current.removed += parsed.removed;
      files.set(parsed.file, current);
    }

    for (const file of this.parseLines(untracked.stdout)) {
      const current = files.get(file) ?? {
        file,
        added: 0,
        removed: 0
      };

      current.added += this.countFileLines(path.join(repoPath, file));
      files.set(file, current);
    }

    const changedNames = new Set();

    for (const line of this.parseLines(status.stdout)) {
      const file = this.parseStatusFile(line);

      if (file) {
        changedNames.add(file);
      }
    }

    for (const file of changedNames) {
      if (!files.has(file)) {
        files.set(file, {
          file,
          added: 0,
          removed: 0
        });
      }
    }

    return {
      ok: true,
      files: [...files.values()].map((file) => {
        const lastCommit = this.getFileLastCommitAge(repoPath, file.file);

        return {
          ...file,
          net: file.added - file.removed,
          lastCommitAgo: lastCommit.age,
          warning: lastCommit.ok ? null : lastCommit.warning
        };
      }).sort((a, b) => a.file.localeCompare(b.file)),
      warning: null
    };
  }

  getFullDiff(repoPath) {
    const unstaged = this.run(['-C', repoPath, 'diff', '--no-ext-diff']);
    const staged = this.run(['-C', repoPath, 'diff', '--cached', '--no-ext-diff']);
    const untracked = this.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard']);

    for (const result of [unstaged, staged, untracked]) {
      if (!result.ok) {
        return {
          ok: false,
          diff: '',
          warning: result.stderr || 'Git diff failed.'
        };
      }
    }

    const parts = [];

    if (staged.stdout) {
      parts.push(staged.stdout);
    }

    if (unstaged.stdout) {
      parts.push(unstaged.stdout);
    }

    for (const file of this.parseLines(untracked.stdout)) {
      const fileDiff = this.buildUntrackedFileDiff(repoPath, file);

      if (fileDiff) {
        parts.push(fileDiff);
      }
    }

    return {
      ok: true,
      diff: parts.join('\n\n'),
      warning: null
    };
  }

  getFileLastCommitAge(repoPath, file) {
    const result = this.run(['-C', repoPath, 'log', '-1', '--format=%ct', '--', file]);

    if (!result.ok) {
      return {
        ok: false,
        age: null,
        warning: result.stderr || 'File last commit not available.'
      };
    }

    if (!result.stdout) {
      return {
        ok: true,
        age: null,
        warning: null
      };
    }

    const timestamp = Number(result.stdout) * 1000;

    if (!Number.isFinite(timestamp)) {
      return {
        ok: false,
        age: null,
        warning: 'File last commit timestamp was invalid.'
      };
    }

    return {
      ok: true,
      age: this.formatAge(Date.now() - timestamp),
      warning: null
    };
  }

  commit(repoPath, title, body) {
    const add = this.run(['-C', repoPath, 'add', '-A']);

    if (!add.ok) {
      return {
        ok: false,
        warning: add.stderr || 'Git add failed.'
      };
    }

    const args = ['-C', repoPath, 'commit', '-m', title];

    if (body.trim()) {
      args.push('-m', body);
    }

    const result = this.run(args);

    return {
      ok: result.ok,
      warning: result.ok ? null : result.stderr || 'Git commit failed.'
    };
  }

  push(repoPath) {
    const result = this.run(['-C', repoPath, 'push']);

    return {
      ok: result.ok,
      warning: result.ok ? null : result.stderr || 'Git push failed.'
    };
  }

  parseNumstat(output) {
    return this.parseLines(output).reduce((stats, line) => {
      const parsed = this.parseNumstatLine(line);

      if (!parsed) {
        return stats;
      }

      return {
        added: stats.added + parsed.added,
        removed: stats.removed + parsed.removed
      };
    }, { added: 0, removed: 0 });
  }

  parseNumstatLine(line) {
    const parts = line.split('\t');

    if (parts.length < 3) {
      return null;
    }

    return {
      added: this.parseNumstatNumber(parts[0]),
      removed: this.parseNumstatNumber(parts[1]),
      file: parts.slice(2).join('\t')
    };
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

  parseStatusFile(line) {
    if (line.length < 4) {
      return null;
    }

    const value = line.slice(3);

    if (!value) {
      return null;
    }

    const renameParts = value.split(' -> ');
    return renameParts[renameParts.length - 1];
  }

  buildUntrackedFileDiff(repoPath, file) {
    const filePath = path.join(repoPath, file);

    try {
      const stats = fs.statSync(filePath);

      if (!stats.isFile()) {
        return null;
      }

      const content = fs.readFileSync(filePath);

      if (content.includes(0)) {
        return [
          'diff --git a/' + file + ' b/' + file,
          'new file mode 100644',
          'Binary files /dev/null and b/' + file + ' differ'
        ].join('\n');
      }

      const text = content.toString('utf8');
      const lines = text ? text.split('\n') : [];

      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      return [
        'diff --git a/' + file + ' b/' + file,
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/' + file,
        '@@ -0,0 +1,' + String(lines.length) + ' @@',
        ...lines.map((line) => '+' + line)
      ].join('\n');
    } catch {
      return null;
    }
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
