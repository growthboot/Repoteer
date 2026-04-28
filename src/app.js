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
import { BranchPage } from './pages/BranchPage.js';
import { ProjectsStore } from './storage/ProjectsStore.js';
import { SettingsStore } from './storage/SettingsStore.js';
import { BookmarksStore } from './storage/BookmarksStore.js';
import { CommandsStore } from './storage/CommandsStore.js';
import { ProjectManager } from './modules/ProjectManager.js';
import { CommitManager } from './modules/CommitManager.js';
import { BranchManager } from './modules/BranchManager.js';
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
  const bookmarksStore = new BookmarksStore(paths.storageDir);
  const commandsStore = new CommandsStore(paths.storageDir);
  const settings = settingsStore.get();
  const projectManager = new ProjectManager(projectsStore);
  const git = new Git();
  const scanner = new Scanner(git);
  const commitManager = new CommitManager(git);
  const branchManager = new BranchManager(git);
  const clipboard = new Clipboard();
  const forceColorDisabled = argv.includes('--no-color');
  const color = createColor({
    enabled: settings.color !== false,
    forceDisabled: forceColorDisabled
  });

  const runtime = {
    paths,
    settings,
    settingsStore,
    projectsStore,
    bookmarksStore,
    commandsStore,
    projectManager,
    git,
    commitManager,
    branchManager,
    clipboard,
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
    aiProviderEdit: AiProviderEditPage
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
