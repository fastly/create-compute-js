/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { type Language } from './types.js';

// The starter-kit catalog edge service. Kits live in the
// github.com/fastly/compute-starter-kits monorepo under
// starter-kits/<lang>/<name>, and are surfaced here as one flat manifest.
const STARTER_KITS_API_URL = 'https://compute-starter-kits.fastly.dev/kits';

// All JavaScript and TypeScript kits are reported under this catalog
// language; TypeScript ones are distinguished only by the 'typescript' tag
// (see catalogLanguageFor below).
const CATALOG_LANGUAGE = 'javascript';

const TYPESCRIPT_TAG = 'typescript';
const TYPESCRIPT_PREFIX = 'typescript-';

type CatalogKit = {
  id: string;
  name: string;
  language: string;
  description: string;
  catalog: {
    tags: string[];
  };
};

type CatalogManifest = {
  kits: CatalogKit[];
};

export type StarterKit = {
  // The kit identifier used in a starter-kit/<lang>/<name> --from value,
  // e.g. 'default', 'typescript-default', 'advanced-caching'.
  name: string;
  description: string;
};

// Mirrors starterkit.Kit.KitName() in the Fastly CLI: the ID with its
// language prefix removed.
function kitName(kit: CatalogKit): string {
  const prefix = `${kit.language}-`;
  return kit.id.startsWith(prefix) ? kit.id.slice(prefix.length) : kit.id;
}

function isTypeScriptKit(kit: CatalogKit): boolean {
  return kit.catalog.tags.includes(TYPESCRIPT_TAG);
}

// Fetches the starter-kit manifest and buckets JavaScript/TypeScript kits by
// this tool's Language, live at call time -- no kit list is baked into this
// package, so a kit added/renamed/hidden in the catalog is reflected
// immediately.
export async function fetchStarterKits(): Promise<Record<Language, StarterKit[]>> {
  const url = new URL(STARTER_KITS_API_URL);
  url.searchParams.set('cli', 'true');
  url.searchParams.set('lang', CATALOG_LANGUAGE);

  const response = await fetch(url);
  const { kits } = (await response.json()) as CatalogManifest;

  const result: Record<Language, StarterKit[]> = {
    javascript: [],
    typescript: [],
  };

  for (const kit of kits) {
    if (kit.language !== CATALOG_LANGUAGE) {
      continue;
    }
    const language: Language = isTypeScriptKit(kit) ? 'typescript' : 'javascript';
    result[language].push({
      name: kitName(kit),
      description: kit.description,
    });
  }

  return result;
}

// Converts a user/display-facing short name (e.g. 'default', 'kv-store') into
// the kit name used in a --from value, per the catalog's naming convention:
// TypeScript kits are namespaced with a 'typescript-' prefix within the
// shared 'javascript' catalog language.
export function starterKitNameForLanguage(language: Language, shortName: string): string {
  return language === 'typescript' ? `${TYPESCRIPT_PREFIX}${shortName}` : shortName;
}

// The inverse of starterKitNameForLanguage.
export function starterKitShortName(language: Language, name: string): string {
  if (language === 'typescript') {
    if (!name.startsWith(TYPESCRIPT_PREFIX)) {
      throw new TypeError(`'${name}' is not the name of a TypeScript starter kit`);
    }
    return name.slice(TYPESCRIPT_PREFIX.length);
  }
  return name;
}

// Builds the --from value to hand to `fastly compute init` for a given kit
// name, resolved against the starter-kit edge service.
export function starterKitFrom(name: string): string {
  return `starter-kit/${CATALOG_LANGUAGE}/${name}`;
}