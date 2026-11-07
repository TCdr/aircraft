// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LandingSystemSelectionManager } from './LandingSystemSelectionManager';

const getRunways = vi.hoisted(() => vi.fn());

vi.mock('@fmgc/flightplanning/NavigationDatabaseService', () => ({
  NavigationDatabaseService: { activeDatabase: { backendDatabase: { getRunways } } },
}));

const FRANKFURT_25C: Record<string, unknown> = {
  ident: 'RW25C',
  bearing: 249.2,
  magneticBearing: 246.2,
  thresholdLocation: { lat: 50.0285, long: 8.5361, alt: 328 },
  length: 4000,
};

function glsApproach(multipleIndicator: string, runwayIdent = 'EDDF25C') {
  return {
    type: ApproachType.Gls,
    databaseId: `GLS-${runwayIdent}-${multipleIndicator}`,
    runwayIdent,
    multipleIndicator,
  };
}

function setup() {
  const bus = new EventBus();
  bus
    .getPublisher<{ fmgc_flight_phase: FmgcFlightPhase }>()
    .pub('fmgc_flight_phase', FmgcFlightPhase.Approach, false, true);

  const plan = {
    version: 1,
    approach: undefined as unknown,
    destinationAirport: { ident: 'EDDF', location: { lat: 50.03, long: 8.57 } },
  };
  const manager = new LandingSystemSelectionManager(
    bus,
    { active: plan } as never,
    { getPpos: () => ({ lat: 50.5, long: 8.6 }) } as never,
  );

  /** Runs one selection pass; a new plan version forces the throttled update */
  const select = async (approach: unknown) => {
    plan.approach = approach;
    plan.version++;
    await manager.update(100);
  };

  return { manager, select };
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
