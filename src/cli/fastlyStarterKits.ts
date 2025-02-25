/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { type Language, type Repository } from './types.js';

export const KNOWN_STARTER_KITS: Record<Language, Repository[]> = {
  'javascript': [
    {
      fullName: 'fastly/compute-starter-kit-javascript-default',
      description: 'Default package template for JavaScript based Fastly Compute projects'
    },
    {
      fullName: 'fastly/compute-starter-kit-javascript-empty',
      description: 'Empty package template for JavaScript based Fastly Compute projects'
    },
  ],
  'typescript': [
    {
      fullName: 'fastly/compute-starter-kit-typescript-default',
      description: 'A simple Fastly starter kit for Typescript',
    },
  ],
};

export function defaultStarterKitForLanguage(language: Language) {
  return KNOWN_STARTER_KITS[language][0];
}

export function starterKitFullNameToShortName(language: Language, fullName: string) {

  if (fullName === defaultStarterKitForLanguage(language).fullName) {
    return 'default';
  }

  const prefix = `fastly/compute-starter-kit-${language}`;

  if (!fullName.startsWith(prefix)) {
    throw new TypeError(`${fullName} not the name of a starter kit of language ${language}`);
  }

  return fullName.slice(prefix.length + 1);

}

export function starterKitShortNameToFullName(language: Language, shortName: string) {

  if (shortName === 'default') {
    return defaultStarterKitForLanguage(language).fullName;
  }

  return `fastly/compute-starter-kit-${language}-${shortName}`;

}
