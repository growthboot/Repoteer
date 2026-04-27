import os from 'os';
import path from 'path';

export function resolveRuntimePaths() {
  const appDir = path.join(os.homedir(), '.repoteer');

  return {
    appDir,
    configPath: path.join(appDir, 'config.json'),
    storageDir: path.join(appDir, 'storage')
  };
}
