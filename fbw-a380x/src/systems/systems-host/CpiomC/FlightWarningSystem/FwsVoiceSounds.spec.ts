// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FwsAuralsList } from './FwsSoundManager';
import { soundList } from '../../Misc/LegacySoundManager';

describe('A380X sound.xml entries of the new voices', () => {
  const soundDir = resolve(
    __dirname,
    '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/sound',
  );
  const soundXml = readFileSync(resolve(soundDir, 'sound.xml'), 'utf8');
  const waveDataEntries = [...soundXml.matchAll(/<Sound WwiseData="false"[^>]*>/g)].map((m) => m[0]);
  const attribute = (entry: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(entry)?.[1];

  it.each(['priorityLeft', 'priorityRight', 'windshear'])('%s plays a WAV through a Wave Data slot', (aural) => {
    const localVar = FwsAuralsList[aural].localVarName;
    const entry = waveDataEntries.find((e) => attribute(e, 'LocalVar') === localVar);
    expect(entry).toBeDefined();
    // the Wave Data pipeline plays only through its predefined slots (MSFS SDK, Wave Data Sounds Properties)
    expect(attribute(entry!, 'WwiseEvent')).toMatch(
      /^custom_(engine|instrument|ground|misc|rain|rattle|warning_cockpit|warning_headset)_sound_(0[1-9]|1[0-2])$/,
    );
    expect(existsSync(resolve(soundDir, `${attribute(entry!, 'FileName')}.wav`))).toBe(true);
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
