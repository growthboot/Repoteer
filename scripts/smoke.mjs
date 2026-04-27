import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
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
  assert(result.stdout.includes('N/A'), 'add project path did not render placeholder scan data');

  const projects = readProjects(home);
  assert(projects.length === 1, 'add project path should save exactly one project');
  assert(projects[0].name === 'Smoke Project', 'saved project name mismatch');
  assert(projects[0].path === projectPath, 'saved project path mismatch');
  assert(projects[0].shortcut === 'z', 'saved project shortcut mismatch');
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
smokeDuplicateValidation();

console.log('smoke ok');
