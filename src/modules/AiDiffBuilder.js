import fs from 'fs';
import path from 'path';

const TRUNCATION_MARKER = '...TRUNCATED_DIFF_DATA...';
const DEFAULT_MAX_PROMPT_CHARACTERS = 15000;
const RECENT_COMMIT_LOG_LIMIT = 8;
const SAMPLE_BYTES = 262144;
const MEDIA_EXTENSIONS = new Set(
  '.3gp .aif .aiff .avi .bmp .flac .gif .heic .ico .jpeg .jpg .m4a .m4v .mov .mp3 .mp4 .ogg .otf .pdf .png .psd .svg .svgz .ttf .wav .webm .webp .woff .woff2'.split(' ')
);

export class AiDiffBuilder {
  constructor(git) {
    this.git = git;
  }

  build(repoPath, options = {}) {
    const maxPromptCharacters = normalizeMaxPromptCharacters(options.maxPromptCharacters);
    const applyMaxPromptCharacters = options.applyMaxPromptCharacters !== false;
    const recentCommitLogs = options.includeRecentCommitLogs === true
      ? this.getRecentCommitLogs(repoPath, RECENT_COMMIT_LOG_LIMIT)
      : null;
    const staged = this.listChangedFiles(repoPath, ['diff', '--cached', '--name-only', '--no-ext-diff']);
    const unstaged = this.listChangedFiles(repoPath, ['diff', '--name-only', '--no-ext-diff']);
    const untracked = this.listChangedFiles(repoPath, ['ls-files', '--others', '--exclude-standard']);

    for (const result of [staged, unstaged, untracked]) {
      if (!result.ok) {
        return {
          ok: false,
          status: 'warning',
          payload: '',
          size: 0,
          maxPromptCharacters: applyMaxPromptCharacters ? maxPromptCharacters : null,
          promptLimitPending: !applyMaxPromptCharacters,
          truncated: false,
          omittedFiles: [],
          includedFiles: [],
          inputSummary: 'staged, unstaged tracked, and untracked text changes',
          warnings: [result.warning]
        };
      }
    }

    const parts = [];

    for (const file of staged.files) {
      parts.push(this.buildTrackedPart(repoPath, file, 'staged'));
    }

    for (const file of unstaged.files) {
      parts.push(this.buildTrackedPart(repoPath, file, 'unstaged'));
    }

    for (const file of untracked.files) {
      parts.push(this.buildUntrackedPart(repoPath, file));
    }

    const includedFiles = parts
      .filter((part) => part.kind === 'diff')
      .map((part) => ({
        file: part.file,
        source: part.source
      }));
    const omittedFiles = parts
      .filter((part) => part.kind === 'omission')
      .map((part) => ({
        file: part.file,
        reason: part.reason,
        message: part.message
      }));
    const initialPayload = this.renderPayload(parts, {
      maxPromptCharacters: applyMaxPromptCharacters ? maxPromptCharacters : null,
      promptLimitPending: !applyMaxPromptCharacters,
      truncated: false,
      omittedFiles,
      promptOmittedFiles: [],
      recentCommitLogs
    });
    const truncatedResult = applyMaxPromptCharacters
      ? this.truncatePayload(parts, initialPayload, maxPromptCharacters, omittedFiles, recentCommitLogs)
      : {
          payload: initialPayload,
          truncated: false,
          promptOmittedFiles: []
        };
    const warnings = [];
    const truncationSummary = truncatedResult.truncated
      ? buildTruncationSummary(initialPayload.length, truncatedResult.payload.length)
      : null;

    if (omittedFiles.length > 0) {
      warnings.push('Some files were omitted from the AI diff payload.');
    }

    if (truncatedResult.truncated) {
      warnings.push(formatTruncationWarning(truncationSummary));
    }

    if (recentCommitLogs && !recentCommitLogs.ok) {
      warnings.push(recentCommitLogs.warning);
    }

    return {
      ok: true,
      status: warnings.length > 0 ? 'warning' : 'success',
      payload: truncatedResult.payload,
      size: truncatedResult.payload.length,
      maxPromptCharacters: applyMaxPromptCharacters ? maxPromptCharacters : null,
      promptLimitPending: !applyMaxPromptCharacters,
      truncated: truncatedResult.truncated,
      truncationSummary,
      omittedFiles: [...omittedFiles, ...truncatedResult.promptOmittedFiles],
      includedFiles,
      inputSummary: 'staged, unstaged tracked, and untracked text changes',
      warnings
    };
  }

  listChangedFiles(repoPath, args) {
    const result = this.git.run(['-C', repoPath, ...args]);

    if (!result.ok) {
      return {
        ok: false,
        files: [],
        warning: result.stderr || 'Git changed file listing failed.'
      };
    }

    return {
      ok: true,
      files: this.git.parseLines(result.stdout),
      warning: null
    };
  }

  getRecentCommitLogs(repoPath, limit) {
    const result = this.git.run([
      '-C',
      repoPath,
      'log',
      '--max-count=' + String(limit),
      '--format=%x1f%s%x1f%b%x1e'
    ]);

    if (!result.ok) {
      return {
        ok: false,
        logs: [],
        warning: result.stderr || 'Recent commit messages were not available.'
      };
    }

    return {
      ok: true,
      logs: parseRecentCommitLogs(result.stdout),
      warning: null
    };
  }

  buildTrackedPart(repoPath, file, source) {
    const mediaReason = getMediaReason(file);

    if (mediaReason) {
      return this.omit(file, source, mediaReason);
    }

    const binary = this.getNumstatBinaryState(repoPath, file, source);

    if (!binary.ok) {
      return this.omit(file, source, 'unreadable');
    }

    if (binary.binary) {
      return this.omit(file, source, 'non-text');
    }

    const diff = this.getTrackedDiff(repoPath, file, source);

    if (!diff.ok) {
      return this.omit(file, source, 'unreadable');
    }

    const content = this.readTrackedContent(repoPath, file, source);
    const classification = classifyTextLikeContent(content.content ?? diff.diff, file);

    if (!classification.textLike) {
      return this.omit(file, source, classification.reason);
    }

    if (!diff.diff) {
      return this.omit(file, source, 'empty');
    }

    return {
      kind: 'diff',
      source,
      file,
      content: diff.diff
    };
  }

  buildUntrackedPart(repoPath, file) {
    const mediaReason = getMediaReason(file);

    if (mediaReason) {
      return this.omit(file, 'untracked', mediaReason);
    }

    const read = readWorkingFile(path.join(repoPath, file));

    if (!read.ok) {
      return this.omit(file, 'untracked', 'unreadable');
    }

    const classification = classifyBuffer(read.buffer, file);

    if (!classification.textLike) {
      return this.omit(file, 'untracked', classification.reason);
    }

    return {
      kind: 'diff',
      source: 'untracked',
      file,
      content: buildUntrackedTextDiff(file, read.buffer.toString('utf8'))
    };
  }

  getNumstatBinaryState(repoPath, file, source) {
    const args = source === 'staged'
      ? ['-C', repoPath, 'diff', '--cached', '--numstat', '--no-ext-diff', '--', file]
      : ['-C', repoPath, 'diff', '--numstat', '--no-ext-diff', '--', file];
    const result = this.git.run(args);

    if (!result.ok) {
      return {
        ok: false,
        binary: false
      };
    }

    const binary = this.git.parseLines(result.stdout).some((line) => line.startsWith('-\t-'));

    return {
      ok: true,
      binary
    };
  }

  getTrackedDiff(repoPath, file, source) {
    const args = source === 'staged'
      ? ['-C', repoPath, 'diff', '--cached', '--no-ext-diff', '--', file]
      : ['-C', repoPath, 'diff', '--no-ext-diff', '--', file];
    const result = this.git.run(args);

    return {
      ok: result.ok,
      diff: result.ok ? result.stdout : '',
      warning: result.ok ? null : result.stderr || 'Git tracked diff failed.'
    };
  }

  readTrackedContent(repoPath, file, source) {
    if (source === 'staged') {
      const result = this.git.run(['-C', repoPath, 'show', ':' + file]);

      return {
        ok: result.ok,
        content: result.ok ? result.stdout : null
      };
    }

    const read = readWorkingFile(path.join(repoPath, file));

    return {
      ok: read.ok,
      content: read.ok ? read.buffer.toString('utf8') : null
    };
  }

  renderPayload(parts, state) {
    const lines = [
      'AI-ready Git diff payload',
      'Diff input: staged changes, unstaged tracked changes, and untracked text-like files.',
      'Max user payload characters: ' + formatMaxPromptCharacters(state),
      'Payload status: ' + (state.truncated ? 'truncated' : 'complete')
    ];

    if (state.recentCommitLogs) {
      lines.push('', 'Recent commit messages (last ' + String(RECENT_COMMIT_LOG_LIMIT) + '):');

      if (!state.recentCommitLogs.ok) {
        lines.push('Not available.');
      } else if (state.recentCommitLogs.logs.length === 0) {
        lines.push('No commits found.');
      } else {
        state.recentCommitLogs.logs.forEach((log, index) => {
          lines.push(String(index + 1) + '. Title: ' + log.title);

          if (log.body) {
            lines.push('   Body:');

            for (const line of log.body.split('\n')) {
              lines.push('   ' + line);
            }
          } else {
            lines.push('   Body: (empty)');
          }
        });
      }
    }

    if (state.omittedFiles.length > 0 || state.promptOmittedFiles.length > 0) {
      lines.push('', 'Omitted files:');

      for (const omitted of [...state.omittedFiles, ...state.promptOmittedFiles]) {
        lines.push(omitted.message);
      }
    }

    const diffParts = parts.filter((part) => part.kind === 'diff');

    lines.push('', 'Diffs:');

    if (diffParts.length === 0) {
      lines.push('No included text diff content.');
    } else {
      for (const part of diffParts) {
        lines.push('', '[' + part.source + ' diff: ' + part.file + ']', part.content);
      }
    }

    return lines.join('\n');
  }

  truncatePayload(parts, payload, maxPromptCharacters, omittedFiles, recentCommitLogs) {
    if (payload.length <= maxPromptCharacters) {
      return {
        payload,
        truncated: false,
        promptOmittedFiles: []
      };
    }

    const promptOmittedFiles = [];
    const diffParts = parts.filter((part) => part.kind === 'diff');
    const keptParts = [];
    let payloadSoFar = this.renderPayload([], {
      maxPromptCharacters,
      truncated: true,
      omittedFiles,
      promptOmittedFiles,
      recentCommitLogs
    });

    for (const part of diffParts) {
      const blockHeader = '[' + part.source + ' diff: ' + part.file + ']';
      const blockPrefix = (keptParts.length === 0 && payloadSoFar.endsWith('No included text diff content.'))
        ? '\n\n' + blockHeader + '\n'
        : '\n\n' + blockHeader + '\n';
      const remaining = maxPromptCharacters - payloadSoFar.length - blockPrefix.length;

      if (remaining <= minimumTruncatedBlockLength()) {
        promptOmittedFiles.push({
          file: part.file,
          reason: 'prompt-size',
          message: '[Omitted due to prompt size: ' + part.file + ']'
        });
        continue;
      }

      const content = truncateDiffContent(part.content, remaining);
      keptParts.push({
        ...part,
        content
      });
      payloadSoFar = this.renderPayload(keptParts, {
        maxPromptCharacters,
        truncated: true,
        omittedFiles,
        promptOmittedFiles,
        recentCommitLogs
      });

      if (payloadSoFar.length > maxPromptCharacters) {
        keptParts[keptParts.length - 1] = {
          ...part,
          content: truncateDiffContent(part.content, Math.max(0, remaining - (payloadSoFar.length - maxPromptCharacters)))
        };
        payloadSoFar = this.renderPayload(keptParts, {
          maxPromptCharacters,
          truncated: true,
          omittedFiles,
          promptOmittedFiles,
          recentCommitLogs
        });
      }
    }

    let nextPayload = this.renderPayload(keptParts, {
      maxPromptCharacters,
      truncated: true,
      omittedFiles,
      promptOmittedFiles,
      recentCommitLogs
    });

    if (nextPayload.length > maxPromptCharacters) {
      nextPayload = hardLimitPayload(nextPayload, maxPromptCharacters);
    }

    return {
      payload: nextPayload,
      truncated: true,
      promptOmittedFiles
    };
  }

  omit(file, source, reason) {
    return {
      kind: 'omission',
      source,
      file,
      reason,
      message: buildOmissionMessage(file, reason)
    };
  }
}

function normalizeMaxPromptCharacters(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_MAX_PROMPT_CHARACTERS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PROMPT_CHARACTERS;
}

function formatMaxPromptCharacters(state) {
  const maxPromptCharacters = Number(state.maxPromptCharacters);

  if (state.promptLimitPending || !Number.isFinite(maxPromptCharacters) || maxPromptCharacters <= 0) {
    return 'provider-specific, applied after provider selection';
  }

  return String(maxPromptCharacters);
}

function buildTruncationSummary(originalCharacters, finalCharacters) {
  const original = Math.max(0, Number(originalCharacters) || 0);
  const final = Math.max(0, Number(finalCharacters) || 0);
  const removed = Math.max(0, original - final);
  const removedPercent = original > 0 ? (removed / original) * 100 : 0;

  return {
    originalCharacters: original,
    finalCharacters: final,
    removedCharacters: removed,
    removedPercent
  };
}

function formatTruncationWarning(summary) {
  if (!summary) {
    return 'AI diff payload was truncated to fit the max prompt size.';
  }

  return [
    'AI diff payload was truncated: ',
    String(summary.originalCharacters),
    ' -> ',
    String(summary.finalCharacters),
    ' characters (',
    String(summary.removedCharacters),
    ' removed, ',
    formatPercent(summary.removedPercent),
    '% removed).'
  ].join('');
}

function formatPercent(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;

  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(1);
}

function parseRecentCommitLogs(output) {
  return String(output ?? '')
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const parts = record.split('\x1f');
      const title = cleanCommitLogText(parts[1] ?? '');
      const body = cleanCommitLogText(parts.slice(2).join('\x1f'));

      return {
        title,
        body
      };
    })
    .filter((log) => log.title || log.body);
}

function cleanCommitLogText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function getMediaReason(file) {
  return MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()) ? 'media' : null;
}

function readWorkingFile(filePath) {
  try {
    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
      return {
        ok: false,
        buffer: null
      };
    }

    return {
      ok: true,
      buffer: fs.readFileSync(filePath)
    };
  } catch {
    return {
      ok: false,
      buffer: null
    };
  }
}

function classifyTextLikeContent(content, file) {
  if (content === null || content === undefined) {
    return {
      textLike: true,
      reason: null
    };
  }

  return classifyBuffer(Buffer.from(String(content), 'utf8'), file);
}

function classifyBuffer(buffer, file) {
  if (!buffer || buffer.length === 0) {
    return {
      textLike: true,
      reason: null
    };
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, SAMPLE_BYTES));

  if (sample.includes(0)) {
    return {
      textLike: false,
      reason: 'non-text'
    };
  }

  const text = sample.toString('utf8');
  const replacementCount = countOccurrences(text, '\uFFFD');
  const controlRatio = countControlCharacters(text) / Math.max(1, text.length);

  if (replacementCount / Math.max(1, text.length) > 0.01 || controlRatio > 0.02) {
    return {
      textLike: false,
      reason: 'non-text'
    };
  }

  if (looksBase64Like(text)) {
    return {
      textLike: false,
      reason: 'base64'
    };
  }

  const mediaReason = getMediaReason(file);

  if (mediaReason) {
    return {
      textLike: false,
      reason: mediaReason
    };
  }

  return {
    textLike: true,
    reason: null
  };
}

function countControlCharacters(text) {
  let count = 0;

  for (const char of text) {
    const code = char.charCodeAt(0);

    if ((code < 32 && char !== '\n' && char !== '\r' && char !== '\t') || code === 127) {
      count += 1;
    }
  }

  return count;
}

function looksBase64Like(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const longLines = lines.filter((line) => line.length >= 160);
  const joined = lines.join('');

  if (joined.length < 240 || longLines.length === 0) {
    return false;
  }

  const base64Characters = joined.replace(/[A-Za-z0-9+/=]/g, '').length;
  const base64Ratio = (joined.length - base64Characters) / joined.length;
  const averageLineLength = joined.length / lines.length;

  return base64Ratio > 0.97 && averageLineLength > 80;
}

function buildUntrackedTextDiff(file, text) {
  const lines = text ? text.split('\n') : [];

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return [
    'diff --git a/' + file + ' b/' + file,
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/' + file,
    '@@ -0,0 +1,' + String(lines.length) + ' @@',
    ...lines.map((line) => '+' + line)
  ].join('\n');
}

function buildOmissionMessage(file, reason) {
  if (reason === 'base64') {
    return '[Omitted likely base64 data: ' + file + ']';
  }

  if (reason === 'media') {
    return '[Omitted media or image diff: ' + file + ']';
  }

  if (reason === 'unreadable') {
    return '[Omitted unreadable diff: ' + file + ']';
  }

  if (reason === 'empty') {
    return '[Omitted empty diff: ' + file + ']';
  }

  return '[Omitted non-text diff: ' + file + ']';
}

function truncateDiffContent(content, budget) {
  if (content.length <= budget) {
    return content;
  }

  if (budget <= minimumTruncatedBlockLength()) {
    return TRUNCATION_MARKER.slice(0, Math.max(0, budget));
  }

  const markerBlock = '\n\n' + TRUNCATION_MARKER + '\n\n';
  const lines = content.split('\n');
  const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
  const lastHunk = findLastIndex(lines, (line) => line.startsWith('@@'));
  const prefixEnd = firstHunk === -1 ? Math.min(lines.length, 8) : Math.min(lines.length, firstHunk + 8);
  const suffixStart = lastHunk === -1 ? Math.max(prefixEnd, lines.length - 8) : lastHunk;
  const prefix = lines.slice(0, prefixEnd).join('\n');
  const suffix = lines.slice(suffixStart).join('\n');
  const remaining = budget - markerBlock.length;
  const prefixBudget = Math.floor(remaining * 0.6);
  const suffixBudget = remaining - Math.min(prefix.length, prefixBudget);
  const trimmedPrefix = takeStart(prefix, prefixBudget);
  const trimmedSuffix = takeEnd(suffix, suffixBudget);

  return (trimmedPrefix + markerBlock + trimmedSuffix).slice(0, budget);
}

function minimumTruncatedBlockLength() {
  return TRUNCATION_MARKER.length + 24;
}

function takeStart(text, budget) {
  if (text.length <= budget) {
    return text;
  }

  const sliced = text.slice(0, Math.max(0, budget));
  const lastNewline = sliced.lastIndexOf('\n');
  return lastNewline > 0 ? sliced.slice(0, lastNewline) : sliced;
}

function takeEnd(text, budget) {
  if (text.length <= budget) {
    return text;
  }

  const sliced = text.slice(text.length - Math.max(0, budget));
  const firstNewline = sliced.indexOf('\n');
  return firstNewline >= 0 ? sliced.slice(firstNewline + 1) : sliced;
}

function findLastIndex(values, predicate) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index)) {
      return index;
    }
  }

  return -1;
}

function hardLimitPayload(payload, maxPromptCharacters) {
  if (payload.length <= maxPromptCharacters) {
    return payload;
  }

  if (maxPromptCharacters <= TRUNCATION_MARKER.length) {
    return TRUNCATION_MARKER.slice(0, Math.max(0, maxPromptCharacters));
  }

  const markerBlock = '\n' + TRUNCATION_MARKER + '\n';
  const headLength = Math.max(0, maxPromptCharacters - markerBlock.length);
  return payload.slice(0, headLength) + markerBlock;
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}
