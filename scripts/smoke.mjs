import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { Git } from '../src/modules/Git.js';
import { Scanner } from '../src/modules/Scanner.js';
import { formatTable } from '../src/utils/table.js';
import { stripAnsi } from '../src/utils/color.js';
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
smokeScannerMissingProjectPath();
smokeDuplicateValidation();
smokeTableFormatting();

console.log('smoke ok');
