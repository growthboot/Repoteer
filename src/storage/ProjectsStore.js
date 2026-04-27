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
}
