export function formatTable(rows, options = {}) {
  const gap = options.gap ?? '    ';
  const widths = getColumnWidths(rows);

  return rows.map((row) => {
    return row.map((cell, index) => {
      const value = String(cell ?? '');
      const isLast = index === row.length - 1;

      return isLast ? value : value.padEnd(widths[index], ' ');
    }).join(gap).trimEnd();
  });
}

function getColumnWidths(rows) {
  return rows.reduce((widths, row) => {
    row.forEach((cell, index) => {
      const value = String(cell ?? '');
      widths[index] = Math.max(widths[index] ?? 0, value.length);
    });

    return widths;
  }, []);
}
