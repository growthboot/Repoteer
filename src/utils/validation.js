import fs from 'fs';
import path from 'path';

const RESERVED_SHORTCUTS = new Set(['a', 'b', 'd', 'q', 'r', 's', 't', 'v']);

export function validateProjectInput(input) {
  const name = input.name.trim();
  const projectPath = input.path.trim();
  const shortcut = input.shortcut.trim().toLowerCase();

  if (!name) {
    return { ok: false, error: 'Project name is required.' };
  }

  if (input.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'Project name already exists.' };
  }

  if (!path.isAbsolute(projectPath)) {
    return { ok: false, error: 'Project path must be absolute.' };
  }

  if (!fs.existsSync(projectPath)) {
    return { ok: false, error: 'Project path must exist.' };
  }

  if (shortcut && !/^[a-z]$/.test(shortcut)) {
    return { ok: false, error: 'Shortcut must be a single letter.' };
  }

  if (shortcut && RESERVED_SHORTCUTS.has(shortcut)) {
    return { ok: false, error: 'Shortcut conflicts with navigation.' };
  }

  if (shortcut && input.projects.some((project) => project.shortcut === shortcut)) {
    return { ok: false, error: 'Shortcut already exists.' };
  }

  return {
    ok: true,
    project: {
      name,
      path: projectPath,
      shortcut: shortcut || null
    }
  };
}
