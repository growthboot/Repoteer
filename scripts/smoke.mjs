import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { Git } from '../src/modules/Git.js';
import { Scanner } from '../src/modules/Scanner.js';
import { formatTable } from '../src/utils/table.js';
import { formatActionColumns } from '../src/utils/menu.js';
import { stripAnsi } from '../src/utils/color.js';
import { formatBranchName } from '../src/utils/format.js';
import { validateProjectInput } from '../src/utils/validation.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }

  return out;
}

function checkSyntax() {
  const files = [...collectJsFiles(path.join(root, 'src')), ...collectJsFiles(path.join(root, 'bin'))];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root,
      encoding: 'utf8'
    });

    assert(result.status === 0, result.stderr || result.stdout || 'syntax check failed: ' + file);
  }
}

function gitAvailable() {
  const result = spawnSync('git', ['--version'], {
    encoding: 'utf8'
  });

  return result.status === 0;
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || result.stdout || 'git command failed: git ' + args.join(' '));
}

function initGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  runGit(['init'], repoPath);
}

function commitAll(repoPath, message) {
  runGit(['add', '.'], repoPath);
  runGit(['-c', 'user.name=Repoteer Smoke', '-c', 'user.email=smoke@example.com', 'commit', '-m', message], repoPath);
}

function runApp(input, home, args = []) {
  return spawnSync(process.execPath, ['src/app.js', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home
    }
  });
}

function readProjects(home) {
  const file = path.join(home, '.repoteer', 'storage', 'projects.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readSettings(home) {
  const file = path.join(home, '.repoteer', 'storage', 'settings.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readBookmarks(home) {
  const file = path.join(home, '.repoteer', 'storage', 'bookmarks.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readCommands(home) {
  const file = path.join(home, '.repoteer', 'storage', 'commands.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function smokeQuitPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const result = runApp('q\n', home);

  assert(result.status === 0, result.stderr || 'quit path failed');
  assert(result.stdout.includes('Repoteer'), 'quit path did not render title');
  assert(result.stdout.includes('No projects added.'), 'quit path did not render empty state');
  assert(result.stdout.includes('Action: '), 'quit path did not prompt for action');
  assert(Array.isArray(readProjects(home)), 'quit path did not create projects array');
  assert(readProjects(home).length === 0, 'quit path should not add projects');
  assert(readSettings(home).color === true, 'quit path did not create default color setting');
}

function smokePipedMultiCharacterActionPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const result = runApp('bo2\nq\n', home);

  assert(result.status === 0, result.stderr || 'multi-character action path failed');
  assert(countOccurrences(result.stdout, 'Action: ') === 2, 'multi-character action should rerender before quit');
}

function smokeProjectsPageRefreshPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const result = runApp('r\nq\n', home);

  assert(result.status === 0, result.stderr || 'projects page refresh path failed');
  assert(result.stdout.includes('R. Refresh'), 'projects page did not render refresh action');
  assert(countOccurrences(result.stdout, 'Action: ') === 2, 'refresh action should rerender projects page');
}

function smokeNoColorBootFlagPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const result = runApp('q\n', home, ['--no-color']);

  assert(result.status === 0, result.stderr || '--no-color path failed');
  assert(result.stdout.includes('Repoteer'), '--no-color path did not render title');
  assert(!/\u001b\[[0-9;]*m/.test(result.stdout), '--no-color path emitted ANSI color');
}

function smokeSettingsToggleColorPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const input = ['s', 't', '', 'b', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'settings toggle color path failed');
  assert(result.stdout.includes('S. Settings'), 'projects page did not render settings action');
  assert(result.stdout.includes('Settings'), 'settings page did not render title');
  assert(result.stdout.includes('Color: On'), 'settings page did not render color on state');
  assert(result.stdout.includes('Color disabled.'), 'settings page did not confirm disabled color');
  assert(result.stdout.includes('Color: Off'), 'settings page did not render color off state');
  assert(readSettings(home).color === false, 'settings toggle did not persist color=false');
}

function smokeAddProjectPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const input = ['a', 'Smoke Project', projectPath, 'z', '', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'add project path failed');
  assert(result.stdout.includes('Project saved.'), 'add project path did not save');
  assert(/^1\.\s+Smoke Project/m.test(result.stdout), 'add project path did not render numbered project row');
  assert(/^1\.\s+Smoke Project\s+\+0 \/ -0\s+\+0\s+0 repos\s+N\/A\s+\[z\]$/m.test(result.stdout), 'add project path did not render aligned project row shape');
  assert(result.stdout.includes('+0 / -0'), 'add project path did not render zero change totals');
  assert(result.stdout.includes('+0'), 'add project path did not render zero net');
  assert(result.stdout.includes('0 repos'), 'add project path did not render repo count');
  assert(result.stdout.includes('N/A'), 'add project path did not render missing last commit data');

  const projects = readProjects(home);
  assert(projects.length === 1, 'add project path should save exactly one project');
  assert(projects[0].name === 'Smoke Project', 'saved project name mismatch');
  assert(projects[0].path === projectPath, 'saved project path mismatch');
  assert(projects[0].shortcut === 'z', 'saved project shortcut mismatch');
}

function smokeAddProjectCancelPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const input = ['a', 'q', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'add project cancel path failed');
  assert(result.stdout.includes('Add Project'), 'add project cancel path did not open add page');
  assert(!result.stdout.includes('Project saved.'), 'add project cancel path should not save');
  assert(readProjects(home).length === 0, 'add project cancel path should not add projects');
}

function smokeGitRepoDiscovery() {
  if (!gitAvailable()) {
    console.log('smoke git discovery skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const apiPath = path.join(projectPath, 'api');
  const webPath = path.join(projectPath, 'web');

  initGitRepo(apiPath);
  initGitRepo(webPath);

  fs.writeFileSync(path.join(apiPath, 'app.txt'), 'one\n');
  commitAll(apiPath, 'seed api');
  fs.writeFileSync(path.join(apiPath, 'app.txt'), 'one\ntwo\n');
  fs.writeFileSync(path.join(webPath, 'index.txt'), 'alpha\nbeta\ngamma\n');

  const git = new Git();
  const scanner = new Scanner(git);
  const snapshot = scanner.scanProjects([
    {
      name: 'Smoke Project',
      path: projectPath,
      shortcut: 'z'
    }
  ]);

  assert(snapshot.projects.length === 1, 'scanner should return one project');
  assert(snapshot.projects[0].repos.length === 2, 'scanner should discover two child repos');
  assert(snapshot.projects[0].repos[0].name === 'api', 'scanner should sort repos by name');
  assert(snapshot.projects[0].repos[1].name === 'web', 'scanner should sort repos by name');
  assert(snapshot.projects[0].totals.added === 4, 'scanner should aggregate added lines');
  assert(snapshot.projects[0].totals.removed === 0, 'scanner should aggregate removed lines');
  assert(snapshot.projects[0].totals.net === 4, 'scanner should aggregate net lines');
  assert(snapshot.projects[0].totals.modifiedFiles === 2, 'scanner should aggregate modified files');
  assert(snapshot.projects[0].totals.lastCommitAgo === 'now', 'scanner should aggregate last commit age');

  const input = ['a', 'Smoke Project', projectPath, 'z', '', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'git discovery app path failed');
  assert(result.stdout.includes('+4 / -0'), 'projects page did not render discovered change totals');
  assert(result.stdout.includes('+4'), 'projects page did not render discovered net total');
  assert(result.stdout.includes('2 repos'), 'projects page did not render discovered repo count');
  assert(result.stdout.includes('now'), 'projects page did not render discovered last commit age');
}

function smokeProjectsPageHideCleanTogglePath() {
  if (!gitAvailable()) {
    console.log('smoke projects page hide clean toggle skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const dirtyProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-dirty-project-'));
  const cleanProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-clean-project-'));
  const missingProjectPath = path.join(os.tmpdir(), 'repoteer-smoke-missing-project-toggle');
  const dirtyRepoPath = path.join(dirtyProjectPath, 'repo');
  const cleanRepoPath = path.join(cleanProjectPath, 'repo');

  initGitRepo(dirtyRepoPath);
  initGitRepo(cleanRepoPath);

  fs.writeFileSync(path.join(dirtyRepoPath, 'file.txt'), 'one\n');
  commitAll(dirtyRepoPath, 'seed dirty');
  fs.writeFileSync(path.join(dirtyRepoPath, 'file.txt'), 'one\ntwo\n');

  fs.writeFileSync(path.join(cleanRepoPath, 'file.txt'), 'one\n');
  commitAll(cleanRepoPath, 'seed clean');

  const storageDir = path.join(home, '.repoteer', 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Dirty Project', path: dirtyProjectPath, shortcut: null },
    { name: 'Clean Project', path: cleanProjectPath, shortcut: null },
    { name: 'Warning Project', path: missingProjectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp('t\nq\n', home);

  assert(result.status === 0, result.stderr || 'projects page hide clean toggle path failed');
  assert(result.stdout.includes('T. Hide projects without code changes'), 'projects page did not render hide clean toggle action');
  assert(result.stdout.includes('T. Show all projects'), 'projects page did not render show all toggle action');

  const screens = result.stdout.split('Action: ');
  assert(screens.length >= 3, 'toggle path should render projects page twice');

  const allProjectsScreen = screens[0];
  const filteredProjectsScreen = screens[1];

  assert(allProjectsScreen.includes('Dirty Project'), 'initial projects screen should show dirty project');
  assert(allProjectsScreen.includes('Clean Project'), 'initial projects screen should show clean project');
  assert(allProjectsScreen.includes('Warning Project'), 'initial projects screen should show warning project');
  assert(filteredProjectsScreen.includes('Dirty Project'), 'filtered projects screen should keep dirty project');
  assert(!filteredProjectsScreen.includes('Clean Project'), 'filtered projects screen should hide clean project');
  assert(filteredProjectsScreen.includes('Warning Project'), 'filtered projects screen should keep warning project');
}

function smokeProjectsPageSortsAlphabeticallyPath() {
  if (!gitAvailable()) {
    console.log('smoke projects page sort skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const alphaProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-alpha-project-'));
  const zebraProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-zebra-project-'));
  const alphaRepoPath = path.join(alphaProjectPath, 'repo');
  const zebraRepoPath = path.join(zebraProjectPath, 'repo');

  initGitRepo(alphaRepoPath);
  initGitRepo(zebraRepoPath);

  fs.writeFileSync(path.join(alphaRepoPath, 'file.txt'), 'one\n');
  commitAll(alphaRepoPath, 'seed alpha');
  fs.writeFileSync(path.join(alphaRepoPath, 'file.txt'), 'one\ntwo\n');

  fs.writeFileSync(path.join(zebraRepoPath, 'file.txt'), 'one\n');
  commitAll(zebraRepoPath, 'seed zebra');
  fs.writeFileSync(path.join(zebraRepoPath, 'file.txt'), 'one\ntwo\nthree\nfour\n');

  const storageDir = path.join(home, '.repoteer', 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Zebra Project', path: zebraProjectPath, shortcut: null },
    { name: 'Alpha Project', path: alphaProjectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp('q\n', home);

  assert(result.status === 0, result.stderr || 'projects page sort path failed');

  const alphaIndex = result.stdout.indexOf('Alpha Project');
  const zebraIndex = result.stdout.indexOf('Zebra Project');

  assert(alphaIndex !== -1, 'projects page sort path did not render alpha project');
  assert(zebraIndex !== -1, 'projects page sort path did not render zebra project');
  assert(alphaIndex < zebraIndex, 'projects page should sort projects alphabetically by name');
}

function smokeProjectsPageNumberSelectionPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-select-project-'));
  const storageDir = path.join(home, '.repoteer', 'storage');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Select Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp('1\nb\nq\n', home);

  assert(result.status === 0, result.stderr || 'projects page number selection path failed');
  assert(result.stdout.includes('Project: Select Project'), 'number selection should open selected project view');
  assert(result.stdout.includes('No Git repositories found.'), 'selected project view should render empty repo state');
}


function smokeProjectPageHideReposWithoutLineChangesPath() {
  if (!gitAvailable()) {
    console.log('smoke project page hide repos skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-repos-toggle-'));
  const dirtyRepoPath = path.join(projectPath, 'dirty-repo');
  const cleanRepoPath = path.join(projectPath, 'clean-repo');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(cleanRepoPath);
  initGitRepo(dirtyRepoPath);

  fs.writeFileSync(path.join(cleanRepoPath, 'file.txt'), 'one\n');
  commitAll(cleanRepoPath, 'seed clean');

  fs.writeFileSync(path.join(dirtyRepoPath, 'file.txt'), 'one\n');
  commitAll(dirtyRepoPath, 'seed dirty');
  fs.writeFileSync(path.join(dirtyRepoPath, 'file.txt'), 'one\ntwo\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Repo Toggle Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp('1\nt\nb\nq\n', home);

  assert(result.status === 0, result.stderr || 'project page repo toggle path failed');
  assert(result.stdout.includes('T. Hide repos without line changes'), 'project page did not render hide repos toggle action');
  assert(result.stdout.includes('T. Show all repos'), 'project page did not render show all repos toggle action');

  const screens = result.stdout.split('Action: ');
  assert(screens.length >= 4, 'project repo toggle path should render three prompts');

  const allReposScreen = screens[1];
  const filteredReposScreen = screens[2];

  assert(allReposScreen.includes('clean-repo'), 'project page should initially show clean repo');
  assert(allReposScreen.includes('dirty-repo'), 'project page should initially show dirty repo');
  assert(!filteredReposScreen.includes('clean-repo'), 'project page should hide clean repo after toggle');
  assert(filteredReposScreen.includes('dirty-repo'), 'project page should keep dirty repo after toggle');
}


function smokeProjectPageEditProjectPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const originalProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-edit-original-'));
  const renamedProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-edit-renamed-'));
  const storageDir = path.join(home, '.repoteer', 'storage');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Edit Project', path: originalProjectPath, shortcut: null }
  ], null, 2) + '\n');

  const input = ['1', 'r', 'Renamed Project', renamedProjectPath, 'z', '', 'b', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'project page edit path failed');
  assert(result.stdout.includes('Edit Project: Edit Project'), 'edit path did not render edit page');
  assert(result.stdout.includes('Project updated.'), 'edit path did not confirm project update');
  assert(result.stdout.includes('Project: Renamed Project'), 'edit path did not reopen renamed project');

  const projects = readProjects(home);
  assert(projects.length === 1, 'edit path should keep one project');
  assert(projects[0].name === 'Renamed Project', 'edit path project name mismatch');
  assert(projects[0].path === renamedProjectPath, 'edit path project path mismatch');
  assert(projects[0].shortcut === 'z', 'edit path project shortcut mismatch');
}


function smokeProjectPageDeleteProjectPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-delete-project-'));
  const storageDir = path.join(home, '.repoteer', 'storage');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Delete Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const input = ['1', 'd', 'yes', '', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'project page delete path failed');
  assert(result.stdout.includes('Delete Project: Delete Project?'), 'delete path did not render confirmation');
  assert(result.stdout.includes('This will remove it from Repoteer only.'), 'delete path did not explain Repoteer-only delete');
  assert(result.stdout.includes('No files will be deleted.'), 'delete path did not explain filesystem safety');
  assert(result.stdout.includes('Project deleted.'), 'delete path did not confirm project deletion');
  assert(readProjects(home).length === 0, 'delete path should remove project from storage');
}


function smokeProjectItemsPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-items-project-'));
  const storageDir = path.join(home, '.repoteer', 'storage');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Items Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const addInput = [
    '1',
    'ab',
    'Dashboard',
    'https://example.com/dashboard',
    'Project dashboard',
    '',
    'ac',
    'project cli',
    'echo ok',
    '',
    'CLI notes',
    '',
    'b',
    'q'
  ].join('\n') + '\n';
  const addResult = runApp(addInput, home);

  assert(addResult.status === 0, addResult.stderr || 'project items add path failed');
  assert(addResult.stdout.includes('Bookmarks'), 'project items add path did not render bookmarks header');
  assert(addResult.stdout.includes('Commands'), 'project items add path did not render commands header');
  assert(addResult.stdout.includes('ab. Add bookmark'), 'project items add path did not render add bookmark action');
  assert(addResult.stdout.includes('ac. Add command'), 'project items add path did not render add command action');
  assert(addResult.stdout.includes('Bookmark saved.'), 'project items add path did not save bookmark');
  assert(addResult.stdout.includes('Command saved.'), 'project items add path did not save command');
  assert(addResult.stdout.includes('b1. Dashboard'), 'project items add path did not render saved bookmark');
  assert(addResult.stdout.includes('c1. project cli'), 'project items add path did not render saved command');

  const bookmarks = readBookmarks(home);
  const commands = readCommands(home);

  assert(bookmarks.length === 1, 'project items should save one bookmark');
  assert(bookmarks[0].projectName === 'Items Project', 'bookmark project name mismatch');
  assert(bookmarks[0].title === 'Dashboard', 'bookmark title mismatch');
  assert(bookmarks[0].target === 'https://example.com/dashboard', 'bookmark target mismatch');
  assert(commands.length === 1, 'project items should save one command');
  assert(commands[0].projectName === 'Items Project', 'command project name mismatch');
  assert(commands[0].title === 'project cli', 'command title mismatch');
  assert(commands[0].command === 'echo ok', 'command text mismatch');
  assert(commands[0].workingDirectory === projectPath, 'command working directory should default to project path');

  const detailInput = [
    '1',
    'b1',
    'b',
    'c1',
    'b',
    'b1',
    'd',
    'yes',
    '',
    'c1',
    'd',
    'yes',
    '',
    'b',
    'q'
  ].join('\n') + '\n';
  const detailResult = runApp(detailInput, home);

  assert(detailResult.status === 0, detailResult.stderr || 'project items detail path failed');
  assert(detailResult.stdout.includes('Bookmark: Dashboard'), 'bookmark detail path did not render title');
  assert(detailResult.stdout.includes('URL/path: https://example.com/dashboard'), 'bookmark detail path did not render target');
  assert(detailResult.stdout.includes('Command: project cli'), 'command detail path did not render title');
  assert(detailResult.stdout.includes('Command: echo ok'), 'command detail path did not render command');
  assert(detailResult.stdout.includes('Working directory: ' + projectPath), 'command detail path did not render working directory');
  assert(detailResult.stdout.includes('T. Open in terminal'), 'command detail path did not render open in terminal action');
  assert(detailResult.stdout.includes('Bookmark deleted.'), 'bookmark detail path did not delete bookmark');
  assert(detailResult.stdout.includes('Command deleted.'), 'command detail path did not delete command');
  assert(readBookmarks(home).length === 0, 'project items should delete bookmark');
  assert(readCommands(home).length === 0, 'project items should delete command');
}

function smokeScannerMissingProjectPath() {
  const git = new Git();
  const scanner = new Scanner(git);
  const missingPath = path.join(os.tmpdir(), 'repoteer-smoke-missing-project');

  const snapshot = scanner.scanProjects([
    {
      name: 'Missing Project',
      path: missingPath,
      shortcut: null
    }
  ]);

  assert(snapshot.projects.length === 1, 'scanner should return missing project');
  assert(snapshot.projects[0].warning === 'Project path does not exist.', 'scanner missing path warning mismatch');
  assert(snapshot.projects[0].repos.length === 0, 'scanner missing path should have no repos');
}

function smokeDuplicateValidation() {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const result = validateProjectInput({
    name: 'Smoke Project',
    path: projectPath,
    shortcut: 'z',
    projects: [
      {
        name: 'Smoke Project',
        path: projectPath,
        shortcut: null
      }
    ]
  });

  assert(result.ok === false, 'duplicate project name should be invalid');
  assert(result.error === 'Project name already exists.', 'duplicate validation error mismatch');
}

function smokeTableFormatting() {
  const rows = formatTable([
    ['', 'Project', '+ / -', 'net', 'modified', 'last commit', 'shortcut'],
    ['1.', 'Repoteer', '+292 / -18', '+274', '1 repo', '1h ago', '[-]'],
    ['2.', 'ContextScript', '+2709 / -1007', '+1702', '5 repos', '1d ago', '[-]']
  ]);

  assert(rows[1].indexOf('+274') === rows[2].indexOf('+1702'), 'table should align net column');
  assert(rows[1].indexOf('1 repo') === rows[2].indexOf('5 repos'), 'table should align modified column');
  assert(rows[1].indexOf('1h ago') === rows[2].indexOf('1d ago'), 'table should align last commit column');

  const coloredRows = formatTable([
    ['Name', 'Status'],
    ['Short', '\u001b[32mok\u001b[39m'],
    ['Much Longer', '\u001b[31mfailed\u001b[39m']
  ]);

  assert(stripAnsi(coloredRows[1]).indexOf('ok') === stripAnsi(coloredRows[2]).indexOf('failed'), 'table should align ANSI-colored cells');

  const actionRows = formatActionColumns([
    '\u001b[1mT.\u001b[22m Hide projects without code changes',
    '\u001b[1mR.\u001b[22m Refresh',
    '\u001b[1mA.\u001b[22m Add project',
    '\u001b[1mS.\u001b[22m Settings',
    '\u001b[1mQ.\u001b[22m Quit'
  ]);

  assert(actionRows.length === 3, 'action columns should pair actions across rows');
  assert(stripAnsi(actionRows[0]).includes('R. Refresh'), 'action columns should render first right action');
  assert(stripAnsi(actionRows[1]).includes('S. Settings'), 'action columns should render second right action');
  assert(stripAnsi(actionRows[2]) === 'Q. Quit', 'action columns should render odd trailing action alone');
  assert(stripAnsi(actionRows[0]).indexOf('R. Refresh') === stripAnsi(actionRows[1]).indexOf('S. Settings'), 'action columns should align right column');
}

function smokeBranchFormatting() {
  const color = {
    green: (value) => '<green>' + value + '</green>',
    darkYellow: (value) => '<darkYellow>' + value + '</darkYellow>',
    yellow: (value) => '<yellow>' + value + '</yellow>'
  };

  assert(formatBranchName({ branch: 'main', branchDisplay: 'main', detached: false }, color) === '<green>main</green>', 'main branch should be green');
  assert(formatBranchName({ branch: 'master', branchDisplay: 'master', detached: false }, color) === '<green>master</green>', 'master branch should be green');
  assert(formatBranchName({ branch: 'feature', branchDisplay: 'feature', detached: false }, color) === '<darkYellow>feature</darkYellow>', 'non-main branch should be dark yellow');
  assert(formatBranchName({ branch: null, branchDisplay: 'detached HEAD (abc123)', detached: true }, color) === '<darkYellow>detached HEAD (abc123)</darkYellow>', 'detached HEAD should be dark yellow');
  assert(formatBranchName({ branch: null, branchDisplay: null, detached: false }, color) === '<darkYellow>unknown</darkYellow>', 'unknown branch should be dark yellow');
}


function smokeRepoPageOpenAndDiffPath() {
  if (!gitAvailable()) {
    console.log('smoke repo page open skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-repo-page-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed repo page');
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\nconst next = 2;\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Repo Page Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'v', 'b', 'b', 'b', 'q'].join('\n') + '\n', home);

  assert(result.status === 0, result.stderr || 'repo page open and diff path failed');
  assert(result.stdout.includes('Repo: Repo Page Project / frontend'), 'repo page should render selected repo title');
  assert(result.stdout.includes('V. View full diff'), 'repo page should render view diff action');
  assert(result.stdout.includes('H. Hotfix commit'), 'repo page should render hotfix action');
  assert(result.stdout.includes('Repo: frontend (diff)'), 'diff page should render title');
  assert(result.stdout.includes('+const next = 2;'), 'diff page should render changed line');
}

function smokeRepoFilePagePath() {
  if (!gitAvailable()) {
    console.log('smoke repo file page skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-file-page-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed file page');
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\nconst next = 2;\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'File Page Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', '1', 'd', 'yes', '', 'b', 'b', 'b', 'q'].join('\n') + '\n', home);
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || 'repo file page path failed');
  assert(result.stdout.includes('File: test.js'), 'file page should render selected file title');
  assert(result.stdout.includes('Created:'), 'file page should render created metadata');
  assert(result.stdout.includes('Modified:'), 'file page should render modified metadata');
  assert(result.stdout.includes('+ / -:'), 'file page should render file line stats');
  assert(result.stdout.includes('+const next = 2;'), 'file page should render selected file diff');
  assert(result.stdout.includes('D. Discard file changes'), 'file page should render discard action');
  assert(result.stdout.includes('File changes discarded.'), 'file page should confirm discard');
  assert(status.stdout.trim() === '', 'discard file changes should clean selected file');
}

function smokeRepoHotfixConfirmPath() {
  if (!gitAvailable()) {
    console.log('smoke repo hotfix skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-hotfix-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed hotfix');
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\nconst next = 2;\n');
  fs.writeFileSync(path.join(repoPath, 'new.js'), 'export const created = true;\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Hotfix Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'h', 'c', '', 'b', 'b', 'q'].join('\n') + '\n', home);
  const log = spawnSync('git', ['log', '-1', '--format=%s%n%b'], {
    cwd: repoPath,
    encoding: 'utf8'
  });
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || 'repo hotfix confirm path failed');
  assert(result.stdout.includes('Confirm Commit'), 'hotfix path should render confirmation page');
  assert(result.stdout.includes('Title: hotfix(main): 2 file(s)'), 'hotfix path should render generated title');
  assert(result.stdout.includes('Body: Auto hotfix commit'), 'hotfix path should render default body');
  assert(result.stdout.includes('Commit created.'), 'hotfix path should create commit after confirmation');
  assert(log.stdout.includes('hotfix(main): 2 file(s)'), 'hotfix commit subject mismatch');
  assert(log.stdout.includes('Auto hotfix commit'), 'hotfix commit body mismatch');
  assert(status.stdout.trim() === '', 'hotfix commit should include all tracked and untracked changes');
}


function smokeBranchScannerPath() {
  if (!gitAvailable()) {
    console.log('smoke branch scanner skipped: git unavailable');
    return;
  }

  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-branch-scan-project-'));
  const repoPath = path.join(projectPath, 'frontend');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed branch scanner');

  const git = new Git();
  const scanner = new Scanner(git);
  const branch = git.getCurrentBranch(repoPath);
  const snapshot = scanner.scanProjects([
    { name: 'Branch Scan Project', path: projectPath, shortcut: null }
  ]);
  const repo = snapshot.projects[0].repos[0];

  assert(branch.ok, branch.warning || 'current branch should be available');
  assert(repo.branch === branch.branch, 'scanner should include current branch');
  assert(repo.branchDisplay === branch.display, 'scanner should include branch display');
  assert(repo.detached === false, 'scanner should mark attached HEAD');
}

function smokeBranchDetachedScannerPath() {
  if (!gitAvailable()) {
    console.log('smoke detached branch scanner skipped: git unavailable');
    return;
  }

  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-detached-project-'));
  const repoPath = path.join(projectPath, 'frontend');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed detached branch');
  const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8'
  });
  runGit(['checkout', rev.stdout.trim()], repoPath);

  const git = new Git();
  const scanner = new Scanner(git);
  const snapshot = scanner.scanProjects([
    { name: 'Detached Project', path: projectPath, shortcut: null }
  ]);
  const repo = snapshot.projects[0].repos[0];

  assert(repo.detached === true, 'scanner should mark detached HEAD');
  assert(repo.branch === null, 'detached HEAD should not have branch name');
  assert(repo.branchDisplay.includes('detached HEAD'), 'detached HEAD display should be clear');
}

function smokeBranchSwitchPath() {
  if (!gitAvailable()) {
    console.log('smoke branch switch skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-branch-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed branch switch');
  const git = new Git();
  const initialBranch = git.getCurrentBranch(repoPath);
  runGit(['branch', 'feature'], repoPath);

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Branch Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 's', 'feature', '', 'b', 'b', 'q'].join('\n') + '\n', home);
  const current = git.getCurrentBranch(repoPath);

  assert(initialBranch.ok, initialBranch.warning || 'initial branch should be available');
  assert(result.status === 0, result.stderr || 'branch switch path failed');
  assert(result.stdout.includes('Branch: ' + initialBranch.branch), 'repo page should render active branch');
  assert(result.stdout.includes('S. Switch branch'), 'repo page should render switch branch action');
  assert(result.stdout.includes('Switch Branch: Branch Project / frontend'), 'branch page should render title');
  assert(result.stdout.includes('Current branch: ' + initialBranch.branch), 'branch page should render current branch');
  assert(result.stdout.includes('feature'), 'branch page should list existing local branch');
  assert(result.stdout.includes('Switched to branch: feature'), 'branch page should confirm checkout');
  assert(current.branch === 'feature', 'branch switch should checkout selected local branch');
}

function smokeDirtyBranchSwitchWarningPath() {
  if (!gitAvailable()) {
    console.log('smoke dirty branch switch skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-dirty-branch-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed dirty branch switch');
  const git = new Git();
  const initialBranch = git.getCurrentBranch(repoPath);
  runGit(['branch', 'feature'], repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\nconst dirty = true;\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Dirty Branch Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 's', 'feature', 'no', '', 'b', 'b', 'b', 'q'].join('\n') + '\n', home);
  const current = git.getCurrentBranch(repoPath);

  assert(initialBranch.ok, initialBranch.warning || 'initial dirty branch should be available');
  assert(result.status === 0, result.stderr || 'dirty branch switch path failed');
  assert(result.stdout.includes('This repo has uncommitted changes.'), 'dirty branch switch should warn before checkout');
  assert(result.stdout.includes('Git may refuse checkout if changes conflict.'), 'dirty branch switch should explain Git checkout behavior');
  assert(result.stdout.includes('Branch switch canceled.'), 'dirty branch switch should allow cancellation');
  assert(current.branch === initialBranch.branch, 'dirty branch switch cancellation should stay on current branch');
}

function smokeBranchNoColorPath() {
  if (!gitAvailable()) {
    console.log('smoke branch no color skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-branch-no-color-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed branch no color');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Branch No Color Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'b', 'b', 'q'].join('\n') + '\n', home, ['--no-color']);

  assert(result.status === 0, result.stderr || 'branch no-color path failed');
  assert(result.stdout.includes('Branch: '), 'branch no-color path should render branch');
  assert(!/\u001b\[[0-9;]*m/.test(result.stdout), 'branch no-color path emitted ANSI color');
}


function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

checkSyntax();
smokeQuitPath();
smokeNoColorBootFlagPath();
smokeSettingsToggleColorPath();
smokePipedMultiCharacterActionPath();
smokeProjectsPageRefreshPath();
smokeAddProjectPath();
smokeAddProjectCancelPath();
smokeGitRepoDiscovery();
smokeProjectsPageHideCleanTogglePath();
smokeProjectsPageSortsAlphabeticallyPath();
smokeProjectsPageNumberSelectionPath();
smokeProjectPageHideReposWithoutLineChangesPath();
smokeProjectPageEditProjectPath();
smokeProjectPageDeleteProjectPath();
smokeProjectItemsPath();
smokeScannerMissingProjectPath();
smokeDuplicateValidation();
smokeTableFormatting();
smokeBranchFormatting();
smokeRepoPageOpenAndDiffPath();
smokeRepoFilePagePath();
smokeRepoHotfixConfirmPath();
smokeBranchScannerPath();
smokeBranchDetachedScannerPath();
smokeBranchSwitchPath();
smokeDirtyBranchSwitchWarningPath();
smokeBranchNoColorPath();

console.log('smoke ok');
