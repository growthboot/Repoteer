import fs from 'fs';
import path from 'path';

export class Scanner {
  constructor(git) {
    this.git = git;
  }

  scanProjects(projects, options = {}) {
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const onRepoProgress = typeof options.onRepoProgress === 'function' ? options.onRepoProgress : null;
    const repoProgressProjectName = options.repoProgressProjectName ?? null;
    const scannedProjects = [];
    const total = projects.length;

    if (total === 0) {
      onProgress?.({
        current: 0,
        total,
        projectName: null,
        percent: 100
      });

      return { projects: scannedProjects };
    }

    projects.forEach((project, index) => {
      onProgress?.({
        current: index,
        total,
        projectName: project.name,
        percent: Math.floor((index / total) * 100)
      });

      const scanOptions = onRepoProgress && project.name === repoProgressProjectName
        ? { onRepoProgress }
        : {};

      scannedProjects.push(this.scanProject(project, scanOptions));

      onProgress?.({
        current: index + 1,
        total,
        projectName: project.name,
        percent: Math.floor(((index + 1) / total) * 100)
      });
    });

    return {
      projects: scannedProjects
    };
  }

  scanProject(project, options = {}) {
    if (!fs.existsSync(project.path)) {
      return {
        ...project,
        warning: 'Project path does not exist.',
        totals: null,
        repos: []
      };
    }

    let repos = [];

    try {
      repos = this.discoverRepos(project.path, options);
    } catch (error) {
      return {
        ...project,
        warning: error instanceof Error ? error.message : String(error),
        totals: null,
        repos: []
      };
    }

    return {
      ...project,
      warning: null,
      totals: this.aggregateTotals(repos),
      repos
    };
  }

  discoverRepos(projectPath, options = {}) {
    const onRepoProgress = typeof options.onRepoProgress === 'function' ? options.onRepoProgress : null;
    const candidates = [projectPath, ...this.listChildDirectories(projectPath)];
    const seen = new Set();
    const repoPaths = [];

    for (const candidate of candidates) {
      const detected = this.git.detectRepo(candidate);

      if (!detected.ok) {
        continue;
      }

      const repoPath = detected.repoPath;

      if (seen.has(repoPath)) {
        continue;
      }

      seen.add(repoPath);
      repoPaths.push(repoPath);
    }

    const repos = repoPaths.map((repoPath, index) => {
      const repo = this.scanRepo(repoPath);

      onRepoProgress?.({
        current: index + 1,
        total: repoPaths.length,
        repoName: repo.name,
        repoPath,
        percent: Math.floor(((index + 1) / repoPaths.length) * 100)
      });

      return repo;
    });

    return repos.sort((a, b) => a.name.localeCompare(b.name));
  }

  scanRepo(repoPath) {
    const stats = this.git.getDiffStats(repoPath);
    const lastCommit = this.git.getLastCommitAge(repoPath);
    const currentBranch = this.git.getCurrentBranch(repoPath);
    const upstreamStatus = this.git.getUpstreamStatus(repoPath);
    const warnings = [
      stats.ok ? null : stats.warning,
      lastCommit.ok ? null : lastCommit.warning,
      currentBranch.ok ? null : currentBranch.warning,
      upstreamStatus.ok ? null : upstreamStatus.warning
    ].filter(Boolean);

    return {
      name: path.basename(repoPath),
      path: repoPath,
      branch: currentBranch.branch,
      branchDisplay: currentBranch.display,
      detached: currentBranch.detached,
      upstream: upstreamStatus.upstream,
      ahead: upstreamStatus.ahead,
      behind: upstreamStatus.behind,
      warning: warnings.length > 0 ? warnings.join(' ') : null,
      added: stats.added,
      removed: stats.removed,
      net: stats.net,
      modifiedFiles: stats.modifiedFiles,
      lastCommitAgo: lastCommit.age,
      lastCommitTimestamp: lastCommit.timestamp,
      dirty: stats.dirty
    };
  }

  aggregateTotals(repos) {
    const totals = repos.reduce((total, repo) => {
      return {
        added: total.added + repo.added,
        removed: total.removed + repo.removed,
        modifiedFiles: total.modifiedFiles + repo.modifiedFiles,
        lastCommitTimestamp: Math.max(total.lastCommitTimestamp, repo.lastCommitTimestamp ?? 0)
      };
    }, {
      added: 0,
      removed: 0,
      modifiedFiles: 0,
      lastCommitTimestamp: 0
    });

    return {
      added: totals.added,
      removed: totals.removed,
      net: totals.added - totals.removed,
      modifiedFiles: totals.modifiedFiles,
      lastCommitAgo: this.formatLastCommitAge(totals.lastCommitTimestamp)
    };
  }

  formatLastCommitAge(timestamp) {
    if (!timestamp) {
      return null;
    }

    const milliseconds = Date.now() - timestamp;
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

  listChildDirectories(projectPath) {
    return fs.readdirSync(projectPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '.git')
      .map((entry) => path.join(projectPath, entry.name));
  }
}
