// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AirportSubsectionCode, ApproachType } from '@flybywiresim/fbw-sdk';
import { Coordinates, placeBearingDistance } from 'msfs-geo';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LandingSystemSelectionManager } from './LandingSystemSelectionManager';

const { getRunways, getIlsAtAirport, getILSs } = vi.hoisted(() => ({
  getRunways: vi.fn(),
  getIlsAtAirport: vi.fn(),
  getILSs: vi.fn(),
}));

vi.mock('@fmgc/flightplanning/NavigationDatabaseService', () => ({
  NavigationDatabaseService: { activeDatabase: { backendDatabase: { getRunways, getIlsAtAirport, getILSs } } },
}));

const FRANKFURT: Coordinates = { lat: 50.03, long: 8.57 };

const FRANKFURT_25C: Record<string, unknown> = {
  ident: 'RW25C',
  bearing: 249.2,
  magneticBearing: 246.2,
  thresholdLocation: { lat: 50.0285, long: 8.5361, alt: 328 },
  length: 4000,
};

const FRANKFURT_ILS_25C = {
  databaseId: 'ILS-IFCW',
  ident: 'IFCW',
  frequency: 111.55,
  locBearing: 248.9,
  gsSlope: -3,
  subSectionCode: AirportSubsectionCode.LocalizerGlideSlope,
};

function glsApproach(multipleIndicator: string, runwayIdent = 'EDDF25C') {
  return {
    type: ApproachType.Gls,
    databaseId: `GLS-${runwayIdent}-${multipleIndicator}`,
    runwayIdent,
    multipleIndicator,
  };
}

/** An approach whose final leg recommends the ILS of 25C */
function approachOfType(type: ApproachType) {
  return {
    type,
    databaseId: `APPROACH-${type}`,
    runwayIdent: 'EDDF25C',
    multipleIndicator: '',
    legs: [{ recommendedNavaid: { databaseId: FRANKFURT_ILS_25C.databaseId, ident: FRANKFURT_ILS_25C.ident } }],
  };
}

function setup(initialPhase: FmgcFlightPhase = FmgcFlightPhase.Approach) {
  const bus = new EventBus();
  const setPhase = (phase: FmgcFlightPhase) =>
    bus.getPublisher<{ fmgc_flight_phase: FmgcFlightPhase }>().pub('fmgc_flight_phase', phase, false, true);
  setPhase(initialPhase);

  const plan = {
    version: 1,
    approach: undefined as unknown,
    originRunway: undefined as unknown,
    destinationAirport: { ident: 'EDDF', location: FRANKFURT } as unknown,
  };
  const position: { ppos: Coordinates | null } = { ppos: { lat: 50.5, long: 8.6 } };
  const manager = new LandingSystemSelectionManager(
    bus,
    { active: plan } as never,
    { getPpos: () => position.ppos } as never,
  );

  /** Runs one selection pass; a new plan version forces the throttled update */
  const select = async (approach: unknown) => {
    plan.approach = approach;
    plan.version++;
    await manager.update(100);
  };

  return { manager, select, plan, position, setPhase };
}

describe('LandingSystemSelectionManager GLS selection', () => {
  beforeEach(() => {
    getRunways.mockReset();
    getRunways.mockResolvedValue([FRANKFURT_25C]);
  });

  it('has no GLS before any approach is selected', () => {
    expect(setup().manager.selectedGls).toBeNull();
  });

  it('selects the table procedure of a GLS approach with the geometry of the sim runway', async () => {
    const { manager, select } = setup();
    await select(glsApproach('Z'));

    expect(manager.selectedGls).toMatchObject({
      channel: 31434,
      rpi: 'G25P',
      course: 246,
      slope: -3,
    });
    expect(manager.selectedGls?.definition).toMatchObject({
      channel: 31434,
      courseTrue: 249.2,
      thresholdElevation: 328,
    });
    expect(manager.selectedIls).toBeNull();
  });

  it('tells the two procedures of a runway end apart by the suffix', async () => {
    const { manager, select } = setup();
    await select(glsApproach('Y'));

    expect(manager.selectedGls).toMatchObject({ channel: 28968, rpi: 'G25M', slope: -3.2 });
  });

  it('does not read the runways again for the same approach', async () => {
    const { select } = setup();
    await select(glsApproach('Z'));
    await select(glsApproach('Z'));

    expect(getRunways).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection but without a definition when the sim runway is missing', async () => {
    getRunways.mockResolvedValue([]);
    const { manager, select } = setup();
    await select(glsApproach('Z'));

    expect(manager.selectedGls).toMatchObject({ channel: 31434 });
    expect(manager.selectedGls?.definition).toBeNull();
  });

  it('has no GLS for a runway or suffix that is not in the table', async () => {
    const { manager, select } = setup();
    await select(glsApproach('Z', 'EDDF18'));
    expect(manager.selectedGls).toBeNull();

    await select(glsApproach('X'));
    expect(manager.selectedGls).toBeNull();
  });

  it('drops the GLS when the approach is removed or reset', async () => {
    const { manager, select } = setup();
    await select(glsApproach('Z'));
    expect(manager.selectedGls).not.toBeNull();

    await select(undefined);
    expect(manager.selectedGls).toBeNull();

    await select(glsApproach('Z'));
    manager.resetState();
    expect(manager.selectedGls).toBeNull();
  });
});

describe('LandingSystemSelectionManager selection by flight phase', () => {
  beforeEach(() => {
    // The update throttle starts at a random offset
    vi.spyOn(Math, 'random').mockReturnValue(0);
    getRunways.mockReset();
    getRunways.mockResolvedValue([FRANKFURT_25C]);
    getIlsAtAirport.mockReset();
    getIlsAtAirport.mockResolvedValue([FRANKFURT_ILS_25C]);
    getILSs.mockReset();
    getILSs.mockResolvedValue([FRANKFURT_ILS_25C]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('departure', () => {
    it.each([FmgcFlightPhase.Preflight, FmgcFlightPhase.Takeoff])(
      'selects the ILS of the departure runway in phase %i',
      async (phase) => {
        const { manager, select, plan } = setup(phase);
        plan.originRunway = { airportIdent: 'EDDF', lsIdent: 'IFCW' };
        await select(approachOfType(ApproachType.Rnav));

        expect(getIlsAtAirport).toHaveBeenCalledWith('EDDF', 'IFCW');
        expect(manager.selectedIls).toBe(FRANKFURT_ILS_25C);
        expect(manager.selectedLocCourse).toBe(249);
        expect(manager.selectedGsSlope).toBe(-3);
        expect(manager.selectedApprBackcourse).toBe(false);
      },
    );

    it('has no course for an ILS of the departure runway without a localizer bearing', async () => {
      getIlsAtAirport.mockResolvedValue([{ ...FRANKFURT_ILS_25C, locBearing: -1, gsSlope: undefined }]);
      const { manager, select, plan } = setup(FmgcFlightPhase.Preflight);
      plan.originRunway = { airportIdent: 'EDDF', lsIdent: 'IFCW' };
      await select(undefined);

      expect(manager.selectedIls).not.toBeNull();
      expect(manager.selectedLocCourse).toBeNull();
      expect(manager.selectedGsSlope).toBeNull();
    });

    it('selects nothing for a departure runway without a landing system, and not the approach', async () => {
      const { manager, select, plan } = setup(FmgcFlightPhase.Preflight);
      plan.originRunway = { airportIdent: 'EDDF', lsIdent: '' };
      await select(glsApproach('Z'));

      expect(getIlsAtAirport).not.toHaveBeenCalled();
      expect(manager.selectedIls).toBeNull();
      expect(manager.selectedGls).toBeNull();
    });

    it('drops a GLS that is still selected when the ILS of the departure runway is selected', async () => {
      const { manager, select, plan, setPhase } = setup(FmgcFlightPhase.Descent);
      await select(glsApproach('Z'));
      expect(manager.selectedGls).not.toBeNull();

      setPhase(FmgcFlightPhase.Preflight);
      plan.originRunway = { airportIdent: 'EDDF', lsIdent: 'IFCW' };
      await select(glsApproach('Z'));

      expect(manager.selectedIls).toBe(FRANKFURT_ILS_25C);
      expect(manager.selectedGls).toBeNull();
    });

    it('drops the ILS of the departure runway in the climb', async () => {
      const { manager, select, plan, setPhase } = setup(FmgcFlightPhase.Takeoff);
      plan.originRunway = { airportIdent: 'EDDF', lsIdent: 'IFCW' };
      await select(glsApproach('Z'));
      expect(manager.selectedIls).not.toBeNull();

      setPhase(FmgcFlightPhase.Climb);
      await select(glsApproach('Z'));

      expect(manager.selectedIls).toBeNull();
      expect(manager.selectedGls).toBeNull();
    });
  });

  describe('cruise', () => {
    const northOfFrankfurt = (distance: number) => placeBearingDistance(FRANKFURT, 0, distance);

    it('selects the approach within 300 NM of the destination only', async () => {
      const { manager, select, position } = setup(FmgcFlightPhase.Cruise);

      position.ppos = northOfFrankfurt(305);
      await select(glsApproach('Z'));
      expect(manager.selectedGls).toBeNull();
      expect(getRunways).not.toHaveBeenCalled();

      position.ppos = northOfFrankfurt(295);
      await select(glsApproach('Z'));
      expect(manager.selectedGls).toMatchObject({ channel: 31434 });
    });

    it('drops the selection when the destination is more than 300 NM away again', async () => {
      const { manager, select, position } = setup(FmgcFlightPhase.Cruise);
      position.ppos = northOfFrankfurt(295);
      await select(approachOfType(ApproachType.Ils));
      expect(manager.selectedIls).toBe(FRANKFURT_ILS_25C);

      position.ppos = northOfFrankfurt(305);
      await select(approachOfType(ApproachType.Ils));

      expect(manager.selectedIls).toBeNull();
    });

    it('drops the selection when the position is lost', async () => {
      const { manager, select, position } = setup(FmgcFlightPhase.Cruise);
      await select(glsApproach('Z'));
      expect(manager.selectedGls).not.toBeNull();

      position.ppos = null;
      await select(glsApproach('Z'));

      expect(manager.selectedGls).toBeNull();
    });

    it('selects nothing without a destination', async () => {
      const { manager, select, plan } = setup(FmgcFlightPhase.Cruise);
      plan.destinationAirport = undefined;
      await select(approachOfType(ApproachType.Ils));

      expect(manager.selectedIls).toBeNull();
    });
  });

  describe('descent and approach', () => {
    it.each([FmgcFlightPhase.Descent, FmgcFlightPhase.Approach, FmgcFlightPhase.GoAround])(
      'selects the approach at any distance and without a position in phase %i',
      async (phase) => {
        const { manager, select, position } = setup(phase);
        position.ppos = placeBearingDistance(FRANKFURT, 0, 500);
        await select(glsApproach('Z'));
        expect(manager.selectedGls).toMatchObject({ channel: 31434 });

        position.ppos = null;
        await select(glsApproach('Y'));
        expect(manager.selectedGls).toMatchObject({ channel: 28968 });
      },
    );

    it('selects the ILS of an ILS approach with the course and the slope of the database', async () => {
      const { manager, select } = setup();
      await select(approachOfType(ApproachType.Ils));

      expect(getILSs).toHaveBeenCalledWith(['IFCW']);
      expect(manager.selectedIls).toBe(FRANKFURT_ILS_25C);
      expect(manager.selectedLocCourse).toBe(249);
      expect(manager.selectedGsSlope).toBe(-3);
      expect(manager.selectedApprBackcourse).toBe(false);
      expect(manager.selectedGls).toBeNull();
    });

    it('turns the course around for a localizer backcourse approach', async () => {
      const { manager, select } = setup();
      await select(approachOfType(ApproachType.LocBackcourse));

      expect(manager.selectedLocCourse).toBe(69);
      expect(manager.selectedApprBackcourse).toBe(true);
    });

    it('replaces the GLS by the ILS, and the ILS by the GLS, when the approach changes', async () => {
      const { manager, select } = setup();
      await select(glsApproach('Z'));

      await select(approachOfType(ApproachType.Ils));
      expect(manager.selectedGls).toBeNull();
      expect(manager.selectedIls).toBe(FRANKFURT_ILS_25C);

      await select(glsApproach('Z'));
      expect(manager.selectedIls).toBeNull();
      expect(manager.selectedLocCourse).toBeNull();
      expect(manager.selectedGls).toMatchObject({ channel: 31434 });
    });

    it('drops the selection for an approach without a landing system', async () => {
      const { manager, select } = setup();
      await select(approachOfType(ApproachType.Ils));

      await select(approachOfType(ApproachType.Rnav));

      expect(manager.selectedIls).toBeNull();
      expect(manager.selectedGls).toBeNull();
    });

    it('does not select a navaid that is no ILS with a glide slope', async () => {
      getILSs.mockResolvedValue([{ ...FRANKFURT_ILS_25C, subSectionCode: AirportSubsectionCode.Runways }]);
      const { manager, select } = setup();
      await select(approachOfType(ApproachType.Ils));

      expect(manager.selectedIls).toBeNull();
    });
  });

  it('drops the selection when the database fails, and selects again afterwards', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { manager, select } = setup();
    await select(glsApproach('Z'));

    getRunways.mockRejectedValueOnce(new Error('database not ready'));
    await select(glsApproach('Y'));
    expect(manager.selectedGls).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);

    await select(glsApproach('Y'));
    expect(manager.selectedGls).toMatchObject({ channel: 28968 });
  });

  it('reads an unchanged plan again every 30 s only', async () => {
    const { manager, select, setPhase } = setup();
    await select(glsApproach('Z'));

    // A phase without selection shows whether a pass ran
    setPhase(FmgcFlightPhase.Climb);
    await manager.update(29_000);
    expect(manager.selectedGls).not.toBeNull();

    await manager.update(1_000);
    expect(manager.selectedGls).toBeNull();
  });

  it('gives a plan change that arrives during a database lookup a pass of its own', async () => {
    let finishRunwayLookup: (runways: unknown[]) => void = () => {};
    getRunways.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRunwayLookup = resolve;
      }),
    );
    const { manager, plan } = setup();

    plan.approach = glsApproach('Z');
    plan.version++;
    const pendingPass = manager.update(100);

    plan.approach = undefined;
    plan.version++;
    await manager.update(100);

    finishRunwayLookup([FRANKFURT_25C]);
    await pendingPass;
    expect(manager.selectedGls).not.toBeNull();

    await manager.update(100);
    expect(manager.selectedGls).toBeNull();
  });
});
