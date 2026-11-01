// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { flatten } from './mergeTranslations';

// The language files are read from disk rather than through translation.ts, which needs the sim's data store.
const dataDir = path.join(__dirname, 'data');
const readLanguage = (file: string) => flatten(JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')));
const english = readLanguage('en.json');

const placeholders = (text: string) => (text.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) || []).sort();

// Only the language files translation.ts imports reach the picker; the others on disk stay untested.
const importedLanguageFiles = (): string[] => {
  const source = fs.readFileSync(path.join(__dirname, 'translation.ts'), 'utf8');
  const files: string[] = [];
  const importPattern = /from '\.\/data\/([^']+\.json)'/g;
  let match = importPattern.exec(source);
  while (match) {
    if (match[1] !== 'en.json') files.push(match[1]);
    match = importPattern.exec(source);
  }
  return files;
};

describe('flyPad language files', () => {
  const files = importedLanguageFiles();

  it('finds the languages of the picker', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  describe.each(files)('%s', (file) => {
    const translated = readLanguage(file);

    it('has a text for every key of en.json', () => {
      expect(Object.keys(english).filter((key) => !(key in translated))).toEqual([]);
    });

    it('has no key en.json lacks', () => {
      expect(Object.keys(translated).filter((key) => !(key in english))).toEqual([]);
    });

    it('has no empty text', () => {
      expect(Object.keys(translated).filter((key) => translated[key].trim() === '')).toEqual([]);
    });

    it('keeps the placeholders of each text', () => {
      const broken = Object.keys(english).filter(
        (key) => key in translated && placeholders(translated[key]).join() !== placeholders(english[key]).join(),
      );
      expect(broken).toEqual([]);
    });
  });
});
