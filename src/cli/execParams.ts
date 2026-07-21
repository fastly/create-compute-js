/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import path from 'node:path';
import { type CommandLineOptions } from 'command-line-args';
import { isCancel, text, spinner, select, note } from '@clack/prompts';
import {
  fetchStarterKits,
  starterKitFrom,
  starterKitNameForLanguage,
  starterKitShortName,
  type StarterKit,
} from './fastlyStarterKits.js';
import { type Language } from './types.js';

const LANGUAGE_MAPPINGS: Record<string, Language> = {
  'js': 'javascript',
  'javascript': 'javascript',
  'ts': 'typescript',
  'typescript': 'typescript',
};

export type CreateExecParams = {
  mode: 'create',
  directory: string,
  authors: string[],
  from: string,
};

export type ListStarterKitsExecParams = {
  mode: 'list-starter-kits',
  language?: Language,
};

export type ExecParams =
  | ListStarterKitsExecParams
  | CreateExecParams;

export class BuildExecParamsCancelledError extends Error {
  messages: string[];
  constructor(messages: string[] = []) {
    super('Cancelled.');
    this.messages = messages;
  }
}

export async function buildExecParams(commandLineOptions: CommandLineOptions): Promise<ExecParams> {

  const listStarterKitsOptionValue = commandLineOptions['list-starter-kits'];
  if (Boolean(listStarterKitsOptionValue)) {

    let language: Language | undefined = undefined;
    const languageOptionValue = commandLineOptions['language'];
    if (typeof languageOptionValue === 'string') {
      language = LANGUAGE_MAPPINGS[languageOptionValue as keyof typeof LANGUAGE_MAPPINGS];
      if (language == null) {
        throw new BuildExecParamsCancelledError([`Unknown language value: ${languageOptionValue}`]);
      }
    }

    return {
      mode: 'list-starter-kits',
      language,
    };

  }

  let directory: string;
  {
    const optionValue = commandLineOptions['directory'];
    if (typeof optionValue === 'string' && optionValue !== '') {

      directory = optionValue;

    } else {

      directory = './';

    }

    note(`Using directory: ${path.resolve(directory)}`);

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
      note(`Using specified authors: ${authors.join(', ')}`);
    } else {
      note('Using empty authors list.');
    }
  }

  let from: string;
  {
    const optionValue = commandLineOptions['from'];
    if (typeof optionValue === 'string' && optionValue !== '') {

      from = optionValue;
      note(`Using specified source path or URL: ${from}`);

    } else {

      let language: Language | null;
      {

        const optionValue = commandLineOptions['language'];
        if (typeof optionValue === 'string' && optionValue !== '') {

          if (!(optionValue in LANGUAGE_MAPPINGS)) {
            throw new BuildExecParamsCancelledError([`Invalid language value '${directory}'; must be one of: ${Object.keys(LANGUAGE_MAPPINGS).join(', ')}`]);
          }

          language = LANGUAGE_MAPPINGS[optionValue as keyof typeof LANGUAGE_MAPPINGS];
          note(`Using specified language: ${language}`);

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

        let starterKitName: string;
        {
          const defaultStarterKitOptionValue = commandLineOptions['default-starter-kit'];
          const starterKitOptionValue = commandLineOptions['starter-kit'];

          if (defaultStarterKitOptionValue || starterKitOptionValue === 'default') {

            if (
              Boolean(defaultStarterKitOptionValue) &&
              Boolean(starterKitOptionValue)
            ) {
              throw new BuildExecParamsCancelledError([`'starter-kit' cannot be used with 'default-starter-kit'.`]);
            }

            note(`Using default starter kit for '${language}'.`);
            starterKitName = starterKitNameForLanguage(language, 'default');

          } else if (typeof starterKitOptionValue === 'string' && starterKitOptionValue !== '') {

            // We must allow any, because they might exist in the starter-kit catalog.
            note(`Using specified starter kit: ${starterKitOptionValue}`);
            starterKitName = starterKitNameForLanguage(language, starterKitOptionValue);

          } else {

            let starterKits: StarterKit[];

            const s = spinner();
            try {
              s.start('Fetching available starter kits...');
              starterKits = (await fetchStarterKits())[language];
            } finally {
              s.stop();
            }

            // Move "default" kit to front
            const defaultName = starterKitNameForLanguage(language, 'default');
            const defaultIndex = starterKits.findIndex(kit => kit.name === defaultName);
            if (defaultIndex !== -1) {
              starterKits = [
                starterKits[defaultIndex],
                ...starterKits.slice(0, defaultIndex),
                ...starterKits.slice(defaultIndex + 1),
              ];
            }

            const promptValue: symbol | string = await select({
              message: 'Select a starter kit',
              options: starterKits.map(kit => ({
                value: kit.name,
                label: `[${starterKitShortName(language, kit.name)}] ${kit.description}`,
              })),
            });
            if (isCancel(promptValue)) {
              throw new BuildExecParamsCancelledError();
            }

            starterKitName = promptValue;

          }
        }

        from = starterKitFrom(starterKitName);

      }
    }
  }

  return {
    mode: 'create',
    directory,
    authors,
    from,
  };
}
