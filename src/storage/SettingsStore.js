import path from 'path';
import { JsonFileStore } from './JsonFileStore.js';

const DEFAULT_SETTINGS = {
  color: true
};

export class SettingsStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'settings.json'), DEFAULT_SETTINGS);
  }

  get() {
    const settings = this.store.read();

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('settings.json must contain an object.');
    }

    return {
      ...DEFAULT_SETTINGS,
      ...settings
    };
  }

  setColor(enabled) {
    const next = {
      ...this.get(),
      color: enabled === true
    };

    this.store.write(next);

    return next;
  }
}
