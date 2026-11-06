// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FwsLowEnergyAural, isLowEnergy, LowEnergyAuralInputs, selectLowSpeedLimit } from './FwsLowEnergyAural';
import { FwcFlightPhase } from './FwsFlightPhases';
import { expectCode, readSource, runFwsCoreStatement } from './FwsSpecSource';

/** CONF 2S (flaps index 4) on approach at 1000 ft RA, steady energy; the alert speed is 135 kt (a quarter of the way from Vprot to VLS) */
const approach: LowEnergyAuralInputs = {
  casKt: 140,
  vlsKt: 150,
  lowSpeedLimitKt: 130,
  flightPathAngleDeg: 0,
  speedTrendKt: 0,
  radioHeightFt: 1_000,
  flightPhase: FwcFlightPhase.AtOrBelow800Feet,
  flapsConfIndex: 4,
  anyThrustLeverToga: false,
  alphaFloorActive: false,
};

describe('A380 SPEED SPEED SPEED alert condition', () => {
  it('steady energy: the alert speed is a quarter of the way from Vprot to VLS', () => {
    expect(isLowEnergy({ ...approach, casKt: 134 })).toBe(true);
    expect(isLowEnergy({ ...approach, casKt: 136 })).toBe(false);
  });

  it('landing, negative flight path angle or speed trend: the alert speed is closer to VLS', () => {
    expect(isLowEnergy({ ...approach, casKt: 144, flightPathAngleDeg: -1 })).toBe(true);
    expect(isLowEnergy({ ...approach, casKt: 144, speedTrendKt: -1 })).toBe(true);
    expect(isLowEnergy({ ...approach, casKt: 146, flightPathAngleDeg: -1 })).toBe(false);
    expect(isLowEnergy({ ...approach, casKt: 144 })).toBe(false);
  });

  it('takeoff: a negative speed trend or flight path angle does not move the alert speed', () => {
    const takeoff = { ...approach, flightPhase: FwcFlightPhase.AtOrAbove400Feet, radioHeightFt: 500, casKt: 144 };
    expect(isLowEnergy({ ...takeoff, speedTrendKt: -1 })).toBe(false);
    expect(isLowEnergy({ ...takeoff, flightPathAngleDeg: -1 })).toBe(false);
    expect(isLowEnergy({ ...takeoff, casKt: 134, speedTrendKt: -1 })).toBe(true);
    expect(isLowEnergy({ ...takeoff, speedTrendKt: -1, flightPhase: FwcFlightPhase.AtOrBelow800Feet })).toBe(true);
  });

  it('only in CONF 2, 2S, 3 and FULL', () => {
    for (const flapsConfIndex of [0, 1, 2]) {
      expect(isLowEnergy({ ...approach, casKt: 134, flapsConfIndex })).toBe(false);
    }
    for (const flapsConfIndex of [3, 4, 5, 6]) {
      expect(isLowEnergy({ ...approach, casKt: 134, flapsConfIndex })).toBe(true);
    }
  });

  it('only below 2500 ft RA', () => {
    expect(isLowEnergy({ ...approach, casKt: 134, radioHeightFt: 2_500 })).toBe(false);
    expect(isLowEnergy({ ...approach, casKt: 134, radioHeightFt: 2_499 })).toBe(true);
  });

  it('landing: only above 100 ft RA', () => {
    for (const flightPhase of [FwcFlightPhase.AtOrBelow800Feet, FwcFlightPhase.AtOrAbove1500FeetTo800Feet]) {
      expect(isLowEnergy({ ...approach, casKt: 134, flightPhase, radioHeightFt: 99 })).toBe(false);
      expect(isLowEnergy({ ...approach, casKt: 134, flightPhase, radioHeightFt: 101 })).toBe(true);
    }
  });

  it('takeoff: only above 200 ft RA', () => {
    for (const flightPhase of [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet]) {
      expect(isLowEnergy({ ...approach, casKt: 134, flightPhase, radioHeightFt: 199 })).toBe(false);
      expect(isLowEnergy({ ...approach, casKt: 134, flightPhase, radioHeightFt: 201 })).toBe(true);
    }
  });

  it('not in the other flight phases', () => {
    for (const flightPhase of [FwcFlightPhase.ElecPwr, FwcFlightPhase.TouchDown]) {
      expect(isLowEnergy({ ...approach, casKt: 134, flightPhase })).toBe(false);
    }
  });

  it('not with a thrust lever at TOGA or with the alpha floor active', () => {
    expect(isLowEnergy({ ...approach, casKt: 134, anyThrustLeverToga: true })).toBe(false);
    expect(isLowEnergy({ ...approach, casKt: 134, alphaFloorActive: true })).toBe(false);
  });

  it('not when an input is missing', () => {
    const inputsWithoutOne: Partial<LowEnergyAuralInputs>[] = [
      { casKt: null },
      { vlsKt: null },
      { lowSpeedLimitKt: null },
      { flightPathAngleDeg: null },
      { speedTrendKt: null },
      { radioHeightFt: null },
    ];
    for (const missing of inputsWithoutOne) {
      expect(isLowEnergy({ ...approach, casKt: 134, ...missing })).toBe(false);
    }
  });
});

describe('A380 SPEED SPEED SPEED low speed limit', () => {
  const word = (value: number, normal: boolean) => ({ value, isNormalOperation: () => normal });

  it('uses Vprot when it is valid', () => {
    expect(selectLowSpeedLimit(word(130, true), word(120, true))).toBe(130);
  });

  it('uses the stall warning speed outside normal law, where Vprot is not valid', () => {
    expect(selectLowSpeedLimit(word(130, false), word(120, true))).toBe(120);
  });

  it('gives none when neither is valid', () => {
    expect(selectLowSpeedLimit(word(130, false), word(120, false))).toBeNull();
  });
});

describe('A380 SPEED SPEED SPEED call timing', () => {
  const lowEnergy: LowEnergyAuralInputs = { ...approach, casKt: 134 };
  const recovered: LowEnergyAuralInputs = { ...approach, casKt: 150 };
  const STEP_SECONDS = 0.06;

  it('calls at once, then every 5 s while the low energy lasts', () => {
    const aural = new FwsLowEnergyAural();
    expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBe('say');
    // 82 steps of 60 ms = 4.92 s since the call
    for (let step = 0; step < 82; step++) {
      expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBeNull();
    }
    expect(aural.update(lowEnergy, false, 0.1)).toBe('say');
  });

  it('a return of the low energy within 5 s of the last call waits for the rest of the 5 s', () => {
    const aural = new FwsLowEnergyAural();
    expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBe('say');
    expect(aural.update(recovered, false, 2)).toBe('stop');
    expect(aural.update(lowEnergy, false, 2.9)).toBeNull();
    expect(aural.update(lowEnergy, false, 0.2)).toBe('say');
  });

  it('a return of the low energy more than 5 s after the last call calls at once', () => {
    const aural = new FwsLowEnergyAural();
    expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBe('say');
    expect(aural.update(recovered, false, 5.1)).toBe('stop');
    expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBe('say');
  });

  it('reports the end of the low energy once, to stop a queued or running call', () => {
    const aural = new FwsLowEnergyAural();
    expect(aural.update(recovered, false, STEP_SECONDS)).toBeNull();
    expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBe('say');
    expect(aural.update(recovered, false, STEP_SECONDS)).toBe('stop');
    expect(aural.update(recovered, false, STEP_SECONDS)).toBeNull();
  });

  it('waits while a GPWS alert is active and calls on the first sample after it', () => {
    const aural = new FwsLowEnergyAural();
    expect(aural.update(lowEnergy, true, STEP_SECONDS)).toBeNull();
    expect(aural.update(lowEnergy, true, STEP_SECONDS)).toBeNull();
    expect(aural.update(lowEnergy, false, STEP_SECONDS)).toBe('say');
  });
});

describe('A380 SPEED SPEED SPEED in FwsCore', () => {
  const source = readSource('FwsCore.ts');

  it('enqueues the voice', () => {
    expectCode(source, "this.soundManager.enqueueSound('speedSpeedSpeed')");
    expectCode(source, "this.soundManager.dequeueSound('speedSpeedSpeed')");
  });

  it('reads the PRIM words that the wasm writes', () => {
    for (const word of ['V_LS', 'V_ALPHA_PROT', 'V_STALL_WARN', 'GAMMA_T', 'SPEED_TREND']) {
      expectCode(source, `L:A32NX_PRIM_\${prim}_${word}`);
    }
  });

  const leverPositions = (positions: number[]) => ({
    throttle1Position: positions[0],
    throttle2Position: positions[1],
    throttle3Position: positions[2],
    throttle4Position: positions[3],
    anyThrottleToga: false,
  });

  it('anyThrottleToga: one lever at TOGA is enough', () => {
    const result = runFwsCoreStatement(source, 'this.anyThrottleToga.set(', leverPositions([10, 45, 10, 10]));
    expect(result.anyThrottleToga).toBe(true);
  });

  it('anyThrottleToga: false with all levers below TOGA', () => {
    const result = runFwsCoreStatement(source, 'this.anyThrottleToga.set(', leverPositions([44, 44, 44, 44]));
    expect(result.anyThrottleToga).toBe(false);
  });
});
