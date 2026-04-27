import { stripAnsi } from './color.js';

export function formatActionColumns(actions, options = {}) {
  const gap = options.gap ?? '    ';
  const pairs = chunkPairs(actions);
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
