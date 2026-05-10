import path from 'path';
import { GitFileOperations } from './GitFileOperations.js';
import { spawnSync } from 'child_process';

export class Git {
  constructor() {
    this.fileOperations = new GitFileOperations(this);
  }

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
    return this.fileOperations.getFileDiffStats(repoPath);
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

  getFileDiff(repoPath, file) {
    return this.fileOperations.getFileDiff(repoPath, file);
  }

  getFileLastCommitAge(repoPath, file) {
    return this.fileOperations.getFileLastCommitAge(repoPath, file);
  }

  getFileMetadata(repoPath, file) {
    return this.fileOperations.getFileMetadata(repoPath, file);
  }

  getCommitHistory(repoPath, options = {}) {
    const page = Math.max(0, Number.parseInt(String(options.page ?? 0), 10) || 0);
    const pageSize = Math.max(1, Number.parseInt(String(options.pageSize ?? 10), 10) || 10);
    const result = this.run([
      '-C',
      repoPath,
      'log',
      '--skip=' + String(page * pageSize),
      '--max-count=' + String(pageSize + 1),
      '--format=%H%x1f%h%x1f%ct%x1f%s%x1f%b%x1e'
    ]);

    if (!result.ok) {
      return {
        ok: false,
        commits: [],
        hasNextPage: false,
        warning: result.stderr || 'Git history not available.'
      };
    }

    const commits = this.parseCommitHistory(result.stdout).map((commit) => {
      const changes = this.getCommitChanges(repoPath, commit.hash);
      const stats = changes.ok ? this.sumCommitChanges(changes.files) : { added: 0, removed: 0 };

      return {
        ...commit,
        added: stats.added,
        removed: stats.removed
      };
    });

    return {
      ok: true,
      commits: commits.slice(0, pageSize),
      hasNextPage: commits.length > pageSize,
      warning: null
    };
  }

  getCommitChanges(repoPath, commitHash) {
    const result = this.run([
      '-C',
      repoPath,
      'show',
      '--format=',
      '--numstat',
      '--no-ext-diff',
      String(commitHash)
    ]);

    if (!result.ok) {
      return {
        ok: false,
        files: [],
        warning: result.stderr || 'Commit changes not available.'
      };
    }

    return {
      ok: true,
      files: this.parseCommitChangeStats(result.stdout),
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

  getUpstreamStatus(repoPath) {
    const upstream = this.run(['-C', repoPath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);

    if (!upstream.ok || !upstream.stdout) {
      return {
        ok: true,
        upstream: null,
        ahead: 0,
        behind: 0,
        warning: null
      };
    }

    const counts = this.run(['-C', repoPath, 'rev-list', '--left-right', '--count', upstream.stdout + '...HEAD']);

    if (!counts.ok) {
      return {
        ok: false,
        upstream: upstream.stdout,
        ahead: 0,
        behind: 0,
        warning: counts.stderr || 'Upstream status not available.'
      };
    }

    const [behindText, aheadText] = counts.stdout.split(/\s+/);
    const behind = Number(behindText);
    const ahead = Number(aheadText);

    return {
      ok: true,
      upstream: upstream.stdout,
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
      warning: null
    };
  }

  getCurrentBranch(repoPath) {
    const branch = this.run(['-C', repoPath, 'symbolic-ref', '--quiet', '--short', 'HEAD']);

    if (branch.ok && branch.stdout) {
      return {
        ok: true,
        branch: branch.stdout,
        detached: false,
        display: branch.stdout,
        warning: null
      };
    }

    const commit = this.run(['-C', repoPath, 'rev-parse', '--short', 'HEAD']);

    if (commit.ok && commit.stdout) {
      return {
        ok: true,
        branch: null,
        detached: true,
        display: 'detached HEAD (' + commit.stdout + ')',
        warning: null
      };
    }

    return {
      ok: false,
      branch: null,
      detached: false,
      display: 'unknown',
      warning: branch.stderr || commit.stderr || 'Current branch not available.'
    };
  }

  listLocalBranches(repoPath) {
    const result = this.run(['-C', repoPath, 'for-each-ref', '--format=%(refname:short)', 'refs/heads']);

    return {
      ok: result.ok,
      branches: result.ok ? this.parseLines(result.stdout).sort((a, b) => a.localeCompare(b)) : [],
      warning: result.ok ? null : result.stderr || 'Local branches not available.'
    };
  }

  checkoutBranch(repoPath, branchName) {
    const result = this.run(['-C', repoPath, 'checkout', branchName]);

    return {
      ok: result.ok,
      warning: result.ok ? null : result.stderr || 'Git checkout failed.'
    };
  }

  discardFileChanges(repoPath, file) {
    return this.fileOperations.discardFileChanges(repoPath, file);
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
    return this.fileOperations.parseStatusFile(line);
  }

  parseCommitHistory(output) {
    return String(output || '')
      .split('\x1e')
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const parts = record.split('\x1f');
        const hash = parts[0] ?? '';
        const shortHash = parts[1] ?? hash.slice(0, 7);
        const timestampSeconds = Number(parts[2] ?? '');
        const timestamp = Number.isFinite(timestampSeconds) ? timestampSeconds * 1000 : null;
        const title = parts[3] ?? '';
        const body = parts.slice(4).join('\x1f');

        return {
          hash,
          shortHash,
          timestamp,
          date: timestamp === null ? '' : this.formatHistoryTimestamp(timestamp),
          age: timestamp === null ? '' : this.formatHistoryAge(Date.now() - timestamp),
          title,
          body: this.normalizeCommitBody(body)
        };
      })
      .filter((commit) => commit.hash);
  }

  parseCommitChangeStats(output) {
    return this.parseLines(output).map((line) => {
      const parsed = this.parseNumstatLine(line);

      if (!parsed) {
        return null;
      }

      return {
        file: parsed.file,
        added: parsed.added,
        removed: parsed.removed,
        net: parsed.added - parsed.removed
      };
    }).filter(Boolean);
  }

  normalizeCommitBody(body) {
    return String(body || '').replace(/\s+/g, ' ').trim();
  }

  sumCommitChanges(files) {
    return files.reduce((stats, file) => {
      return {
        added: stats.added + file.added,
        removed: stats.removed + file.removed
      };
    }, { added: 0, removed: 0 });
  }

  buildUntrackedFileDiff(repoPath, file) {
    return this.fileOperations.buildUntrackedFileDiff(repoPath, file);
  }

  countFileLines(filePath) {
    return this.fileOperations.countFileLines(filePath);
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

  formatHistoryTimestamp(timestamp) {
    const date = new Date(timestamp);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
  }

  formatHistoryAge(milliseconds) {
    const minutes = Math.max(0, Math.floor(milliseconds / 60000));

    if (minutes < 1) {
      return 'just now';
    }

    if (minutes < 60) {
      return this.pluralizeHistoryAge(minutes, 'minute');
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return this.pluralizeHistoryAge(hours, 'hour');
    }

    const days = Math.floor(hours / 24);

    if (days < 365) {
      return this.pluralizeHistoryAge(days, 'day');
    }

    return this.pluralizeHistoryAge(Math.floor(days / 365), 'year');
  }

  pluralizeHistoryAge(value, unit) {
    return String(value) + ' ' + unit + (value === 1 ? '' : 's') + ' ago';
  }

  formatFileStatus(output) {
    return this.fileOperations.formatFileStatus(output);
  }

  formatFileTimestamp(date) {
    return this.fileOperations.formatFileTimestamp(date);
  }
}
