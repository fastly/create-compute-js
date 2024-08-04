/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { type CommandLineOptions } from 'command-line-args';
import { isCancel, text, spinner, select, note } from '@clack/prompts';
import { getDirectoryStatus } from './directory.js';
import { findReposStartWith, repoNameToPath } from './github.js';
import {
  KNOWN_STARTER_KITS,
  starterKitFullNameToShortName,
  starterKitShortNameToFullName,
} from './fastlyStarterKits.js';
import { type Language, type Repository } from './types.js';

const LANGUAGE_MAPPINGS: Record<string, Language> = {
  'js': 'javascript',
  'javascript': 'javascript',
  'ts': 'typescript',
  'typescript': 'typescript',
};

export type ExecParams = {
  directory: string,
  authors: string[],
  from: string,
};

export class BuildExecParamsCancelledError extends Error {
  messages: string[];
  constructor(messages: string[] = []) {
    super('Cancelled.');
    this.messages = messages;
  }
}

export async function buildExecParams(commandLineOptions: CommandLineOptions): Promise<ExecParams> {

  let directory: string;
  {
    const optionValue = commandLineOptions['directory'];
    if (typeof optionValue === 'string' && optionValue !== '') {

      directory = optionValue;

    } else {

      const promptValue = await text({
        message: 'Where do you wish to create your application?',
        placeholder: 'Path to application directory',
        initialValue: './',
        validate(directory) {
          if (directory === '') {
            return `Cannot be empty!`;
          }
          switch(getDirectoryStatus(directory)) {
          case 'not-directory':
            return `A file at '${directory}' already exists!`;
          case 'not-empty':
            return `Directory '${directory}' is not empty!`;
          case 'other-error':
            return `'${directory}' cannot be used!`;
          case 'available':
          case 'empty':
            // available
            break;
          }
        },
      });
      if (isCancel(promptValue)) {
        throw new BuildExecParamsCancelledError();
      }
      directory = promptValue;

    }

    note(`Using directory: ${directory}.`);

    // Whatever the value is, we will try to fs.mkdir() after confirmation to make sure
    // we can create the directory.
  }

  let authors: string[];
  {
    const optionValue = commandLineOptions['author'];
    if (Array.isArray(optionValue)) {
      authors = optionValue.filter(x => x != null && x !== '');
    } else {
      authors = [];
    }
    if (authors.length > 0) {
      note(`Using specified authors: ${authors.join(', ')}.`);
    } else {
      note('Using empty authors list.');
    }
  }

  let from: string;
  {
    const optionValue = commandLineOptions['from'];
    if (typeof optionValue === 'string' && optionValue !== '') {

      from = optionValue;
      note(`Using specified source path or URL: ${from}.`);

    } else {

      let language: Language | null;
      {

        const optionValue = commandLineOptions['language'];
        if (typeof optionValue === 'string' && optionValue !== '') {

          if (!(optionValue in LANGUAGE_MAPPINGS)) {
            throw new BuildExecParamsCancelledError([`Invalid language value '${directory}'; must be one of: ${Object.keys(LANGUAGE_MAPPINGS).join(', ')}`]);
          }

          language = LANGUAGE_MAPPINGS[optionValue as keyof typeof LANGUAGE_MAPPINGS];
          note(`Using specified language: ${language}.`);

        } else {

          const useStarterKit =
            Boolean(commandLineOptions['default-starter-kit']) ||
            Boolean(commandLineOptions['starter-kit']);

          const message = useStarterKit ?
            'Select a language for your Compute application.' :
            'Select a language for your Compute application, or specify a starter kit.'

          const options: { value: Language | '__other', label: string, hint?: string}[] = [
            { value: 'javascript', label: 'JavaScript' },
            { value: 'typescript', label: 'TypeScript' },
          ];

          if (!useStarterKit) {
            options.push({
              value: '__other',
              label: 'Specify starter kit or directory',
              hint: 'Path to existing Compute app, GitHub URL of a starter kit, or Fastly Fiddle URL.'
            });
          }

          const promptValue: symbol | Language | '__other' = await select({
            message,
            options,
          });

          if (isCancel(promptValue)) {
            throw new BuildExecParamsCancelledError();
          }

          if (promptValue === '__other') {

            language = null;

          } else {

            language = promptValue;

          }

        }

      }

      if (language == null) {

        {

          const promptValue = await text({
            message: 'Specify the path to an existing Compute app, GitHub URL of a starter kit, or Fastly Fiddle URL.',
            placeholder: 'Path or URL',
            initialValue: '',
            validate(value) {
              if (value === '') {
                return `Cannot be empty!`;
              }
              if (value.startsWith('http://')) {
                return `URL must begin with https!`;
              }
              if (value.startsWith('https://')) {
                let valid = false;
                if (
                  value.startsWith('https://github.com/') ||
                  value.startsWith('https://fiddle.fastly.dev/') ||
                  value.startsWith('https://fiddle.fastlydemo.net/')
                ) {
                  valid = true;
                }
                if (!valid) {
                  return `URL must belong to GitHub or Fastly Fiddle!`;
                }
              }
            },
          });
          if (isCancel(promptValue)) {
            throw new BuildExecParamsCancelledError();
          }
          from = promptValue;

        }

      } else {

        let starterKit: string;
        {
          const optionValue = commandLineOptions['default-starter-kit'];
          if (optionValue) {

            if (commandLineOptions['starter-kit'] != null) {
              throw new BuildExecParamsCancelledError([`'starter-kit' cannot be used with 'default-starter-kit'.`]);
            }
            starterKit = starterKitFullNameToShortName(language, KNOWN_STARTER_KITS[language][0].fullName);
            note(`Using default starter kit for '${language}'.`);

          } else {

            {
              const optionValue = commandLineOptions['starter-kit'];
              if (typeof optionValue === 'string' && optionValue !== '') {

                // We must allow any, because they might exist on GitHub.
                starterKit = optionValue;
                note(`Using specified starter kit: ${starterKit}.`);

              } else {

                // Allow choosing from the known list first.

                {
                  const promptValue: symbol | string = await select({
                    message: 'Select a starter kit',
                    options: [
                      ...KNOWN_STARTER_KITS[language].map(repository => {
                        const shortName = starterKitFullNameToShortName(language, repository.fullName);
                        return {
                          value: shortName,
                          label: `[${shortName}] ${repository.description}`,
                        };
                      }),
                      {
                        value: '__other',
                        label: 'Choose a starter kit from GitHub.',
                      }
                    ],
                  });
                  if (isCancel(promptValue)) {
                    throw new BuildExecParamsCancelledError();
                  }

                  if (promptValue === '__other') {

                    let starterKits: Repository[];

                    const s = spinner();
                    try {
                      s.start('Querying GitHub for starter kits...');

                      starterKits = await findReposStartWith(null, 'fastly', 'compute-starter-kit-' + language);

                    } finally {
                      s.stop();
                    }

                    {
                      const promptValue: symbol | string = await select({
                        message: 'Select a starter kit',
                        options: [
                          ...starterKits.map(repository => {
                            const shortName = starterKitFullNameToShortName(language, repository.fullName);
                            return {
                              value: shortName,
                              label: `[${shortName}] ${repository.description}`,
                            };
                          }),
                        ],
                      });
                      if (isCancel(promptValue)) {
                        throw new BuildExecParamsCancelledError();
                      }

                      starterKit = promptValue;

                    }

                  } else {

                    starterKit = promptValue;

                  }
                }
              }
            }
          }

          const fullName = starterKitShortNameToFullName(language, starterKit);
          from = repoNameToPath(fullName);

        }
      }
    }
  }

  return {
    directory,
    authors,
    from,
  };
}
