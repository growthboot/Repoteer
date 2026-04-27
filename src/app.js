import { Router } from './router/Router.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { AddProjectPage } from './pages/AddProjectPage.js';
import { ProjectsStore } from './storage/ProjectsStore.js';
import { ProjectManager } from './modules/ProjectManager.js';
import { Git } from './modules/Git.js';
import { Scanner } from './modules/Scanner.js';
import { resolveRuntimePaths } from './config/paths.js';
import { closeInput } from './utils/input.js';

export async function main() {
  const paths = resolveRuntimePaths();
  const projectsStore = new ProjectsStore(paths.storageDir);
  const projectManager = new ProjectManager(projectsStore);
  const git = new Git();
  const scanner = new Scanner(git);

  const runtime = {
    paths,
    projectsStore,
    projectManager,
    git,
    scanner,
    snapshot: { projects: [] },
    refreshSnapshot() {
      this.snapshot = this.scanner.scanProjects(this.projectManager.listProjects());
      return this.snapshot;
    }
  };

  runtime.refreshSnapshot();

  const router = new Router(runtime, {
    projects: ProjectsPage,
    addProject: AddProjectPage
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
