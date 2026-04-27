import { validateProjectInput } from '../utils/validation.js';

export class ProjectManager {
  constructor(projectsStore) {
    this.projectsStore = projectsStore;
  }

  listProjects() {
    return this.projectsStore.list();
  }

  addProject(input) {
    const validation = validateProjectInput({
      ...input,
      projects: this.projectsStore.list()
    });

    if (!validation.ok) {
      return validation;
    }

    this.projectsStore.add(validation.project);

    return validation;
  }
}
