// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { FpmConfigs } from '@fmgc/flightplanning/FpmConfig';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { A380FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/A380FlightPlanPerformanceData';
import { FlightPlanChangeNotifier } from '@fmgc/flightplanning/sync/FlightPlanChangeNotifier';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { setupTestDatabase } from '@fmgc/flightplanning/test/Database';
import { ActivePlanCruiseAltitude, NO_CRUISE_ALTITUDE } from './ActivePlanCruiseAltitude';

describe('the cruise altitude simvar of the A380X FMS', () => {
  beforeAll(() => setupTestDatabase());

  /** Wired like the FMC: the simvar reset, the plans created, then the change notifier drives the simvar */
  const createFms = () => {
    let simvar = NO_CRUISE_ALTITUDE;
    const cruiseAltitude = () => simvar;
    const bus = new EventBus();
    const service = new FlightPlanService(bus, new A380FlightPlanPerformanceData(), FpmConfigs.A380);
    service.createFlightPlans();
    const flightPhase = { current: FmgcFlightPhase.Preflight };
    const cruiseAltitudeSync = new ActivePlanCruiseAltitude(
      service,
      () => flightPhase.current,
      (feet) => (simvar = feet),
    );
    new FlightPlanChangeNotifier(bus).flightPlanChanged.sub(() => cruiseAltitudeSync.onFlightPlansChanged(), true);
    return { service, flightPhase, cruiseAltitude };
  };

  it('follows a CRZ FL entered in the temporary flight plan once it is inserted', async () => {
    const { service, cruiseAltitude } = createFms();
    await service.newCityPair('CYYZ', 'CYVR');
    const nosus = await NavigationDatabaseService.activeDatabase.searchWaypoint('NOSUS');
    await service.nextWaypoint(1, nosus[0]);
    expect(service.hasTemporary).toBe(true);

    service.temporary.setPerformanceData('cruiseFlightLevel', 350);
    expect(cruiseAltitude()).toBe(NO_CRUISE_ALTITUDE);

    await service.temporaryInsert();
    expect(cruiseAltitude()).toBe(35_000);
  });

  it('follows the CRZ FL of an inserted company flight plan', async () => {
    const { service, cruiseAltitude } = createFms();
    await service.newCityPair('CYYZ', 'CYVR', undefined, FlightPlanIndex.Uplink);
    service.uplink.setPerformanceData('cruiseFlightLevel', 350);

    await service.uplinkInsert();
    expect(cruiseAltitude()).toBe(35_000);
  });

  it('follows the CRZ FL of an activated SEC, and its later changes', async () => {
    const { service, cruiseAltitude } = createFms();
    service.active.setPerformanceData('cruiseFlightLevel', 330);
    await service.secondaryInit(1);
    service.secondary(1).setPerformanceData('cruiseFlightLevel', 370);

    await service.activeAndSecondarySwap(1, true);
    expect(cruiseAltitude()).toBe(37_000);

    service.active.setPerformanceData('cruiseFlightLevel', 390);
    expect(cruiseAltitude()).toBe(39_000);

    // The old active plan is SEC 1 now: its CRZ FL is not the active one
    service.secondary(1).setPerformanceData('cruiseFlightLevel', 250);
    expect(cruiseAltitude()).toBe(39_000);
  });

  it('has no cruise altitude when the activated SEC has no CRZ FL', async () => {
    const { service, flightPhase, cruiseAltitude } = createFms();
    flightPhase.current = FmgcFlightPhase.Climb;
    service.active.setPerformanceData('cruiseFlightLevel', 350);
    await service.secondaryInit(1);

    await service.activeAndSecondarySwap(1, false);
    expect(cruiseAltitude()).toBe(NO_CRUISE_ALTITUDE);
  });

  it('keeps the last cruise altitude when the FMS deletes the CRZ FL at the start of the descent', () => {
    const { service, flightPhase, cruiseAltitude } = createFms();
    service.active.setPerformanceData('cruiseFlightLevel', 350);

    flightPhase.current = FmgcFlightPhase.Descent;
    service.active.setPerformanceData('cruiseFlightLevel', null);
    expect(cruiseAltitude()).toBe(35_000);
  });
});
