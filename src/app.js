import { Router } from './router/Router.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { AddProjectPage } from './pages/AddProjectPage.js';
import { ProjectPage } from './pages/ProjectPage.js';
import { RepoPage } from './pages/RepoPage.js';
import { DiffPage } from './pages/DiffPage.js';
import { FilePage } from './pages/FilePage.js';
import { CommitConfirmPage } from './pages/CommitConfirmPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AiSettingsPage } from './pages/AiSettingsPage.js';
import { AiProviderEditPage } from './pages/AiProviderEditPage.js';
import { AiProviderSelectPage } from './pages/AiProviderSelectPage.js';
import { AiPromptEditPage } from './pages/AiPromptEditPage.js';
import { AiResultPage } from './pages/AiResultPage.js';
import { BranchPage } from './pages/BranchPage.js';
import { ProjectsStore } from './storage/ProjectsStore.js';
import { SettingsStore } from './storage/SettingsStore.js';
import { PromptsStore } from './storage/PromptsStore.js';
import { BookmarksStore } from './storage/BookmarksStore.js';
import { CommandsStore } from './storage/CommandsStore.js';
import { ProjectManager } from './modules/ProjectManager.js';
import { CommitManager } from './modules/CommitManager.js';
import { BranchManager } from './modules/BranchManager.js';
import { AiPromptManager } from './modules/AiPromptManager.js';
import { AiDiffBuilder } from './modules/AiDiffBuilder.js';
import { AiGateway } from './modules/AiGateway.js';
import { BrowserOpener } from './modules/BrowserOpener.js';
import { LocalAiClient } from './modules/LocalAiClient.js';
import { Clipboard } from './modules/Clipboard.js';
import { Git } from './modules/Git.js';
import { Scanner } from './modules/Scanner.js';
import { resolveRuntimePaths } from './config/paths.js';
import { createColor } from './utils/color.js';
import { closeInput } from './utils/input.js';

export async function main(argv = process.argv.slice(2)) {
  const paths = resolveRuntimePaths();
  const projectsStore = new ProjectsStore(paths.storageDir);
  const settingsStore = new SettingsStore(paths.storageDir);
  const promptsStore = new PromptsStore(paths.storageDir);
  const bookmarksStore = new BookmarksStore(paths.storageDir);
  const commandsStore = new CommandsStore(paths.storageDir);
  const settings = settingsStore.get();
  const projectManager = new ProjectManager(projectsStore);
  const git = new Git();
  const scanner = new Scanner(git);
  const commitManager = new CommitManager(git);
  const branchManager = new BranchManager(git);
  const aiPromptManager = new AiPromptManager(promptsStore);
  const aiDiffBuilder = new AiDiffBuilder(git);
  const clipboard = new Clipboard();
  const browserOpener = new BrowserOpener();
  const localAiClient = new LocalAiClient();
  const aiGateway = new AiGateway({ aiPromptManager, aiDiffBuilder, clipboard, browserOpener, localAiClient });
  const forceColorDisabled = argv.includes('--no-color');
  const color = createColor({
    enabled: settings.color !== false,
    forceDisabled: forceColorDisabled
  });

  const runtime = {
    paths,
    settings,
    settingsStore,
    promptsStore,
    projectsStore,
    bookmarksStore,
    commandsStore,
    projectManager,
    git,
    commitManager,
    branchManager,
    aiPromptManager,
    aiDiffBuilder,
    aiGateway,
    clipboard,
    browserOpener,
    localAiClient,
    scanner,
    color,
    projectsPageHideClean: false,
    snapshot: { projects: [] },
    refreshSnapshot() {
      this.snapshot = this.scanner.scanProjects(this.projectManager.listProjects());
      return this.snapshot;
    },
    refreshColor() {
      this.color = createColor({
        enabled: this.settings.color !== false,
        forceDisabled: forceColorDisabled
      });
      return this.color;
    }
  };

  runtime.refreshSnapshot();

  const router = new Router(runtime, {
    projects: ProjectsPage,
    addProject: AddProjectPage,
    project: ProjectPage,
    repo: RepoPage,
    diff: DiffPage,
    file: FilePage,
    commitConfirm: CommitConfirmPage,
    branch: BranchPage,
    settings: SettingsPage,
    aiSettings: AiSettingsPage,
    aiProviderEdit: AiProviderEditPage,
    aiProviderSelect: AiProviderSelectPage,
    aiPromptEdit: AiPromptEditPage,
    aiResult: AiResultPage
  });

  await router.open('projects');
}

if (import.meta.url === 'file://' + process.argv[1]) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => {
      closeInput();
    });
}
