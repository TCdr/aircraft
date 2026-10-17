// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { CVR_AUTO_RUN_TIME_SECONDS, CVR_TEST_TONE_VAR, CvrInputs, CvrPowerLogic } from './CockpitVoiceRecorder';

/** Cold and dark with the network just energized: on the ground, engines off, GND CTL AUTO, parking brake on */
const COLD: CvrInputs = {
  networkPowered: true,
  onGround: true,
  anyEngineRunning: false,
  groundControlOn: false,
  parkingBrakeOn: true,
  testPressed: false,
};

/** Runs the logic for the given time, in steps of 1 s, and returns the last outputs */
function run(logic: CvrPowerLogic, seconds: number, inputs: CvrInputs) {
  let outputs = logic.update(0, inputs);
  for (let t = 0; t < seconds; t++) {
    outputs = logic.update(1, inputs);
  }
  return outputs;
}

/*
 * The CVR is energized automatically on the ground during the first 5 min after the network is energized, on the
 * ground with one engine running, in flight; it stops 5 min after the last engine shutdown; GND CTL energizes it
 * manually.
 */
describe('A32NX CVR power logic', () => {
  it('runs during the first 5 min after the network is energized, then stops', () => {
    const logic = new CvrPowerLogic();
    expect(run(logic, CVR_AUTO_RUN_TIME_SECONDS - 1, COLD).energized).toBe(true);
    expect(run(logic, 2, COLD).energized).toBe(false);
  });

  it('starts a new 5 min window at the next power-up', () => {
    const logic = new CvrPowerLogic();
    run(logic, CVR_AUTO_RUN_TIME_SECONDS + 10, COLD);
    expect(logic.update(1, { ...COLD, networkPowered: false }).energized).toBe(false);
    expect(run(logic, 10, COLD).energized).toBe(true);
  });

  it('runs on the ground with GND CTL ON', () => {
    const logic = new CvrPowerLogic();
    run(logic, CVR_AUTO_RUN_TIME_SECONDS + 10, COLD);
    expect(logic.update(1, { ...COLD, groundControlOn: true }).energized).toBe(true);
  });

  it('runs with one engine running and in flight, and stops 5 min after the last engine shutdown', () => {
    const logic = new CvrPowerLogic();
    run(logic, CVR_AUTO_RUN_TIME_SECONDS + 10, COLD);
    expect(logic.update(1, { ...COLD, anyEngineRunning: true }).energized).toBe(true);
    expect(run(logic, 3600, { ...COLD, anyEngineRunning: true, onGround: false }).energized).toBe(true);
    // landed, engines shut down: still running for 5 min
    expect(run(logic, CVR_AUTO_RUN_TIME_SECONDS - 2, COLD).energized).toBe(true);
    expect(run(logic, 3, COLD).energized).toBe(false);
  });

  it('runs in flight with all engines out', () => {
    const logic = new CvrPowerLogic();
    expect(run(logic, CVR_AUTO_RUN_TIME_SECONDS + 10, { ...COLD, onGround: false }).energized).toBe(true);
  });

  it('is off without electrical power, even with GND CTL ON', () => {
    const logic = new CvrPowerLogic();
    expect(logic.update(1, { ...COLD, networkPowered: false, groundControlOn: true }).energized).toBe(false);
  });
});

/*
 * CVR TEST pb: tests the CVR if it is on (GND CTL pb-sw pressed, or during the first 5 min after the network is
 * energized) and the parking brake is on.
 */
describe('A32NX CVR TEST pb', () => {
  it('gives the test signal in the first 5 min after power-up without GND CTL', () => {
    const logic = new CvrPowerLogic();
    expect(run(logic, 60, { ...COLD, testPressed: true }).testTone).toBe(true);
  });

  it('gives no test signal once the CVR has stopped, until GND CTL is ON', () => {
    const logic = new CvrPowerLogic();
    expect(run(logic, CVR_AUTO_RUN_TIME_SECONDS + 10, { ...COLD, testPressed: true }).testTone).toBe(false);
    expect(logic.update(1, { ...COLD, testPressed: true, groundControlOn: true }).testTone).toBe(true);
  });

  it('gives no test signal with the parking brake off', () => {
    const logic = new CvrPowerLogic();
    expect(logic.update(1, { ...COLD, testPressed: true, groundControlOn: true, parkingBrakeOn: false }).testTone).toBe(
      false,
    );
  });

  it('gives no signal when the pb is not pressed', () => {
    const logic = new CvrPowerLogic();
    expect(logic.update(1, { ...COLD, groundControlOn: true }).testTone).toBe(false);
  });
});

describe('A32NX CVR test sound wiring (sound.xml)', () => {
  const soundXml = readFileSync(
    resolve(
      __dirname,
      '../../../../base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/sound/sound.xml',
    ),
    'utf-8',
  );
  const cvrTestSound = soundXml.match(/<Sound[^>]*WwiseEvent="cvr_test"[^>]*>[\s\S]*?<\/Sound>/)?.[0] ?? '';

  it('plays the cvr_test sound on the test signal of the CVR logic, not on the pb alone', () => {
    expect(cvrTestSound).not.toBe('');
    expect(cvrTestSound).toContain(`LocalVar="${CVR_TEST_TONE_VAR.replace('L:', '')}"`);
    // the GND CTL condition is now inside the CVR logic (the first 5 min window works without GND CTL)
    expect(cvrTestSound).not.toContain('A32NX_RCDR_GROUND_CONTROL_ON');
  });
});
