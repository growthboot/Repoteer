import { stripAnsi } from './color.js';

export function formatActionColumns(actions, options = {}) {
  const styledActions = actions.map((action) => formatActionHotkey(action, options.color));
  const pairs = chunkPairs(styledActions);

  return formatColumnPairs(pairs, options);
}

export function formatColumnPairs(pairs, options = {}) {
  const gap = options.gap ?? '    ';
  const leftWidth = pairs.reduce((width, pair) => {
    return Math.max(width, stripAnsi(pair[0]).length);
  }, 0);

  return pairs.map(([leftAction, rightAction]) => {
    if (!rightAction) {
      return leftAction;
    }

    return padVisibleEnd(leftAction, leftWidth) + gap + rightAction;
  });
}

function formatActionHotkey(action, color) {
  const value = String(action ?? '');
  const match = /^([^ ]+\.)( .*)?$/.exec(stripAnsi(value));

  if (!match || typeof color?.hotkey !== 'function') {
    return value;
  }

  return color.hotkey(match[1]) + (match[2] ?? '');
}

function chunkPairs(values) {
  const pairs = [];

  for (let index = 0; index < values.length; index += 2) {
    pairs.push([values[index], values[index + 1] ?? null]);
  }

  return pairs;
}

function padVisibleEnd(value, width) {
  const padding = Math.max(0, width - stripAnsi(value).length);
  return value + ' '.repeat(padding);
}
