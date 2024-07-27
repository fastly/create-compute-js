#!/usr/bin/env node

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import commandLineArgs, { type CommandLineOptions } from 'command-line-args';
import fs from 'node:fs/promises';
import path from 'node:path';
import { confirm, intro, isCancel, log, note, outro, spinner } from '@clack/prompts';
import { buildExecParams, BuildExecParamsCancelledError, type ExecParams } from './execParams.js';
import { execFastlyCli, getFastlyCliVersion } from './fastlyCommand.js';

const OPTION_DEFINITIONS: commandLineArgs.OptionDefinition[] = [
  { name: 'help', type: Boolean, },                  // Display help
  { name: 'directory', type: String, },              // A directory that should not exist. If not provided, then will be prompted.
  { name: 'author', type: String, multiple: true, }, // Author email. If not provided, then will be left empty in fastly.toml.
  { name: 'language', type: String, },               // Language. Can be javascript or typescript. If not provided, then will be prompted.
  { name: 'starter-kit', type: String, },            // Starter kit. If not provided, then will be prompted. Requires --language.
  { name: 'from', type: String, },                   // Path to a directory with a fastly.toml, a URL to a GitHub repo path with a fastly.toml, or a fiddle.
  { name: 'fastly-cli-path', type: String, },        // Path to the fastly CLI command. If not provided, then defaults to $(which fastly) (where in Windows)
  { name: 'no-confirm', type: Boolean, },            // If set, then perform the operation with a confirmation prompt.
];

function displayHelp() {
  log.info(`\
@fastly/create-compute: A CLI for creating new JavaScript (TypeScript) applications on Fastly Compute.

Initializes a Fastly Compute JavaScript (TypeScript) application.

Usage:
  npm create @fastly/compute [<flags>]

Flags:
  --help                        - Displays this help screen.
  --directory=<pathspec>        - Specifies the directory to create the new
                                  application. Must not already exist.
  --author=<author-name>, ...   - Sets the author(s) in fastly.toml.
  --language=<lang>             - Used to select a category of starter kit.
                                  Can be 'javascript' or 'typescript'.
                                  Cannot be used with --from.
  --starter-kit=<id>            - Used to specify a starter kit. Must be used
                                  with --language, and cannot be used with
                                  --from.
  --from=<pathspec-or-url>      - Specifies a directory with a fastly.toml, a
                                  URL to a GitHub repo path with a fastly.toml,
                                  or a URL to a Fiddle, and will be used as the
                                  starting point of the new application. Cannot
                                  be used with --language or --starter-kit.
  --fastly-cli-path=<pathspec>  - Path to the fastly CLI command. If not
                                  specified, then it will be searched from the
                                  system path.
  --no-confirm                  - Do not show confirmation prompt before
                                  creating the application.
  
Notes:

* If --author is not provided, then fastly.toml will be initialized with an
  empty value.
* If --fastly-cli-path is not provided, then the 'fastly' command in the
  system path will be used.
* If --directory, --language, or --starter-kit are not provided, then you will
  be prompted for them. 
`);
}

const { argv } = process;

intro('@fastly/create-compute');

// Parse command line options
let commandLineOptions: CommandLineOptions;
try {
  commandLineOptions = commandLineArgs(OPTION_DEFINITIONS, { argv });
} catch(ex) {
  log.error('Error parsing command line arguments.')
  log.error(String(ex));
  displayHelp();
  process.exit(1);
}

if (commandLineOptions['help']) {
  displayHelp();
  process.exit(0);
}

let fastlyCliPath: string | null = null;
{
  const optionValue = commandLineOptions['fastly-cli-path'];
  if (typeof optionValue === 'string' && optionValue !== '') {
    fastlyCliPath = optionValue;
    note(`Using specified fastly-cli-path: ${fastlyCliPath}.`);
  }

  const fastlyCliVersion = getFastlyCliVersion(fastlyCliPath);

  if (fastlyCliVersion == null) {
    log.error('Unable to obtain Fastly CLI version.');

    if (fastlyCliPath != null) {
      log.error(`Check to make sure that the specified Fastly CLI path '${fastlyCliPath}' is correct.`);
    } else {
      log.error(`Check to make sure that Fastly CLI is in the system path. Alternatively specify the path using --fastly-cli-path.`);
    }

    process.exit(1);
  }

  log.info(`Found Fastly CLI ${fastlyCliVersion}`);
}

let execParams: ExecParams;
try {
  execParams = await buildExecParams(commandLineOptions);
} catch(error) {
  if (error instanceof BuildExecParamsCancelledError) {
    log.error(error.messages.join('\n'));
    process.exit(1);
  }
  throw error;
}

let noConfirm = false;
{
  const optionValue = commandLineOptions['no-confirm'];
  if (typeof optionValue === 'boolean') {
    noConfirm = optionValue;
    if (noConfirm) {
      note(`Using specified no-confirm value: ${noConfirm}`);
    }
  }
}

if (!noConfirm) {
  const promptValue = await confirm({
    message: 'Confirm creation of Compute application with above options.',
  });
  if (isCancel(promptValue) || !promptValue) {
    log.error('Canceled.');
    process.exit(1);
  }
}

const appDirectory = path.resolve(execParams.directory);

const s1 = spinner();
s1.start(`Creating application directory ${appDirectory}...`)
try {
  await fs.mkdir(execParams.directory);
} finally {
  s1.stop('Directory created.');
}

const s2 = spinner();
s2.start('Creating and initializing application, this can take a few minutes...');
try {
  await execFastlyCli(fastlyCliPath, execParams);
} finally {
  s2.stop('Application created and initialized!');
}

log.success(`Application created at ${appDirectory}.`);

outro('Process completed!');
