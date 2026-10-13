// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FwsAuralsList } from './FwsSoundManager';
import { soundList } from '../../Misc/LegacySoundManager';
import { INTERMEDIATE_CALLOUT_CEILING_FT, intermediateCalloutWords } from '../../../shared/src/AutoCallOuts';

describe('A380X sound.xml entries of the new voices', () => {
  const soundDir = resolve(
    __dirname,
    '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/sound',
  );
  const soundXml = readFileSync(resolve(soundDir, 'sound.xml'), 'utf8');
  const waveDataEntries = [...soundXml.matchAll(/<Sound WwiseData="false"[^>]*>/g)].map((m) => m[0]);
  const attribute = (entry: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(entry)?.[1];

  // the clips of tools/fws-voice/generate.py: the voices, and the words of the intermediate callout below 100 ft
  const clipAurals = [
    'priorityLeft',
    'priorityRight',
    'windshear',
    'pitchPitch',
    'companyMessage',
    ...[1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((feet) => `intermediate_${feet}`),
  ];

  it.each(clipAurals)('%s plays a WAV through a Wave Data slot', (aural) => {
    const localVar = FwsAuralsList[aural].localVarName;
    const entry = waveDataEntries.find((e) => attribute(e, 'LocalVar') === localVar);
    expect(entry).toBeDefined();
    // the Wave Data pipeline plays only through its predefined slots (MSFS SDK, Wave Data Sounds Properties)
    expect(attribute(entry!, 'WwiseEvent')).toMatch(
      /^custom_(engine|instrument|ground|misc|rain|rattle|warning_cockpit|warning_headset)_sound_(0[1-9]|1[0-2])$/,
    );
    expect(existsSync(resolve(soundDir, `${attribute(entry!, 'FileName')}.wav`))).toBe(true);
  });

  it('every word of the intermediate callout is an FWS sound (shared/src/AutoCallOuts.ts)', () => {
    for (let height = 0; height < INTERMEDIATE_CALLOUT_CEILING_FT; height += 0.5) {
      for (const word of intermediateCalloutWords(height)) {
        expect(FwsAuralsList[word]).toBeDefined();
      }
    }
  });

  it('no Wave Data slot is used twice', () => {
    const slots = waveDataEntries.map((e) => attribute(e, 'WwiseEvent'));
    expect(new Set(slots).size).toBe(slots.length);
  });

  it.each(['terrain', 'glideslope_quiet', 'glideslope_loud'])(
    'the GPWS %s voice is declared in the AvionicSounds (played by name by the systems host)',
    (sound) => {
      const avionicSounds = /<AvionicSounds>([\s\S]*)<\/AvionicSounds>/.exec(soundXml)?.[1] ?? '';
      expect(avionicSounds).toContain(`WwiseEvent="${soundList[sound].name}"`);
    },
  );
});
