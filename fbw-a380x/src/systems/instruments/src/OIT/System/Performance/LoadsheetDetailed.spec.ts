// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LOADSHEET_AIRCRAFT, LOADSHEET_DOCG, armToPercentMac, computeLoadsheet } from './Loadsheet';
import {
  CABIN_SECTIONS,
  CARGO_COMPARTMENTS,
  DetailedLoading,
  computeDetailedZeroFuel,
  detailedDryOperatingWeight,
  detailedLoadsheetReportLines,
  missingDetailedParameters,
  parsePaxEntry,
  standardPaxDistribution,
  undistributedPayload,
} from './LoadsheetDetailed';

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);

const LOADING: DetailedLoading = {
  crew: 0,
  pax: { adults: 400, children: 32, infants: 4 },
  cargo: 20_000,
  paxPerSection: standardPaxDistribution(432),
  cargoPerCompartment: [12_000, 7_000, 1_000],
};

describe('LOADSHEET DETAILED mode', () => {
  it('reads the PAX entry by passenger type', () => {
    expect(parsePaxEntry('400/32/4')).toEqual({ adults: 400, children: 32, infants: 4 });
    expect(parsePaxEntry('400')).toEqual({ adults: 400, children: 0, infants: 0 });
    expect(parsePaxEntry('400/A')).toBeNull();
    // More seated passengers than the 484 seats
    expect(parsePaxEntry('480/10')).toBeNull();
  });

  it('spreads the seated passengers over the cabin sections in proportion to their seats', () => {
    const distribution = standardPaxDistribution(432);
    expect(sum(distribution)).toBe(432);
    expect(distribution).toHaveLength(CABIN_SECTIONS.length);
    distribution.forEach((pax, i) => expect(pax).toBeLessThanOrEqual(CABIN_SECTIONS[i].seats));
    expect(standardPaxDistribution(484)).toEqual(CABIN_SECTIONS.map((s) => s.seats));
  });

  it('adds the additional flight crew to the basic weight at the cockpit', () => {
    expect(detailedDryOperatingWeight(0)).toEqual({ dow: LOADSHEET_AIRCRAFT.dow, arm: LOADSHEET_AIRCRAFT.dowArm });
    const withTwo = detailedDryOperatingWeight(2);
    expect(withTwo.dow).toBe(LOADSHEET_AIRCRAFT.dow + 170);
    expect(withTwo.arm).toBeGreaterThan(LOADSHEET_AIRCRAFT.dowArm);
  });

  it('shows the passengers and cargo left to distribute', () => {
    expect(undistributedPayload(LOADING)).toEqual({ pax: 0, cargo: 0 });
    expect(undistributedPayload({ ...LOADING, cargoPerCompartment: [12_000, 0, 0] })).toEqual({ pax: 0, cargo: 8_000 });
    expect(missingDetailedParameters({ ...LOADING, pax: null, cargo: null })).toEqual(['PAX', 'CARGO']);
  });

  it('computes the payload and the ZFW/CG from the distribution', () => {
    const { zeroFuel, errors } = computeDetailedZeroFuel(LOADING, 84);
    expect(errors).toEqual([]);
    // 400 adults of 84 kg, 32 children of 35 kg and 4 infants of 10 kg, plus the cargo
    expect(zeroFuel!.payload).toBeCloseTo(400 * 84 + 32 * 35 + 4 * 10 + 20_000, 6);
    expect(zeroFuel!.zfw).toBeCloseTo(LOADSHEET_AIRCRAFT.dow + zeroFuel!.payload, 6);
    expect(zeroFuel!.docg).toBeCloseTo(LOADSHEET_DOCG, 9);

    // All the cargo in the forward compartment moves the ZFCG forward
    const forward = computeDetailedZeroFuel({ ...LOADING, cargoPerCompartment: [20_000, 0, 0] }, 84).zeroFuel!;
    expect(forward.zfcg).toBeLessThan(zeroFuel!.zfcg);
    const moment =
      LOADSHEET_AIRCRAFT.dow * LOADSHEET_AIRCRAFT.dowArm +
      sum(LOADING.paxPerSection.map((pax, i) => ((pax * (zeroFuel!.payload - 20_000)) / 432) * CABIN_SECTIONS[i].arm)) +
      20_000 * CARGO_COMPARTMENTS[0].arm;
    expect(forward.zfcg).toBeCloseTo(armToPercentMac(moment / forward.zfw), 6);
  });

  it('does not compute an incomplete or impossible distribution', () => {
    expect(computeDetailedZeroFuel({ ...LOADING, paxPerSection: [0, 0, 0, 0, 0, 0, 0] }, 84).errors).toEqual([
      'PAX DISTRIBUTION: 432 PAX not distributed',
    ]);
    expect(computeDetailedZeroFuel({ ...LOADING, cargoPerCompartment: [12_000, 7_000, 3_000] }, 84).errors).toEqual([
      'CARGO DISTRIBUTION: cargo in excess',
      'CP3: above the maximum compartment load',
    ]);
  });

  it('gives its DOW to the loadsheet, and writes the detailed loadsheet with the edition number', () => {
    const loading = { ...LOADING, crew: 1 };
    const zeroFuel = computeDetailedZeroFuel(loading, 84).zeroFuel!;
    const configuration = {
      mtow: 510_000,
      mtowFromTakeoffPerf: false,
      mlw: 395_000,
      mlwFromLandingPerf: false,
      dryOperating: { dow: zeroFuel.dow, docg: zeroFuel.docg },
    };
    const { results } = computeLoadsheet(
      configuration,
      {
        zfw: zeroFuel.zfw,
        zfcg: zeroFuel.zfcg,
        fob: 100_000,
        tripFuel: 80_000,
        taxiFuel: 1_500,
        lmcPax: 0,
        lmcCargo: 0,
      },
      [1],
      84,
      () => true,
    );
    expect(results!.dow).toBe(zeroFuel.dow);
    expect(results!.payload).toBeCloseTo(zeroFuel.payload, 6);

    const lines = detailedLoadsheetReportLines(
      { checkedBy: 'BARKER', approvedBy: 'BROWNSON', captInfoNotes: ['', ''], paxPerClass: '9/48/375', edition: 3 },
      { flightNumber: 'FBW123', registration: 'F-FBWA', from: 'LFBO', to: 'EGLL' },
      configuration,
      loading,
      results!,
      new Date(Date.UTC(2026, 9, 20, 16, 33)),
      true,
    );
    expect(lines[0]).toMatch(/^L O A D S H E E T +CHECKED +APPROVED +EDNO$/);
    expect(lines[1]).toMatch(/BARKER +BROWNSON +03$/);
    expect(lines[4]).toBe('LFBO EGLL FBW123   F-FBWA   3/24   20OCT26  1633');
    expect(lines).toContain('LOAD IN COMPARTMENTS       20000  CP1/12000 CP2/7000 CP3/1000');
    expect(lines.some((l) => l.includes('400/32/4  TTL 436'))).toBe(true);
    expect(lines.some((l) => /MAIN {2}FWD\/\d+ MID 1\/\d+ MID 2\/\d+ AFT\/\d+$/.test(l))).toBe(true);
    expect(lines.some((l) => /UPPER FWD\/\d+ MID\/\d+ AFT\/\d+$/.test(l))).toBe(true);
    expect(lines).toContain(`DRY OPERATING WEIGHT      ${Math.round(zeroFuel.dow)}`);
    expect(lines[lines.length - 1]).toBe('END');
  });
});
