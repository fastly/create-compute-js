/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

export type Language = 'javascript' | 'typescript';

export type Repository = {
  fullName: string;
  description: string;
};

export type RepoShort = {
  shortName: string;
  description: string;
};
