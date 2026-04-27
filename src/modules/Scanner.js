import fs from 'fs';
import path from 'path';

export class Scanner {
  constructor(git) {
    this.git = git;
  }

  scanProjects(projects) {
    return {
      projects: projects.map((project) => this.scanProject(project))
    };
  }

  scanProject(project) {
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
      repos = this.discoverRepos(project.path);
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
      totals: null,
      repos
    };
  }

  discoverRepos(projectPath) {
    const candidates = [projectPath, ...this.listChildDirectories(projectPath)];
    const seen = new Set();
    const repos = [];

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
      repos.push({
        name: path.basename(repoPath),
        path: repoPath,
        branch: null,
        detached: false,
        warning: null,
        added: null,
        removed: null,
        net: null,
        modifiedFiles: null,
        lastCommitAgo: null,
        dirty: null
      });
    }

    return repos.sort((a, b) => a.name.localeCompare(b.name));
  }

  listChildDirectories(projectPath) {
    return fs.readdirSync(projectPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '.git')
      .map((entry) => path.join(projectPath, entry.name));
  }
}
