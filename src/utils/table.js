import { stripAnsi } from './color.js';

export function formatTable(rows, options = {}) {
  const gap = options.gap ?? '    ';
  const leaderGap = options.leaderGap ?? null;
  const gapWidth = stripAnsi(gap).length;
  const widths = getColumnWidths(rows);

  return rows.map((row) => {
    const hasLeader = leaderGap && stripAnsi(row[0]).length > 0;

    return row.map((cell, index) => {
      const value = String(cell ?? '');
      const isLast = index === row.length - 1;

      if (hasLeader && index === 0) {
        return value;
      }

      return isLast ? value : padVisibleEnd(value, widths[index]);
    }).reduce((line, value, index) => {
      if (index === 0) {
        return value;
      }

      if (hasLeader && index === 1) {
        const width = Math.max(0, widths[0] - stripAnsi(row[0]).length) + gapWidth;
        return line + formatLeaderGap(leaderGap, width) + value;
      }

      return line + gap + value;
    }, '').trimEnd();
  });
}

function getColumnWidths(rows) {
  return rows.reduce((widths, row) => {
    row.forEach((cell, index) => {
      const value = stripAnsi(cell);
      widths[index] = Math.max(widths[index] ?? 0, value.length);
    });

    return widths;
  }, []);
}

function padVisibleEnd(value, width) {
  const padding = Math.max(0, width - stripAnsi(value).length);
  return value + ' '.repeat(padding);
}

function formatLeaderGap(leaderGap, width) {
  const visible = stripAnsi(leaderGap);

  if (!visible || width <= 0) {
    return '';
  }

  const text = visible.repeat(Math.ceil(width / visible.length)).slice(0, width);
  const start = leaderGap.indexOf(visible);

  if (start === -1) {
    return text;
  }

  return leaderGap.slice(0, start) + text + leaderGap.slice(start + visible.length);
}
