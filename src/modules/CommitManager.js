export class CommitManager {
  createHotfixPayload(repo) {
    const branchName = repo.branch ?? 'detached';

    return {
      title: 'hotfix(' + branchName + '): ' + String(repo.modifiedFiles) + ' file(s)',
      body: 'Auto hotfix commit'
    };
  }

  createDefaultPayload(repo) {
    return {
      title: 'update(' + repo.name + '): ' + String(repo.modifiedFiles) + ' file(s)',
      body: ''
    };
  }

  commit(repoPath, title, body) {
    return this.git.commit(repoPath, title, body);
  }

  constructor(git) {
    this.git = git;
  }
}
