import path from 'path';
import { JsonFileStore } from './JsonFileStore.js';

export class ProjectsStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'projects.json'), []);
  }

  list() {
    const projects = this.store.read();

    if (!Array.isArray(projects)) {
      throw new Error('projects.json must contain an array.');
    }

    return projects;
  }

  add(project) {
    const projects = this.list();
    projects.push(project);
    this.store.write(projects);
  }

  updateByName(name, nextProject) {
    const projects = this.list();
    const index = projects.findIndex((project) => project.name === name);

    if (index === -1) {
      return false;
    }

    projects[index] = nextProject;
    this.store.write(projects);

    return true;
  }

  deleteByName(name) {
    const projects = this.list();
    const nextProjects = projects.filter((project) => project.name !== name);

    if (nextProjects.length === projects.length) {
      return false;
    }

    this.store.write(nextProjects);

    return true;
  }
}
