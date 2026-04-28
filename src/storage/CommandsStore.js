import path from 'path';
import { JsonFileStore } from './JsonFileStore.js';

export class CommandsStore {
  constructor(storageDir) {
    this.store = new JsonFileStore(path.join(storageDir, 'commands.json'), []);
  }

  list() {
    const commands = this.store.read();

    if (!Array.isArray(commands)) {
      throw new Error('commands.json must contain an array.');
    }

    return commands;
  }

  listForProject(projectName) {
    return this.list().filter((command) => command.projectName === projectName);
  }

  add(projectName, input) {
    const commands = this.list();
    const command = {
      projectName,
      title: input.title.trim(),
      command: input.command.trim(),
      workingDirectory: input.workingDirectory.trim(),
      notes: input.notes.trim()
    };

    commands.push(command);
    this.store.write(commands);

    return command;
  }

  updateForProjectByIndex(projectName, index, input) {
    const commands = this.list();
    const projectIndexes = this.indexesForProject(commands, projectName);
    const storeIndex = projectIndexes[index];

    if (storeIndex === undefined) {
      return null;
    }

    commands[storeIndex] = {
      projectName,
      title: input.title.trim(),
      command: input.command.trim(),
      workingDirectory: input.workingDirectory.trim(),
      notes: input.notes.trim()
    };

    this.store.write(commands);

    return commands[storeIndex];
  }

  deleteForProjectByIndex(projectName, index) {
    const commands = this.list();
    const projectIndexes = this.indexesForProject(commands, projectName);
    const storeIndex = projectIndexes[index];

    if (storeIndex === undefined) {
      return false;
    }

    commands.splice(storeIndex, 1);
    this.store.write(commands);

    return true;
  }

  renameProject(originalName, nextName) {
    const commands = this.list();
    const nextCommands = commands.map((command) => {
      if (command.projectName !== originalName) {
        return command;
      }

      return {
        ...command,
        projectName: nextName
      };
    });

    this.store.write(nextCommands);
  }

  deleteProject(projectName) {
    const commands = this.list();
    const nextCommands = commands.filter((command) => command.projectName !== projectName);

    this.store.write(nextCommands);
  }

  indexesForProject(commands, projectName) {
    const indexes = [];

    commands.forEach((command, index) => {
      if (command.projectName === projectName) {
        indexes.push(index);
      }
    });

    return indexes;
  }
}
