import fs from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

let rl = null;
let pipedLines = null;

function getPipedLines() {
  if (pipedLines === null) {
    pipedLines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  }

  return pipedLines;
}

function getReadline() {
  if (!rl) {
    rl = createInterface({ input, output });
  }

  return rl;
}

async function readLine(label) {
  if (!input.isTTY) {
    output.write(label);
    return getPipedLines().shift() ?? '';
  }

  return await getReadline().question(label);
}

export async function promptLine(label) {
  return await readLine(label);
}

export async function promptAction(label) {
  return await readLine(label);
}

export function closeInput() {
  if (rl) {
    rl.close();
    rl = null;
  }
}
