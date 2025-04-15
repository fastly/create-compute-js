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
import { getDirectoryStatus } from './directory.js';
import { starterKitFullNameToShortName } from './fastlyStarterKits.js';
import { findReposStartWith } from './github.js';
import { type Language, type RepoShort } from './types.js';

const OPTION_DEFINITIONS: commandLineArgs.OptionDefinition[] = [
  { name: 'help', type: Boolean, },
  { name: 'directory', type: String, },
  { name: 'author', type: String, multiple: true, },
  { name: 'language', type: String, },
  { name: 'starter-kit', type: String, },
  { name: 'default-starter-kit', type: Boolean, },
  { name: 'list-starter-kits', type: Boolean, },
  { name: 'from', type: String, },
  { name: 'fastly-cli-path', type: String, },
  { name: 'no-confirm', type: Boolean, },
];

function displayHelp() {
  log.info(`\
@fastly/create-compute: A CLI for creating new JavaScript (TypeScript)
applications on Fastly Compute.

Initializes a Fastly Compute JavaScript (TypeScript) application.

Usage:
  npm create @fastly/compute -- [<options>]

Options:
  --help                        - Displays this help screen.
  --directory=<pathspec>        - Specifies the directory to create the new
                                  application. If the directory exists, it
                                  must be empty. Defaults to the current
                                  directory.
  --author=<author-name>, ...   - Sets the author(s) in fastly.toml.
  --language=<lang>             - Used to select a category of starter kit.
                                  Can be 'javascript' or 'typescript'.
                                  Cannot be used with --from.
  --starter-kit=<id>            - Used to specify a starter kit. Must be
                                  used with --language.
                                  Cannot be used with --default-starter-kit,
                                  --list-starter-kits, or --from.
  --default-starter-kit         - Uses 'default' as the starter kit.
                                  Equivalent to --starter-kit=default.
                                  Cannot be used with --starter-kit,
                                  --list-starter-kits, or --from.
  --list-starter-kits           - Fetches a list of available starter kits
                                  and outputs it.
                                  Cannot be used with --starter-kit,
                                  --default-starter-kit, or --from.
  --from=<pathspec-or-url>      - Specifies a directory with a fastly.toml,
                                  a URL to a GitHub repo path with a
                                  fastly.toml, or a URL to a Fiddle, and
                                  will be used as the starting point of the
                                  new application.
                                  Cannot be used with --language,
                                  --list-starter-kits, or --starter-kit.
  --fastly-cli-path=<pathspec>  - By default, this initializer uses a
                                  built-in copy of the Fastly CLI. Use this
                                  option to specify the path of an
                                  alternative Fastly CLI to use.
  --no-confirm                  - Do not show confirmation prompt before
                                  creating the application.
  
Notes:

* If --directory is not provided, then the current directory will be used.
* If --author is not provided, then fastly.toml will be initialized with an
  empty value.
* If --language, or --starter-kit are not provided, then you will be
  prompted for them. 
`);
}

const { argv } = process;

intro('create @fastly/compute');

log.info('Use `npm create @fastly/compute@latest -- --help` for options');

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
    note(`Using specified fastly-cli-path: ${fastlyCliPath}`);
  }

  const fastlyCliVersion = getFastlyCliVersion(fastlyCliPath);

  if (fastlyCliVersion == null) {
    log.error('Unable to obtain Fastly CLI version.');

    if (fastlyCliPath != null) {
      log.error(`Check to make sure that the specified Fastly CLI path '${fastlyCliPath}' is correct.`);
    } else {
      log.error(`Error executing Fastly CLI. Alternatively specify the path using --fastly-cli-path.`);
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

if (execParams.mode === 'list-starter-kits') {

  const starterKits = await findReposStartWith(null, 'fastly', 'compute-starter-kit');

  let languages: Language[] = [
    'javascript',
    'typescript',
  ];
  if (execParams.language != null) {
    languages = [
      execParams.language,
    ];
  }

  const languagesAndRepos: Partial<Record<Language, RepoShort[]>> = {};
  for (const language of languages) {
    const prefix = `fastly/compute-starter-kit-${language}`;
    languagesAndRepos[language] = starterKits.filter(
      starterKitRepo => starterKitRepo.fullName.startsWith(prefix)
    ).map(repository => {
      const { fullName, description } = repository;
      const shortName = starterKitFullNameToShortName(language, fullName);
      return {
        shortName,
        description,
      };
    });
  }

  const messages: string[] = [];

  messages.push('Available starter kits:');
  messages.push('');

  for (const [language, repos] of Object.entries(languagesAndRepos)) {

    messages.push(`Language: ${language}`);
    for (const repo of repos) {
      messages.push(`  [${repo.shortName}] - ${repo.description}`);
    }

  }

  messages.push('');
  messages.push('Use the value listed in brackets with the --starter-kit option.');

  note(messages.join('\n'));

  process.exit(0);
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

const directoryStatus = getDirectoryStatus(appDirectory);

if (directoryStatus === 'not-directory') {
  log.error(`A file at '${appDirectory}' already exists!`);
  process.exit(1);
}
if (directoryStatus === 'not-empty') {
  log.error(`Directory '${appDirectory}' is not empty!`);
  process.exit(1);
}
if (directoryStatus === 'other-error') {
  log.error(`Error using directory '${appDirectory}'!`);
  process.exit(1);
}
if (directoryStatus === 'available') {
  const s1 = spinner();
  s1.start(`Creating application directory ${appDirectory}...`)
  try {
    await fs.mkdir(execParams.directory);
  } finally {
    s1.stop('Directory created.');
  }
}
// if 'empty', then directory already exists and should be usable

const s2 = spinner();
s2.start('Creating and initializing application, this can take a few minutes...');
try {
  await execFastlyCli(fastlyCliPath, execParams);
} finally {
  s2.stop('Application created and initialized!');
}

log.success(`Application created at: ${appDirectory}`);

outro('Process completed!');
