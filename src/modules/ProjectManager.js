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

  updateProject(originalName, input) {
    const projects = this.projectsStore.list();
    const validation = validateProjectInput({
      ...input,
      projects: projects.filter((project) => project.name !== originalName)
    });

    if (!validation.ok) {
      return validation;
    }

    const updated = this.projectsStore.updateByName(originalName, validation.project);

    if (!updated) {
      return { ok: false, error: 'Project not found.' };
    }

    return validation;
  }

  deleteProject(name) {
    const deleted = this.projectsStore.deleteByName(name);

    if (!deleted) {
      return { ok: false, error: 'Project not found.' };
    }

    return { ok: true };
  }
}
