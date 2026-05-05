import path from 'path';
import { JsonFileStore } from './JsonFileStore.js';

export class ClipboardItemsStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'clipboard.json'), []);
  }

  list() {
    const items = this.store.read();

    if (!Array.isArray(items)) {
      throw new Error('clipboard.json must contain an array.');
    }

    return items;
  }

  listForProject(projectName) {
    return this.list().filter((item) => item.projectName === projectName);
  }

  add(projectName, input) {
    const items = this.list();
    const item = {
      projectName,
      title: input.title.trim(),
      text: input.text,
      notes: input.notes.trim()
    };

    items.push(item);
    this.store.write(items);

    return item;
  }

  updateForProjectByIndex(projectName, index, input) {
    const items = this.list();
    const projectIndexes = this.indexesForProject(items, projectName);
    const storeIndex = projectIndexes[index];

    if (storeIndex === undefined) {
      return null;
    }

    items[storeIndex] = {
      projectName,
      title: input.title.trim(),
      text: input.text,
      notes: input.notes.trim()
    };

    this.store.write(items);

    return items[storeIndex];
  }

  deleteForProjectByIndex(projectName, index) {
    const items = this.list();
    const projectIndexes = this.indexesForProject(items, projectName);
    const storeIndex = projectIndexes[index];

    if (storeIndex === undefined) {
      return false;
    }

    items.splice(storeIndex, 1);
    this.store.write(items);

    return true;
  }

  renameProject(originalName, nextName) {
    const items = this.list();
    const nextItems = items.map((item) => {
      if (item.projectName !== originalName) {
        return item;
      }

      return {
        ...item,
        projectName: nextName
      };
    });

    this.store.write(nextItems);
  }

  deleteProject(projectName) {
    const items = this.list();
    const nextItems = items.filter((item) => item.projectName !== projectName);

    this.store.write(nextItems);
  }

  indexesForProject(items, projectName) {
    const indexes = [];

    items.forEach((item, index) => {
      if (item.projectName === projectName) {
        indexes.push(index);
      }
    });

    return indexes;
  }
}
