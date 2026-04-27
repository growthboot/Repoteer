import fs from 'fs';
import path from 'path';

export class JsonFileStore {
  constructor(filePath, defaultValue) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this.ensureFile();
  }

  read() {
    const raw = fs.readFileSync(this.filePath, 'utf8');

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON in ' + this.filePath + '. Repoteer will not overwrite broken user data.');
    }
  }

  write(value) {
    fs.writeFileSync(this.filePath, JSON.stringify(value, null, 2) + '\n');
  }

  ensureFile() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      this.write(this.defaultValue);
    }
  }
}
