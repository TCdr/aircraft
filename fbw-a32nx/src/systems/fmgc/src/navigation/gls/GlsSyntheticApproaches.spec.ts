// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import {
  AirportSubsectionCode,
  Approach,
  ApproachType,
  LegType,
  ProcedureLeg,
  Runway,
  SectionCode,
  VhfNavaidType,
} from '@flybywiresim/fbw-sdk';
import { createGlsApproaches, createGlsSyntheticApproachProvider } from './GlsSyntheticApproaches';

const ILS_NAVAID = {
  sectionCode: SectionCode.Airport,
  subSectionCode: AirportSubsectionCode.LocalizerGlideSlope,
  databaseId: 'ILS-IFRA',
  ident: 'IFRA',
};

const VOR_NAVAID = {
  sectionCode: SectionCode.Navaid,
  databaseId: 'VOR-FFM',
  ident: 'FFM',
  type: VhfNavaidType.VorDme,
};

function leg(ident: string, overrides: Partial<ProcedureLeg> = {}): ProcedureLeg {
  return {
    procedureIdent: 'I25C',
    type: LegType.TF,
    overfly: false,
    waypoint: { ident, databaseId: `W${ident}` },
    ...overrides,
  } as unknown as ProcedureLeg;
}

function approach(type: ApproachType, ident: string, overrides: Partial<Approach> = {}): Approach {
  return {
    sectionCode: SectionCode.Airport,
    subSectionCode: AirportSubsectionCode.ApproachProcedures,
    databaseId: `PEDEDDF${ident}`,
    icaoCode: 'ED',
    ident,
    runwayIdent: 'EDDF25C',
    runwayNumber: 25,
    multipleIndicator: '',
    type,
    authorisationRequired: false,
    missedApproachAuthorisationRequired: false,
    transitions: [{ databaseId: `${ident}0`, ident: 'GEDKE', legs: [leg('GEDKE')] }],
    legs: [
      leg('FACF', { recommendedNavaid: ILS_NAVAID as never }),
      leg('RW25C', { recommendedNavaid: ILS_NAVAID as never }),
    ],
    missedLegs: [leg('MAPT', { recommendedNavaid: VOR_NAVAID as never })],
    ...overrides,
  } as unknown as Approach;
}

/** 3 degrees of west variation make the true bearing 3 degrees more than the magnetic one */
function runway(ident: string, magneticBearing: number): Runway {
  return {
    ident,
    bearing: magneticBearing + 3,
    magneticBearing,
    thresholdLocation: { lat: 50.0285, long: 8.5361, alt: 328 },
    length: 4000,
  } as unknown as Runway;
}

const RUNWAY_EDDF_25C = runway('EDDF25C', 246);
const ILS_25C = approach(ApproachType.Ils, 'I25C');

describe('GLS synthetic approaches', () => {
  it('copies the ILS approach once for each procedure of the runway end, with the identity of the GLS', () => {
    const glsApproaches = createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]);

    expect(glsApproaches.map((gls) => [gls.ident, gls.multipleIndicator, gls.type])).toEqual([
      ['J25CZ', 'Z', ApproachType.Gls],
      ['J25CY', 'Y', ApproachType.Gls],
    ]);
    expect(glsApproaches[0].legs.map((legOfGls) => legOfGls.waypoint?.ident)).toEqual(['FACF', 'RW25C']);
    expect(glsApproaches[0].runwayIdent).toBe('EDDF25C');
  });

  it('flies the glide path of the chart and tunes nothing of the ILS', () => {
    const [glsZ, glsY] = createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]);

    expect(glsZ.legs[glsZ.legs.length - 1].verticalAngle).toBe(-3);
    expect(glsY.legs[glsY.legs.length - 1].verticalAngle).toBe(-3.2);
    expect(glsZ.legs.map((legOfGls) => legOfGls.recommendedNavaid)).toEqual([undefined, undefined]);
    expect(glsZ.legs.every((legOfGls) => legOfGls.procedureIdent === 'J25CZ')).toBe(true);
  });

  it('keeps a recommended navaid that is not a landing system', () => {
    const [gls] = createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]);

    expect(gls.missedLegs[0].recommendedNavaid).toBe(VOR_NAVAID);
  });

  it('does not change the approach it copies', () => {
    createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]);

    expect(ILS_25C.type).toBe(ApproachType.Ils);
    expect(ILS_25C.legs[1].recommendedNavaid).toBe(ILS_NAVAID);
    expect(ILS_25C.legs[1].verticalAngle).toBeUndefined();
  });

  it('gives an id that does not depend on the approach it was copied from', () => {
    const fromIls = createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]);
    const fromRnav = createGlsApproaches(
      'EDDF',
      [approach(ApproachType.Rnav, 'R25C-Z', { multipleIndicator: 'Z' })],
      [RUNWAY_EDDF_25C],
    );

    expect(fromIls.map((gls) => gls.databaseId)).toEqual(['PEDEDDFJ25CZ', 'PEDEDDFJ25CY']);
    expect(fromRnav.map((gls) => gls.databaseId)).toEqual(fromIls.map((gls) => gls.databaseId));
    expect(createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]).map((gls) => gls.databaseId)).toEqual(
      fromIls.map((gls) => gls.databaseId),
    );
  });

  it('gives the transitions an id of their own', () => {
    const [gls] = createGlsApproaches('EDDF', [ILS_25C], [RUNWAY_EDDF_25C]);

    expect(gls.transitions[0].databaseId).not.toBe(ILS_25C.transitions[0].databaseId);
    expect(gls.transitions[0].ident).toBe('GEDKE');
  });

  describe('source approach', () => {
    const rnav = approach(ApproachType.Rnav, 'R25C', {
      legs: [leg('FACF'), leg('RW25C')],
    });

    it('prefers the ILS approach', () => {
      const [gls] = createGlsApproaches('EDDF', [rnav, ILS_25C], [RUNWAY_EDDF_25C]);

      expect(gls.transitions[0].databaseId).toContain('I25C');
    });

    it('falls back to an RNAV approach that ends at the runway', () => {
      const glsApproaches = createGlsApproaches('EDDF', [rnav], [RUNWAY_EDDF_25C]);

      expect(glsApproaches).toHaveLength(2);
      expect(glsApproaches[0].transitions[0].databaseId).toContain('R25C');
    });

    it('does not take an RNAV approach that ends elsewhere, or one that needs authorisation', () => {
      const endsAtFix = approach(ApproachType.Rnav, 'R25C', { legs: [leg('FACF'), leg('MAPT')] });
      const authorisationRequired = approach(ApproachType.Rnav, 'R25C', {
        legs: [leg('FACF'), leg('RW25C')],
        authorisationRequired: true,
      });

      expect(createGlsApproaches('EDDF', [endsAtFix, authorisationRequired], [RUNWAY_EDDF_25C])).toEqual([]);
    });

    it('creates nothing without an approach to copy, or with approaches of another runway only', () => {
      const ilsOfOtherRunway = approach(ApproachType.Ils, 'I25L', { runwayIdent: 'EDDF25L' });

      expect(createGlsApproaches('EDDF', [], [RUNWAY_EDDF_25C])).toEqual([]);
      expect(createGlsApproaches('EDDF', [ilsOfOtherRunway], [RUNWAY_EDDF_25C])).toEqual([]);
    });
  });

  describe('where the table and the sim agree', () => {
    it('creates nothing when the sim has no such runway', () => {
      expect(createGlsApproaches('EDDF', [ILS_25C], [runway('EDDF25R', 246)])).toEqual([]);
    });

    it('creates nothing when the sim runway points more than the allowed mismatch away from the chart', () => {
      expect(createGlsApproaches('EDDF', [ILS_25C], [runway('EDDF25C', 250)])).toEqual([]);
      expect(createGlsApproaches('EDDF', [ILS_25C], [runway('EDDF25C', 248)])).toHaveLength(2);
    });

    it('reads the runway ident of either form of the navigation data', () => {
      expect(createGlsApproaches('EDDF', [ILS_25C], [runway('RW25C', 246)])).toHaveLength(2);
    });
  });

  describe('table', () => {
    it('adds nothing on a runway of a listed airport that the table does not list', () => {
      const ilsOfSfo01L = approach(ApproachType.Ils, 'I01L', { runwayIdent: 'KSFO01L' });
      const ilsOfSfo28L = approach(ApproachType.Ils, 'I28L', { runwayIdent: 'KSFO28L' });

      const glsApproaches = createGlsApproaches(
        'KSFO',
        [ilsOfSfo01L, ilsOfSfo28L],
        [runway('KSFO01L', 14), runway('KSFO28L', 284)],
      );

      expect(glsApproaches.map((gls) => gls.ident)).toEqual(['J28L']);
    });

    it('adds nothing at an airport that the table does not list', () => {
      const ils = approach(ApproachType.Ils, 'I25C', { runwayIdent: 'LFPG25C' });

      expect(createGlsApproaches('LFPG', [ils], [runway('LFPG25C', 246)])).toEqual([]);
    });

    it('names a runway end without designator and without suffix by the runway alone', () => {
      const kiah = approach(ApproachType.Ils, 'I09', { runwayIdent: 'KIAH09' });

      expect(createGlsApproaches('KIAH', [kiah], [runway('KIAH09', 87)]).map((gls) => gls.ident)).toEqual(['J09']);
    });
  });

  it('lets a real GLS approach of the same runway end and suffix win', () => {
    const realGlsZ = approach(ApproachType.Gls, 'J25CZ', { multipleIndicator: 'Z' });

    const glsApproaches = createGlsApproaches('EDDF', [ILS_25C, realGlsZ], [RUNWAY_EDDF_25C]);

    expect(glsApproaches.map((gls) => gls.ident)).toEqual(['J25CY']);
  });
});

describe('GLS synthetic approach provider', () => {
  it('does no work for an airport outside the table', async () => {
    const getRunways = vi.fn(() => Promise.resolve([RUNWAY_EDDF_25C]));
    const approaches = [approach(ApproachType.Ils, 'I25C', { runwayIdent: 'LFPG25C' })];
    const provider = createGlsSyntheticApproachProvider();

    const synthetic = await provider('LFPG', approaches, getRunways);

    expect(synthetic).toEqual([]);
    expect(getRunways).not.toHaveBeenCalled();
  });

  it('loads the runways once per airport', async () => {
    const getRunways = vi.fn(() => Promise.resolve([RUNWAY_EDDF_25C]));
    const provider = createGlsSyntheticApproachProvider();

    const first = await provider('EDDF', [ILS_25C], getRunways);
    const second = await provider('EDDF', [ILS_25C], getRunways);

    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
    expect(getRunways).toHaveBeenCalledTimes(1);
  });

  it('gives each call leg objects of its own, so that a change by the caller does not reach the next call', async () => {
    const provider = createGlsSyntheticApproachProvider();
    const getRunways = () => Promise.resolve([RUNWAY_EDDF_25C]);

    const first = await provider('EDDF', [ILS_25C], getRunways);
    first[0].legs[0].altitude1 = 9999;
    first[0].missedLegs[0].altitude1 = 9999;
    first[0].transitions[0].legs[0].altitude1 = 9999;
    first[0].ident = 'CHANGED';
    const second = await provider('EDDF', [ILS_25C], getRunways);

    expect(second[0]).not.toBe(first[0]);
    expect(second[0].ident).not.toBe('CHANGED');
    expect(second[0].legs[0]).not.toBe(first[0].legs[0]);
    expect(second[0].legs[0].altitude1).toBeUndefined();
    expect(second[0].missedLegs[0].altitude1).toBeUndefined();
    expect(second[0].transitions[0].legs[0].altitude1).toBeUndefined();
  });

  it('tries again after the runways failed to load', async () => {
    const getRunways = vi.fn().mockRejectedValueOnce(new Error('no facility')).mockResolvedValue([RUNWAY_EDDF_25C]);
    const provider = createGlsSyntheticApproachProvider();

    await expect(provider('EDDF', [ILS_25C], getRunways)).rejects.toThrow('no facility');
    await expect(provider('EDDF', [ILS_25C], getRunways)).resolves.toHaveLength(2);
  });
});
