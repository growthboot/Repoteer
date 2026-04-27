import { stripAnsi } from './color.js';

export function formatTable(rows, options = {}) {
  const gap = options.gap ?? '    ';
  const widths = getColumnWidths(rows);

  return rows.map((row) => {
    return row.map((cell, index) => {
      const value = String(cell ?? '');
      const isLast = index === row.length - 1;

      return isLast ? value : padVisibleEnd(value, widths[index]);
    }).join(gap).trimEnd();
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
