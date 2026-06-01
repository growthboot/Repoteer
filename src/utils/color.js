const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function createColor(options = {}) {
  const enabled = shouldUseColor(options);

  return {
    enabled,
    bold: (value) => String(value ?? ''),
    hotkey: (value) => wrap(value, '1;38;2;180;120;255', '22;39', enabled),
    dim: (value) => wrap(value, '2', '22', enabled),
    blue: (value) => wrap(value, '34', '39', enabled),
    cyan: (value) => wrap(value, '36', '39', enabled),
    green: (value) => wrap(value, '32', '39', enabled),
    graphCold: (value) => wrap(value, '38;2;72;78;101', '39', enabled),
    graphCool: (value) => wrap(value, '38;2;83;121;128', '39', enabled),
    graphWarm: (value) => wrap(value, '38;2;196;150;76', '39', enabled),
    graphHot: (value) => wrap(value, '38;2;230;96;78', '39', enabled),
    graphLevel1: (value) => wrap(value, '38;2;48;53;69', '39', enabled),
    graphLevel2: (value) => wrap(value, '38;2;63;88;103', '39', enabled),
    graphLevel3: (value) => wrap(value, '38;2;88;125;127', '39', enabled),
    graphLevel4: (value) => wrap(value, '38;2;164;136;82', '39', enabled),
    graphLevel5: (value) => wrap(value, '38;2;230;148;84', '39', enabled),
    graphLevel6: (value) => wrap(value, '1;38;2;255;178;104', '22;39', enabled),
    red: (value) => wrap(value, '31', '39', enabled),
    yellow: (value) => wrap(value, '33', '39', enabled),
    darkYellow: (value) => wrap(value, '33', '39', enabled)
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
