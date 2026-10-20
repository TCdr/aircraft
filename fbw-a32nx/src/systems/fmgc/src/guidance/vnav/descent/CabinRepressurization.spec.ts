// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import {
  CabinRateExceededInputs,
  cruiseCabinAltitude,
  descentCabinRateField,
  displayedDescentCabinRate,
  isCabinRateExceeded,
  maxDescentCabinRate,
  meanCabinDescentRate,
  parseDescentCabinRateEntry,
  remainingDescentSeconds,
  requiredDescentSeconds,
} from './CabinRepressurization';

const a320Cabin = A320AircraftConfig.vnavConfig.CABIN_PRESSURIZATION;
const a380Cabin = A380AircraftConfig.vnavConfig.CABIN_PRESSURIZATION;

describe('maximum descent cabin rate', () => {
  it('is -350 ft/min without an entry', () => {
    expect(maxDescentCabinRate(null)).toBe(-350);
    expect(maxDescentCabinRate(undefined)).toBe(-350);
  });

  it('is the flight crew entry, always a descent', () => {
    expect(maxDescentCabinRate(-500)).toBe(-500);
    expect(maxDescentCabinRate(250)).toBe(-250);
  });
});

describe('cruise cabin altitude', () => {
  it('is about 8000 ft at FL390 on the A320 and limited to 7500 ft on the A380 at FL430', () => {
    expect(cruiseCabinAltitude(39000, 0, a320Cabin)).toBeGreaterThan(7500);
    expect(cruiseCabinAltitude(39000, 0, a320Cabin)).toBeLessThanOrEqual(8000);
    expect(cruiseCabinAltitude(41000, 0, a380Cabin)).toBeLessThan(7500);
    expect(cruiseCabinAltitude(43000, 0, a380Cabin)).toBe(7500);
  });

  it('is lower at a lower cruise level, and never below the destination elevation', () => {
    expect(cruiseCabinAltitude(25000, 0, a320Cabin)).toBeLessThan(cruiseCabinAltitude(35000, 0, a320Cabin));
    expect(cruiseCabinAltitude(10000, 0, a320Cabin)).toBe(0);
    expect(cruiseCabinAltitude(39000, 9000, a320Cabin)).toBe(9000);
  });
});

describe('descent cabin rate', () => {
  it('needs 20 min for 7000 ft at 350 ft/min', () => {
    expect(requiredDescentSeconds(7000, -350)).toBeCloseTo(1200);
    expect(requiredDescentSeconds(0, -350)).toBe(0);
  });

  it('is the mean rate over the descent', () => {
    expect(meanCabinDescentRate(7000, 1200)).toBeCloseTo(-350);
    expect(meanCabinDescentRate(0, 1200)).toBe(0);
  });

  it('shows the maximum rate while the profile meets it, else the computed rate', () => {
    expect(displayedDescentCabinRate(-300, -350)).toEqual({ rate: -350, isComputed: false });
    expect(displayedDescentCabinRate(-352, -350)).toEqual({ rate: -350, isComputed: false });
    expect(displayedDescentCabinRate(-480.4, -350)).toEqual({ rate: -480, isComputed: true });
  });
});

describe('DES CABIN RATE field', () => {
  it('shows the default in small font without an entry', () => {
    expect(descentCabinRateField(null, null)).toEqual({ rate: -350, isPilotEntered: false });
    expect(descentCabinRateField(null, { rate: -350, isComputed: false })).toEqual({
      rate: -350,
      isPilotEntered: false,
    });
  });

  it('shows the entry in large font, unless the FMS cannot meet it', () => {
    expect(descentCabinRateField(-500, { rate: -500, isComputed: false })).toEqual({
      rate: -500,
      isPilotEntered: true,
    });
    expect(descentCabinRateField(-200, { rate: -260, isComputed: true })).toEqual({
      rate: -260,
      isPilotEntered: false,
    });
  });
});

describe('DES CABIN RATE entry', () => {
  it('takes NNN or -NNN from 100 to 999', () => {
    expect(parseDescentCabinRateEntry('500')).toEqual({ rate: -500 });
    expect(parseDescentCabinRateEntry('-250')).toEqual({ rate: -250 });
    expect(parseDescentCabinRateEntry('100')).toEqual({ rate: -100 });
    expect(parseDescentCabinRateEntry('999')).toEqual({ rate: -999 });
  });

  it('refuses a value out of range or in another format', () => {
    expect(parseDescentCabinRateEntry('99')).toEqual({ error: 'range' });
    expect(parseDescentCabinRateEntry('-50')).toEqual({ error: 'range' });
    expect(parseDescentCabinRateEntry('1000')).toEqual({ error: 'format' });
    expect(parseDescentCabinRateEntry('+300')).toEqual({ error: 'format' });
    expect(parseDescentCabinRateEntry('3.5')).toEqual({ error: 'format' });
    expect(parseDescentCabinRateEntry('ABC')).toEqual({ error: 'format' });
  });
});

describe('CABIN RATE EXCEEDED', () => {
  const tooShort: CabinRateExceededInputs = {
    flightPhase: FmgcFlightPhase.Cruise,
    checkedPhases: a380Cabin.cabinRateExceededPhases,
    distanceToDestination: 150,
    cabinDescent: 7000,
    remainingDescentSeconds: 900,
    maxRate: -350,
  };

  it('is raised in cruise within 200 NM when the descent is too short for the maximum rate', () => {
    expect(isCabinRateExceeded(tooShort)).toBe(true);
  });

  it('is not raised when the descent is long enough', () => {
    expect(isCabinRateExceeded({ ...tooShort, remainingDescentSeconds: 1200 })).toBe(false);
    expect(isCabinRateExceeded({ ...tooShort, maxRate: -500 })).toBe(false);
  });

  it('is not raised farther than 200 NM from the destination', () => {
    expect(isCabinRateExceeded({ ...tooShort, distanceToDestination: 201 })).toBe(false);
    expect(isCabinRateExceeded({ ...tooShort, distanceToDestination: undefined })).toBe(false);
  });

  it('is raised in cruise only on the A380, in climb and cruise on the A320', () => {
    expect(isCabinRateExceeded({ ...tooShort, flightPhase: FmgcFlightPhase.Climb })).toBe(false);
    expect(isCabinRateExceeded({ ...tooShort, flightPhase: FmgcFlightPhase.Descent })).toBe(false);
    const a320 = { ...tooShort, checkedPhases: a320Cabin.cabinRateExceededPhases };
    expect(isCabinRateExceeded({ ...a320, flightPhase: FmgcFlightPhase.Climb })).toBe(true);
    expect(isCabinRateExceeded({ ...a320, flightPhase: FmgcFlightPhase.Descent })).toBe(false);
  });

  it('uses a descent shortened by the distance flown past the top of descent', () => {
    expect(remainingDescentSeconds(1200, 100, 10)).toBe(1200);
    expect(remainingDescentSeconds(1200, 100, -25)).toBeCloseTo(900);
    expect(remainingDescentSeconds(1200, 100, -150)).toBe(0);
  });
});
