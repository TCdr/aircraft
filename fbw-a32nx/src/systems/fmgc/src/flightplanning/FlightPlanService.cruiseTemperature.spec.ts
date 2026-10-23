// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { FlightPlanService } from './FlightPlanService';
import { FpmConfigs } from './FpmConfig';
import { FlightPlanIndex } from './FlightPlanManager';
import { A380FlightPlanPerformanceData } from './plans/performance/A380FlightPlanPerformanceData';
import { setupTestDatabase } from './test/Database';
import { NavigationDatabaseService } from './NavigationDatabaseService';
import { PropagationType } from './data/wind';
import { isLeg } from './legs/FlightPlanLeg';

const createService = async () => {
  const service = new FlightPlanService(new EventBus(), new A380FlightPlanPerformanceData(), FpmConfigs.A380, true);
  service.createFlightPlans();
  await service.newCityPair('CYYZ', 'CYVR');
  const nosus = await NavigationDatabaseService.activeDatabase.searchWaypoint('NOSUS');
  await service.nextWaypoint(1, nosus[0]);
  if (service.hasTemporary) {
    await service.temporaryInsert();
  }
  return service;
};

/** The leg indices of the flight plan fixes; the plan stores an entry on any of them, the pages offer the cruise ones */
const waypointLegIndices = (service: FlightPlanService) => {
  const indices: number[] = [];
  for (let i = 0; i < service.active.firstMissedApproachLegIndex; i++) {
    const element = service.active.maybeElementAt(i);
    if (isLeg(element) && element.isXF()) {
      indices.push(i);
    }
  }
  return indices;
};

describe('the SAT entries of the cruise waypoints', () => {
  beforeAll(() => setupTestDatabase());

  it('hold down-path until a waypoint has an entry of its own', async () => {
    const service = await createService();
    const [, first, second] = waypointLegIndices(service);
    const active = FlightPlanIndex.Active;

    await service.setCruiseTemperatureEntry(first, { altitude: 35000, temperature: -50 }, active);

    expect(service.propagateTemperatureAt(first, active)).toMatchObject({
      type: PropagationType.Entry,
      temperature: -50,
      altitude: 35000,
    });
    expect(service.propagateTemperatureAt(second, active)).toMatchObject({
      type: PropagationType.Forward,
      temperature: -50,
      sourceLegIndex: first,
    });

    await service.setCruiseTemperatureEntry(second, { altitude: 37000, temperature: -58 }, active);

    expect(service.propagateTemperatureAt(second, active)).toMatchObject({
      type: PropagationType.Entry,
      temperature: -58,
    });
    expect(service.propagateTemperatureAt(first, active)).toMatchObject({ temperature: -50 });
  });

  it('have nothing up-path of the first entry and can be removed', async () => {
    const service = await createService();
    const [, first, second] = waypointLegIndices(service);
    const active = FlightPlanIndex.Active;

    await service.setCruiseTemperatureEntry(second, { altitude: 35000, temperature: -52 }, active);
    expect(service.propagateTemperatureAt(first, active)).toBeNull();

    await service.setCruiseTemperatureEntry(second, null, active);
    expect(service.propagateTemperatureAt(second, active)).toBeNull();
  });

  it('are a draft with the winds: INSERT keeps them, WIND CANCEL drops them', async () => {
    const service = await createService();
    const [, first] = waypointLegIndices(service);
    const active = FlightPlanIndex.Active;

    await service.setCruiseTemperatureEntry(first, { altitude: 35000, temperature: -50 }, active);
    expect(service.active.hasDraftWindEntries()).toBe(true);
    expect(service.active.legElementAt(first).cruiseTemperatureEntry).toBeUndefined();

    service.active.deleteDraftWindEntries();
    expect(service.propagateTemperatureAt(first, active)).toBeNull();

    await service.setCruiseTemperatureEntry(first, { altitude: 35000, temperature: -50 }, active);
    service.active.insertDraftWindEntries();
    expect(service.active.legElementAt(first).cruiseTemperatureEntry).toEqual({ altitude: 35000, temperature: -50 });
  });

  it('are kept when the flight plan is copied', async () => {
    const service = await createService();
    const [, first] = waypointLegIndices(service);

    await service.setCruiseTemperatureEntry(first, { altitude: 35000, temperature: -50 }, FlightPlanIndex.Active);
    service.active.insertDraftWindEntries();
    await service.secondaryCopyFromActive(1, true);

    expect(service.propagateTemperatureAt(first, FlightPlanIndex.FirstSecondary)).toMatchObject({ temperature: -50 });
  });
});
