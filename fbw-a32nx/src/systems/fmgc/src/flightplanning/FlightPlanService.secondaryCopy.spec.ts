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

const SEC1 = FlightPlanIndex.FirstSecondary;
const SEC2 = FlightPlanIndex.FirstSecondary + 1;

/** An A380 active flight plan CYYZ-CYVR with its INIT, FUEL&LOAD and PERF T.O data, before engine start */
const createService = async () => {
  const service = new FlightPlanService(new EventBus(), new A380FlightPlanPerformanceData(), FpmConfigs.A380, true);
  service.createFlightPlans();
  await service.newCityPair('CYYZ', 'CYVR');
  const nosus = await NavigationDatabaseService.activeDatabase.searchWaypoint('NOSUS');
  await service.nextWaypoint(1, nosus[0]);
  if (service.hasTemporary) {
    await service.temporaryInsert();
  }
  await service.setFlightNumber('KAL901');
  const entries: [string, unknown][] = [
    ['cruiseFlightLevel', 350],
    ['costIndex', 80],
    ['pilotTropopause', 38000],
    ['zeroFuelWeight', 360],
    ['zeroFuelWeightCenterOfGravity', 38],
    ['blockFuel', 120],
    ['pilotMinimumDestinationFuelOnBoard', 8],
    ['paxNumber', 450],
    ['v1', 140],
    ['vr', 150],
    ['v2', 155],
    ['takeoffFlaps', 2],
  ];
  for (const [key, value] of entries) {
    await service.setPerformanceData(key as any, value, FlightPlanIndex.Active);
  }
  return service;
};

describe('the A380 copy of the active flight plan into a secondary flight plan', () => {
  beforeAll(() => setupTestDatabase());

  it('includes the flight plan, fuel and load and performance data', async () => {
    const service = await createService();

    await service.secondaryCopyFromActive(1, true);

    const sec = service.get(SEC1);
    const pd = sec.performanceData;
    expect(sec.legCount).toBe(service.active.legCount);
    expect(sec.destinationAirport?.ident).toBe('CYVR');
    expect(sec.flightNumber.get()).toBe('KAL901');
    expect(pd.cruiseFlightLevel.get()).toBe(350);
    expect(pd.costIndex.get()).toBe(80);
    expect(pd.zeroFuelWeight.get()).toBe(360);
    expect(pd.zeroFuelWeightCenterOfGravity.get()).toBe(38);
    expect(pd.blockFuel.get()).toBe(120);
    expect(pd.minimumDestinationFuelOnBoard.get()).toBe(8);
    expect(pd.paxNumber.get()).toBe(450);
    expect([pd.v1.get(), pd.vr.get(), pd.v2.get(), pd.takeoffFlaps.get()]).toEqual([140, 150, 155, 2]);
  });

  it('follows every change of the linked parameters of the active flight plan', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);

    await service.setPerformanceData('zeroFuelWeight', 365, FlightPlanIndex.Active);
    await service.setPerformanceData('zeroFuelWeightCenterOfGravity', 37, FlightPlanIndex.Active);
    await service.setPerformanceData('blockFuel', 130, FlightPlanIndex.Active);
    await service.setPerformanceData('pilotMinimumDestinationFuelOnBoard', 9, FlightPlanIndex.Active);
    await service.setPerformanceData('costIndex', 60, FlightPlanIndex.Active);
    await service.setPerformanceData('cruiseFlightLevel', 370, FlightPlanIndex.Active);
    await service.setPerformanceData('cruiseTemperaturePilotEntry', -50, FlightPlanIndex.Active);
    await service.setPerformanceData('pilotTropopause', 39000, FlightPlanIndex.Active);
    await service.setPerformanceData('pilotRouteReserveFuel', 3, FlightPlanIndex.Active);
    await service.setPerformanceData('pilotFinalHoldingTime', 35, FlightPlanIndex.Active);
    await service.setPerformanceData('paxNumber', 470, FlightPlanIndex.Active);
    await service.setFlightNumber('KAL902');

    const sec = service.get(SEC1);
    const pd = sec.performanceData;
    expect(pd.zeroFuelWeight.get()).toBe(365);
    expect(pd.zeroFuelWeightCenterOfGravity.get()).toBe(37);
    expect(pd.blockFuel.get()).toBe(130);
    expect(pd.minimumDestinationFuelOnBoard.get()).toBe(9);
    expect(pd.costIndex.get()).toBe(60);
    expect(pd.cruiseFlightLevel.get()).toBe(370);
    expect(pd.cruiseTemperaturePilotEntry.get()).toBe(-50);
    expect(pd.pilotTropopause.get()).toBe(39000);
    expect(pd.pilotRouteReserveFuel.get()).toBe(3);
    expect(pd.pilotFinalHoldingTime.get()).toBe(35);
    expect(pd.paxNumber.get()).toBe(470);
    expect(sec.flightNumber.get()).toBe('KAL902');
  });

  it('links each copy of the active flight plan', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);
    await service.secondaryCopyFromActive(2, true);

    await service.setPerformanceData('zeroFuelWeight', 370, FlightPlanIndex.Active);

    expect(service.get(SEC1).performanceData.zeroFuelWeight.get()).toBe(370);
    expect(service.get(SEC2).performanceData.zeroFuelWeight.get()).toBe(370);
  });

  it('becomes independent when the flight crew changes a linked parameter in the copy', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);

    await service.setPerformanceData('costIndex', 30, SEC1);
    await service.setPerformanceData('costIndex', 60, FlightPlanIndex.Active);
    await service.setPerformanceData('zeroFuelWeight', 370, FlightPlanIndex.Active);

    expect(service.get(SEC1).performanceData.costIndex.get()).toBe(30);
    expect(service.get(SEC1).performanceData.zeroFuelWeight.get()).toBe(360);
  });

  it('stays linked when the copy updates its ISA temperature', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);

    await service.setPerformanceData('cruiseTemperatureIsaTemp', -55, SEC1);
    await service.setPerformanceData('costIndex', 60, FlightPlanIndex.Active);

    expect(service.get(SEC1).performanceData.costIndex.get()).toBe(60);
  });

  it('links the weights and fuel only before engine start', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, false);
    await service.secondaryCopyFromActive(2, true);

    service.get(SEC2).performanceData.unlinkBeforeEngineStartParameters();
    await service.setPerformanceData('zeroFuelWeight', 370, FlightPlanIndex.Active);
    await service.setPerformanceData('blockFuel', 130, FlightPlanIndex.Active);
    await service.setPerformanceData('cruiseFlightLevel', 390, FlightPlanIndex.Active);

    for (const index of [SEC1, SEC2]) {
      const pd = service.get(index).performanceData;
      expect(pd.zeroFuelWeight.get()).toBe(360);
      expect(pd.blockFuel.get()).toBe(120);
      expect(pd.cruiseFlightLevel.get()).toBe(390);
    }
  });

  it('stays linked across a revision of the active flight plan', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);

    await service.deleteElementAt(service.active.findLegIndexByFixIdent('NOSUS'));
    expect(service.hasTemporary).toBe(true);
    await service.setPerformanceData('costIndex', 50, FlightPlanIndex.Temporary);
    await service.temporaryInsert();
    await service.setPerformanceData('zeroFuelWeight', 370, FlightPlanIndex.Active);

    expect(service.get(SEC1).performanceData.costIndex.get()).toBe(50);
    expect(service.get(SEC1).performanceData.zeroFuelWeight.get()).toBe(370);
  });

  it('becomes independent when another flight plan is activated', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);
    await service.secondaryCopyFromActive(2, true);

    await service.secondaryActivate(1, true);
    await service.setPerformanceData('costIndex', 20, FlightPlanIndex.Active);

    expect(service.get(SEC2).performanceData.costIndex.get()).toBe(80);
  });
});

describe('the A380 copy of a secondary flight plan', () => {
  beforeAll(() => setupTestDatabase());

  it('is independent of the original secondary flight plan and of the active one', async () => {
    const service = await createService();
    await service.secondaryCopyFromActive(1, true);
    await service.secondaryCopyFromSecondary(1, 2, true);

    expect(service.get(SEC2).performanceData.zeroFuelWeight.get()).toBe(360);

    await service.setPerformanceData('costIndex', 40, SEC1);
    await service.setPerformanceData('zeroFuelWeight', 370, FlightPlanIndex.Active);

    expect(service.get(SEC2).performanceData.costIndex.get()).toBe(80);
    expect(service.get(SEC2).performanceData.zeroFuelWeight.get()).toBe(360);
  });
});
