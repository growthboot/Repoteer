import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { Git } from '../src/modules/Git.js';
import { Scanner } from '../src/modules/Scanner.js';
import { Router } from '../src/router/Router.js';
import { DiffPage } from '../src/pages/DiffPage.js';
import { FilePage } from '../src/pages/FilePage.js';
import { RepoHistoryPage } from '../src/pages/RepoHistoryPage.js';
import { ProjectHistoryPage } from '../src/pages/ProjectHistoryPage.js';
import { ProjectsHistoryPage } from '../src/pages/ProjectsHistoryPage.js';
import { ProjectItemsPanel } from '../src/pages/ProjectItemsPanel.js';
import { ProjectPage } from '../src/pages/ProjectPage.js';
import { AiGateway } from '../src/modules/AiGateway.js';
import { AiPromptManager } from '../src/modules/AiPromptManager.js';
import { AiDiffBuilder } from '../src/modules/AiDiffBuilder.js';
import { CommitManager } from '../src/modules/CommitManager.js';
import { ActivityGraph } from '../src/modules/ActivityGraph.js';
import { PromptsStore } from '../src/storage/PromptsStore.js';
import { SettingsStore } from '../src/storage/SettingsStore.js';
import { DEFAULT_PROMPTS } from '../src/data/defaultPrompts.js';
import { formatTable } from '../src/utils/table.js';
import { formatActionColumns } from '../src/utils/menu.js';
import { stripAnsi } from '../src/utils/color.js';
import { formatDiffForDisplay } from '../src/utils/diff.js';
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

function commitAll(repoPath, message, body = '') {
  runGit(['add', '.'], repoPath);

  const args = ['-c', 'user.name=Repoteer Smoke', '-c', 'user.email=smoke@example.com', 'commit', '-m', message];

  if (body) {
    args.push('-m', body);
  }

  runGit(args, repoPath);
}

function commitAllAt(repoPath, message, date, body = '') {
  runGit(['add', '.'], repoPath);

  const args = ['-c', 'user.name=Repoteer Smoke', '-c', 'user.email=smoke@example.com', 'commit', '-m', message];

  if (body) {
    args.push('-m', body);
  }

  const result = spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date
    }
  });

  assert(result.status === 0, result.stderr || result.stdout || 'git dated commit failed: git ' + args.join(' '));
}

function localNoonDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, 0, 0);

  return date.toISOString();
}

function readGitState(repoPath) {
  const run = (args) => spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8'
  });

  return {
    head: run(['rev-parse', 'HEAD']).stdout.trim(),
    status: run(['status', '--porcelain']).stdout,
    stagedDiff: run(['diff', '--cached', '--no-ext-diff']).stdout,
    unstagedDiff: run(['diff', '--no-ext-diff']).stdout
  };
}

function runApp(input, home, args = [], env = {}) {
  return spawnSync(process.execPath, ['src/app.js', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      ...env
    }
  });
}

function installFakeFolderOpeners(fakeBin) {
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const command of ['open', 'osascript', 'xdg-open', 'x-terminal-emulator', 'repoteer-fake-terminal']) {
    fs.writeFileSync(path.join(fakeBin, command), '#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$REPOTEER_SMOKE_OPEN_LOG"\n');
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }
}

function platformFileExplorerName() {
  return process.platform === 'darwin' ? 'Finder' : 'file explorer';
}

function platformFileExplorerCommandName() {
  if (process.platform === 'darwin') {
    return 'open';
  }

  if (process.platform === 'win32') {
    return 'cmd';
  }

  return 'xdg-open';
}

function platformTerminalCommandName() {
  if (process.platform === 'darwin') {
    return 'osascript';
  }

  if (process.platform === 'win32') {
    return 'cmd.exe';
  }

  return 'repoteer-fake-terminal';
}

function readProjects(home) {
  const file = path.join(home, '.repoteer', 'storage', 'projects.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readSettings(home) {
  const file = path.join(home, '.repoteer', 'storage', 'settings.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readPrompts(home) {
  const file = path.join(home, '.repoteer', 'storage', 'prompts.json');
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

function readClipboardItems(home) {
  const file = path.join(home, '.repoteer', 'storage', 'clipboard.json');
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
  assert(readSettings(home).alternateScreen === true, 'quit path did not create default alternate screen setting');
  assert(readSettings(home).ai.globalMaxPromptCharacters === 15000, 'quit path did not create default AI prompt size');
  assert(readSettings(home).ai.providers.length === 4, 'quit path did not create default AI providers');
  assert(readPrompts(home)['commit_review.system'] === DEFAULT_PROMPTS['commit_review.system'], 'quit path did not create default commit review system prompt');
  assert(readPrompts(home)['commit_message.pre'] === DEFAULT_PROMPTS['commit_message.pre'], 'quit path did not create default commit message pre-prompt');
  assert(readPrompts(home)['diff_summary.pre'] === DEFAULT_PROMPTS['diff_summary.pre'], 'quit path did not create default diff summary pre-prompt');
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
  const input = ['s', 'l', '', 't', '', 'b', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'settings toggle color path failed');
  assert(result.stdout.includes('S. Settings'), 'projects page did not render settings action');
  assert(result.stdout.includes('Settings'), 'settings page did not render title');
  assert(result.stdout.includes('Color                         On'), 'settings page did not render color on state');
  assert(result.stdout.includes('Alternate screen              On'), 'settings page did not render alternate screen on state');
  assert(result.stdout.includes('L. Toggle alternate screen'), 'settings page did not render alternate screen action');
  assert(result.stdout.includes('Alternate screen disabled.'), 'settings page did not confirm disabled alternate screen');
  assert(result.stdout.includes('Alternate screen              Off'), 'settings page did not render alternate screen off state');
  assert(result.stdout.includes('A. AI settings'), 'settings page did not render AI settings action');
  assert(result.stdout.includes('Color disabled.'), 'settings page did not confirm disabled color');
  assert(result.stdout.includes('Color                         Off'), 'settings page did not render color off state');
  assert(readSettings(home).alternateScreen === false, 'settings toggle did not persist alternateScreen=false');
  assert(readSettings(home).color === false, 'settings toggle did not persist color=false');
}

function smokeAiSettingsPersistencePath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const input = [
    's',
    'a',
    'g',
    '18000',
    '',
    'a',
    'Custom web chat',
    'https://example.com/chat',
    '60',
    '8000',
    '',
    'l',
    'Custom local',
    'http://127.0.0.1:9000/v1/chat/completions',
    'custom-local-model',
    '70',
    '9000',
    '',
    '1',
    '1',
    '',
    '3',
    'http://localhost:8080/v1/chat/completions',
    '',
    '4',
    'demo-local-model',
    '',
    '5',
    '30',
    '',
    '6',
    '11000',
    '',
    'b',
    '3',
    '1',
    '',
    '3',
    'https://chatgpt.com/?temporary-chat=false',
    '',
    '4',
    '25',
    '',
    '5',
    '12000',
    '',
    'b',
    'b',
    'b',
    'q'
  ].join('\n') + '\n';
  const result = runApp(input, home);
  const settings = readSettings(home);
  const lmStudio = settings.ai.providers.find((provider) => provider.id === 'lm-studio-local');
  const ollama = settings.ai.providers.find((provider) => provider.id === 'ollama-openai-compatible');
  const chatgpt = settings.ai.providers.find((provider) => provider.id === 'chatgpt-temp');
  const custom = settings.ai.providers.find((provider) => provider.title === 'Custom web chat');
  const customLocal = settings.ai.providers.find((provider) => provider.title === 'Custom local');

  assert(result.status === 0, result.stderr || 'AI settings persistence path failed');
  assert(result.stdout.includes('AI Settings'), 'AI settings path did not render AI settings title');
  assert(result.stdout.includes('Global max prompt size: 15000 characters'), 'AI settings path did not render default global max prompt size');
  assert(result.stdout.includes('LM Studio local'), 'AI settings path did not render local provider');
  assert(result.stdout.includes('ChatGPT temporary chat'), 'AI settings path did not render browser provider');
  assert(result.stdout.includes('Browser provider saved.'), 'AI settings path did not add browser provider');
  assert(result.stdout.includes('Local provider saved.'), 'AI settings path did not add local provider');
  assert(result.stdout.includes('Provider updated.'), 'AI settings path did not update providers');

  assert(settings.ai.globalMaxPromptCharacters === 18000, 'AI settings did not persist global max prompt size');
  assert(settings.ai.providers.length === 6, 'AI settings did not persist added AI providers');
  assert(lmStudio.enabled === true, 'AI settings did not persist local enabled state');
  assert(lmStudio.endpointUrl === 'http://localhost:8080/v1/chat/completions', 'AI settings did not persist local endpoint URL');
  assert(lmStudio.model === 'demo-local-model', 'AI settings did not persist local model');
  assert(lmStudio.priority === 30, 'AI settings did not persist local priority');
  assert(lmStudio.maxPromptCharacters === 11000, 'AI settings did not persist local max prompt size');
  assert(ollama.enabled === false, 'AI settings should keep no-secret local defaults disabled');
  assert(ollama.endpointUrl === 'http://127.0.0.1:11434/v1/chat/completions', 'AI settings did not persist Ollama default endpoint');
  assert(chatgpt.enabled === false, 'AI settings did not persist browser enabled state');
  assert(chatgpt.url === 'https://chatgpt.com/?temporary-chat=false', 'AI settings did not persist browser URL');
  assert(chatgpt.priority === 25, 'AI settings did not persist browser priority');
  assert(chatgpt.maxPromptCharacters === 12000, 'AI settings did not persist browser max prompt size');
  assert(custom.type === 'browser', 'AI settings did not persist custom browser type');
  assert(custom.enabled === true, 'AI settings did not persist custom browser enabled state');
  assert(custom.url === 'https://example.com/chat', 'AI settings did not persist custom browser URL');
  assert(custom.priority === 60, 'AI settings did not persist custom browser priority');
  assert(custom.maxPromptCharacters === 8000, 'AI settings did not persist custom browser max prompt size');
  assert(customLocal.type === 'local', 'AI settings did not persist custom local type');
  assert(customLocal.enabled === false, 'AI settings should default custom local provider to disabled');
  assert(customLocal.endpointUrl === 'http://127.0.0.1:9000/v1/chat/completions', 'AI settings did not persist custom local endpoint');
  assert(customLocal.model === 'custom-local-model', 'AI settings did not persist custom local model');
  assert(customLocal.priority === 70, 'AI settings did not persist custom local priority');
  assert(customLocal.maxPromptCharacters === 9000, 'AI settings did not persist custom local max prompt size');
}

function smokeAiPromptEditingPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const editInput = [
    's',
    'a',
    'c',
    'y',
    'Custom commit review system prompt',
    '',
    'p',
    'Custom commit review pre-prompt',
    '',
    'b',
    'b',
    'b',
    'q'
  ].join('\n') + '\n';
  const editResult = runApp(editInput, home);
  const editedPrompts = readPrompts(home);
  const promptManager = new AiPromptManager(new PromptsStore(path.join(home, '.repoteer', 'storage')));
  const composedPrompt = promptManager.composeBrowserPrompt('commit_review', 'USER PAYLOAD');

  assert(editResult.status === 0, editResult.stderr || 'AI prompt editing path failed');
  assert(editResult.stdout.includes('Prompts'), 'AI prompt editing path did not render prompt section');
  assert(editResult.stdout.includes('C. Commit review prompt'), 'AI prompt editing path did not render commit review prompt action');
  assert(editResult.stdout.includes('AI Prompt: Commit review'), 'AI prompt editing path did not open prompt editor');
  assert(editResult.stdout.includes('Prompt updated.'), 'AI prompt editing path did not update prompts');
  assert(editedPrompts['commit_review.system'] === 'Custom commit review system prompt', 'AI prompt editing did not persist system prompt');
  assert(editedPrompts['commit_review.pre'] === 'Custom commit review pre-prompt', 'AI prompt editing did not persist pre-prompt');
  assert(!Object.prototype.hasOwnProperty.call(readSettings(home), 'prompts'), 'AI prompt editing should not store prompt text in settings.json');
  assert(
    composedPrompt === 'Custom commit review system prompt\n\nCustom commit review pre-prompt\n\nUSER PAYLOAD',
    'browser prompt composition should use system prompt, blank line, pre-prompt, blank line, user payload'
  );

  const resetInput = [
    's',
    'a',
    'c',
    'x',
    'yes',
    '',
    'b',
    'b',
    'b',
    'q'
  ].join('\n') + '\n';
  const resetResult = runApp(resetInput, home);
  const resetPrompts = readPrompts(home);

  assert(resetResult.status === 0, resetResult.stderr || 'AI prompt reset path failed');
  assert(resetResult.stdout.includes('Prompt reset.'), 'AI prompt reset path did not confirm reset');
  assert(resetPrompts['commit_review.system'] === DEFAULT_PROMPTS['commit_review.system'], 'AI prompt reset did not restore system prompt');
  assert(resetPrompts['commit_review.pre'] === DEFAULT_PROMPTS['commit_review.pre'], 'AI prompt reset did not restore pre-prompt');
}

function smokeAiDiffBuilderPayloadPath() {
  if (!gitAvailable()) {
    console.log('smoke AI diff builder skipped: git unavailable');
    return;
  }

  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-diff-repo-'));

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'staged.js'), 'export const staged = 1;\n');
  fs.writeFileSync(path.join(repoPath, 'unstaged.js'), 'export const unstaged = 1;\n');
  commitAll(repoPath, 'seed AI diff builder');

  for (let index = 1; index <= 9; index += 1) {
    fs.writeFileSync(path.join(repoPath, 'history.txt'), 'history ' + String(index) + '\n');
    commitAll(repoPath, 'history commit ' + String(index), 'Body for history ' + String(index));
  }

  fs.writeFileSync(path.join(repoPath, 'staged.js'), 'export const staged = 2;\n');
  runGit(['add', 'staged.js'], repoPath);
  fs.writeFileSync(path.join(repoPath, 'unstaged.js'), 'export const unstaged = 2;\n');
  fs.writeFileSync(path.join(repoPath, 'notes.txt'), 'untracked note\nsecond line\n');
  fs.mkdirSync(path.join(repoPath, 'private'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'private', 'secret.txt'), 'secret generated note\n');
  fs.writeFileSync(path.join(repoPath, 'binary.dat'), Buffer.from([0, 1, 2, 3, 4, 5]));
  fs.writeFileSync(path.join(repoPath, 'base64.txt'), 'A'.repeat(300) + '\n');
  fs.writeFileSync(path.join(repoPath, 'large.js'), Array.from({ length: 120 }, (_, index) => {
    return 'export const value' + String(index) + ' = ' + String(index) + ';';
  }).join('\n') + '\n');

  const builder = new AiDiffBuilder(new Git());
  const full = builder.build(repoPath, { maxPromptCharacters: 20000 });
  const withRecentCommitLogs = builder.build(repoPath, {
    maxPromptCharacters: 30000,
    includeRecentCommitLogs: true
  });
  const withExcludedPaths = builder.build(repoPath, {
    maxPromptCharacters: 30000,
    includeRecentCommitLogs: true,
    excludedPaths: ['private']
  });
  const uncapped = builder.build(repoPath, {
    maxPromptCharacters: 900,
    applyMaxPromptCharacters: false
  });
  const truncated = builder.build(repoPath, { maxPromptCharacters: 900 });
  const aiGateway = new AiGateway({
    aiPromptManager: null,
    aiDiffBuilder: builder,
    clipboard: null,
    browserOpener: null,
    localAiClient: null
  });
  const commitMessagePayload = aiGateway.buildRepoPayload({
    repoPath,
    settings: { ai: { globalMaxPromptCharacters: 30000 } },
    toolId: 'commit_message',
    excludedPaths: ['private/secret.txt']
  });
  const commitReviewPayload = aiGateway.buildRepoPayload({
    repoPath,
    settings: { ai: { globalMaxPromptCharacters: 30000 } },
    toolId: 'commit_review'
  });

  assert(full.ok, full.warnings.join('\n') || 'AI diff builder should succeed');
  assert(full.status === 'warning', 'AI diff builder should warn when files are omitted');
  assert(full.payload.includes('[staged diff: staged.js]'), 'AI diff payload should include staged changes');
  assert(full.payload.includes('+export const staged = 2;'), 'AI diff payload should include staged diff content');
  assert(full.payload.includes('[unstaged diff: unstaged.js]'), 'AI diff payload should include unstaged tracked changes');
  assert(full.payload.includes('+export const unstaged = 2;'), 'AI diff payload should include unstaged diff content');
  assert(full.payload.includes('[untracked diff: notes.txt]'), 'AI diff payload should include untracked text-like files');
  assert(full.payload.includes('+untracked note'), 'AI diff payload should include untracked text content');
  assert(full.payload.includes('[untracked diff: private/secret.txt]'), 'AI diff payload should include untracked text before exclusions');
  assert(full.payload.includes('[Omitted non-text diff: binary.dat]'), 'AI diff payload should mark binary omissions');
  assert(full.payload.includes('[Omitted likely base64 data: base64.txt]'), 'AI diff payload should mark base64-like omissions');
  assert(!full.payload.includes('A'.repeat(160)), 'AI diff payload should not include base64-like content');
  assert(!full.truncated, 'large max AI diff payload should not be truncated');
  assert(!full.payload.includes('Recent commit messages'), 'regular AI diff payload should not include recent commit logs');

  assert(withRecentCommitLogs.ok, withRecentCommitLogs.warnings.join('\n') || 'AI diff builder should include recent commit logs');
  assert(withRecentCommitLogs.payload.includes('Recent commit messages (last 8):'), 'commit-message AI payload should label recent commit logs');
  assert(withRecentCommitLogs.payload.includes('1. Title: history commit 9'), 'commit-message AI payload should include the newest commit title');
  assert(withRecentCommitLogs.payload.includes('Body for history 9'), 'commit-message AI payload should include commit bodies');
  assert(withRecentCommitLogs.payload.includes('history commit 2'), 'commit-message AI payload should include the eighth recent commit title');
  assert(!withRecentCommitLogs.payload.includes('history commit 1'), 'commit-message AI payload should include only eight recent commits');
  assert(withExcludedPaths.ok, withExcludedPaths.warnings.join('\n') || 'AI diff builder should allow excluded paths');
  assert(!withExcludedPaths.payload.includes('private/secret.txt'), 'excluded paths should not appear in the AI diff payload');
  assert(!withExcludedPaths.payload.includes('secret generated note'), 'excluded path contents should not appear in the AI diff payload');
  assert(!withExcludedPaths.payload.includes('Omitted') || !withExcludedPaths.payload.includes('private/secret.txt'), 'excluded paths should not be disclosed as omitted files');
  assert(commitMessagePayload.payload.includes('Recent commit messages (last 8):'), 'gateway should add recent commit logs for commit-message prompts');
  assert(!commitMessagePayload.payload.includes('private/secret.txt'), 'gateway should pass commit-message excluded paths into payload building');
  assert(!commitReviewPayload.payload.includes('Recent commit messages'), 'gateway should not add recent commit logs for commit-review prompts');

  assert(uncapped.ok, uncapped.warnings.join('\n') || 'uncapped AI diff builder should succeed');
  assert(!uncapped.truncated, 'uncapped AI diff payload should not truncate before provider selection');
  assert(uncapped.promptLimitPending, 'uncapped AI diff payload should report pending provider limit');
  assert(uncapped.maxPromptCharacters === null, 'uncapped AI diff payload should not report a selected max');
  assert(uncapped.payload.length > 900, 'uncapped AI diff payload should preserve full prepared payload before provider selection');
  assert(uncapped.payload.includes('Max user payload characters: provider-specific, applied after provider selection'), 'uncapped AI diff payload should label deferred provider max');
  assert(!uncapped.warnings.includes('AI diff payload was truncated to fit the max prompt size.'), 'uncapped AI diff payload should not warn about truncation');

  assert(truncated.ok, truncated.warnings.join('\n') || 'truncated AI diff builder should succeed');
  assert(truncated.truncated, 'AI diff payload should report truncation');
  assert(truncated.payload.length <= 900, 'AI diff payload should enforce max prompt size on user payload');
  assert(truncated.payload.includes('...TRUNCATED_DIFF_DATA...'), 'AI diff payload should include truncation marker');
  assert(!truncated.payload.trimStart().startsWith('...TRUNCATED_DIFF_DATA...'), 'AI diff payload should not start with the truncation marker');
  assert(!truncated.payload.trimEnd().endsWith('...TRUNCATED_DIFF_DATA...'), 'AI diff payload should not end with the truncation marker');
  assert(truncated.payload.includes('diff --git'), 'truncated AI diff payload should preserve diff context');
  assert(truncated.payload.includes('@@'), 'truncated AI diff payload should preserve hunk context');

  const promptStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-prompts-'));
  const promptManager = new AiPromptManager(new PromptsStore(promptStorageDir));
  const composedPrompt = promptManager.composeBrowserPrompt('diff_summary', truncated.payload);

  assert(composedPrompt.length > truncated.maxPromptCharacters, 'AI prompt size limit should apply to user payload only');
  assert(composedPrompt.endsWith(truncated.payload), 'browser prompt should preserve the prepared user payload');
}

function smokeCommitSummaryExclusionSettingsPath() {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-settings-exclusions-'));
  const store = new SettingsStore(storageDir);
  const repoPath = '/tmp/example-repo';

  assert(store.listCommitSummaryExcludedPaths(repoPath).length === 0, 'commit summary exclusions should default to an empty list');
  assert(store.addCommitSummaryExcludedPath(repoPath, './private\\secret.txt') === 'private/secret.txt', 'commit summary exclusions should normalize relative paths');
  assert(store.addCommitSummaryExcludedPath(repoPath, 'private/secret.txt') === 'private/secret.txt', 'commit summary exclusions should accept duplicate saves without growing the list');
  assert(store.listCommitSummaryExcludedPaths(repoPath).length === 1, 'commit summary exclusions should dedupe paths');
  assert(store.updateCommitSummaryExcludedPath(repoPath, 0, 'generated') === 'generated', 'commit summary exclusions should update a path by row');
  assert(store.listCommitSummaryExcludedPaths(repoPath)[0] === 'generated', 'commit summary exclusions should persist updated paths');
  assert(store.deleteCommitSummaryExcludedPath(repoPath, 0), 'commit summary exclusions should delete a path by row');
  assert(store.listCommitSummaryExcludedPaths(repoPath).length === 0, 'commit summary exclusions should persist deletes');
  assert(store.addCommitSummaryExcludedPath(repoPath, '../outside') === null, 'commit summary exclusions should reject parent-relative paths');
}

function smokeAiProviderSelectBrowserPath() {
  const result = runAiProviderSelectScenario('success', ['3', '', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI provider select browser path failed');
  assert(result.stdout.includes('AI: Diff summary'), 'AI provider select should render tool title');
  assert(result.stdout.includes('Repo: Demo Project / demo-repo'), 'AI provider select should render repo context');
  assert(result.stdout.includes('Payload size: 12 / 100 characters'), 'AI provider select should render payload size');
  assert(result.stdout.includes('Diff input: staged, unstaged, untracked'), 'AI provider select should render diff input summary');
  assert(result.stdout.includes('Enabled Local'), 'AI provider select should show enabled local provider after local execution exists');
  assert(result.stdout.includes('Ready'), 'AI provider select should mark local providers ready');
  assert(result.stdout.includes('First Browser'), 'AI provider select should show enabled browser provider');
  assert(result.stdout.includes('Alpha Browser'), 'AI provider select should show same-priority provider by title');
  assert(result.stdout.includes('Beta Browser'), 'AI provider select should show later same-priority provider');
  assert(result.stdout.indexOf('Enabled Local') < result.stdout.indexOf('First Browser'), 'AI provider select should order local and browser providers by priority');
  assert(result.stdout.indexOf('First Browser') < result.stdout.indexOf('Alpha Browser'), 'AI provider select should order providers by priority');
  assert(result.stdout.indexOf('Alpha Browser') < result.stdout.indexOf('Beta Browser'), 'AI provider select should order equal priorities by title');
  assert(!result.stdout.includes('Disabled Browser'), 'AI provider select should hide disabled browser providers');
  assert(!result.stdout.includes('Invalid Local'), 'AI provider select should hide unavailable local providers');
  assert(result.stdout.includes('Prompt copied.'), 'AI provider select should confirm browser prompt copy');
  assert(result.stdout.includes('Opened URL: https://alpha.example/chat'), 'AI provider select should confirm browser URL open');
  assert(result.stdout.includes('COPIED_HAS_SYSTEM true'), 'browser prompt should include system prompt');
  assert(result.stdout.includes('COPIED_HAS_PRE true'), 'browser prompt should include pre-prompt');
  assert(result.stdout.includes('COPIED_ENDS_WITH_PAYLOAD true'), 'browser prompt should end with user payload');
  assert(result.stdout.includes('OPENED_URL https://alpha.example/chat'), 'browser provider selection should open selected URL');
  assert(result.stdout.includes('Return Page'), 'AI provider select back action should return to previous page');
}

function smokeAiProviderSelectWarningPath() {
  const result = runAiProviderSelectScenario('failure', ['2', '', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI provider select warning path failed');
  assert(result.stdout.includes('Prompt was not copied automatically.'), 'clipboard failure should show copy warning');
  assert(result.stdout.includes('Prompt:'), 'clipboard failure should show prompt for manual copy');
  assert(result.stdout.includes('Browser URL could not be opened automatically.'), 'browser open failure should show warning');
  assert(result.stdout.includes('URL: https://first.example/chat'), 'browser open failure should show URL');
  assert(result.stdout.includes('copy failed in smoke'), 'clipboard failure should include underlying warning');
  assert(result.stdout.includes('open failed in smoke'), 'browser open failure should include underlying warning');
}

function smokeAiLocalProviderSuccessPath() {
  const result = runAiLocalProviderScenario('success', ['1', 'yes', 'c', '', 'a', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI local provider success path failed');
  assert(result.stdout.includes('Enabled Local'), 'local provider picker should render enabled local provider');
  assert(result.stdout.includes('Ready'), 'local provider picker should mark local provider ready');
  assert(result.stdout.includes('Send to local AI provider'), 'local provider should show confirmation screen');
  assert(result.stdout.includes('Endpoint: 127.0.0.1:'), 'local provider confirmation should show endpoint host');
  assert(result.stdout.includes('Model: test-model'), 'local provider confirmation should show model');
  assert(result.stdout.includes('AI: Diff summary result'), 'local provider success should render result page');
  assert(result.stdout.includes('Provider: Enabled Local'), 'AI result should render provider title');
  assert(result.stdout.includes('Local summary result'), 'AI result should render local provider content');
  assert(result.stdout.includes('AI result copied.'), 'AI result page should support copying result');
  assert(result.stdout.includes('COPIED_RESULT Local summary result'), 'AI result copy should copy result content');
  assert(result.stdout.includes('REQUEST_MODEL test-model'), 'local provider request should include configured model');
  assert(result.stdout.includes('REQUEST_HAS_AUTH false'), 'local provider request should not include auth headers');
  assert(result.stdout.includes('REQUEST_SYSTEM_HAS_INTERNAL true'), 'local provider request should include internal messages in system content');
  assert(result.stdout.includes('REQUEST_USER_HAS_PAYLOAD true'), 'local provider request should include user payload');
  assert(result.stdout.includes('Return Page'), 'AI result run again and picker back should return to previous page');
}

function smokeAiLocalProviderCancelPath() {
  const result = runAiLocalProviderScenario('success', ['1', 'no', '', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI local provider cancel path failed');
  assert(result.stdout.includes('Local request canceled.'), 'local provider should allow cancellation before request');
  assert(result.stdout.includes('SERVER_REQUESTED false'), 'local provider cancellation should not send request');
}

function smokeAiLocalProviderNon2xxPath() {
  const result = runAiLocalProviderScenario('non2xx', ['1', 'yes', '', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI local provider non-2xx path failed');
  assert(result.stdout.includes('Local provider returned HTTP 503'), 'local provider should show non-2xx warning');
  assert(result.stdout.includes('Return Page'), 'local provider non-2xx path should stay navigable');
}

function smokeAiLocalProviderInvalidShapePath() {
  const result = runAiLocalProviderScenario('invalid', ['1', 'yes', '', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI local provider invalid response path failed');
  assert(result.stdout.includes('choices[0].message.content'), 'local provider should show invalid response shape warning');
  assert(result.stdout.includes('Return Page'), 'local provider invalid response path should stay navigable');
}

function smokeAiLocalProviderConnectionFailurePath() {
  const result = runAiLocalProviderScenario('connection', ['1', 'yes', '', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI local provider connection failure path failed');
  assert(result.stdout.includes('failed') || result.stdout.includes('ECONNREFUSED') || result.stdout.includes('fetch'), 'local provider should show connection warning');
  assert(result.stdout.includes('Return Page'), 'local provider connection failure path should stay navigable');
}

function smokeAiProviderSelectSettingsPath() {
  const result = runAiProviderSelectScenario('success', ['a', 'b', 'b'].join('\n') + '\n');

  assert(result.status === 0, result.stderr || 'AI provider select settings path failed');
  assert(result.stdout.includes('AI Settings'), 'AI provider select should open AI settings');
  assert(result.stdout.includes('Return Page'), 'AI provider select should return after settings and back actions');
}

function smokeAiProviderSelectDeferredLimitPath() {
  if (!gitAvailable()) {
    console.log('smoke AI provider deferred limit skipped: git unavailable');
    return;
  }

  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-provider-limit-repo-'));

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'large.js'), 'export const seed = true;\n');
  commitAll(repoPath, 'seed deferred provider limit');
  fs.writeFileSync(path.join(repoPath, 'large.js'), Array.from({ length: 140 }, (_, index) => {
    return 'export const value' + String(index) + ' = ' + String(index) + ';';
  }).join('\n') + '\n');

  const initial = runAiProviderSelectDeferredLimitScenario(repoPath, ['b'].join('\n') + '\n');

  assert(initial.status === 0, initial.stderr || 'AI provider select deferred limit initial path failed');
  assert(initial.stdout.includes('provider limit applied after selection'), 'AI provider select should explain that provider limits are deferred');
  assert(!initial.stdout.includes('Payload size: 900 / 900 characters'), 'AI provider select should not show a selected provider max before selection');
  assert(!initial.stdout.includes('AI diff payload was truncated:'), 'AI provider select should not warn about truncation before provider selection');

  const selected = runAiProviderSelectDeferredLimitScenario(repoPath, ['1', '', 'b'].join('\n') + '\n');
  const selectedText = stripAnsi(selected.stdout);

  assert(selected.status === 0, selected.stderr || 'AI provider select deferred limit selected path failed');
  assert(selectedText.includes('COPIED_HAS_TRUNCATED true'), 'AI provider selection should truncate after a provider is selected');
  assert(selectedText.includes('AI diff payload was truncated:'), 'AI provider select should warn about provider-specific truncation after selection');
  assert(/AI diff payload was truncated: [0-9]+ -> [0-9]+ characters \([0-9]+ removed, [0-9.]+% removed\)\./.test(selectedText), 'AI provider truncation warning should include removed characters and percentage');
  assert(selectedText.indexOf('AI diff payload was truncated:') < selectedText.indexOf('Prompt copied.'), 'AI provider truncation warning should show before browser send confirmation');
}

function smokeGeneratedCommitMessageParser() {
  const manager = new CommitManager(null);
  const parsed = manager.parseGeneratedCommitResponse([
    'Title: update repo navigation',
    'Summary: Adds the generated commit import path.'
  ].join('\n'));
  const missingTitle = manager.parseGeneratedCommitResponse('Summary: Missing title.');
  const missingSummary = manager.parseGeneratedCommitResponse('Title: missing summary');

  assert(parsed.ok, parsed.warning || 'generated commit parser should accept Title and Summary lines');
  assert(parsed.title === 'update repo navigation', 'generated commit parser should extract title');
  assert(parsed.body === 'Adds the generated commit import path.', 'generated commit parser should extract summary as body');
  assert(!missingTitle.ok && missingTitle.warning.includes('Title:'), 'generated commit parser should require Title line');
  assert(!missingSummary.ok && missingSummary.warning.includes('Summary:'), 'generated commit parser should require Summary line');
}

function smokeAiProviderSelectCommitMessagePath() {
  const promptHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-commit-prompts-'));
  const code = `
    import { Router } from './src/router/Router.js';
    import { AiProviderSelectPage } from './src/pages/AiProviderSelectPage.js';
    import { AiGateway } from './src/modules/AiGateway.js';
    import { AiPromptManager } from './src/modules/AiPromptManager.js';
    import { CommitManager } from './src/modules/CommitManager.js';
    import { PromptsStore } from './src/storage/PromptsStore.js';

    const copiedPrompts = [];
    const openedUrls = [];
    const color = {
      bold: (value) => value,
      dim: (value) => value,
      green: (value) => value,
      yellow: (value) => value,
      red: (value) => value,
      darkYellow: (value) => value
    };
    const aiPromptManager = new AiPromptManager(new PromptsStore(${JSON.stringify(promptHome)}));
    const clipboard = {
      copy(text) {
        copiedPrompts.push(text);
        return { ok: true, warning: null };
      },
      read() {
        return {
          ok: true,
          text: 'Title: update generated commits\\nSummary: Adds the clipboard import flow for generated commit messages.\\n',
          warning: null
        };
      }
    };
    const settings = {
      color: true,
      ai: {
        globalMaxPromptCharacters: 100,
        providers: [
          { id: 'browser-on', type: 'browser', title: 'Browser Provider', enabled: true, priority: 1, url: 'https://example.com/chat', maxPromptCharacters: 100 }
        ]
      }
    };
    const runtime = {
      settings,
      color,
      clipboard,
      commitManager: new CommitManager(null),
      aiPromptManager,
      aiGateway: new AiGateway({
        aiPromptManager,
        clipboard,
        browserOpener: {
          open(url) {
            openedUrls.push(url);
            return { ok: true, warning: null };
          }
        },
        localAiClient: {
          async sendChatCompletion() {
            return { ok: false, content: '', warning: 'local should not run in browser commit smoke' };
          }
        }
      })
    };
    class ReturnPage {
      async show() {
        console.log('Return Page');
      }
    }
    class CommitConfirmPage {
      constructor({ params }) {
        this.params = params;
      }

      async show() {
        console.log('Commit Confirm Title ' + this.params.title);
        console.log('Commit Confirm Body ' + this.params.body);
        console.log('Commit Confirm Repo ' + this.params.repoPath);
      }
    }
    const router = new Router(runtime, {
      returnPage: ReturnPage,
      aiProviderSelect: AiProviderSelectPage,
      commitConfirm: CommitConfirmPage
    });

    await router.open('returnPage');
    await runtime.aiGateway.openProviderSelection(router, {
      toolId: 'commit_message',
      projectName: 'Demo Project',
      repoName: 'demo-repo',
      repoPath: '/tmp/demo-repo',
      payload: {
        payload: 'USER PAYLOAD',
        size: 12,
        maxPromptCharacters: 100,
        inputSummary: 'staged, unstaged, untracked'
      }
    });

    const copied = copiedPrompts[0] || '';
    console.log('COPIED_HAS_COMMIT_PROMPT ' + String(copied.includes('You write Git commit messages')));
    console.log('COPIED_ENDS_WITH_PAYLOAD ' + String(copied.endsWith('USER PAYLOAD')));
    console.log('OPENED_URL ' + String(openedUrls[0] || ''));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    input: ['1', '1'].join('\n') + '\n',
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || 'AI provider select commit message path failed');
  assert(result.stdout.includes('AI: Commit message'), 'commit message picker should render tool title');
  assert(result.stdout.includes('Prompt copied.'), 'commit message browser path should copy prompt');
  assert(result.stdout.includes('Opened URL: https://example.com/chat'), 'commit message browser path should open provider URL');
  assert(result.stdout.includes('Read generated commit message'), 'commit message browser path should offer generated response import');
  assert(result.stdout.includes('Commit Confirm Title update generated commits'), 'generated commit response should open commit confirmation with title');
  assert(result.stdout.includes('Commit Confirm Body Adds the clipboard import flow for generated commit messages.'), 'generated commit response should open commit confirmation with body');
  assert(result.stdout.includes('Commit Confirm Repo /tmp/demo-repo'), 'generated commit response should preserve repo path');
  assert(result.stdout.includes('COPIED_HAS_COMMIT_PROMPT true'), 'commit message prompt should include system prompt');
  assert(result.stdout.includes('COPIED_ENDS_WITH_PAYLOAD true'), 'commit message prompt should include user payload');
  assert(result.stdout.includes('OPENED_URL https://example.com/chat'), 'commit message prompt should open configured provider URL');
}

function runAiProviderSelectScenario(mode, input) {
  const promptHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-select-prompts-'));
  const code = `
    import { Router } from './src/router/Router.js';
    import { AiProviderSelectPage } from './src/pages/AiProviderSelectPage.js';
    import { AiSettingsPage } from './src/pages/AiSettingsPage.js';
    import { AiGateway } from './src/modules/AiGateway.js';
    import { AiPromptManager } from './src/modules/AiPromptManager.js';
    import { PromptsStore } from './src/storage/PromptsStore.js';

    const copiedPrompts = [];
    const openedUrls = [];
    const mode = ${JSON.stringify(mode)};
    const color = {
      bold: (value) => value,
      dim: (value) => value,
      green: (value) => value,
      yellow: (value) => value,
      red: (value) => value,
      darkYellow: (value) => value
    };
    const aiPromptManager = new AiPromptManager(new PromptsStore(${JSON.stringify(promptHome)}));
    const clipboard = {
      copy(text) {
        copiedPrompts.push(text);
        if (mode === 'failure') {
          return { ok: false, warning: 'copy failed in smoke' };
        }
        return { ok: true, warning: null };
      }
    };
    const browserOpener = {
      open(url) {
        openedUrls.push(url);
        if (mode === 'failure') {
          return { ok: false, warning: 'open failed in smoke' };
        }
        return { ok: true, warning: null };
      }
    };
    const settings = {
      color: true,
      ai: {
        globalMaxPromptCharacters: 100,
        providers: [
          { id: 'local-on', type: 'local', title: 'Enabled Local', enabled: true, priority: 1, endpointUrl: 'http://127.0.0.1:1234/v1/chat/completions', requestFormat: 'openai-compatible-chat', model: 'local', maxPromptCharacters: 100 },
          { id: 'local-invalid', type: 'local', title: 'Invalid Local', enabled: true, priority: 2, endpointUrl: '', requestFormat: 'openai-compatible-chat', model: 'local', maxPromptCharacters: 100 },
          { id: 'disabled-browser', type: 'browser', title: 'Disabled Browser', enabled: false, priority: 2, url: 'https://disabled.example/chat', maxPromptCharacters: 100 },
          { id: 'first-browser', type: 'browser', title: 'First Browser', enabled: true, priority: 10, url: 'https://first.example/chat', maxPromptCharacters: 100 },
          { id: 'beta-browser', type: 'browser', title: 'Beta Browser', enabled: true, priority: 20, url: 'https://beta.example/chat', maxPromptCharacters: 100 },
          { id: 'alpha-browser', type: 'browser', title: 'Alpha Browser', enabled: true, priority: 20, url: 'https://alpha.example/chat', maxPromptCharacters: 100 }
        ]
      }
    };
    const runtime = {
      settings,
      color,
      aiPromptManager,
      aiGateway: new AiGateway({
        aiPromptManager,
        clipboard,
        browserOpener,
        localAiClient: {
          async sendChatCompletion() {
            return { ok: false, content: '', warning: 'local should not run in browser smoke' };
          }
        }
      })
    };
    class ReturnPage {
      async show() {
        console.log('Return Page');
      }
    }
    const router = new Router(runtime, {
      returnPage: ReturnPage,
      aiProviderSelect: AiProviderSelectPage,
      aiSettings: AiSettingsPage
    });

    await router.open('returnPage');
    await runtime.aiGateway.openProviderSelection(router, {
      toolId: 'diff_summary',
      projectName: 'Demo Project',
      repoName: 'demo-repo',
      returnPage: 'returnPage',
      payload: {
        payload: 'USER PAYLOAD',
        size: 12,
        maxPromptCharacters: 100,
        inputSummary: 'staged, unstaged, untracked'
      }
    });

    const copied = copiedPrompts[0] || '';
    console.log('COPIED_HAS_SYSTEM ' + String(copied.includes('You summarize Git diffs')));
    console.log('COPIED_HAS_PRE ' + String(copied.includes('Summarize the following prepared diff.')));
    console.log('COPIED_ENDS_WITH_PAYLOAD ' + String(copied.endsWith('USER PAYLOAD')));
    console.log('OPENED_URL ' + String(openedUrls[0] || ''));
  `;

  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    input,
    encoding: 'utf8'
  });
}

function runAiProviderSelectDeferredLimitScenario(repoPath, input) {
  const promptHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-select-deferred-prompts-'));
  const code = `
    import { Router } from './src/router/Router.js';
    import { AiProviderSelectPage } from './src/pages/AiProviderSelectPage.js';
    import { AiGateway } from './src/modules/AiGateway.js';
    import { AiPromptManager } from './src/modules/AiPromptManager.js';
    import { AiDiffBuilder } from './src/modules/AiDiffBuilder.js';
    import { Git } from './src/modules/Git.js';
    import { PromptsStore } from './src/storage/PromptsStore.js';

    const copiedPrompts = [];
    const color = {
      bold: (value) => value,
      dim: (value) => value,
      green: (value) => value,
      yellow: (value) => value,
      red: (value) => value,
      darkYellow: (value) => value
    };
    const aiPromptManager = new AiPromptManager(new PromptsStore(${JSON.stringify(promptHome)}));
    const settings = {
      color: true,
      ai: {
        globalMaxPromptCharacters: 15000,
        providers: [
          { id: 'browser-small', type: 'browser', title: 'Small Browser', enabled: true, priority: 1, url: 'https://example.com/chat', maxPromptCharacters: 900 }
        ]
      }
    };
    const runtime = {
      settings,
      color,
      aiPromptManager,
      aiGateway: new AiGateway({
        aiPromptManager,
        aiDiffBuilder: new AiDiffBuilder(new Git()),
        clipboard: {
          copy(text) {
            copiedPrompts.push(text);
            return { ok: true, warning: null };
          }
        },
        browserOpener: {
          open() {
            return { ok: true, warning: null };
          }
        },
        localAiClient: {
          async sendChatCompletion() {
            return { ok: false, content: '', warning: 'local should not run in deferred limit smoke' };
          }
        }
      })
    };
    class ReturnPage {
      async show() {
        console.log('Return Page');
      }
    }
    const router = new Router(runtime, {
      returnPage: ReturnPage,
      aiProviderSelect: AiProviderSelectPage
    });

    await router.open('returnPage');
    await runtime.aiGateway.openRepoTool(router, {
      toolId: 'diff_summary',
      projectName: 'Demo Project',
      repo: { name: 'demo-repo', path: ${JSON.stringify(repoPath)} },
      settings,
      returnPage: 'returnPage'
    });

    console.log('COPIED_HAS_TRUNCATED ' + String((copiedPrompts[0] || '').includes('...TRUNCATED_DIFF_DATA...')));
  `;

  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    input,
    encoding: 'utf8'
  });
}

function runAiLocalProviderScenario(mode, input) {
  const promptHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-local-prompts-'));
  const code = `
    import { Router } from './src/router/Router.js';
    import { AiProviderSelectPage } from './src/pages/AiProviderSelectPage.js';
    import { AiResultPage } from './src/pages/AiResultPage.js';
    import { AiGateway } from './src/modules/AiGateway.js';
    import { LocalAiClient } from './src/modules/LocalAiClient.js';
    import { AiPromptManager } from './src/modules/AiPromptManager.js';
    import { PromptsStore } from './src/storage/PromptsStore.js';

    const mode = ${JSON.stringify(mode)};
    let requested = false;
    let requestBody = null;
    let requestHasAuth = false;
    const endpointUrl = 'http://127.0.0.1:11434/v1/chat/completions';

    const copiedResults = [];
    const color = {
      bold: (value) => value,
      dim: (value) => value,
      green: (value) => value,
      yellow: (value) => value,
      red: (value) => value,
      darkYellow: (value) => value
    };
    const aiPromptManager = new AiPromptManager(new PromptsStore(${JSON.stringify(promptHome)}));
    const fetchImplementation = async (url, options) => {
      requested = true;
      requestHasAuth = Boolean(options.headers?.authorization || options.headers?.Authorization);
      requestBody = JSON.parse(options.body);

      if (mode === 'connection') {
        throw new Error('connect ECONNREFUSED in smoke');
      }

      if (mode === 'non2xx') {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          async text() {
            return 'local unavailable';
          }
        };
      }

      if (mode === 'invalid') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async text() {
            return JSON.stringify({ choices: [{ message: {} }] });
          }
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            choices: [
              { message: { content: 'Local summary result' } }
            ]
          });
        }
      };
    };
    const clipboard = {
      copy(text) {
        copiedResults.push(text);
        return { ok: true, warning: null };
      }
    };
    const settings = {
      color: true,
      ai: {
        globalMaxPromptCharacters: 100,
        providers: [
          { id: 'local-on', type: 'local', title: 'Enabled Local', enabled: true, priority: 1, endpointUrl, requestFormat: 'openai-compatible-chat', model: 'test-model', maxPromptCharacters: 100 },
          { id: 'browser-on', type: 'browser', title: 'Browser Provider', enabled: true, priority: 20, url: 'https://example.com/chat', maxPromptCharacters: 100 }
        ]
      }
    };
    const runtime = {
      settings,
      color,
      clipboard,
      aiPromptManager,
      aiGateway: new AiGateway({
        aiPromptManager,
        clipboard,
        browserOpener: { open() { return { ok: true, warning: null }; } },
        localAiClient: new LocalAiClient(fetchImplementation)
      })
    };
    class ReturnPage {
      async show() {
        console.log('Return Page');
      }
    }
    const router = new Router(runtime, {
      returnPage: ReturnPage,
      aiProviderSelect: AiProviderSelectPage,
      aiResult: AiResultPage
    });

    await router.open('returnPage');
    await runtime.aiGateway.openProviderSelection(router, {
      toolId: 'diff_summary',
      projectName: 'Demo Project',
      repoName: 'demo-repo',
      payload: {
        payload: 'USER PAYLOAD',
        size: 12,
        maxPromptCharacters: 100,
        inputSummary: 'staged, unstaged, untracked'
      }
    });

    console.log('SERVER_REQUESTED ' + String(requested));
    console.log('COPIED_RESULT ' + String(copiedResults[0] || ''));

    if (requestBody) {
      console.log('REQUEST_MODEL ' + String(requestBody.model || ''));
      console.log('REQUEST_HAS_AUTH ' + String(requestHasAuth));
      console.log('REQUEST_SYSTEM_HAS_INTERNAL ' + String(requestBody.messages[0].content.includes('The diff payload may be truncated')));
      console.log('REQUEST_USER_HAS_PAYLOAD ' + String(requestBody.messages[1].content.endsWith('USER PAYLOAD')));
    }
  `;

  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    input,
    encoding: 'utf8'
  });
}

function smokeAddProjectPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const input = ['a', 'Smoke Project', projectPath, 'z', '', 'q'].join('\n') + '\n';
  const result = runApp(input, home);

  assert(result.status === 0, result.stderr || 'add project path failed');
  assert(result.stdout.includes('Project saved.'), 'add project path did not save');
  assert(/^1\.·+Smoke Project/m.test(result.stdout), 'add project path did not render numbered project row');
  assert(/^1\.·+Smoke Project\s+\+0 \/ -0\s+\+0\s+0 repos\s+N\/A\s+\[z\]$/m.test(result.stdout), 'add project path did not render aligned project row shape');
  assert(result.stdout.includes('Total: +0 / -0  Net: +0'), 'add project path did not render total project summary');
  assert(result.stdout.includes('+0 / -0'), 'add project path did not render zero change totals');
  assert(result.stdout.includes('+0'), 'add project path did not render zero net');
  assert(result.stdout.includes('0 repos'), 'add project path did not render repo count');
  assert(result.stdout.includes('N/A'), 'add project path did not render missing last commit data');

  const projects = readProjects(home);
  assert(projects.length === 1, 'add project path should save exactly one project');
  assert(projects[0].name === 'Smoke Project', 'saved project name mismatch');
  assert(projects[0].path === projectPath, 'saved project path mismatch');
  assert(projects[0].shortcut === 'z', 'saved project shortcut mismatch');
  assert(projects[0].pinned === false, 'saved project should default to unpinned');
  assert(projects[0].archived === false, 'saved project should default to unarchived');
}

function smokeAddProjectCancelPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-'));
  const input = ['a', 'b', 'q'].join('\n') + '\n';
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
  assert(result.stdout.includes('Total: +4 / -0  Net: +4'), 'projects page did not render discovered total project summary');
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

function smokeProjectsPageSortsByChangeVolumePath() {
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
    { name: 'Alpha Project', path: alphaProjectPath, shortcut: null },
    { name: 'Zebra Project', path: zebraProjectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp('q\n', home);

  assert(result.status === 0, result.stderr || 'projects page sort path failed');
  assert(result.stdout.includes('Total: +4 / -0  Net: +4'), 'projects page sort path did not render total project summary');

  const alphaIndex = result.stdout.indexOf('Alpha Project');
  const zebraIndex = result.stdout.indexOf('Zebra Project');

  assert(alphaIndex !== -1, 'projects page sort path did not render alpha project');
  assert(zebraIndex !== -1, 'projects page sort path did not render zebra project');
  assert(zebraIndex < alphaIndex, 'unpinned projects should sort by change volume descending');
}

function smokeProjectsPagePinPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const alphaProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-alpha-project-'));
  const zebraProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-zebra-project-'));
  const storageDir = path.join(home, '.repoteer', 'storage');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Zebra Project', path: zebraProjectPath, shortcut: null },
    { name: 'Alpha Project', path: alphaProjectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp('1p\nq\n', home);

  assert(result.status === 0, result.stderr || 'projects page pin path failed');
  assert(result.stdout.includes('Pinned Projects'), 'pin path should render pinned group');
  assert(result.stdout.includes('Projects'), 'pin path should render normal group');
  assert(result.stdout.includes('[0-9]P.'), 'pin path should render visible pin action');
  assert(result.stdout.includes('[0-9]A.'), 'pin path should render visible archive action');
  assert(/^1\.·+Alpha Project/m.test(result.stdout), 'pinned project should keep shared number sequence at top');
  assert(/^2\.·+Zebra Project/m.test(result.stdout), 'unpinned project should keep shared number sequence after pinned group');

  const projects = readProjects(home);
  assert(projects.find((project) => project.name === 'Alpha Project').pinned === true, 'pin path should persist pinned project');
  assert(projects.find((project) => project.name === 'Zebra Project').pinned !== true, 'pin path should not pin other projects');
}

function smokeProjectsPageArchivePath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const activeProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-active-project-'));
  const archiveProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-archive-project-'));
  const storageDir = path.join(home, '.repoteer', 'storage');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Active Project', path: activeProjectPath, shortcut: null },
    { name: 'Archive Project', path: archiveProjectPath, shortcut: null }
  ], null, 2) + '\n');

  const archiveResult = runApp('2a\nv\n1u\nb\nq\n', home);

  assert(archiveResult.status === 0, archiveResult.stderr || 'projects page archive path failed');

  const screens = archiveResult.stdout.split('Action: ');
  assert(screens.length >= 4, 'archive path should render multiple screens');
  assert(screens[2].includes('Archived Projects'), 'archive view should render archived project title');
  assert(screens[2].includes('Archive Project'), 'archive view should show archived project');
  assert(screens[2].includes('[0-9]U.'), 'archive view should render visible unarchive action');
  assert(screens[2].includes('[0-9]D.'), 'archive view should render visible delete action');
  assert(!screens[2].includes('Active Project'), 'archive view should not show active project');
  assert(screens[3].includes('No archived projects.'), 'unarchive path should remove project from archive view');

  const projectsAfterUnarchive = readProjects(home);
  assert(projectsAfterUnarchive.every((project) => project.archived !== true), 'unarchive path should clear archived flag');

  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Archived Delete Project', path: archiveProjectPath, shortcut: null, archived: true }
  ], null, 2) + '\n');

  const deleteResult = runApp('v\n1d\nyes\n\nb\nq\n', home);

  assert(deleteResult.status === 0, deleteResult.stderr || 'archive delete path failed');
  assert(deleteResult.stdout.includes('Delete Project: Archived Delete Project?'), 'archive delete path should render confirmation');
  assert(deleteResult.stdout.includes('Project deleted.'), 'archive delete path should confirm deletion');
  assert(readProjects(home).length === 0, 'archive delete path should remove project from storage');
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

function smokeProjectPageCopyProjectPathPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-copy-project-path-'));
  const storageDir = path.join(home, '.repoteer', 'storage');
  const fakeBin = path.join(home, 'fake-bin');
  const clipboardFile = path.join(home, 'clipboard.txt');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Copy Path Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const command of ['pbcopy', 'xclip', 'wl-copy', 'clip']) {
    fs.writeFileSync(path.join(fakeBin, command), '#!/bin/sh\ncat > "$REPOTEER_SMOKE_CLIPBOARD_FILE"\n');
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  const result = runApp('1\nc\n\nb\nq\n', home, [], {
    PATH: fakeBin + path.delimiter + process.env.PATH,
    REPOTEER_SMOKE_CLIPBOARD_FILE: clipboardFile
  });

  assert(result.status === 0, result.stderr || 'project page copy project path action failed');
  assert(result.stdout.includes('C. Copy Project Path'), 'project page did not render copy project path action');
  assert(result.stdout.includes('Project path copied.'), 'project page did not confirm project path copy');
  assert(fs.readFileSync(clipboardFile, 'utf8') === 'Project: ' + projectPath, 'project path copied text mismatch');

  const page = new ProjectPage({
    runtime: {},
    router: {},
    params: {}
  });

  assert(page.formatProjectPathLine({ path: projectPath }) === 'Project: ' + projectPath, 'project path copy line mismatch');
}

function smokeProjectPageOpenFolderActionsPath() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-open-project-'));
  const storageDir = path.join(home, '.repoteer', 'storage');
  const fakeBin = path.join(home, 'fake-bin');
  const openLog = path.join(home, 'open-log.txt');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Open Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');
  installFakeFolderOpeners(fakeBin);

  const result = runApp(['1', 'l', '', 'o', '', 'b', 'q'].join('\n') + '\n', home, [], {
    PATH: fakeBin + path.delimiter + process.env.PATH,
    REPOTEER_SMOKE_OPEN_LOG: openLog,
    TERMINAL: 'repoteer-fake-terminal'
  });

  assert(result.status === 0, result.stderr || 'project page open folder actions failed');
  assert(result.stdout.includes('L. Open project in terminal'), 'project page did not render terminal action');
  assert(result.stdout.includes('O. Open project in ' + platformFileExplorerName()), 'project page did not render file explorer action');
  assert(result.stdout.includes('Project opened in terminal.'), 'project page did not confirm terminal action');
  assert(result.stdout.includes('Project opened in ' + platformFileExplorerName() + '.'), 'project page did not confirm file explorer action');

  const log = fs.readFileSync(openLog, 'utf8');
  assert(log.includes(projectPath), 'project folder actions should pass the project path to the opener');
  assert(log.includes(platformTerminalCommandName()), 'project terminal action should use the platform terminal opener');
  assert(log.includes(platformFileExplorerCommandName()), 'project file explorer action should use the platform file explorer opener');
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

  const input = ['1', 'n', 'Renamed Project', renamedProjectPath, 'z', '', 'b', 'q'].join('\n') + '\n';
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
  const fakeBin = path.join(home, 'fake-bin');
  const clipboardFile = path.join(home, 'clipboard.txt');


  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Items Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  fs.mkdirSync(fakeBin, { recursive: true });

  for (const command of ['pbcopy', 'xclip', 'wl-copy', 'clip']) {
    fs.writeFileSync(path.join(fakeBin, command), '#!/bin/sh\ncat > "$REPOTEER_SMOKE_CLIPBOARD_FILE"\n');
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  const addInput = [
    '1',
    'am',
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
    'ap',
    'Release notes',
    'First clipboard line',
    'Second clipboard line',
    '.',
    'Clipboard notes',
    '',
    'p1',
    '',
    'b',
    'q'
  ].join('\n') + '\n';
  const addResult = runApp(addInput, home, [], {
    PATH: fakeBin + path.delimiter + process.env.PATH,
    REPOTEER_SMOKE_CLIPBOARD_FILE: clipboardFile
  });

  assert(addResult.status === 0, addResult.stderr || 'project items add path failed');
  assert(addResult.stdout.includes('Bookmarks'), 'project items add path did not render bookmarks header');
  assert(addResult.stdout.includes('Commands'), 'project items add path did not render commands header');
  assert(addResult.stdout.includes('Clipboard'), 'project items add path did not render clipboard header');
  assert(addResult.stdout.includes('am. Add bookmark'), 'project items add path did not render add bookmark action');
  assert(addResult.stdout.includes('ac. Add command'), 'project items add path did not render add command action');
  assert(addResult.stdout.includes('ap. Add clipboard'), 'project items add path did not render add clipboard action');
  assert(addResult.stdout.includes('Bookmark saved.'), 'project items add path did not save bookmark');
  assert(addResult.stdout.includes('Command saved.'), 'project items add path did not save command');
  assert(addResult.stdout.includes('Clipboard item saved.'), 'project items add path did not save clipboard item');
  assert(addResult.stdout.includes('Clipboard copied: Release notes'), 'project items add path did not copy clipboard item');
  assert(addResult.stdout.includes('m1. Dashboard'), 'project items add path did not render saved bookmark');
  assert(addResult.stdout.includes('c1. project cli'), 'project items add path did not render saved command');
  assert(addResult.stdout.includes('p1. Release notes'), 'project items add path did not render saved clipboard item');

  const bookmarks = readBookmarks(home);
  const commands = readCommands(home);
  const clipboardItems = readClipboardItems(home);

  assert(bookmarks.length === 1, 'project items should save one bookmark');
  assert(bookmarks[0].projectName === 'Items Project', 'bookmark project name mismatch');
  assert(bookmarks[0].title === 'Dashboard', 'bookmark title mismatch');
  assert(bookmarks[0].target === 'https://example.com/dashboard', 'bookmark target mismatch');
  assert(commands.length === 1, 'project items should save one command');
  assert(commands[0].projectName === 'Items Project', 'command project name mismatch');
  assert(commands[0].title === 'project cli', 'command title mismatch');
  assert(commands[0].command === 'echo ok', 'command text mismatch');
  assert(commands[0].workingDirectory === projectPath, 'command working directory should default to project path');
  assert(clipboardItems.length === 1, 'project items should save one clipboard item');
  assert(clipboardItems[0].projectName === 'Items Project', 'clipboard item project name mismatch');
  assert(clipboardItems[0].title === 'Release notes', 'clipboard item title mismatch');
  assert(clipboardItems[0].text === 'First clipboard line\nSecond clipboard line', 'clipboard item text mismatch');
  assert(fs.readFileSync(clipboardFile, 'utf8') === 'First clipboard line\nSecond clipboard line', 'clipboard copied text mismatch');

  const bookmarkCopyInput = [
    '1',
    'm1',
    'c',
    '',
    'b',
    'q'
  ].join('\n') + '\n';
  const bookmarkCopyResult = runApp(bookmarkCopyInput, home, [], {
    PATH: fakeBin + path.delimiter + process.env.PATH,
    REPOTEER_SMOKE_CLIPBOARD_FILE: clipboardFile
  });

  assert(bookmarkCopyResult.status === 0, bookmarkCopyResult.stderr || 'project bookmark copy path failed');
  assert(bookmarkCopyResult.stdout.includes('Link copied: Dashboard'), 'bookmark detail path did not copy target');
  assert(fs.readFileSync(clipboardFile, 'utf8') === 'https://example.com/dashboard', 'bookmark detail copied text mismatch');

  const detailInput = [
    '1',
    'm1',
    'b',
    'vp1',
    'b',
    'c1',
    'c',
    '',
    'b',
    'm1',
    'd',
    'yes',
    '',
    'c1',
    'd',
    'yes',
    '',
    'vp1',
    'd',
    'yes',
    '',
    'b',
    'q'
  ].join('\n') + '\n';
  const detailResult = runApp(detailInput, home, [], {
    PATH: fakeBin + path.delimiter + process.env.PATH,
    REPOTEER_SMOKE_CLIPBOARD_FILE: clipboardFile
  });

  assert(detailResult.status === 0, detailResult.stderr || 'project items detail path failed');
  assert(detailResult.stdout.includes('Bookmark: Dashboard'), 'bookmark detail path did not render title');
  assert(detailResult.stdout.includes('URL/path: https://example.com/dashboard'), 'bookmark detail path did not render target');
  assert(detailResult.stdout.includes('Command: project cli'), 'command detail path did not render title');
  assert(detailResult.stdout.includes('Command: echo ok'), 'command detail path did not render command');
  assert(detailResult.stdout.includes('Working directory: ' + projectPath), 'command detail path did not render working directory');
  assert(detailResult.stdout.includes('T. Open in terminal'), 'command detail path did not render open in terminal action');
  assert(detailResult.stdout.includes('Command copied: project cli'), 'command detail path did not copy command');
  assert(detailResult.stdout.includes('Clipboard: Release notes'), 'clipboard detail path did not render title');
  assert(detailResult.stdout.includes('First clipboard line'), 'clipboard detail path did not render text');
  assert(detailResult.stdout.includes('C. Copy'), 'clipboard detail path did not render copy action');
  assert(detailResult.stdout.includes('Bookmark deleted.'), 'bookmark detail path did not delete bookmark');
  assert(detailResult.stdout.includes('Command deleted.'), 'command detail path did not delete command');
  assert(detailResult.stdout.includes('Clipboard item deleted.'), 'clipboard detail path did not delete clipboard item');
  assert(fs.readFileSync(clipboardFile, 'utf8') === 'echo ok', 'command detail copied text mismatch');
  assert(readBookmarks(home).length === 0, 'project items should delete bookmark');
  assert(readCommands(home).length === 0, 'project items should delete command');
  assert(readClipboardItems(home).length === 0, 'project items should delete clipboard item');
}

async function smokeProjectCommandRunTerminalModePath() {
  const calls = [];
  const routed = [];
  const panel = new ProjectItemsPanel({
    runtime: {
      terminal: {
        exitAlternateScreen() {
          calls.push('exit');
        },
        enterAlternateScreen() {
          calls.push('enter');
        }
      }
    },
    color: {
      bold(value) {
        return value;
      },
      green(value) {
        return value;
      },
      yellow(value) {
        return value;
      }
    },
    showProject(projectName) {
      routed.push(['project', projectName]);
    },
    router: {
      async backTo(pageName, params) {
        routed.push([pageName, params.projectName]);
      },
      async replace(pageName, params) {
        routed.push([pageName, params.projectName, params.repoPath]);
      }
    }
  });
  panel.waitForCommandReview = async () => {
    calls.push('review');
  };

  const notice = await panel.runCommand({
    title: 'smoke command',
    command: JSON.stringify(process.execPath) + ' -e "process.exit(0)"',
    workingDirectory: root
  });

  assert(calls.join(',') === 'exit,review,enter', 'command run should leave alternate screen, pause for review, and restore it');
  assert(notice === 'Command finished.', 'command run should report success after returning');

  await panel.returnAfterCommandRun({
    name: 'Smoke Project',
    repos: [
      { path: path.join(root, 'nested') },
      { path: root }
    ]
  }, {
    workingDirectory: path.join(root, 'nested', 'app')
  });

  await panel.returnAfterCommandRun({
    name: 'Smoke Project',
    repos: []
  }, {
    workingDirectory: root
  });

  assert(
    routed.filter((entry) => entry[0] === 'project' && entry[1] === 'Smoke Project').length === 2,
    'command run should return to the project page after review'
  );
  assert(
    routed.some((entry) => entry[0] === 'project' && entry[1] === 'Smoke Project'),
    'command run should fall back to the project when no repo matches'
  );
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
    'T. Hide projects without code changes',
    'R. Refresh',
    'A. Add project',
    'V. View archive',
    '[0-9]P. Pin/unpin project',
    '[0-9]A. Archive project',
    'S. Settings',
    'Q. Quit'
  ], {
    color: {
      hotkey: (value) => '\u001b[1;38;2;180;120;255m' + value + '\u001b[22;39m'
    }
  });

  assert(actionRows[0].includes('\u001b[1;38;2;180;120;255mT.\u001b[22;39m'), 'action hotkey should render bold purple');

  assert(actionRows.length === 4, 'action columns should pair actions across rows');
  assert(stripAnsi(actionRows[0]).includes('R. Refresh'), 'action columns should render first right action');
  assert(stripAnsi(actionRows[1]).includes('V. View archive'), 'action columns should render second right action');
  assert(stripAnsi(actionRows[2]).includes('[0-9]A. Archive project'), 'action columns should render numeric archive action');
  assert(stripAnsi(actionRows[3]).includes('Q. Quit'), 'action columns should render final right action');
  assert(stripAnsi(actionRows[0]).indexOf('R. Refresh') === stripAnsi(actionRows[1]).indexOf('V. View archive'), 'action columns should align right column');
  assert(stripAnsi(actionRows[1]).indexOf('V. View archive') === stripAnsi(actionRows[2]).indexOf('[0-9]A. Archive project'), 'action columns should align right column');
  assert(stripAnsi(actionRows[2]).indexOf('[0-9]A. Archive project') === stripAnsi(actionRows[3]).indexOf('Q. Quit'), 'action columns should align right column');
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

function smokeDiffFormatting() {
  const color = {
    green: (value) => '<green>' + value + '</green>',
    red: (value) => '<red>' + value + '</red>'
  };
  const formatted = formatDiffForDisplay([
    'diff --git a/test.js b/test.js',
    '--- a/test.js',
    '+++ b/test.js',
    '@@ -1 +1 @@',
    '-const value = 1;',
    '+const value = 2;',
    ' const context = true;'
  ].join('\n'), color);

  assert(formatted.includes('--- a/test.js'), 'diff formatter should not color removed file header');
  assert(formatted.includes('+++ b/test.js'), 'diff formatter should not color added file header');
  assert(formatted.includes('<red>-const value = 1;</red>'), 'diff formatter should color removed lines red');
  assert(formatted.includes('<green>+const value = 2;</green>'), 'diff formatter should color added lines green');
  assert(formatted.includes(' const context = true;'), 'diff formatter should leave context lines plain');
}

function smokeDiffPagesUseNormalScroll() {
  assert(DiffPage.scrollMode === 'normal', 'full diff page should use normal terminal scrollback');
  assert(FilePage.scrollMode === 'normal', 'file diff page should use normal terminal scrollback');
  assert(RepoHistoryPage.scrollMode === 'normal', 'repo history page should use normal terminal scrollback');
  assert(ProjectHistoryPage.scrollMode === 'normal', 'project history page should use normal terminal scrollback');
  assert(ProjectsHistoryPage.scrollMode === 'normal', 'projects history page should use normal terminal scrollback');
}

function smokeDiffPagesDoNotTruncateVisibleDiffs() {
  const diffPageSource = fs.readFileSync(path.join(root, 'src/pages/DiffPage.js'), 'utf8');
  const filePageSource = fs.readFileSync(path.join(root, 'src/pages/FilePage.js'), 'utf8');

  assert(!diffPageSource.includes('[truncated]'), 'full diff page should not append visible truncation markers');
  assert(!filePageSource.includes('[truncated]'), 'file diff page should not append visible truncation markers');
  assert(!diffPageSource.includes('MAX_VISIBLE_DIFF_CHARS'), 'full diff page should not cap visible diff characters');
  assert(!filePageSource.includes('MAX_VISIBLE_DIFF_CHARS'), 'file diff page should not cap visible diff characters');
}

async function smokeRouterTerminalModePath() {
  const events = [];
  const runtime = {
    terminal: {
      enterAlternateScreen() {
        events.push('enter');
      },
      exitAlternateScreen() {
        events.push('exit');
      }
    }
  };

  class FullscreenPage {
    async show() {
      events.push('fullscreen');
    }
  }

  class NormalScrollPage {
    static scrollMode = 'normal';

    async show() {
      events.push('normal');
    }
  }

  const router = new Router(runtime, {
    fullscreen: FullscreenPage,
    normal: NormalScrollPage
  });

  await router.open('fullscreen');
  await router.open('normal');
  await router.back();

  assert(
    events.join(',') === 'enter,fullscreen,exit,normal,enter,fullscreen',
    'router should switch terminal mode per rendered page'
  );
}

function smokeCommitConfirmReturnPagePath() {
  const code = `
    import { Router } from './src/router/Router.js';
    import { CommitConfirmPage } from './src/pages/CommitConfirmPage.js';

    const repo = {
      path: '/tmp/return-repo',
      modifiedFiles: 1
    };
    const color = {
      bold: (value) => value,
      dim: (value) => value,
      green: (value) => value,
      yellow: (value) => value,
      red: (value) => value,
      darkYellow: (value) => value
    };
    const runtime = {
      color,
      commitManager: {
        commit(repoPath, title, body) {
          console.log('COMMIT_CALLED ' + repoPath + ' ' + title + ' ' + body);
          return { ok: true, warning: null };
        }
      },
      refreshSnapshot() {
        return {
          projects: [
            {
              name: 'Return Project',
              repos: [repo]
            }
          ]
        };
      }
    };
    class ProjectPage {
      constructor({ params }) {
        this.params = params;
      }

      async show() {
        console.log('Project Page Returned ' + this.params.projectName);
      }
    }
    class PickerPage {
      async show() {
        console.log('Picker Page');
      }
    }
    const router = new Router(runtime, {
      project: ProjectPage,
      picker: PickerPage,
      commitConfirm: CommitConfirmPage
    });

    await router.open('project', {
      projectName: 'Return Project'
    });
    await router.open('picker');
    await router.open('commitConfirm', {
      projectName: 'Return Project',
      repoPath: repo.path,
      title: 'update return path',
      body: 'Return to project after commit.',
      pushAfterCommit: false,
      returnPage: 'project',
      returnParams: {
        projectName: 'Return Project'
      }
    });

    console.log('CURRENT_PAGE ' + router.current().pageName);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    input: ['c', ''].join('\n') + '\n',
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || 'commit confirmation return page path failed');
  assert(result.stdout.includes('COMMIT_CALLED /tmp/return-repo update return path Return to project after commit.'), 'commit confirmation should call commit before returning');
  assert(result.stdout.includes('Commit created.'), 'commit confirmation should report successful commit');
  assert(result.stdout.includes('Project Page Returned Return Project'), 'commit confirmation should return to project page');
  assert(result.stdout.includes('CURRENT_PAGE project'), 'commit confirmation should leave router on project page');
}

function smokeCommitConfirmAutoPushPath() {
  const code = `
    import { Router } from './src/router/Router.js';
    import { CommitConfirmPage } from './src/pages/CommitConfirmPage.js';

    const repo = {
      path: '/tmp/push-repo',
      modifiedFiles: 1
    };
    const color = {
      bold: (value) => value,
      dim: (value) => value,
      green: (value) => value,
      yellow: (value) => value,
      red: (value) => value,
      darkYellow: (value) => value
    };
    const runtime = {
      color,
      commitManager: {
        commit(repoPath, title, body) {
          console.log('COMMIT_CALLED ' + repoPath + ' ' + title + ' ' + body);
          return { ok: true, warning: null };
        }
      },
      git: {
        push(repoPath) {
          console.log('PUSH_CALLED ' + repoPath);
          return { ok: true, warning: null };
        }
      },
      refreshSnapshot() {
        return {
          projects: [
            {
              name: 'Push Project',
              repos: [repo]
            }
          ]
        };
      }
    };
    class ProjectPage {
      async show() {
        console.log('Project Page Returned');
      }
    }
    const router = new Router(runtime, {
      project: ProjectPage,
      commitConfirm: CommitConfirmPage
    });

    await router.open('project');
    await router.open('commitConfirm', {
      projectName: 'Push Project',
      repoPath: repo.path,
      title: 'push after commit',
      body: 'Push automatically after commit.',
      pushAfterCommit: true,
      returnPage: 'project'
    });
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    input: ['c', ''].join('\n') + '\n',
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || 'commit confirmation auto push path failed');
  assert(result.stdout.includes('COMMIT_CALLED /tmp/push-repo push after commit Push automatically after commit.'), 'commit confirmation should call commit');
  assert(result.stdout.includes('PUSH_CALLED /tmp/push-repo'), 'commit confirmation should push automatically');
  assert(!result.stdout.includes('Push now?'), 'commit confirmation should not ask for a second push confirmation');
  assert(result.stdout.includes('Push complete.'), 'commit confirmation should report successful push');
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
  assert(result.stdout.includes('Push: no upstream'), 'repo page should render push status');
  assert(result.stdout.includes('V. View full diff'), 'repo page should render view diff action');
  assert(result.stdout.includes('X. Commit summary exclusions'), 'repo page should render commit summary exclusions action');
  assert(result.stdout.includes('F. Hotfix commit & push'), 'repo page should render hotfix action');
  assert(result.stdout.includes('T. Open repo in terminal'), 'repo page should render terminal action');
  assert(result.stdout.includes('O. Open repo in ' + platformFileExplorerName()), 'repo page should render file explorer action');
  assert(result.stdout.includes('Repo: frontend (diff)'), 'diff page should render title');
  assert(result.stdout.includes('+const next = 2;'), 'diff page should render changed line');
}

function smokeRepoPageOpenFolderActionsPath() {
  if (!gitAvailable()) {
    console.log('smoke repo open folder actions skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-open-repo-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');
  const fakeBin = path.join(home, 'fake-bin');
  const openLog = path.join(home, 'open-log.txt');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed repo open folder');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Repo Open Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');
  installFakeFolderOpeners(fakeBin);

  const result = runApp(['1', '1', 't', '', 'o', '', 'b', 'b', 'q'].join('\n') + '\n', home, [], {
    PATH: fakeBin + path.delimiter + process.env.PATH,
    REPOTEER_SMOKE_OPEN_LOG: openLog,
    TERMINAL: 'repoteer-fake-terminal'
  });

  assert(result.status === 0, result.stderr || 'repo page open folder actions failed');
  assert(result.stdout.includes('Repo opened in terminal.'), 'repo page did not confirm terminal action');
  assert(result.stdout.includes('Repo opened in ' + platformFileExplorerName() + '.'), 'repo page did not confirm file explorer action');

  const log = fs.readFileSync(openLog, 'utf8');
  assert(log.includes(repoPath), 'repo folder actions should pass the repo path to the opener');
  assert(log.includes(platformTerminalCommandName()), 'repo terminal action should use the platform terminal opener');
  assert(log.includes(platformFileExplorerCommandName()), 'repo file explorer action should use the platform file explorer opener');
}

function smokeRepoPageUnpushedPushPath() {
  if (!gitAvailable()) {
    console.log('smoke repo unpushed push skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-unpushed-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const remotePath = path.join(projectPath, 'remote.git');
  const storageDir = path.join(home, '.repoteer', 'storage');

  runGit(['init', '--bare', remotePath], projectPath);
  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\n');
  commitAll(repoPath, 'seed unpushed repo');
  runGit(['remote', 'add', 'origin', remotePath], repoPath);
  runGit(['push', '-u', 'origin', 'HEAD'], repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\nconst next = 2;\n');
  commitAll(repoPath, 'unpushed commit');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Unpushed Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'u', '', 'b', 'b', 'q'].join('\n') + '\n', home);
  const remoteLog = spawnSync('git', ['--git-dir', remotePath, 'log', '-1', '--format=%s'], {
    encoding: 'utf8'
  });

  assert(result.status === 0, result.stderr || 'repo unpushed push path failed');
  assert(result.stdout.includes('Push: 1 unpushed commit(s) to origin/'), 'repo page should render unpushed commit count');
  assert(result.stdout.includes('U. Push unpushed commits'), 'repo page should render unpushed push action');
  assert(result.stdout.includes('Push complete.'), 'repo page should confirm direct push');
  assert(remoteLog.stdout.trim() === 'unpushed commit', 'direct push action should update remote');
}

function smokeRepoHistoryPath() {
  if (!gitAvailable()) {
    console.log('smoke repo history skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-history-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'seed.txt'), 'seed\n');
  commitAll(repoPath, 'seed history repo');

  for (let index = 1; index <= 12; index += 1) {
    fs.writeFileSync(path.join(repoPath, 'history-' + String(index) + '.txt'), 'line ' + String(index) + '\n');
    const body = index === 12
      ? 'Body for history 12 starts here and continues with enough words to wrap inside the body column for readability.'
      : 'Body for history ' + String(index);

    commitAll(repoPath, 'history commit ' + String(index), body);
  }

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'History Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'y', 'n', '1', 'b', 'p', 'b', 'b', 'b', 'q'].join('\n') + '\n', home, [], {
    COLUMNS: '80'
  });
  const output = stripAnsi(result.stdout);

  assert(result.status === 0, result.stderr || 'repo history path failed');
  assert(result.stdout.includes('Y. History'), 'repo page should render history action');
  assert(result.stdout.includes('History: History Project / frontend'), 'history page should render title');
  assert(result.stdout.includes('Page: 1'), 'history page should render first page');
  assert(result.stdout.includes('Page: 2'), 'history page should render second page');
  assert(result.stdout.includes('1.') && result.stdout.includes('5.'), 'history page should render five page-local numbers');
  assert(!/^6\. /m.test(output), 'history page should not render more than five commits per page');
  assert(result.stdout.includes('history commit 12'), 'history page should render newest commit title');
  assert(result.stdout.includes('Body for history 12'), 'history page should render commit body');
  assert(/^1\. \d{4}-\d{2}-\d{2} \d{2}:\d{2} \((?:just now|\d+ (?:minute|hour|day|year)s? ago)\) [a-f0-9]+ \+1 \/ -0$/m.test(output), 'history item should render date, time, ago time, history id, and line stats on the first row');
  assert(/^Title: history commit 12$/m.test(output), 'history item should render title on the second row');
  assert(/^Body: Body for history 12 starts here/m.test(output), 'history item should render body on the third row');
  assert(/^ {6}.+readability\.$/m.test(output), 'history body should wrap with continuation indentation');
  assert(/readability\.\n\n2\. /m.test(output), 'history items should be separated by a blank line');
  assert(result.stdout.includes('history commit 7'), 'second page should render older commit title');
  assert(result.stdout.includes('Commit: History Project / frontend'), 'commit history detail should render title');
  assert(result.stdout.includes('Title: history commit 7'), 'commit detail should preserve selected commit title');
  assert(result.stdout.includes('history-7.txt'), 'commit detail should render changed file');
  assert(result.stdout.includes('+1 / -0'), 'commit detail should render changed file stats');
  assert(!result.stdout.includes('diff --git'), 'repo history path should not render historical patch diffs');
}

function smokeProjectHistoryPath() {
  if (!gitAvailable()) {
    console.log('smoke project history skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-project-history-project-'));
  const frontendPath = path.join(projectPath, 'frontend');
  const backendPath = path.join(projectPath, 'backend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(frontendPath);
  fs.writeFileSync(path.join(frontendPath, 'seed.txt'), 'seed\n');
  commitAllAt(frontendPath, 'seed frontend history', '2024-01-01T00:00:00Z');

  initGitRepo(backendPath);
  fs.writeFileSync(path.join(backendPath, 'seed.txt'), 'seed\n');
  commitAllAt(backendPath, 'seed backend history', '2024-01-01T00:00:00Z');

  const commits = [
    { repoPath: backendPath, repoName: 'backend', index: 1, date: '2024-01-02T00:00:00Z' },
    { repoPath: frontendPath, repoName: 'frontend', index: 2, date: '2024-01-03T00:00:00Z' },
    { repoPath: backendPath, repoName: 'backend', index: 3, date: '2024-01-04T00:00:00Z' },
    { repoPath: frontendPath, repoName: 'frontend', index: 4, date: '2024-01-05T00:00:00Z' },
    { repoPath: backendPath, repoName: 'backend', index: 5, date: '2024-01-06T00:00:00Z' },
    { repoPath: frontendPath, repoName: 'frontend', index: 6, date: '2024-01-07T00:00:00Z' },
    { repoPath: backendPath, repoName: 'backend', index: 7, date: '2024-01-08T00:00:00Z' }
  ];

  commits.forEach((commit) => {
    fs.writeFileSync(path.join(commit.repoPath, 'aggregate-' + String(commit.index) + '.txt'), 'line ' + String(commit.index) + '\n');
    commitAllAt(commit.repoPath, 'aggregate ' + commit.repoName + ' ' + String(commit.index), commit.date, 'Body for aggregate ' + String(commit.index));
  });

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Aggregate History', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', 'y', 'n', '1', 'b', 'b', 'q'].join('\n') + '\n', home, [], {
    COLUMNS: '90'
  });
  const output = stripAnsi(result.stdout);

  assert(result.status === 0, result.stderr || 'project history path failed');
  assert(result.stdout.includes('History: Aggregate History'), 'project history page should render title');
  assert(result.stdout.includes('Page: 1'), 'project history page should render first page');
  assert(result.stdout.includes('Page: 2'), 'project history page should render second page');
  assert(result.stdout.includes('aggregate backend 7'), 'project history should render newest commit from backend');
  assert(result.stdout.includes('aggregate frontend 6'), 'project history should render commits from frontend');
  assert(result.stdout.includes('aggregate frontend 2'), 'project history second page should render older aggregate commit');
  assert(/^1\. \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(.+ ago\) backend [a-f0-9]+ \+1 \/ -0$/m.test(output), 'project history item should render repo name, history id, and line stats');
  assert(/Title: aggregate backend 7[\s\S]*Title: aggregate frontend 6[\s\S]*Title: aggregate backend 5/.test(output), 'project history should aggregate commits ordered by date');
  assert(!/^6\. /m.test(output), 'project history page should not render more than five commits per page');
  assert(result.stdout.includes('Commit: Aggregate History / frontend'), 'project history detail should open the selected repo commit');
  assert(result.stdout.includes('Title: aggregate frontend 2'), 'project history detail should preserve selected commit title');
  assert(result.stdout.includes('aggregate-2.txt'), 'project history detail should render changed file');
  assert(!result.stdout.includes('diff --git'), 'project history path should not render historical patch diffs');
}

function smokeProjectsHistoryPath() {
  if (!gitAvailable()) {
    console.log('smoke projects history skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const alphaPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-projects-history-alpha-'));
  const betaPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-projects-history-beta-'));
  const archivePath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-projects-history-archive-'));
  const alphaRepoPath = path.join(alphaPath, 'api');
  const betaRepoPath = path.join(betaPath, 'web');
  const archiveRepoPath = path.join(archivePath, 'old');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(alphaRepoPath);
  fs.writeFileSync(path.join(alphaRepoPath, 'seed.txt'), 'seed\n');
  commitAllAt(alphaRepoPath, 'seed alpha projects history', '2024-01-01T00:00:00Z');

  initGitRepo(betaRepoPath);
  fs.writeFileSync(path.join(betaRepoPath, 'seed.txt'), 'seed\n');
  commitAllAt(betaRepoPath, 'seed beta projects history', '2024-01-01T00:00:00Z');

  initGitRepo(archiveRepoPath);
  fs.writeFileSync(path.join(archiveRepoPath, 'seed.txt'), 'seed\n');
  commitAllAt(archiveRepoPath, 'archived newest projects history', '2024-02-01T00:00:00Z');

  const commits = [
    { repoPath: alphaRepoPath, projectName: 'Alpha History', repoName: 'api', index: 1, date: '2024-01-02T00:00:00Z' },
    { repoPath: betaRepoPath, projectName: 'Beta History', repoName: 'web', index: 2, date: '2024-01-03T00:00:00Z' },
    { repoPath: alphaRepoPath, projectName: 'Alpha History', repoName: 'api', index: 3, date: '2024-01-04T00:00:00Z' },
    { repoPath: betaRepoPath, projectName: 'Beta History', repoName: 'web', index: 4, date: '2024-01-05T00:00:00Z' },
    { repoPath: alphaRepoPath, projectName: 'Alpha History', repoName: 'api', index: 5, date: '2024-01-06T00:00:00Z' },
    { repoPath: betaRepoPath, projectName: 'Beta History', repoName: 'web', index: 6, date: '2024-01-07T00:00:00Z' },
    { repoPath: alphaRepoPath, projectName: 'Alpha History', repoName: 'api', index: 7, date: '2024-01-08T00:00:00Z' }
  ];

  commits.forEach((commit) => {
    fs.writeFileSync(path.join(commit.repoPath, 'projects-aggregate-' + String(commit.index) + '.txt'), 'line ' + String(commit.index) + '\n');
    commitAllAt(
      commit.repoPath,
      'projects aggregate ' + commit.projectName + ' ' + commit.repoName + ' ' + String(commit.index),
      commit.date,
      'Body for projects aggregate ' + String(commit.index)
    );
  });

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Alpha History', path: alphaPath, shortcut: null, archived: false },
    { name: 'Beta History', path: betaPath, shortcut: null, archived: false },
    { name: 'Archived History', path: archivePath, shortcut: null, archived: true }
  ], null, 2) + '\n');

  const result = runApp(['y', 'n', '1', 'b', 'p', 'b', 'q'].join('\n') + '\n', home, [], {
    COLUMNS: '110'
  });
  const output = stripAnsi(result.stdout);

  assert(result.status === 0, result.stderr || 'projects history path failed');
  assert(result.stdout.includes('Y. History'), 'projects page should render top-level history action');
  assert(result.stdout.includes('History: Projects'), 'projects history page should render title');
  assert(result.stdout.includes('Page: 1'), 'projects history page should render first page');
  assert(result.stdout.includes('Page: 2'), 'projects history page should render second page');
  assert(result.stdout.includes('projects aggregate Alpha History api 7'), 'projects history should render newest active project commit');
  assert(result.stdout.includes('projects aggregate Beta History web 6'), 'projects history should render commits from second active project repo');
  assert(result.stdout.includes('projects aggregate Beta History web 2'), 'projects history second page should render older aggregate commit');
  assert(!result.stdout.includes('archived newest projects history'), 'projects history should exclude archived projects');
  assert(/^1\. \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(.+ ago\) Alpha History \/ api [a-f0-9]+ \+1 \/ -0$/m.test(output), 'projects history item should render project name, repo name, history id, and line stats');
  assert(/Title: projects aggregate Alpha History api 7[\s\S]*Title: projects aggregate Beta History web 6[\s\S]*Title: projects aggregate Alpha History api 5/.test(output), 'projects history should aggregate commits ordered by date');
  assert(!/^6\. /m.test(output), 'projects history page should not render more than five commits per page');
  assert(result.stdout.includes('Commit: Beta History / web'), 'projects history detail should open the selected project/repo commit');
  assert(result.stdout.includes('Title: projects aggregate Beta History web 2'), 'projects history detail should preserve selected commit title');
  assert(result.stdout.includes('projects-aggregate-2.txt'), 'projects history detail should render changed file');
  assert(!result.stdout.includes('diff --git'), 'projects history path should not render historical patch diffs');
}

function smokeActivityGraphMainViewsPath() {
  if (!gitAvailable()) {
    console.log('smoke activity graph skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const alphaPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-activity-alpha-'));
  const betaPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-activity-beta-'));
  const archivePath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-activity-archive-'));
  const alphaRepoPath = path.join(alphaPath, 'api');
  const betaRepoPath = path.join(betaPath, 'web');
  const archiveRepoPath = path.join(archivePath, 'old');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(alphaRepoPath);
  fs.writeFileSync(path.join(alphaRepoPath, 'seed.txt'), 'seed\n');
  commitAllAt(alphaRepoPath, 'old alpha seed', localNoonDaysAgo(45));

  initGitRepo(betaRepoPath);
  fs.writeFileSync(path.join(betaRepoPath, 'seed.txt'), 'seed\n');
  commitAllAt(betaRepoPath, 'old beta seed', localNoonDaysAgo(45));

  initGitRepo(archiveRepoPath);
  fs.writeFileSync(path.join(archiveRepoPath, 'seed.txt'), 'seed\n');
  commitAllAt(archiveRepoPath, 'old archive seed', localNoonDaysAgo(45));

  for (let index = 1; index <= 3; index += 1) {
    fs.writeFileSync(path.join(alphaRepoPath, 'today-' + String(index) + '.txt'), 'today ' + String(index) + '\n');
    commitAllAt(alphaRepoPath, 'alpha today ' + String(index), localNoonDaysAgo(0));
  }

  fs.writeFileSync(path.join(alphaRepoPath, 'yesterday.txt'), 'yesterday\n');
  commitAllAt(alphaRepoPath, 'alpha yesterday', localNoonDaysAgo(1));

  for (let index = 1; index <= 2; index += 1) {
    fs.writeFileSync(path.join(betaRepoPath, 'two-days-' + String(index) + '.txt'), 'two days ' + String(index) + '\n');
    commitAllAt(betaRepoPath, 'beta two days ' + String(index), localNoonDaysAgo(2));
  }

  for (let index = 1; index <= 6; index += 1) {
    fs.writeFileSync(path.join(archiveRepoPath, 'archived-' + String(index) + '.txt'), 'archived ' + String(index) + '\n');
    commitAllAt(archiveRepoPath, 'archived today ' + String(index), localNoonDaysAgo(0));
  }

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Alpha Activity', path: alphaPath, shortcut: null, archived: false },
    { name: 'Beta Activity', path: betaPath, shortcut: null, archived: false },
    { name: 'Archived Activity', path: archivePath, shortcut: null, archived: true }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'b', 'b', 'q'].join('\n') + '\n', home, [], {
    COLUMNS: '90'
  });
  const output = stripAnsi(result.stdout);
  const graph = new ActivityGraph(new Git());
  const alphaCounts = Array.from({ length: 90 }, () => 0);
  const activeCounts = Array.from({ length: 90 }, () => 0);
  alphaCounts[44] = 1;
  alphaCounts[88] = 1;
  alphaCounts[89] = 3;
  activeCounts[44] = 2;
  activeCounts[87] = 2;
  activeCounts[88] = 1;
  activeCounts[89] = 3;
  const alphaGraph = graph.renderCounts(alphaCounts).join('\n');
  const activeGraph = graph.renderCounts(activeCounts).join('\n');

  assert(result.status === 0, result.stderr || 'activity graph path failed');

  const projectsStart = output.indexOf('Repoteer');
  const projectsEnd = output.indexOf('Action:', projectsStart);
  const projectsScreen = output.slice(projectsStart, projectsEnd);
  assert(projectsScreen.includes(activeGraph), 'projects page should render active project activity graph');
  assert(projectsScreen.indexOf(activeGraph) < projectsScreen.indexOf('Total:'), 'projects activity graph should render before the summary');
  assert(!projectsScreen.includes('Archived Activity'), 'projects page should exclude archived projects from visible activity scope');

  const projectStart = output.indexOf('Project: Alpha Activity');
  const projectEnd = output.indexOf('Action:', projectStart);
  const projectScreen = output.slice(projectStart, projectEnd);
  assert(projectScreen.includes(alphaGraph), 'project page should render selected project activity graph');
  assert(projectScreen.indexOf(alphaGraph) < projectScreen.indexOf('Repo'), 'project activity graph should render before repo rows');

  const repoStart = output.indexOf('Repo: Alpha Activity / api');
  const repoEnd = output.indexOf('Action:', repoStart);
  const repoScreen = output.slice(repoStart, repoEnd);
  assert(repoScreen.includes(alphaGraph), 'repo page should render selected repo activity graph');
  assert(repoScreen.indexOf(alphaGraph) < repoScreen.indexOf('No file changes.'), 'repo activity graph should render before file state');
  assert(alphaGraph.includes('Activity (90d)'), 'activity graph should label the visible day range');
  assert(alphaGraph.includes('90d ago') && alphaGraph.includes('60d ago') && alphaGraph.includes('30d ago') && alphaGraph.includes('today'), 'activity graph should render x-axis labels');
  assert(alphaGraph.includes('┤') && alphaGraph.includes('└') && alphaGraph.includes('┴'), 'activity graph should render box-drawing axes');
  assert(alphaGraph.split('\n')[1].endsWith('░'), 'activity graph should render the busiest recent day at full height');
  assert(alphaGraph.split('\n')[6].endsWith('░░'), 'activity graph should give lower activity days shorter columns');
  assert(alphaGraph.split('\n')[1].length === alphaGraph.split('\n')[7].length, 'activity graph axis should match the data width');
  assert(alphaGraph.split('\n')[7].length === alphaGraph.split('\n')[8].length, 'activity graph labels should match the axis width');
}


function smokeAiToolEntryPointsPath() {
  if (!gitAvailable()) {
    console.log('smoke AI tool entry points skipped: git unavailable');
    return;
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-home-'));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteer-smoke-ai-entry-project-'));
  const repoPath = path.join(projectPath, 'frontend');
  const storageDir = path.join(home, '.repoteer', 'storage');

  initGitRepo(repoPath);
  fs.writeFileSync(path.join(repoPath, 'staged.js'), 'export const staged = 1;\n');
  fs.writeFileSync(path.join(repoPath, 'unstaged.js'), 'export const unstaged = 1;\n');
  commitAll(repoPath, 'seed AI entry points');
  fs.writeFileSync(path.join(repoPath, 'staged.js'), 'export const staged = 2;\n');
  runGit(['add', 'staged.js'], repoPath);
  fs.writeFileSync(path.join(repoPath, 'unstaged.js'), 'export const unstaged = 2;\n');
  fs.writeFileSync(path.join(repoPath, 'untracked.txt'), 'new untracked text\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'AI Entry Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const before = readGitState(repoPath);
  const aiGateway = new AiGateway({
    aiPromptManager: new AiPromptManager(new PromptsStore(storageDir)),
    aiDiffBuilder: new AiDiffBuilder(new Git()),
    clipboard: { copy() { return { ok: true, warning: null }; } },
    browserOpener: { open() { return { ok: true, warning: null }; } },
    localAiClient: { async sendChatCompletion() { return { ok: true, content: 'ok' }; } }
  });
  const payload = aiGateway.buildRepoPayload({
    repoPath,
    settings: { ai: { globalMaxPromptCharacters: 15000 } }
  });
  const result = runApp([
    '1',
    '1',
    'a',
    'b',
    'e',
    'b',
    'v',
    'g',
    'b',
    'e',
    'b',
    'b',
    'b',
    'b',
    'q'
  ].join('\n') + '\n', home);
  const after = readGitState(repoPath);

  assert(result.status === 0, result.stderr || 'AI tool entry points path failed');
  assert(result.stdout.includes('A. Commit review'), 'repo page should render commit review AI action');
  assert(result.stdout.includes('E. Security review'), 'repo or diff page should render security review AI action');
  assert(result.stdout.includes('G. Generate summary'), 'diff page should render diff summary AI action');
  assert(result.stdout.includes('AI: Commit review'), 'commit review action should open AI provider selection');
  assert(result.stdout.includes('AI: Diff summary'), 'diff summary action should open AI provider selection');
  assert(result.stdout.includes('AI: Security review'), 'security review action should open AI provider selection');
  assert(payload.payload.includes('[staged diff: staged.js]'), 'AI payload should include staged changes');
  assert(payload.payload.includes('[unstaged diff: unstaged.js]'), 'AI payload should include unstaged tracked changes');
  assert(payload.payload.includes('[untracked diff: untracked.txt]'), 'AI payload should include untracked text changes');
  assert(after.head === before.head, 'AI entry paths must not create commits');
  assert(after.status === before.status, 'AI entry paths must not change git status');
  assert(after.stagedDiff === before.stagedDiff, 'AI entry paths must not change staged diff');
  assert(after.unstagedDiff === before.unstagedDiff, 'AI entry paths must not change unstaged diff');
  assert(fs.readFileSync(path.join(repoPath, 'untracked.txt'), 'utf8') === 'new untracked text\n', 'AI entry paths must not modify untracked files');
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
  runGit(['checkout', '-b', 'feature'], repoPath);
  fs.writeFileSync(path.join(repoPath, 'test.js'), 'const value = 1;\nconst next = 2;\n');
  fs.writeFileSync(path.join(repoPath, 'new.js'), 'export const created = true;\n');

  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'projects.json'), JSON.stringify([
    { name: 'Hotfix Project', path: projectPath, shortcut: null }
  ], null, 2) + '\n');

  const result = runApp(['1', '1', 'f', 'c', '', 'b', 'b', 'q'].join('\n') + '\n', home);
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
  assert(result.stdout.includes('Title: hotfix(feature): 2 file(s)'), 'hotfix path should render generated title with current branch');
  assert(result.stdout.includes('Body: Auto hotfix commit'), 'hotfix path should render default body');
  assert(result.stdout.includes('Commit created.'), 'hotfix path should create commit after confirmation');
  assert(log.stdout.includes('hotfix(feature): 2 file(s)'), 'hotfix commit subject mismatch');
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

  const result = runApp(['1', '1', 'w', 'feature', '', 'b', 'b', 'q'].join('\n') + '\n', home);
  const current = git.getCurrentBranch(repoPath);

  assert(initialBranch.ok, initialBranch.warning || 'initial branch should be available');
  assert(result.status === 0, result.stderr || 'branch switch path failed');
  assert(result.stdout.includes('Branch: ' + initialBranch.branch), 'repo page should render active branch');
  assert(result.stdout.includes('W. Switch branch'), 'repo page should render switch branch action');
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

  const result = runApp(['1', '1', 'w', 'feature', 'no', '', 'b', 'b', 'b', 'q'].join('\n') + '\n', home);
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
smokeAiSettingsPersistencePath();
smokeAiPromptEditingPath();
smokeAiDiffBuilderPayloadPath();
smokeCommitSummaryExclusionSettingsPath();
smokeAiProviderSelectBrowserPath();
smokeAiProviderSelectWarningPath();
smokeAiProviderSelectSettingsPath();
smokeAiProviderSelectDeferredLimitPath();
smokeGeneratedCommitMessageParser();
smokeAiProviderSelectCommitMessagePath();
smokeAiLocalProviderSuccessPath();
smokeAiLocalProviderCancelPath();
smokeAiLocalProviderNon2xxPath();
smokeAiLocalProviderInvalidShapePath();
smokeAiLocalProviderConnectionFailurePath();
smokePipedMultiCharacterActionPath();
smokeProjectsPageRefreshPath();
smokeAddProjectPath();
smokeAddProjectCancelPath();
smokeProjectPageCopyProjectPathPath();
smokeProjectPageOpenFolderActionsPath();
smokeGitRepoDiscovery();
smokeProjectsPageHideCleanTogglePath();
smokeProjectsPageSortsByChangeVolumePath();
smokeProjectsPagePinPath();
smokeProjectsPageArchivePath();
smokeProjectsPageNumberSelectionPath();
smokeProjectPageHideReposWithoutLineChangesPath();
smokeProjectPageEditProjectPath();
smokeProjectPageDeleteProjectPath();
smokeProjectItemsPath();
await smokeProjectCommandRunTerminalModePath();
smokeScannerMissingProjectPath();
smokeDiffFormatting();
smokeDiffPagesUseNormalScroll();
smokeDiffPagesDoNotTruncateVisibleDiffs();
smokeDuplicateValidation();
smokeTableFormatting();
smokeBranchFormatting();
await smokeRouterTerminalModePath();
smokeCommitConfirmReturnPagePath();
smokeCommitConfirmAutoPushPath();
smokeRepoPageOpenAndDiffPath();
smokeRepoPageOpenFolderActionsPath();
smokeRepoPageUnpushedPushPath();
smokeRepoHistoryPath();
smokeProjectHistoryPath();
smokeProjectsHistoryPath();
smokeActivityGraphMainViewsPath();
smokeAiToolEntryPointsPath();
smokeRepoFilePagePath();
smokeRepoHotfixConfirmPath();
smokeBranchScannerPath();
smokeBranchDetachedScannerPath();
smokeBranchSwitchPath();
smokeDirtyBranchSwitchWarningPath();
smokeBranchNoColorPath();

console.log('smoke ok');
