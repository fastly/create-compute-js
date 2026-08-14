/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import assert from 'node:assert';
import * as sinon from 'sinon';
import {
  fetchStarterKits,
  starterKitFrom,
  starterKitNameForLanguage,
  starterKitShortName,
} from '../cli/fastlyStarterKits.js';

function catalogKit(overrides: Partial<{
  id: string;
  name: string;
  language: string;
  description: string;
  tags: string[];
}> = {}) {
  const {
    id = 'javascript-default',
    name = 'Default starter for JavaScript',
    language = 'javascript',
    description = 'A basic starter kit.',
    tags = [],
  } = overrides;
  return { id, name, language, description, catalog: { tags } };
}

describe('fastlyStarterKits', () => {

  describe('starterKitNameForLanguage / starterKitShortName', () => {

    it('round-trips a JavaScript short name unchanged', () => {
      const name = starterKitNameForLanguage('javascript', 'kv-store');
      assert.strictEqual(name, 'kv-store');
      assert.strictEqual(starterKitShortName('javascript', name), 'kv-store');
    });

    it('round-trips a TypeScript short name with the typescript- prefix', () => {
      const name = starterKitNameForLanguage('typescript', 'kv-store');
      assert.strictEqual(name, 'typescript-kv-store');
      assert.strictEqual(starterKitShortName('typescript', name), 'kv-store');
    });

    it('follows the default-kit naming convention for both languages', () => {
      assert.strictEqual(starterKitNameForLanguage('javascript', 'default'), 'default');
      assert.strictEqual(starterKitNameForLanguage('typescript', 'default'), 'typescript-default');
    });

    it('throws when asked for the TypeScript short name of a non-prefixed kit name', () => {
      assert.throws(() => starterKitShortName('typescript', 'default'), TypeError);
    });

  });

  describe('starterKitFrom', () => {

    it('builds a starter-kit/<lang>/<name> --from value', () => {
      assert.strictEqual(starterKitFrom('typescript-default'), 'starter-kit/javascript/typescript-default');
      assert.strictEqual(starterKitFrom('empty'), 'starter-kit/javascript/empty');
    });

  });

  describe('fetchStarterKits', () => {

    it('buckets kits into javascript/typescript by the typescript catalog tag', async () => {
      const kits = [
        catalogKit({ id: 'javascript-default', description: 'JS default' }),
        catalogKit({ id: 'javascript-empty', description: 'JS empty' }),
        catalogKit({ id: 'javascript-typescript-default', description: 'TS default', tags: ['typescript'] }),
        // Other languages should be excluded entirely.
        catalogKit({ id: 'go-default', language: 'go', description: 'Go default' }),
      ];
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(
        new Response(JSON.stringify({ kits })),
      );

      const result = await fetchStarterKits();

      assert.deepStrictEqual(result.javascript, [
        { name: 'default', description: 'JS default' },
        { name: 'empty', description: 'JS empty' },
      ]);
      assert.deepStrictEqual(result.typescript, [
        { name: 'typescript-default', description: 'TS default' },
      ]);

      assert.strictEqual(fetchStub.callCount, 1);
      const requestedUrl = new URL(String(fetchStub.firstCall.args[0]));
      assert.strictEqual(requestedUrl.origin + requestedUrl.pathname, 'https://compute-starter-kits.fastly.dev/kits');
      assert.strictEqual(requestedUrl.searchParams.get('cli'), 'true');
      assert.strictEqual(requestedUrl.searchParams.get('lang'), 'javascript');
    });

  });

});
