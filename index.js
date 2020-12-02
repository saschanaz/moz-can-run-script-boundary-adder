#!/usr/bin/env node
import chalk from "chalk";
import { promises as fs} from "fs";
import readline from "readline";

const errorMessage = "functions marked as MOZ_CAN_RUN_SCRIPT can only be called from functions also marked as MOZ_CAN_RUN_SCRIPT";
const noteMessage = "caller function declared here";
const messageRegex = /^ ?\d:\d\d\.\d\d (.+)\((\d+),\d+\): \w+: /;

/**
 * @param {NodeJS.ReadStream} stdin
 */
async function* getPositions(stdin) {
  let lastMessage = "";
  let lastLineNumber = 0;
  for await (const line of readline.createInterface(stdin)) {
    console.log(chalk`{gray ${line}}`);
    const match = messageRegex.exec(line);
    if (!match) {
      continue;
    }
    const [, path, lineNumber] = match;
    if (lastMessage.includes(errorMessage) && line.includes(noteMessage)) {
      // if (line.trimStart().startsWith("NS_DECL_")) {
      //   yield [lastMessage, path, lastLineNumber];
      // } else {
      yield [lastMessage, path, Number(lineNumber)];
    } else if (line.includes("error:") && !line.includes(errorMessage)) {
      console.log(chalk`{red Needs manual fix: ${line}}`);
    }
    lastMessage = line;
    lastLineNumber = lineNumber;
  }
}

/**
 * @param {string} line
 */
function addBoundary(line) {
  const boundaryAttr = "MOZ_CAN_RUN_SCRIPT_BOUNDARY ";
  if (line.includes(boundaryAttr)) {
    return line; // An earlier warning might already have added one
  }

  const index = line.search(/\S/);
  const sliceIndex = index === -1 ? 0 : index;
  return line.slice(0, sliceIndex) + boundaryAttr + line.slice(sliceIndex);
}

const aggregated = [];
for await (const [cause, path, lineNumber] of getPositions(process.stdin)) {
  console.log(`${path}:${lineNumber} needs MOZ_CAN_RUN_SCRIPT_BOUNDARY, because of ${cause}`);
  aggregated.push([path, lineNumber]);
}

for (const [path, lineNumber] of aggregated) {
  console.log(chalk`{green Modifying ${path}:${lineNumber} ...}`);
  const file = await fs.readFile(path, "utf-8");
  const lines = file.split("\n");
  lines[lineNumber - 1] = addBoundary(lines[lineNumber - 1]);
  await fs.writeFile(path, lines.join("\n"));
}
