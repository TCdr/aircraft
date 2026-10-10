// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { FlightPlanService } from './FlightPlanService';
import { FpmConfigs } from './FpmConfig';
import { FlightPlanIndex } from './FlightPlanManager';
import { A320FlightPlanPerformanceData } from './plans/performance/A320FlightPlanPerformanceData';
import { HistoryWind } from '../wind/HistoryWind';

// The previous flight cruised at FL380, the plan now has FL350
const storeFlightWithCruiseAtFl380 = () =>
  localStorage.setItem(
    HistoryWind.LOCALSTORAGE_KEY,
    JSON.stringify([
      { altitude: 5000, vector: { direction: 1, magnitude: 10 } },
      { altitude: 15000, vector: { direction: 1, magnitude: 20 } },
      { altitude: 25000, vector: { direction: 1, magnitude: 30 } },
      { altitude: 38000, vector: { direction: 1, magnitude: 40 } },
    ]),
  );

const createService = async (config: typeof FpmConfigs.A380) => {
  storeFlightWithCruiseAtFl380();
  const service = new FlightPlanService(new EventBus(), new A320FlightPlanPerformanceData(), config, true);
  service.createFlightPlans();
  for (let i = 1; i <= config.NUM_SECONDARY_FLIGHT_PLANS; i++) {
    await service.secondaryInit(i);
  }
  service.active.setPerformanceData('cruiseFlightLevel', 350);
  return service;
};

describe('history winds of the flight plan service', () => {
  beforeEach(() => localStorage.clear());

  it('the A380 lists and inserts the same 4 levels, with the measured cruise wind', async () => {
    const service = await createService(FpmConfigs.A380);

    const listed = await service.getHistoryWindsEntries(false);
    expect(listed.map((w) => w.altitude)).toEqual([38000, 25000, 15000, 5000]);
    expect(await service.historyWindInsertionAllowed()).toBe(true);

    expect(await service.insertHistoryWinds()).toBe(true);

    const inserted = service.get(FlightPlanIndex.Active).performanceData.climbWindEntries.get()!;
    expect(inserted.map((w) => w.altitude).sort((a, b) => b! - a!)).toEqual([38000, 25000, 15000, 5000]);
    expect(inserted.find((w) => w.altitude === 38000)?.vector.magnitude).toBe(40);
    // What was inserted is what is listed, so there is nothing left to insert
    expect(await service.historyWindInsertionAllowed()).toBe(false);
  });

  it('the A32NX lists and inserts the planned CRZ FL as well', async () => {
    const service = await createService(FpmConfigs.A320_HONEYWELL_H4);

    const listed = await service.getHistoryWindsEntries(false);
    expect(listed.map((w) => w.altitude)).toEqual([38000, 35000, 25000, 15000, 5000]);

    expect(await service.insertHistoryWinds()).toBe(true);

    const inserted = service.get(FlightPlanIndex.Active).performanceData.climbWindEntries.get()!;
    expect(inserted.map((w) => w.altitude).sort((a, b) => b! - a!)).toEqual([38000, 35000, 25000, 15000, 5000]);
  });
});
