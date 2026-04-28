export function formatDiffForDisplay(diff, color) {
  return String(diff ?? '')
    .split('\n')
    .map((line) => formatDiffLine(line, color))
    .join('\n');
}

function formatDiffLine(line, color) {
  if (line.startsWith('+') && !line.startsWith('+++ ')) {
    return color.green(line);
  }

  if (line.startsWith('-') && !line.startsWith('--- ')) {
    return color.red(line);
  }

  return line;
}
