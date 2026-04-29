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

  parseGeneratedCommitResponse(response) {
    const title = this.extractGeneratedField('Title', response);
    const summary = this.extractGeneratedField('Summary', response);

    if (!title) {
      return {
        ok: false,
        title: '',
        body: '',
        warning: 'Could not find a Title: line in the generated response.'
      };
    }

    if (!summary) {
      return {
        ok: false,
        title: '',
        body: '',
        warning: 'Could not find a Summary: line in the generated response.'
      };
    }

    return {
      ok: true,
      title,
      body: summary,
      warning: null
    };
  }

  extractGeneratedField(fieldName, response) {
    const pattern = new RegExp('^' + fieldName + '\\s*:\\s*(.*)$', 'i');
    const lines = String(response ?? '').split(/\r?\n/);

    for (const line of lines) {
      const match = line.match(pattern);

      if (match) {
        return match[1].trim();
      }
    }

    return '';
  }

  commit(repoPath, title, body) {
    return this.git.commit(repoPath, title, body);
  }

  constructor(git) {
    this.git = git;
  }
}
