import path from 'path';
import { DEFAULT_PROMPTS } from '../data/defaultPrompts.js';
import { JsonFileStore } from './JsonFileStore.js';

export class PromptsStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'prompts.json'), DEFAULT_PROMPTS);
  }

  get() {
    const prompts = this.store.read();

    if (!prompts || typeof prompts !== 'object' || Array.isArray(prompts)) {
      throw new Error('prompts.json must contain an object.');
    }

    const next = {
      ...DEFAULT_PROMPTS,
      ...normalizePromptValues(prompts)
    };

    if (JSON.stringify(next) !== JSON.stringify(prompts)) {
      this.store.write(next);
    }

    return next;
  }

  getPrompt(promptId) {
    return this.get()[promptId] ?? DEFAULT_PROMPTS[promptId] ?? '';
  }

  setPrompt(promptId, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PROMPTS, promptId)) {
      return null;
    }

    const next = this.get();
    next[promptId] = String(value);
    this.store.write(next);

    return next[promptId];
  }

  resetPrompt(promptId) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PROMPTS, promptId)) {
      return null;
    }

    const next = this.get();
    next[promptId] = DEFAULT_PROMPTS[promptId];
    this.store.write(next);

    return next[promptId];
  }
}

function normalizePromptValues(prompts) {
  const normalized = {};

  Object.keys(prompts).forEach((promptId) => {
    normalized[promptId] = String(prompts[promptId] ?? '');
  });

  return normalized;
}
