// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { FpmConfigs } from '@fmgc/flightplanning/FpmConfig';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { A320FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/A320FlightPlanPerformanceData';
import { setupTestDatabase } from '@fmgc/flightplanning/test/Database';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { PropagationType, createVectorFromMagnitudeAndDirection } from '@fmgc/flightplanning/data/wind';
import {
  createLevelAtmosphere,
  cruiseLevelAtmosphereInputsFromPlan,
  recMaxAtRouteTemperature,
} from '@fmgc/guidance/vnav/CruiseLevelAtmosphere';
import { parseCruiseTemperatureEntry } from '../legacy_pages/CruiseTemperatureEntry';
import { progOptimumFlightLevel } from './OptimumFlightLevel';
import { recMaxFlightLevel } from './RecMaxFlightLevel';

const GROSS_WEIGHT = 66;

/** An A320 flight plan on the ground with the geometry the VNAV would have calculated */
const createService = async () => {
  const service = new FlightPlanService(
    new EventBus(),
    new A320FlightPlanPerformanceData(),
    FpmConfigs.A320_HONEYWELL_H4,
    true,
  );
  service.createFlightPlans();
  await service.newCityPair('CYYZ', 'CYVR');
  const nosus = await NavigationDatabaseService.activeDatabase.searchWaypoint('NOSUS');
  await service.nextWaypoint(1, nosus[0]);
  if (service.hasTemporary) {
    await service.temporaryInsert();
  }
  for (let i = 0; i < service.active.firstMissedApproachLegIndex; i++) {
    const element = service.active.maybeElementAt(i);
    if (isLeg(element)) {
      element.calculated = { trueTrack: 270, distanceWithTransitions: 1000 } as any;
    }
  }
  return service;
};

/** What updateOptimumFlightLevel does on the ground, from the plan */
const optimumFlightLevel = (service: FlightPlanService) => {
  const plan = service.active;
  const atmosphere = createLevelAtmosphere(cruiseLevelAtmosphereInputsFromPlan(plan, 0, 36_090, null, null));
  const recMax = recMaxAtRouteTemperature(recMaxFlightLevel(0, GROSS_WEIGHT), atmosphere, (isaDeviation) =>
    recMaxFlightLevel(isaDeviation, GROSS_WEIGHT),
  );
  return progOptimumFlightLevel({
    grossWeight: GROSS_WEIGHT,
    recMaxFlightLevel: recMax,
    engineOut: false,
    costIndex: 30,
    isaDeviation: 0,
    headwind: 0,
    atmosphere,
    tropopause: 36_090,
    distanceToDestination: 2000,
    currentAltitude: 0,
    destinationElevation: 0,
  });
};

const enterSat = async (service: FlightPlanService, legIndex: number, input: string) => {
  const result = parseCruiseTemperatureEntry(input, null);
  if (!('entry' in result)) {
    throw new Error(input);
  }
  await service.setCruiseTemperatureEntry(legIndex, result.entry, FlightPlanIndex.Active);
};

describe('the OPT FL of the A32NX with the entries of the CRZ WIND page', () => {
  beforeAll(() => setupTestDatabase());

  it('drops when a SAT 30 degrees above ISA is entered, as the REC MAX ceiling drops on a warm day', async () => {
    const service = await createService();
    const legIndex = 2;
    const before = optimumFlightLevel(service);

    await enterSat(service, legIndex, '-26/FL370');

    const after = optimumFlightLevel(service);
    expect(after).not.toBeNull();
    expect(after!).toBeLessThanOrEqual(before! - 30);
  });

  it('follows the winds entered per level: a headwind growing with height lowers it, a tailwind raises it', async () => {
    const service = await createService();
    const before = optimumFlightLevel(service);
    const addWind = (altitude: number, magnitude: number, from: number) =>
      service.addCruiseWindEntry(
        2,
        { altitude, vector: createVectorFromMagnitudeAndDirection(magnitude, from) },
        FlightPlanIndex.Active,
      );

    // The route heads west (track 270): wind from 270 is a headwind
    await addWind(31_000, 0, 270);
    await addWind(39_000, 100, 270);
    expect(optimumFlightLevel(service)!).toBeLessThanOrEqual(before! - 50);

    await addWind(39_000, 100, 90);
    expect(optimumFlightLevel(service)!).toBeGreaterThan(before!);
  });

  it('goes back when the SAT entry is cleared', async () => {
    const service = await createService();
    const before = optimumFlightLevel(service);

    await enterSat(service, 2, '-26/FL370');
    await service.setCruiseTemperatureEntry(2, null, FlightPlanIndex.Active);

    expect(optimumFlightLevel(service)).toBe(before);
  });

  it('is found when the SAT sits on a waypoint of a procedure (no airway legs in the route)', async () => {
    const service = await createService();
    const before = optimumFlightLevel(service);

    await enterSat(service, 0, '-26/FL370');

    expect(optimumFlightLevel(service)).toBeLessThan(before!);
    expect(service.propagateTemperatureAt(2, FlightPlanIndex.Active)?.type).toBe(PropagationType.Forward);
  });
});
