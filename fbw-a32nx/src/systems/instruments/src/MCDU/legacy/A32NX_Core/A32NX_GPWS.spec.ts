// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { A32NX_GPWS } from './A32NX_GPWS';
import { A32NX_SoundManager, soundList } from './A32NX_SoundManager';

const SOUND_FOLDER = resolve(
  __dirname,
  '../../../../../../base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/sound',
);
const SOUND_XML = readFileSync(resolve(SOUND_FOLDER, 'sound.xml'), 'utf8');

/** The Wave Data entries of sound.xml, with their attributes and the inside of the element */
function waveDataSounds(): { attributes: string; body: string }[] {
  const entries: { attributes: string; body: string }[] = [];
  const pattern = /<Sound\s([^>]*WwiseData="false"[^>]*)>([\s\S]*?)<\/Sound>/g;
  let match = pattern.exec(SOUND_XML);
  while (match !== null) {
    entries.push({ attributes: match[1], body: match[2] });
    match = pattern.exec(SOUND_XML);
  }
  return entries;
}

// The GPWS aural output (L:A32NX_GPWS_AURAL_OUTPUT, written by the EGPWC) and the sounds it plays
describe('A32NX GPWS words', () => {
  const gpws = new A32NX_GPWS(null);

  it('PULL UP plays the PULL UP sound', () => {
    expect(gpws.GetWarningFromEnum(1)).toBe(soundList.pull_up);
  });

  it('AVOID TERRAIN no longer plays the PULL UP sound', () => {
    expect(gpws.GetWarningFromEnum(12)).toBe('');
  });

  it('AVOID OBSTACLE plays no sound from the bank either', () => {
    expect(gpws.GetWarningFromEnum(13)).toBe('');
  });

  // The words missing from the sound bank: a Wave Data clip played when the aural output takes the word's value
  describe.each([
    ['gpws_avoid_terrain', 12],
    ['gpws_avoid_obstacle', 13],
  ])('%s', (file, output) => {
    it(`is played on aural output ${output} only`, () => {
      const entries = waveDataSounds().filter((sound) => sound.attributes.includes(`FileName="${file}"`));
      expect(entries).toHaveLength(1);
      expect(entries[0].attributes).toMatch(/LocalVar="A32NX_GPWS_AURAL_OUTPUT"/);
      expect(entries[0].attributes).toMatch(/Continuous="false"/);
      const range = /<Range LowerBound="([\d.]+)" UpperBound="([\d.]+)"\s*\/>/.exec(entries[0].body);
      expect(range).not.toBeNull();
      const [lower, upper] = [Number(range?.[1]), Number(range?.[2])];
      expect(lower).toBeGreaterThan(output - 1);
      expect(lower).toBeLessThan(output);
      expect(upper).toBeGreaterThan(output);
      expect(upper).toBeLessThan(output + 1);
    });

    it('has its clip in the sound folder', () => {
      expect(existsSync(resolve(SOUND_FOLDER, `${file}.wav`))).toBe(true);
    });
  });

  describe('saying the words', () => {
    /**
     * Runs the GPWS module the way the MCDU core does: the sound manager's update first, then the module's, every
     * updateS seconds. The output is given as a function of time; returns when each sound was started.
     */
    function sayWords(output: (timeS: number) => number, updateS: number, durationS: number) {
      const started: { timeS: number; name: string; output: number }[] = [];
      let timeS = 0;
      vi.stubGlobal('SimVar', { GetSimVarValue: () => output(timeS) });
      vi.stubGlobal('Coherent', {
        call: (_: string, name: string) => {
          started.push({ timeS, name, output: output(timeS) });
          return Promise.resolve();
        },
      });
      const soundManager = new A32NX_SoundManager();
      const module = new A32NX_GPWS({ soundManager });
      for (; timeS <= durationS; timeS += updateS) {
        soundManager.update(updateS * 1000);
        module.update(updateS * 1000, null);
      }
      vi.unstubAllGlobals();
      return started;
    }

    it('says a word held on the output again every 1.1 s', () => {
      const started = sayWords(() => 1, 0.1, 3.5);
      expect(started.length).toBeGreaterThanOrEqual(3);
      expect(started.every((s) => s.name === soundList.pull_up.name)).toBe(true);
      for (let i = 1; i < started.length; i++) {
        const spacing = started[i].timeS - started[i - 1].timeS;
        expect(spacing).toBeGreaterThan(1.1 - 1e-6);
        expect(spacing).toBeLessThan(1.25);
      }
    });

    // The predictive words come as pulses: 0.5 s on the output, then 1 s off
    const pulses = (timeS: number) => (timeS % 1.5 < 0.5 ? 1 : 0);

    it('says each pulsed word once', () => {
      const started = sayWords(pulses, 0.05, 6);
      expect(started).toHaveLength(4);
    });

    it('never starts a word that has left the output, however late the MCDU updates', () => {
      const started = sayWords(pulses, 0.6, 9);
      expect(started.length).toBeGreaterThan(0);
      expect(started.every((s) => s.output === 1)).toBe(true);
    });
  });

  it('no two Wave Data entries share an event slot', () => {
    const slots = waveDataSounds().map((sound) => /WwiseEvent="([^"]+)"/.exec(sound.attributes)?.[1]);
    expect(new Set(slots).size).toBe(slots.length);
  });
});
