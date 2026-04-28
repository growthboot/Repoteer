export class CommitManager {
  createHotfixPayload(repo) {
    return {
      title: 'hotfix(main): ' + String(repo.modifiedFiles) + ' file(s)',
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
