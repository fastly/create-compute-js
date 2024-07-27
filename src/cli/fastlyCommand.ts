/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { spawn, spawnSync } from 'node:child_process';
import { type ExecParams } from './execParams.js';

const re = /^Fastly CLI version (v\d+.\d+.\d)/;

export function getFastlyCliVersion(fastlyCli: string | null) {

  const result = spawnSync(
    `"${fastlyCli ?? 'fastly'}"`,
    [
      "version",
    ],
    {
      shell: true,
      encoding: "utf-8",
    }
  );

  if (result.status !== 0) {
    return null;
  }

  const match = result.stdout.match(re);
  if (match == null) {
    return null;
  }

  return match[1];
}

export async function execFastlyCli(fastlyCli: string | null, execParams: ExecParams) {

  const args = [
    `--non-interactive`,
    `--quiet`,
    `--directory="${execParams.directory}"`,
    `--language="javascript"`,
    `--from="${execParams.from}"`,
  ];

  if (execParams.authors.length === 0) {
    args.push('--author=""');
  } else {
    for (const author of execParams.authors) {
      args.push(`--author="${author}"`);
    }
  }

  return new Promise((resolve, reject) => {
    const p = spawn(`"${fastlyCli ?? 'fastly'}"`,
      [
        "compute",
        "init",
        ...args
      ],
      {
        shell: true,
      });

    p.stdout.on('data', (_x) => {
      // process.stdout.write(_x);
    });

    p.stderr.on('data', (x) => {
      process.stderr.write(x);
    });

    p.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error('Failed initializing Compute application'));
      }
      resolve(code);
    });
  });
}
