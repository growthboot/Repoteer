import path from 'path';
import { JsonFileStore } from './JsonFileStore.js';

export class BookmarksStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'bookmarks.json'), []);
  }

  list() {
    const bookmarks = this.store.read();

    if (!Array.isArray(bookmarks)) {
      throw new Error('bookmarks.json must contain an array.');
    }

    return bookmarks;
  }

  listForProject(projectName) {
    return this.list().filter((bookmark) => bookmark.projectName === projectName);
  }

  add(projectName, input) {
    const bookmarks = this.list();
    const bookmark = {
      projectName,
      title: input.title.trim(),
      target: input.target.trim(),
      notes: input.notes.trim()
    };

    bookmarks.push(bookmark);
    this.store.write(bookmarks);

    return bookmark;
  }

  updateForProjectByIndex(projectName, index, input) {
    const bookmarks = this.list();
    const projectIndexes = this.indexesForProject(bookmarks, projectName);
    const storeIndex = projectIndexes[index];

    if (storeIndex === undefined) {
      return null;
    }

    bookmarks[storeIndex] = {
      projectName,
      title: input.title.trim(),
      target: input.target.trim(),
      notes: input.notes.trim()
    };

    this.store.write(bookmarks);

    return bookmarks[storeIndex];
  }

  deleteForProjectByIndex(projectName, index) {
    const bookmarks = this.list();
    const projectIndexes = this.indexesForProject(bookmarks, projectName);
    const storeIndex = projectIndexes[index];

    if (storeIndex === undefined) {
      return false;
    }

    bookmarks.splice(storeIndex, 1);
    this.store.write(bookmarks);

    return true;
  }

  renameProject(originalName, nextName) {
    const bookmarks = this.list();
    const nextBookmarks = bookmarks.map((bookmark) => {
      if (bookmark.projectName !== originalName) {
        return bookmark;
      }

      return {
        ...bookmark,
        projectName: nextName
      };
    });

    this.store.write(nextBookmarks);
  }

  deleteProject(projectName) {
    const bookmarks = this.list();
    const nextBookmarks = bookmarks.filter((bookmark) => bookmark.projectName !== projectName);

    this.store.write(nextBookmarks);
  }

  indexesForProject(bookmarks, projectName) {
    const indexes = [];

    bookmarks.forEach((bookmark, index) => {
      if (bookmark.projectName === projectName) {
        indexes.push(index);
      }
    });

    return indexes;
  }
}
