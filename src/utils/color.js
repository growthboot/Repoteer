const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function createColor(options = {}) {
  const enabled = shouldUseColor(options);

  return {
    enabled,
    bold: (value) => wrap(value, '1', '22', enabled),
    dim: (value) => wrap(value, '2', '22', enabled),
    green: (value) => wrap(value, '32', '39', enabled),
    red: (value) => wrap(value, '31', '39', enabled),
    yellow: (value) => wrap(value, '33', '39', enabled)
  };
}

export function stripAnsi(value) {
  return String(value ?? '').replace(ANSI_PATTERN, '');
}

function shouldUseColor(options) {
  if (options.forceDisabled) {
    return false;
  }

  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  if (process.env.TERM === 'dumb') {
    return false;
  }

  if (!process.stdout.isTTY) {
    return false;
  }

  return options.enabled !== false;
}

function wrap(value, open, close, enabled) {
  const text = String(value ?? '');

  if (!enabled || !text) {
    return text;
  }

  return '\u001b[' + open + 'm' + text + '\u001b[' + close + 'm';
}
