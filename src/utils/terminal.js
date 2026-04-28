export function createTerminalSession(options = {}) {
  let active = false;
  let enabled = options.enabled !== false;
  let originalConsoleClear = null;

  return {
    enterAlternateScreen() {
      if (!shouldUseTerminalControl(enabled) || active) {
        return;
      }

      this.installClearScreen();
      this.clearScreen();
      process.stdout.write('\u001b[?1049h');
      active = true;
    },

    exitAlternateScreen() {
      this.restoreClearScreen();

      if (!active) {
        return;
      }

      process.stdout.write('\u001b[?1049l');
      active = false;
    },

    setAlternateScreenEnabled(nextEnabled) {
      enabled = nextEnabled === true;

      if (enabled) {
        this.enterAlternateScreen();
      } else {
        this.exitAlternateScreen();
      }
    },

    installClearScreen() {
      if (!shouldUseTerminalControl(enabled) || originalConsoleClear) {
        return;
      }

      originalConsoleClear = console.clear;
      console.clear = () => {
        this.clearScreen();
      };
    },

    restoreClearScreen() {
      if (!originalConsoleClear) {
        return;
      }

      console.clear = originalConsoleClear;
      originalConsoleClear = null;
    },

    clearScreen() {
      if (!shouldUseTerminalControl(enabled)) {
        return;
      }

      process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
    }
  };
}

function shouldUseTerminalControl(enabled) {
  if (!enabled) {
    return false;
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    return false;
  }

  if (process.env.TERM === 'dumb') {
    return false;
  }

  return true;
}
