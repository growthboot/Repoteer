import fs from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { stripAnsi } from './color.js';

const SELECTED_OPEN = '\u001b[1;38;2;255;255;255;48;2;70;70;70m';
const SELECTED_CLOSE = '\u001b[22;39;49m';
const SELECTED_ROW_OPEN = '\u001b[48;2;70;70;70m';
const SELECTED_ROW_CLOSE = '\u001b[49m';

let rl = null;
let pipedLines = null;

function getPipedLines() {
  if (pipedLines === null) {
    pipedLines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  }

  return pipedLines;
}

function getReadline() {
  if (!rl) {
    rl = createInterface({ input, output });
  }

  return rl;
}

async function readLine(label) {
  if (!input.isTTY) {
    output.write(label);
    return getPipedLines().shift() ?? '';
  }

  return await getReadline().question(label);
}

export async function promptLine(label) {
  return await readLine(label);
}

export async function promptAction(label, options = {}) {
  const choices = normalizeChoices(options.choices);

  if (!input.isTTY || choices.length === 0) {
    return await readLine(label);
  }

  closeInput();
  return await readKeyAction(label, choices, options);
}

export function closeInput() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

function normalizeChoices(choices) {
  if (!Array.isArray(choices)) {
    return [];
  }

  return choices
    .map((choice) => {
      if (!choice) {
        return null;
      }

      if (typeof choice === 'string') {
        return {
          key: choice,
          label: choice
        };
      }

      return {
        key: String(choice.key ?? ''),
        label: String(choice.label ?? choice.key ?? '')
      };
    })
    .filter((choice) => choice && choice.key);
}

async function readKeyAction(label, choices, options) {
  return await new Promise((resolve) => {
    const stdin = input;
    const wasRaw = stdin.isRaw === true;
    const renderScreen = typeof options.render === 'function' ? options.render : null;
    const frameCache = renderScreen ? createFrameCache(renderScreen, choices) : null;
    let selectedIndex = 0;
    let buffer = '';
    let rendered = false;
    let frameLines = null;

    const cleanup = () => {
      stdin.off('data', onData);
      frameCache?.cancel();

      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(wasRaw);
      }

      stdin.pause();
    };

    const finish = (value) => {
      output.write('\n');
      cleanup();
      resolve(value);
    };

    const moveSelection = (direction) => {
      selectedIndex = (selectedIndex + direction + choices.length) % choices.length;
      render();
    };

    const onData = (chunk) => {
      const value = chunk.toString('utf8');

      for (let index = 0; index < value.length; index += 1) {
        const character = value[index];

        if (character === '\u0003') {
          finish('q');
          return;
        }

        if (character === '\r' || character === '\n') {
          finish(buffer.length > 0 ? buffer : choices[selectedIndex].key);
          return;
        }

        if (character === '\u001b') {
          const sequence = value.slice(index, index + 3);

          if (sequence === '\u001b[A' || sequence === '\u001b[D') {
            moveSelection(-1);
            index += 2;
            continue;
          }

          if (sequence === '\u001b[B' || sequence === '\u001b[C') {
            moveSelection(1);
            index += 2;
            continue;
          }

          finish('\u001b');
          return;
        }

        if (character === '\u007f' || character === '\b') {
          buffer = buffer.slice(0, -1);
          render();
          continue;
        }

        if (isPrintable(character)) {
          buffer += character;
          render();
        }
      }
    };

    const render = () => {
      const selectedChoice = choices[selectedIndex];

      if (renderScreen) {
        const nextFrameLines = frameCache.get(selectedChoice.key);
        drawFrame(frameLines, nextFrameLines);
        clearPreviousPromptLine(frameLines, nextFrameLines);
        frameLines = nextFrameLines;
      }

      if (rendered) {
        if (renderScreen) {
          output.write('\u001b[' + String(frameLines.length + 1) + ';1H\r\u001b[2K');
        } else {
          output.write('\u001b[1A\r\u001b[2K');
        }
      }

      output.write(label + buffer);

      if (!renderScreen) {
        const selected = formatSelectedChoice(selectedChoice, options.color);

        output.write('\n');
        output.write('\r\u001b[2K');
        output.write('Selected: ' + selected);
      }

      rendered = true;
      frameCache?.warmAround(selectedIndex);
    };

    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true);
    }

    stdin.resume();
    stdin.on('data', onData);
    render();
    frameCache?.warm();
  });
}

function createFrameCache(renderScreen, choices) {
  const cache = new Map();
  let canceled = false;
  let warmIndex = 0;

  const get = (selectedKey) => {
    const key = String(selectedKey);

    if (!cache.has(key)) {
      cache.set(key, captureRenderedFrame(renderScreen, key));
    }

    return cache.get(key);
  };

  const warm = () => {
    const step = () => {
      if (canceled || warmIndex >= choices.length) {
        return;
      }

      get(choices[warmIndex].key);
      warmIndex += 1;
      setImmediate(step);
    };

    setImmediate(step);
  };

  const warmAround = (selectedIndex) => {
    if (canceled || choices.length < 2) {
      return;
    }

    const previousIndex = (selectedIndex - 1 + choices.length) % choices.length;
    const nextIndex = (selectedIndex + 1) % choices.length;

    get(choices[previousIndex].key);
    get(choices[nextIndex].key);
  };

  const cancel = () => {
    canceled = true;
  };

  return { get, warm, warmAround, cancel };
}

function captureRenderedFrame(renderScreen, selectedKey) {
  const originalLog = console.log;
  const originalClear = console.clear;
  const lines = [];

  const append = (value = '') => {
    String(value).split('\n').forEach((line) => lines.push(line));
  };

  console.log = (...args) => {
    append(args.map((arg) => String(arg)).join(' '));
  };

  console.clear = () => {
    lines.length = 0;
  };

  try {
    renderScreen(selectedKey);
  } finally {
    console.log = originalLog;
    console.clear = originalClear;
  }

  return lines.map((line) => extendSelectedLine(line));
}

function extendSelectedLine(line) {
  const value = String(line ?? '');

  if (countOccurrences(value, SELECTED_OPEN) < 2) {
    return value;
  }

  const expanded = value.split(SELECTED_CLOSE).join(SELECTED_CLOSE + SELECTED_ROW_OPEN);

  return SELECTED_ROW_OPEN + expanded + SELECTED_ROW_CLOSE;
}

function countOccurrences(value, pattern) {
  return String(value ?? '').split(pattern).length - 1;
}

function drawFrame(previousLines, nextLines) {
  if (!previousLines) {
    let value = '\u001b[2J\u001b[H';

    if (nextLines.length > 0) {
      value += nextLines.join('\n') + '\n';
    }

    output.write(value);
    return;
  }

  const lineCount = Math.max(previousLines.length, nextLines.length);
  const chunks = [];

  for (let index = 0; index < lineCount; index += 1) {
    const previous = previousLines[index] ?? '';
    const next = nextLines[index] ?? '';

    if (previous === next) {
      continue;
    }

    chunks.push('\u001b[' + String(index + 1) + ';1H\r\u001b[2K' + next);
  }

  if (chunks.length > 0) {
    output.write(chunks.join(''));
  }
}

function clearPreviousPromptLine(previousLines, nextLines) {
  if (!previousLines || previousLines.length === nextLines.length) {
    return;
  }

  output.write('\u001b[' + String(previousLines.length + 1) + ';1H\r\u001b[2K');
}

function formatSelectedChoice(choice, color) {
  const label = stripAnsi(choice.label);
  const value = choice.key + (label && label !== choice.key ? '  ' + label : '');

  if (typeof color?.selected === 'function') {
    return color.selected(' ' + value + ' ');
  }

  return '> ' + value;
}

function isPrintable(value) {
  return /^[\x20-\x7e]+$/.test(value);
}
