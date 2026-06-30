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
    const selectedLeft = isSelectedAction(leftAction, options.selectedKey);
    const selectedRight = isSelectedAction(rightAction, options.selectedKey);

    if (!rightAction) {
      return selectedLeft ? highlightValue(leftAction, options.color) : leftAction;
    }

    const leftCell = padVisibleEnd(leftAction, leftWidth);
    const renderedLeft = selectedLeft ? highlightValue(leftCell, options.color) : leftCell;
    const renderedRight = selectedRight ? highlightValue(rightAction, options.color) : rightAction;

    return renderedLeft + gap + renderedRight;
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

function isSelectedAction(action, selectedKey) {
  const value = String(action ?? '');
  const match = /^([^ ]+)\.( .*)?$/.exec(stripAnsi(value));

  if (!selectedKey || !match) {
    return false;
  }

  const actionKey = match[1].toLowerCase();
  const selected = String(selectedKey).toLowerCase();

  return actionKey === selected;
}

function highlightValue(value, color) {
  if (typeof color?.selected !== 'function') {
    return value;
  }

  return color.selected(value);
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
