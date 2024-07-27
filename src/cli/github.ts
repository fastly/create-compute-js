/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { type Repository } from './types.js';

type RepositoryEntry = {
  'full_name': string;
  'description': string;
};

export async function findReposStartWith(token: string | null, org: string, startsWith: string) {

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token != null && token !== '') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `https://api.github.com/orgs/${org}/repos`;
  const prefix = org + '/' + startsWith;

  const results: Repository[] = [];

  let page = 1;
  while(true) {

    const pagedUrl = new URL(url);
    pagedUrl.searchParams.set('page', String(page));

    const response = await fetch(pagedUrl, {
      headers,
    });

    const entries = (await response.json()) as RepositoryEntry[];
    if (entries.length === 0) {
      break;
    }

    for (const entry of entries) {
      if (entry.full_name.startsWith(prefix)) {
        const { full_name: fullName, description } = entry;
        results.push({ fullName, description });
      }
    }

    page = page + 1;
  }

  return results;
}

export function repoNameToPath(fullName: string) {

  return `https://github.com/${fullName}`;

}
