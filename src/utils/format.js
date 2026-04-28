export function formatShortcut(shortcut) {
  return shortcut ? '[' + shortcut + ']' : '[-]';
}

export function formatBranchName(repo, color) {
  const display = repo.branchDisplay ?? 'unknown';

  if (repo.detached) {
    return formatSecondaryBranch(display, color);
  }

  if (repo.branch === 'main' || repo.branch === 'master') {
    return color.green(display);
  }

  return formatSecondaryBranch(display, color);
}

export function formatBranchValue(branchName, color) {
  return formatBranchName({
    branch: branchName,
    branchDisplay: branchName,
    detached: false
  }, color);
}

function formatSecondaryBranch(value, color) {
  return color.darkYellow ? color.darkYellow(value) : color.yellow(value);
}
