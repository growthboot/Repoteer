import fs from 'fs';
import path from 'path';

export class GitFileOperations {
  constructor(git) {
    this.git = git;
  }

  getFileDiffStats(repoPath) {
    const unstaged = this.git.run(['-C', repoPath, 'diff', '--numstat', '--no-ext-diff']);
    const staged = this.git.run(['-C', repoPath, 'diff', '--cached', '--numstat', '--no-ext-diff']);
    const status = this.git.run(['-C', repoPath, 'status', '--porcelain']);
    const untracked = this.git.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard']);

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

  getFileDiff(repoPath, file) {
    const unstaged = this.git.run(['-C', repoPath, 'diff', '--no-ext-diff', '--', file]);
    const staged = this.git.run(['-C', repoPath, 'diff', '--cached', '--no-ext-diff', '--', file]);
    const untracked = this.git.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard', '--', file]);

    for (const result of [unstaged, staged, untracked]) {
      if (!result.ok) {
        return {
          ok: false,
          diff: '',
          warning: result.stderr || 'Git file diff failed.'
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

    if (this.parseLines(untracked.stdout).includes(file)) {
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
    const result = this.git.run(['-C', repoPath, 'log', '-1', '--format=%ct', '--', file]);

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
      age: this.git.formatAge(Date.now() - timestamp),
      warning: null
    };
  }

  getFileMetadata(repoPath, file) {
    const status = this.git.run(['-C', repoPath, 'status', '--porcelain', '--', file]);

    if (!status.ok) {
      return {
        ok: false,
        created: 'N/A',
        modified: 'N/A',
        state: 'unknown',
        warning: status.stderr || 'Git file status failed.'
      };
    }

    let created = 'N/A';
    let modified = 'N/A';

    try {
      const stats = fs.statSync(path.join(repoPath, file));

      if (stats.isFile()) {
        created = this.formatFileTimestamp(stats.birthtime);
        modified = this.formatFileTimestamp(stats.mtime);
      }
    } catch {
      created = 'N/A';
      modified = 'N/A';
    }

    return {
      ok: true,
      created,
      modified,
      state: this.formatFileStatus(status.stdout),
      warning: null
    };
  }

  discardFileChanges(repoPath, file) {
    const initialUntracked = this.git.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard', '--', file]);

    if (!initialUntracked.ok) {
      return {
        ok: false,
        warning: initialUntracked.stderr || 'Git untracked file check failed.'
      };
    }

    if (this.parseLines(initialUntracked.stdout).includes(file)) {
      const clean = this.git.run(['-C', repoPath, 'clean', '-f', '--', file]);

      return {
        ok: clean.ok,
        warning: clean.ok ? null : clean.stderr || 'Git clean failed.'
      };
    }

    const unstage = this.git.run(['-C', repoPath, 'restore', '--staged', '--', file]);

    if (!unstage.ok) {
      return {
        ok: false,
        warning: unstage.stderr || 'Git restore staged failed.'
      };
    }

    const restore = this.git.run(['-C', repoPath, 'restore', '--worktree', '--', file]);

    if (!restore.ok) {
      const afterRestoreUntracked = this.git.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard', '--', file]);

      if (afterRestoreUntracked.ok && this.parseLines(afterRestoreUntracked.stdout).includes(file)) {
        const clean = this.git.run(['-C', repoPath, 'clean', '-f', '--', file]);

        return {
          ok: clean.ok,
          warning: clean.ok ? null : clean.stderr || 'Git clean failed.'
        };
      }

      return {
        ok: false,
        warning: restore.stderr || 'Git restore worktree failed.'
      };
    }

    const remainingUntracked = this.git.run(['-C', repoPath, 'ls-files', '--others', '--exclude-standard', '--', file]);

    if (remainingUntracked.ok && this.parseLines(remainingUntracked.stdout).includes(file)) {
      const clean = this.git.run(['-C', repoPath, 'clean', '-f', '--', file]);

      return {
        ok: clean.ok,
        warning: clean.ok ? null : clean.stderr || 'Git clean failed.'
      };
    }

    return {
      ok: true,
      warning: null
    };
  }

  parseLines(output) {
    if (!output) {
      return [];
    }

    return output.split(/\r?\n/).filter(Boolean);
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

  parseStatusFile(line) {
    if (line.length < 3) {
      return null;
    }

    const value = line[2] === ' '
      ? line.slice(3)
      : line[1] === ' '
        ? line.slice(2)
        : line.slice(3);

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

  formatFileStatus(output) {
    const labels = new Set();

    for (const line of this.parseLines(output)) {
      const status = line.slice(0, 2);

      if (status === '??') {
        labels.add('untracked');
        continue;
      }

      if (status.includes('A')) {
        labels.add('added');
      }

      if (status.includes('M')) {
        labels.add('modified');
      }

      if (status.includes('D')) {
        labels.add('deleted');
      }

      if (status.includes('R')) {
        labels.add('renamed');
      }

      if (status.includes('C')) {
        labels.add('copied');
      }
    }

    return labels.size > 0 ? [...labels].join(', ') : 'clean';
  }

  formatFileTimestamp(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    return date.toLocaleString();
  }
}
