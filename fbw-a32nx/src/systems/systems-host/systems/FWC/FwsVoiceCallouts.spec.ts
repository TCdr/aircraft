// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { FwsAuralsList, FwsSoundManager } from './FwsSoundManager';
import { PseudoFWC } from './PseudoFWC';
import { computeFwcAvailability } from './Logic/FwcAvailability';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the FWC reads (by name), and the times (s) each simvar was written true */
let simvars: Map<string, number>;
let writtenTrueAt: Map<string, number[]>;
let time = 0;

beforeEach(() => {
  simvars = new Map();
  writtenTrueAt = new Map();
  time = 0;
  vi.stubGlobal('GameState', { ingame: 3 });
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simvars.get(name) ?? 0);
  const recordWrite = (name: string, value: unknown) => {
    if (value === true || value === 1) {
      writtenTrueAt.set(name, [...(writtenTrueAt.get(name) ?? []), time]);
    }
  };
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
    recordWrite(name, value);
    return Promise.resolve();
  });
  const registeredNames: string[] = [];
  (SimVar as any).GetRegisteredId = (name: string) => {
    if (!registeredNames.includes(name)) {
      registeredNames.push(name);
    }
    return registeredNames.indexOf(name);
  };
  (SimVar as any).GetSimVarValueFastReg = (id: number) => simvars.get(registeredNames[id]) ?? 0;
  (SimVar as any).GetSimVarValueFastRegString = (id: number) => simvars.get(registeredNames[id]) ?? '';
  (SimVar as any).SetSimVarValueReg = (id: number, value: unknown) => recordWrite(registeredNames[id], value);
});

const normalWord = (value: number) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
const bits = (...set: number[]) => set.reduce((sum, bit) => sum + 2 ** (bit - 1), 0);

/** The real PseudoFWC and its sound manager, both FWCs powered and started */
function createFwc() {
  const bus = new EventBus();
  const startupCompleted = Subject.create(true);
  const fwcAvailability = Subject.create(
    computeFwcAvailability({ fwc1Failed: false, fwc2Failed: false, fwc1Powered: true, fwc2Powered: true }),
  );
  const soundManager = new FwsSoundManager(bus, startupCompleted);
  const fwc = new PseudoFWC(bus, soundManager, startupCompleted, fwcAvailability);
  fwc.init();
  return { fwc, soundManager };
}

/** Runs the FWC and its sound manager for some seconds at the FwsManager rate (60 ms) */
function run(fwc: PseudoFWC, soundManager: FwsSoundManager, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 60) {
    time += 0.06;
    fwc.update(60);
    soundManager.onUpdate(60);
  }
}

describe('A32NX FWC sidestick priority voices on the whole FWC', () => {
  it('PRIORITY LEFT when the FCDC reports the F/O sidestick deactivated for 1 s', () => {
    const { fwc, soundManager } = createFwc();
    run(fwc, soundManager, 1);
    simvars.set('L:A32NX_FCDC_1_DISCRETE_WORD_2', normalWord(bits(29)));
    run(fwc, soundManager, 3);
    const said = writtenTrueAt.get('L:A32NX_FWS_AUDIO_PRIORITY_LEFT') ?? [];
    expect(said).toHaveLength(1);
    expect(said[0]).toBeGreaterThan(1.9);
    expect(said[0]).toBeLessThan(3.5); // 1 s of priority, plus a sound being played at the time
    expect(writtenTrueAt.get('L:A32NX_FWS_AUDIO_PRIORITY_RIGHT')).toBeUndefined();
  });

  it('DUAL INPUT when the FCDC reports both sidesticks deflected', () => {
    const { fwc, soundManager } = createFwc();
    run(fwc, soundManager, 1);
    simvars.set('L:A32NX_FCDC_1_DISCRETE_WORD_2', normalWord(0));
    simvars.set('L:A32NX_FCDC_1_CAPT_PITCH_COMMAND', normalWord(5));
    simvars.set('L:A32NX_FCDC_1_FO_ROLL_COMMAND', normalWord(-5));
    run(fwc, soundManager, 6);
    expect(writtenTrueAt.get('L:A32NX_FWS_AUDIO_DUAL_INPUT')).toHaveLength(2);
  });
});

describe('A32NX WINDSHEAR voice on the whole FWC', () => {
  it('WINDSHEAR (three times in one clip) once when the FACs raise the reactive windshear warning', () => {
    const { fwc, soundManager } = createFwc();
    run(fwc, soundManager, 1);
    simvars.set('L:A32NX_REACTIVE_WINDSHEAR_WARNING', 1);
    run(fwc, soundManager, 10);
    expect(writtenTrueAt.get('L:A32NX_FWS_AUDIO_WINDSHEAR')).toHaveLength(1);
  });
});

describe('A32NX intermediate height callout on the whole FWC', () => {
  it('holding 300 ft: THREE HUNDRED 11 s after the descent below 410 ft, then every 4 s', () => {
    const { fwc, soundManager } = createFwc();
    for (const ra of [1, 2]) {
      simvars.set(`L:A32NX_RA_${ra}_RADIO_ALTITUDE`, normalWord(300));
    }
    run(fwc, soundManager, 20);
    const said = writtenTrueAt.get('L:A32NX_FWS_AUDIO_300') ?? [];
    expect(said.length).toBeGreaterThanOrEqual(3);
    expect(said[0]).toBeGreaterThan(10.9);
    expect(said[0]).toBeLessThan(12.5); // plus a sound being played at the time
    expect(said[1] - said[0]).toBeCloseTo(4, 0);
    expect(writtenTrueAt.get('L:A32NX_FWS_AUDIO_200')).toBeUndefined();
  });
});

describe('Sound files of the FWS voices', () => {
  const soundDir = resolve(
    __dirname,
    '../../../../../src/base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/sound',
  );
  const soundXml = readFileSync(resolve(soundDir, 'sound.xml'), 'utf8');
  const waveDataEntries = [...soundXml.matchAll(/<Sound WwiseData="false"[^>]*>/g)].map((m) => m[0]);
  const attribute = (entry: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(entry)?.[1];

  it.each(['priorityLeft', 'priorityRight', 'dualInput', 'windshear'])(
    '%s plays a WAV through a Wave Data slot',
    (aural) => {
      const localVar = FwsAuralsList[aural].localVarName;
      const entry = waveDataEntries.find((e) => attribute(e, 'LocalVar') === localVar);
      expect(entry).toBeDefined();
      // the Wave Data pipeline plays only through its predefined slots (MSFS SDK, Wave Data Sounds Properties)
      expect(attribute(entry!, 'WwiseEvent')).toMatch(
        /^custom_(engine|instrument|ground|misc|rain|rattle|warning_cockpit|warning_headset)_sound_(0[1-9]|1[0-2])$/,
      );
      expect(existsSync(resolve(soundDir, `${attribute(entry!, 'FileName')}.wav`))).toBe(true);
    },
  );

  it('no Wave Data slot is used twice', () => {
    const slots = waveDataEntries.map((e) => attribute(e, 'WwiseEvent'));
    expect(new Set(slots).size).toBe(slots.length);
  });
});
