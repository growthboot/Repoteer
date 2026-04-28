export class BranchManager {
  constructor(git) {
    this.git = git;
  }

  listLocalBranches(repoPath) {
    return this.git.listLocalBranches(repoPath);
  }

  checkoutExistingLocalBranch(repoPath, branchName) {
    const branches = this.listLocalBranches(repoPath);

    if (!branches.ok) {
      return {
        ok: false,
        warning: branches.warning
      };
    }

    if (!branches.branches.includes(branchName)) {
      return {
        ok: false,
        warning: 'Branch not found: ' + branchName
      };
    }

    return this.git.checkoutBranch(repoPath, branchName);
  }
}
