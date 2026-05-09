import path from 'path';
import { JsonFileStore } from './JsonFileStore.js';
import {
  DEFAULT_AI_GLOBAL_MAX_PROMPT_CHARACTERS,
  DEFAULT_AI_PROVIDERS,
  DEFAULT_SETTINGS
} from '../data/defaultSettings.js';
import { normalizeRelativePath, normalizeRelativePathList } from '../utils/pathFilters.js';

export class SettingsStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'settings.json'), DEFAULT_SETTINGS);
  }

  get() {
    const settings = this.store.read();

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('settings.json must contain an object.');
    }

    const next = normalizeSettings(settings);

    if (JSON.stringify(next) !== JSON.stringify(settings)) {
      this.store.write(next);
    }

    return next;
  }

  setColor(enabled) {
    const next = {
      ...this.get(),
      color: enabled === true
    };

    this.store.write(next);

    return next;
  }

  setAlternateScreen(enabled) {
    const next = {
      ...this.get(),
      alternateScreen: enabled === true
    };

    this.store.write(next);

    return next;
  }

  setAiGlobalMaxPromptCharacters(value) {
    const next = this.get();
    next.ai.globalMaxPromptCharacters = normalizePositiveInteger(value, DEFAULT_AI_GLOBAL_MAX_PROMPT_CHARACTERS);
    this.store.write(next);

    return next;
  }

  addAiBrowserProvider(input) {
    const next = this.get();
    const provider = normalizeProvider({
      id: createProviderId('browser'),
      type: 'browser',
      title: input.title,
      enabled: true,
      priority: input.priority,
      url: input.url,
      maxPromptCharacters: input.maxPromptCharacters
    }, next.ai.globalMaxPromptCharacters);

    next.ai.providers.push(provider);
    this.store.write(next);

    return provider;
  }

  addAiLocalProvider(input) {
    const next = this.get();
    const provider = normalizeProvider({
      id: createProviderId('local'),
      type: 'local',
      title: input.title,
      enabled: false,
      priority: input.priority,
      endpointUrl: input.endpointUrl,
      requestFormat: 'openai-compatible-chat',
      model: input.model,
      maxPromptCharacters: input.maxPromptCharacters
    }, next.ai.globalMaxPromptCharacters);

    next.ai.providers.push(provider);
    this.store.write(next);

    return provider;
  }

  updateAiProvider(id, updates) {
    const next = this.get();
    const index = next.ai.providers.findIndex((provider) => provider.id === id);

    if (index === -1) {
      return null;
    }

    const current = next.ai.providers[index];
    next.ai.providers[index] = normalizeProvider({
      ...current,
      ...updates,
      id: current.id,
      type: current.type,
      requestFormat: current.requestFormat
    }, next.ai.globalMaxPromptCharacters);
    this.store.write(next);

    return next.ai.providers[index];
  }

  listCommitSummaryExcludedPaths(repoPath) {
    const key = normalizeRepoPathKey(repoPath);

    if (!key) {
      return [];
    }

    return this.get().ai.commitSummaryExcludedPathsByRepo[key] ?? [];
  }

  addCommitSummaryExcludedPath(repoPath, relativePath) {
    const key = normalizeRepoPathKey(repoPath);
    const normalizedPath = normalizeRelativePath(relativePath);

    if (!key || !normalizedPath) {
      return null;
    }

    const next = this.get();
    const current = next.ai.commitSummaryExcludedPathsByRepo[key] ?? [];

    if (!current.includes(normalizedPath)) {
      next.ai.commitSummaryExcludedPathsByRepo[key] = [...current, normalizedPath];
      this.store.write(next);
    }

    return normalizedPath;
  }

  updateCommitSummaryExcludedPath(repoPath, index, relativePath) {
    const key = normalizeRepoPathKey(repoPath);
    const normalizedPath = normalizeRelativePath(relativePath);

    if (!key || !normalizedPath) {
      return null;
    }

    const next = this.get();
    const current = next.ai.commitSummaryExcludedPathsByRepo[key] ?? [];

    if (index < 0 || index >= current.length) {
      return null;
    }

    const updated = [...current];
    updated[index] = normalizedPath;
    next.ai.commitSummaryExcludedPathsByRepo[key] = normalizeRelativePathList(updated);
    this.store.write(next);

    return normalizedPath;
  }

  deleteCommitSummaryExcludedPath(repoPath, index) {
    const key = normalizeRepoPathKey(repoPath);

    if (!key) {
      return false;
    }

    const next = this.get();
    const current = next.ai.commitSummaryExcludedPathsByRepo[key] ?? [];

    if (index < 0 || index >= current.length) {
      return false;
    }

    next.ai.commitSummaryExcludedPathsByRepo[key] = current.filter((_, itemIndex) => itemIndex !== index);
    this.store.write(next);

    return true;
  }

  clearCommitSummaryExcludedPaths(repoPath) {
    const key = normalizeRepoPathKey(repoPath);

    if (!key) {
      return false;
    }

    const next = this.get();
    next.ai.commitSummaryExcludedPathsByRepo[key] = [];
    this.store.write(next);

    return true;
  }
}

function normalizeSettings(settings) {
  return {
    ...settings,
    color: settings.color !== false,
    alternateScreen: settings.alternateScreen !== false,
    ai: normalizeAiSettings(settings.ai)
  };
}

function normalizeAiSettings(ai) {
  const source = ai && typeof ai === 'object' && !Array.isArray(ai) ? ai : {};
  const globalMaxPromptCharacters = normalizePositiveInteger(
    source.globalMaxPromptCharacters,
    DEFAULT_AI_GLOBAL_MAX_PROMPT_CHARACTERS
  );
  const sourceProviders = Array.isArray(source.providers) ? source.providers : [];
  const providers = [];

  DEFAULT_AI_PROVIDERS.forEach((defaultProvider) => {
    const stored = sourceProviders.find((provider) => provider && provider.id === defaultProvider.id);
    providers.push(normalizeProvider({
      ...defaultProvider,
      ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}),
      id: defaultProvider.id,
      type: defaultProvider.type,
      requestFormat: defaultProvider.requestFormat
    }, globalMaxPromptCharacters));
  });

  sourceProviders.forEach((provider) => {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
      return;
    }

    if (DEFAULT_AI_PROVIDERS.some((defaultProvider) => defaultProvider.id === provider.id)) {
      return;
    }

    providers.push(normalizeProvider(provider, globalMaxPromptCharacters));
  });

  return {
    globalMaxPromptCharacters,
    providers,
    commitSummaryExcludedPathsByRepo: normalizeCommitSummaryExcludedPathsByRepo(
      source.commitSummaryExcludedPathsByRepo
    )
  };
}

function normalizeCommitSummaryExcludedPathsByRepo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const next = {};

  Object.entries(value).forEach(([repoPath, paths]) => {
    const key = normalizeRepoPathKey(repoPath);
    const normalizedPaths = normalizeRelativePathList(paths);

    if (key && normalizedPaths.length > 0) {
      next[key] = normalizedPaths;
    }
  });

  return next;
}

function normalizeProvider(provider, globalMaxPromptCharacters) {
  const type = provider.type === 'local' ? 'local' : 'browser';
  const normalized = {
    id: String(provider.id || createProviderId(type)),
    type,
    title: String(provider.title || (type === 'local' ? 'Local model' : 'Browser chat')).trim(),
    enabled: provider.enabled === true,
    priority: normalizeInteger(provider.priority, 100),
    maxPromptCharacters: normalizePositiveInteger(provider.maxPromptCharacters, globalMaxPromptCharacters)
  };

  if (type === 'local') {
    return {
      ...normalized,
      endpointUrl: String(provider.endpointUrl || '').trim(),
      requestFormat: 'openai-compatible-chat',
      model: String(provider.model || '').trim()
    };
  }

  return {
    ...normalized,
    url: String(provider.url || '').trim()
  };
}

function normalizePositiveInteger(value, fallback) {
  const parsed = normalizeInteger(value, fallback);

  return parsed > 0 ? parsed : fallback;
}

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function createProviderId(type) {
  return type + '-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
}

function normalizeRepoPathKey(repoPath) {
  return String(repoPath ?? '').trim();
}
