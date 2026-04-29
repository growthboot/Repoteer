import { validateProjectInput } from '../utils/validation.js';

export class ProjectManager {
  constructor(projectsStore) {
    this.projectsStore = projectsStore;
  }

  listProjects() {
    return this.projectsStore.list();
  }

  listActiveProjects() {
    return this.projectsStore.list().filter((project) => project.archived !== true);
  }

  listArchivedProjects() {
    return this.projectsStore.list().filter((project) => project.archived === true);
  }

  addProject(input) {
    const validation = validateProjectInput({
      ...input,
      projects: this.projectsStore.list()
    });

    if (!validation.ok) {
      return validation;
    }

    const project = {
      ...validation.project,
      pinned: false,
      archived: false
    };

    this.projectsStore.add(project);

    return {
      ...validation,
      project
    };
  }

  updateProject(originalName, input) {
    const projects = this.projectsStore.list();
    const existingProject = projects.find((project) => project.name === originalName) ?? null;
    const validation = validateProjectInput({
      ...input,
      projects: projects.filter((project) => project.name !== originalName)
    });

    if (!validation.ok) {
      return validation;
    }

    if (!existingProject) {
      return { ok: false, error: 'Project not found.' };
    }

    const nextProject = {
      ...validation.project,
      pinned: existingProject.pinned === true,
      archived: existingProject.archived === true
    };
    const updated = this.projectsStore.updateByName(originalName, nextProject);

    if (!updated) {
      return { ok: false, error: 'Project not found.' };
    }

    return {
      ...validation,
      project: nextProject
    };
  }

  deleteProject(name) {
    const deleted = this.projectsStore.deleteByName(name);

    if (!deleted) {
      return { ok: false, error: 'Project not found.' };
    }

    return { ok: true };
  }

  setProjectPinned(name, pinned) {
    const project = this.projectsStore.list().find((candidate) => candidate.name === name) ?? null;

    if (!project) {
      return { ok: false, error: 'Project not found.' };
    }

    const nextProject = {
      ...project,
      pinned: pinned === true
    };

    this.projectsStore.updateByName(name, nextProject);

    return { ok: true, project: nextProject };
  }

  archiveProject(name) {
    const project = this.projectsStore.list().find((candidate) => candidate.name === name) ?? null;

    if (!project) {
      return { ok: false, error: 'Project not found.' };
    }

    const nextProject = {
      ...project,
      pinned: false,
      archived: true
    };

    this.projectsStore.updateByName(name, nextProject);

    return { ok: true, project: nextProject };
  }

  unarchiveProject(name) {
    const project = this.projectsStore.list().find((candidate) => candidate.name === name) ?? null;

    if (!project) {
      return { ok: false, error: 'Project not found.' };
    }

    const nextProject = {
      ...project,
      archived: false
    };

    this.projectsStore.updateByName(name, nextProject);

    return { ok: true, project: nextProject };
  }
}
