export function normalizeRelativePath(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/');
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) {
    return null;
  }

  const withoutPrefix = raw.replace(/^(\.\/)+/, '');
  const parts = [];

  for (const part of withoutPrefix.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      return null;
    }

    parts.push(part);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join('/');
}

export function normalizeRelativePathList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const path = normalizeRelativePath(value);

    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    normalized.push(path);
  }

  return normalized;
}

export function pathMatchesRelativeFilter(file, filter) {
  const normalizedFile = normalizeRelativePath(file);
  const normalizedFilter = normalizeRelativePath(filter);

  if (!normalizedFile || !normalizedFilter) {
    return false;
  }

  return normalizedFile === normalizedFilter || normalizedFile.startsWith(normalizedFilter + '/');
}

export function pathMatchesAnyRelativeFilter(file, filters) {
  return normalizeRelativePathList(filters).some((filter) => pathMatchesRelativeFilter(file, filter));
}
