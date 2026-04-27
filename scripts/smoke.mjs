import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { Git } from '../src/modules/Git.js';
import { Scanner } from '../src/modules/Scanner.js';
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

function runApp(input, home) {
  return spawnSync(process.execPath, ['src/app.js'], {
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

function smokeQuitPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const result = runApp('q\n', home);

  assert(result.status === 0, result.stderr || 'quit path failed');
  assert(result.stdout.includes('Repoteer'), 'quit path did not render title');
  assert(result.stdout.includes('No projects added.'), 'quit path did not render empty state');
  assert(Array.isArray(readProjects(home)), 'quit path did not create projects array');
  assert(readProjects(home).length === 0, 'quit path should not add projects');
}

function smokeAddProjectPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const input = ['a', 'Smoke Project', projectPath, 'z', '', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'add project path failed');
  assert(result.stdout.includes('Project saved.'), 'add project path did not save');
  assert(result.stdout.includes('1.  Smoke Project'), 'add project path did not render numbered project row');
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

checkSyntax();
smokeQuitPath();
smokeAddProjectPath();
smokeGitRepoDiscovery();
smokeScannerMissingProjectPath();
smokeDuplicateValidation();

console.log('smoke ok');
