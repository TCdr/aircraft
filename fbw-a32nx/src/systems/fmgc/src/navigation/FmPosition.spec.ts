// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { distanceTo } from 'msfs-geo';
import { FmNavigationMode } from './PositionUncertainty';
import {
  A320_FM_POSITION_CONFIG,
  A380_FM_POSITION_CONFIG,
  a320FmGpsDisagreeThreshold,
  a380FmGpsDisagreeThreshold,
  applyOffset,
  biasTimeConstant,
  FmPositionBias,
  FmPositionComputer,
  FmPositionInputs,
  irsUsedCount,
  isFmGpsPositionDisagree,
  isFmIrPositionDisagree,
  longitudeDifference,
  navigationModeText,
  positionOffset,
  selectGpirs,
  takeoffUpdatePosition,
} from './FmPosition';

/** One minute of arc, in degrees */
const MINUTE = 1 / 60;

describe('FM position bias', () => {
  it('starts at the GPIRS position at flight initialisation, else at the MIX IRS position', () => {
    const withGps = new FmPositionBias();
    withGps.update(0.1, true, { lat: 0.001, long: -0.002 }, true, 0);
    expect(withGps.initialised).toBe(true);
    expect(withGps.offset).toEqual({ lat: 0.001, long: -0.002 });

    const withoutGps = new FmPositionBias();
    withoutGps.update(0.1, true, null, true, 0);
    expect(withoutGps.initialised).toBe(true);
    expect(withoutGps.offset).toEqual({ lat: 0, long: 0 });
  });

  it('has no FM position without an inertial position, and is initialised again after it', () => {
    const bias = new FmPositionBias();
    bias.update(0.1, false, { lat: 0.001, long: 0.001 }, true, 0);
    expect(bias.initialised).toBe(false);
    bias.update(0.1, true, { lat: 0.001, long: 0.001 }, true, 0);
    bias.update(0.1, false, null, true, 0);
    expect(bias.initialised).toBe(false);
    expect(bias.offset).toEqual({ lat: 0, long: 0 });
  });

  it('approaches the GPIRS or radio position with the time constant of the altitude', () => {
    const bias = new FmPositionBias();
    bias.update(0.1, true, null, true, 0);
    // one time constant at sea level (10 s): 1 - 1/e of the way
    bias.update(10, true, { lat: 0.01, long: 0.02 }, true, 0);
    expect(bias.offset.lat).toBeCloseTo(0.01 * (1 - Math.exp(-1)), 9);
    expect(bias.offset.long).toBeCloseTo(0.02 * (1 - Math.exp(-1)), 9);
    // a long time later it is there
    bias.update(600, true, { lat: 0.01, long: 0.02 }, true, 0);
    expect(bias.offset.lat).toBeCloseTo(0.01, 9);
    expect(bias.offset.long).toBeCloseTo(0.02, 9);
  });

  it('converges by 63 % in 10 s of elapsed time when fed in 250 ms steps at sea level', () => {
    const bias = new FmPositionBias();
    bias.update(0.1, true, null, true, 0);
    for (let step = 0; step < 40; step++) {
      bias.update(0.25, true, { lat: 0.01, long: 0 }, true, 0);
    }
    expect(bias.offset.lat).toBeCloseTo(0.01 * (1 - Math.exp(-1)), 9);
  });

  it('approaches slower at a higher altitude', () => {
    expect(biasTimeConstant(0)).toBe(10);
    expect(biasTimeConstant(20_000)).toBe(35);
    expect(biasTimeConstant(40_000)).toBe(60);
    expect(biasTimeConstant(45_000)).toBe(60);
    expect(biasTimeConstant(-500)).toBe(10);

    const low = new FmPositionBias();
    const high = new FmPositionBias();
    for (const bias of [low, high]) {
      bias.update(0.1, true, null, true, 0);
    }
    low.update(5, true, { lat: 0.01, long: 0 }, true, 1_000);
    high.update(5, true, { lat: 0.01, long: 0 }, true, 39_000);
    expect(low.offset.lat).toBeGreaterThan(high.offset.lat);
  });

  it('memorises the bias when the radio/GPIRS position is lost, or while it may not approach it', () => {
    const bias = new FmPositionBias();
    bias.update(0.1, true, { lat: 0.003, long: 0.004 }, true, 0);
    bias.update(600, true, null, true, 0);
    expect(bias.offset).toEqual({ lat: 0.003, long: 0.004 });
    bias.update(600, true, { lat: 0, long: 0 }, false, 0);
    expect(bias.offset).toEqual({ lat: 0.003, long: 0.004 });
  });

  it('takes a position update (takeoff or manual) once initialised', () => {
    const bias = new FmPositionBias();
    bias.set({ lat: 1, long: 1 });
    expect(bias.initialised).toBe(false);
    bias.update(0.1, true, null, true, 0);
    bias.set({ lat: 0.002, long: -0.001 });
    expect(bias.offset).toEqual({ lat: 0.002, long: -0.001 });
    // in IRS only it stays
    bias.update(600, true, null, true, 0);
    expect(bias.offset).toEqual({ lat: 0.002, long: -0.001 });
  });

  it('wraps the longitude across the antimeridian', () => {
    expect(longitudeDifference(-179.9, 179.9)).toBeCloseTo(0.2, 9);
    expect(longitudeDifference(179.9, -179.9)).toBeCloseTo(-0.2, 9);
    expect(positionOffset({ lat: 10, long: 179.95 }, { lat: 10.01, long: -179.95 }).long).toBeCloseTo(0.1, 9);
    const out = { lat: 0, long: 0 };
    applyOffset({ lat: 10, long: 179.95 }, { lat: 0.01, long: 0.1 }, out);
    expect(out.lat).toBeCloseTo(10.01, 9);
    expect(out.long).toBeCloseTo(-179.95, 9);
  });
});

describe('FM position update at takeoff (runway threshold + TO SHIFT)', () => {
  const start = { lat: 45, long: 7 };

  it('is the beginning of the runway without a takeoff shift', () => {
    expect(takeoffUpdatePosition(start, 90, null)).toEqual(start);
    expect(takeoffUpdatePosition(start, 90, 0)).toEqual(start);
  });

  it('moves the takeoff shift along the runway', () => {
    const shifted = takeoffUpdatePosition(start, 90, 926);
    expect(distanceTo(start, shifted)).toBeCloseTo(0.5, 3);
    expect(shifted.long).toBeGreaterThan(start.long);
    expect(shifted.lat).toBeCloseTo(start.lat, 3);
  });
});

describe('FM/GPS POS DISAGREE thresholds', () => {
  it('uses the A320 thresholds', () => {
    expect(a320FmGpsDisagreeThreshold(40)).toEqual({ latitude: 0.5, longitude: 0.5 });
    expect(a320FmGpsDisagreeThreshold(-54.9)).toEqual({ latitude: 0.5, longitude: 0.5 });
    expect(a320FmGpsDisagreeThreshold(55)).toEqual({ latitude: 0.5, longitude: 0.9 });
    expect(a320FmGpsDisagreeThreshold(-69.9)).toEqual({ latitude: 0.5, longitude: 0.9 });
    expect(a320FmGpsDisagreeThreshold(70)).toEqual({ latitude: 0.5, longitude: null });
  });

  it('uses the A380 thresholds', () => {
    expect(a380FmGpsDisagreeThreshold(44.9)).toEqual({ latitude: 0.5, longitude: 0.5 });
    expect(a380FmGpsDisagreeThreshold(-45)).toEqual({ latitude: 0.5, longitude: 0.7 });
    expect(a380FmGpsDisagreeThreshold(60)).toEqual({ latitude: 0.5, longitude: 1 });
    expect(a380FmGpsDisagreeThreshold(70)).toEqual({ latitude: 0.5, longitude: null });
  });

  it('triggers when one FM position and one GPS position differ by more than the latitude threshold', () => {
    const fm = { lat: 40, long: 10 };
    expect(isFmGpsPositionDisagree([fm], [{ lat: 40 + 0.4 * MINUTE, long: 10 }], a320FmGpsDisagreeThreshold)).toBe(
      false,
    );
    expect(isFmGpsPositionDisagree([fm], [{ lat: 40 - 0.6 * MINUTE, long: 10 }], a320FmGpsDisagreeThreshold)).toBe(
      true,
    );
    // either FM position against either GPS position
    expect(
      isFmGpsPositionDisagree(
        [fm, { lat: 40 + 0.6 * MINUTE, long: 10 }],
        [null, { lat: 40, long: 10 }],
        a320FmGpsDisagreeThreshold,
      ),
    ).toBe(true);
  });

  it('applies the longitude threshold of the latitude band of each aircraft', () => {
    const fm = { lat: 50, long: 10 };
    const gps = [{ lat: 50, long: 10 + 0.6 * MINUTE }];
    expect(isFmGpsPositionDisagree([fm], gps, a320FmGpsDisagreeThreshold)).toBe(true);
    expect(isFmGpsPositionDisagree([fm], gps, a380FmGpsDisagreeThreshold)).toBe(false);
    // above 70 degrees a longitude difference does not trigger
    const polar = { lat: 75, long: 10 };
    expect(isFmGpsPositionDisagree([polar], [{ lat: 75, long: 12 }], a320FmGpsDisagreeThreshold)).toBe(false);
    // across the antimeridian
    expect(
      isFmGpsPositionDisagree([{ lat: 0, long: 179.999 }], [{ lat: 0, long: -179.999 }], a320FmGpsDisagreeThreshold),
    ).toBe(false);
  });

  it('does not trigger without a valid GPS position', () => {
    expect(isFmGpsPositionDisagree([{ lat: 0, long: 0 }], [null, null], a320FmGpsDisagreeThreshold)).toBe(false);
  });
});

describe('GPIRS selection and IRS count', () => {
  it('selects onside, GPIRS 3, offside for each FMS', () => {
    expect(selectGpirs(1, [true, true, true])).toBe(1);
    expect(selectGpirs(2, [true, true, true])).toBe(2);
    expect(selectGpirs(1, [false, true, true])).toBe(3);
    expect(selectGpirs(2, [true, false, false])).toBe(1);
    expect(selectGpirs(2, [false, false, false])).toBe(null);
  });

  it('uses the MIX IRS (3 IRS) only with the three IRS positions', () => {
    expect(irsUsedCount(3)).toBe(3);
    expect(irsUsedCount(2)).toBe(1);
    expect(irsUsedCount(1)).toBe(1);
    expect(irsUsedCount(0)).toBe(0);
  });

  it('writes the navigation mode as the position pages show it', () => {
    expect(navigationModeText(3, FmNavigationMode.IrsGps)).toBe('3 IRS/GPS');
    expect(navigationModeText(1, FmNavigationMode.IrsDmeDme)).toBe('1 IRS/DME/DME');
    expect(navigationModeText(3, FmNavigationMode.IrsVorDme)).toBe('3 IRS/VOR/DME');
    expect(navigationModeText(3, FmNavigationMode.IrsOnly)).toBe('3 IRS');
    expect(navigationModeText(0, FmNavigationMode.IrsOnly)).toBe('');
  });
});

describe('FM position computation (FmPositionComputer)', () => {
  const sim = { lat: 45, long: 7 };
  /** A GPS error of about 0.05 NM north (GPIRS 1) and 0.1 NM north (GPIRS 2) */
  const gpirs1 = { lat: 45 + 0.05 / 60, long: 7 };
  const gpirs2 = { lat: 45 + 0.1 / 60, long: 7 };

  const inputs = (overrides: Partial<FmPositionInputs> = {}): FmPositionInputs => ({
    deltaTime: 0.1,
    simPosition: sim,
    irPositions: [sim, sim, sim],
    gpirsPositions: [gpirs1, gpirs2, gpirs1],
    gpsPositions: [gpirs1, gpirs2],
    gpsDeselected: false,
    navigationMode: FmNavigationMode.IrsGps,
    gpsPrimary: true,
    onGround: true,
    altitude: 0,
    ...overrides,
  });

  it('is the onside GPIRS position for each FMS in the IRS/GPS mode', () => {
    const computer = new FmPositionComputer(A320_FM_POSITION_CONFIG);
    computer.update(inputs());
    expect(computer.isValid).toBe(true);
    expect(computer.fmPositions[0].lat).toBeCloseTo(gpirs1.lat, 9);
    expect(computer.fmPositions[1].lat).toBeCloseTo(gpirs2.lat, 9);
  });

  it('has no FM position without an IR position', () => {
    const computer = new FmPositionComputer();
    computer.update(inputs({ irPositions: [null, null, null] }));
    expect(computer.isValid).toBe(false);
    expect(computer.manualUpdate(sim)).toBe(false);
  });

  it('keeps the bias on ground in a radio mode and approaches the radio position in flight', () => {
    const computer = new FmPositionComputer();
    computer.update(inputs({ navigationMode: FmNavigationMode.IrsOnly, gpirsPositions: [null, null, null] }));
    // the crew updates the position 0.5 NM north
    const updated = { lat: 45 + 0.5 / 60, long: 7 };
    expect(computer.manualUpdate(updated)).toBe(true);
    expect(computer.fmPositions[0].lat).toBeCloseTo(updated.lat, 9);
    computer.update(inputs({ navigationMode: FmNavigationMode.IrsDmeDme, deltaTime: 600, onGround: true }));
    expect(computer.fmPositions[0].lat).toBeCloseTo(updated.lat, 9);
    computer.update(inputs({ navigationMode: FmNavigationMode.IrsDmeDme, deltaTime: 600, onGround: false }));
    expect(computer.fmPositions[0].lat).toBeCloseTo(sim.lat, 6);
  });

  it('memorises the bias in IRS only', () => {
    const computer = new FmPositionComputer();
    computer.update(inputs());
    computer.update(inputs({ navigationMode: FmNavigationMode.IrsOnly, deltaTime: 3600, onGround: false }));
    expect(computer.fmPositions[0].lat).toBeCloseTo(gpirs1.lat, 9);
  });

  it('does not allow a manual update in the IRS/GPS mode', () => {
    const computer = new FmPositionComputer();
    computer.update(inputs());
    expect(computer.manualUpdate({ lat: 46, long: 7 })).toBe(false);
    expect(computer.fmPositions[0].lat).toBeCloseTo(gpirs1.lat, 9);
  });

  it('updates the position at takeoff unless GPS PRIMARY (A320) or the IRS/GPS mode (A380) inhibits it', () => {
    const start = { lat: 45.01, long: 7 };
    const a320 = new FmPositionComputer(A320_FM_POSITION_CONFIG);
    a320.update(inputs());
    expect(a320.takeoffUpdate(start, 0, null)).toBeNull();
    // A320: IRS/GPS mode without GPS PRIMARY, the update is done
    a320.update(inputs({ gpsPrimary: false }));
    expect(a320.takeoffUpdate(start, 0, null)).toEqual(start);
    expect(a320.fmPositions[0].lat).toBeCloseTo(start.lat, 9);
    expect(a320.fmPositions[1].lat).toBeCloseTo(start.lat, 9);

    const a380 = new FmPositionComputer(A380_FM_POSITION_CONFIG);
    a380.update(inputs({ gpsPrimary: false }));
    expect(a380.takeoffUpdate(start, 0, null)).toBeNull();
    a380.update(inputs({ navigationMode: FmNavigationMode.IrsDmeDme, gpsDeselected: true }));
    const shifted = a380.takeoffUpdate(start, 0, 926);
    expect(shifted).not.toBeNull();
    expect(distanceTo(start, shifted!)).toBeCloseTo(0.5, 3);
  });

  it('flags FM/GPS POS DISAGREE when a GPS position is away from the FM positions', () => {
    const farGps = { lat: 45 + 1 / 60, long: 7 };
    const a320 = new FmPositionComputer(A320_FM_POSITION_CONFIG);
    a320.update(inputs());
    expect(a320.isFmGpsDisagree).toBe(false);
    a320.update(inputs({ gpsPositions: [gpirs1, farGps] }));
    expect(a320.isFmGpsDisagree).toBe(true);
    // A320: only with GPS PRIMARY
    a320.update(inputs({ gpsPositions: [gpirs1, farGps], gpsPrimary: false }));
    expect(a320.isFmGpsDisagree).toBe(false);
    // A380: without GPS PRIMARY too
    const a380 = new FmPositionComputer(A380_FM_POSITION_CONFIG);
    a380.update(inputs({ gpsPositions: [gpirs1, farGps], gpsPrimary: false }));
    expect(a380.isFmGpsDisagree).toBe(true);
  });

  it('flags FM/IR POS DISAGREE after a manual update far from the IR positions, not in GPS PRIMARY', () => {
    const computer = new FmPositionComputer(A380_FM_POSITION_CONFIG);
    const irsOnly = { navigationMode: FmNavigationMode.IrsOnly, gpirsPositions: [null, null, null], gpsPrimary: false };
    computer.update(inputs(irsOnly));
    expect(computer.isFmIrDisagree).toBe(false);
    // 6 NM north of the IR positions
    expect(computer.manualUpdate({ lat: 45 + 6 / 60, long: 7 })).toBe(true);
    computer.update(inputs(irsOnly));
    expect(computer.isFmIrDisagree).toBe(true);
    computer.update(inputs({ ...irsOnly, gpsPrimary: true }));
    expect(computer.isFmIrDisagree).toBe(false);
  });

  it('compares each FM position with each valid IR position', () => {
    const fm = [{ lat: 45, long: 7 }];
    expect(isFmIrPositionDisagree(fm, [{ lat: 45 + 4 / 60, long: 7 }, null], 5)).toBe(false);
    expect(
      isFmIrPositionDisagree(
        fm,
        [
          { lat: 45 + 4 / 60, long: 7 },
          { lat: 45 - 6 / 60, long: 7 },
        ],
        5,
      ),
    ).toBe(true);
    expect(isFmIrPositionDisagree(fm, [null, null, null], 5)).toBe(false);
  });

  it('uses no GPIRS position when the GPS is deselected', () => {
    expect(FmPositionComputer.gpirsSource(1, [gpirs1, gpirs2, gpirs1], false)).toBe(1);
    expect(FmPositionComputer.gpirsSource(2, [gpirs1, gpirs2, gpirs1], false)).toBe(2);
    expect(FmPositionComputer.gpirsSource(1, [gpirs1, gpirs2, gpirs1], true)).toBeNull();
  });
});
