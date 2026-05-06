import { stripAnsi } from './color.js';

export function formatTable(rows, options = {}) {
  const gap = options.gap ?? '    ';
  const leaderGap = options.leaderGap ?? null;
  const widths = getColumnWidths(rows);

  return rows.map((row) => {
    const hasLeader = leaderGap && stripAnsi(row[0]).length > 0;

    return row.map((cell, index) => {
      const value = String(cell ?? '');
      const isLast = index === row.length - 1;

      return isLast ? value : padVisibleEnd(value, widths[index]);
    }).reduce((line, value, index) => {
      if (index === 0) {
        return value;
      }

      const separator = hasLeader && index === 1 ? leaderGap : gap;
      return line + separator + value;
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
