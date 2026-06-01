const GRAPH_HEIGHT = 6;
const MAX_DAYS = 90;
const ROW_STYLES = [
  { mark: '░', color: 'graphLevel6' },
  { mark: '░', color: 'graphLevel5' },
  { mark: '░', color: 'graphLevel4' },
  { mark: '░', color: 'graphLevel3' },
  { mark: '░', color: 'graphLevel2' },
  { mark: '░', color: 'graphLevel1' }
];

export class ActivityGraph {
  constructor(git) {
    this.git = git;
  }

  renderForRepos(repos, options = {}) {
    const dayCount = this.getDayCount(options.width);
    const counts = this.getDailyCounts(repos, dayCount);

    return this.renderCounts(counts, {
      color: options.color
    });
  }

  getDailyCounts(repos, dayCount) {
    const today = this.getStartOfLocalDay(Date.now());
    const firstDay = today - ((dayCount - 1) * 86400000);
    const counts = Array.from({ length: dayCount }, () => 0);

    repos.forEach((repo) => {
      const history = this.git.getCommitTimestamps(repo.path, {
        days: dayCount
      });

      if (!history.ok) {
        return;
      }

      history.timestamps.forEach((timestamp) => {
        const day = this.getStartOfLocalDay(timestamp);
        const index = Math.floor((day - firstDay) / 86400000);

        if (index >= 0 && index < dayCount) {
          counts[index] += 1;
        }
      });
    });

    return counts;
  }

  renderCounts(counts, options = {}) {
    const max = Math.max(0, ...counts);

    if (max === 0) {
      return [];
    }

    const color = options.color ?? this.createPlainColor();
    const axisWidth = String(max).length;
    const rows = Array.from({ length: GRAPH_HEIGHT }, (_, rowIndex) => {
      const threshold = GRAPH_HEIGHT - rowIndex;
      const label = this.formatYAxisLabel(rowIndex, max, axisWidth);
      const axis = this.formatYAxisMark(rowIndex, max);
      const cells = counts.map((count) => {
        const height = Math.max(1, Math.ceil((count / max) * GRAPH_HEIGHT));

        return count > 0 && height >= threshold ? this.formatBarCell(rowIndex, color) : ' ';
      }).join('').trimEnd();

      return label + color.dim(' ' + axis) + cells;
    });

    const axisPadding = ' '.repeat(axisWidth);
    const title = color.dim('Activity (' + String(counts.length) + 'd)');
    const xAxis = axisPadding + color.dim(' └' + this.formatXAxis(counts.length));
    const xLabels = axisPadding + '  ' + color.dim(this.formatXAxisLabels(counts.length));

    return [title, ...rows, xAxis, xLabels];
  }

  formatXAxisLabels(dayCount) {
    const rightLabel = 'today';
    const cells = Array.from({ length: dayCount }, () => ' ');
    const labels = [
      { position: 0, text: String(dayCount) + 'd ago', align: 'left' },
      { position: Math.floor(dayCount / 3), text: String(Math.floor((dayCount * 2) / 3)) + 'd ago', align: 'center' },
      { position: Math.floor((dayCount * 2) / 3), text: String(Math.floor(dayCount / 3)) + 'd ago', align: 'center' },
      { position: dayCount - rightLabel.length, text: rightLabel, align: 'left' }
    ];

    labels.forEach((label) => {
      this.writeLabel(cells, this.getLabelStart(label.position, label.text, label.align), label.text);
    });

    return cells.join('').trimEnd();
  }

  getLabelStart(position, label, align) {
    if (align === 'center') {
      return position - Math.floor(label.length / 2);
    }

    return position;
  }

  writeLabel(cells, start, label) {
    const safeStart = Math.max(0, Math.min(Math.max(0, cells.length - label.length), start));

    for (let index = 0; index < label.length && safeStart + index < cells.length; index += 1) {
      cells[safeStart + index] = label[index];
    }
  }

  formatXAxis(dayCount) {
    const cells = Array.from({ length: dayCount }, () => '─');

    cells[Math.floor(dayCount / 3)] = '┴';
    cells[Math.floor((dayCount * 2) / 3)] = '┴';
    cells[dayCount - 1] = '┘';

    return cells.join('');
  }

  formatYAxisLabel(rowIndex, max, width) {
    if (rowIndex === 0) {
      return String(max).padStart(width);
    }

    if (rowIndex === Math.floor(GRAPH_HEIGHT / 2) && max > 1) {
      return String(Math.ceil(max / 2)).padStart(width);
    }

    return ' '.repeat(width);
  }

  formatYAxisMark(rowIndex, max) {
    if (rowIndex === 0 || (rowIndex === Math.floor(GRAPH_HEIGHT / 2) && max > 1)) {
      return '┤';
    }

    return '│';
  }

  formatBarCell(rowIndex, color) {
    const style = ROW_STYLES[rowIndex] ?? ROW_STYLES[ROW_STYLES.length - 1];
    const formatter = color[style.color] ?? color.green;

    return formatter(style.mark);
  }

  createPlainColor() {
    const plain = (value) => String(value ?? '');

    return {
      dim: plain,
      blue: plain,
      cyan: plain,
      green: plain,
      graphCold: plain,
      graphCool: plain,
      graphWarm: plain,
      graphHot: plain,
      graphLevel1: plain,
      graphLevel2: plain,
      graphLevel3: plain,
      graphLevel4: plain,
      graphLevel5: plain,
      graphLevel6: plain,
      red: plain,
      yellow: plain,
      hotkey: plain
    };
  }

  getDayCount(width) {
    const parsedWidth = Number(width);
    const fallbackWidth = Number(process.stdout.columns);
    const rawWidth = Number.isFinite(parsedWidth) && parsedWidth > 0
      ? parsedWidth
      : fallbackWidth;
    const usableWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : MAX_DAYS;

    return Math.max(1, Math.min(MAX_DAYS, Math.floor(usableWidth)));
  }

  getStartOfLocalDay(timestamp) {
    const date = new Date(timestamp);

    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
}
