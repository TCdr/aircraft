// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { FlightPlanService } from './FlightPlanService';
import { FpmConfigs } from './FpmConfig';
import { FlightPlanIndex } from './FlightPlanManager';
import { A320FlightPlanPerformanceData } from './plans/performance/A320FlightPlanPerformanceData';
import { setupTestDatabase } from './test/Database';
import { NavigationDatabaseService } from './NavigationDatabaseService';

// A380: inserting, changing or removing the alternate destination creates a temporary flight plan, except from the
// INIT page.
describe('the alternate revision of the flight plan service', () => {
  beforeAll(() => setupTestDatabase());

  const createService = async () => {
    const service = new FlightPlanService(new EventBus(), new A320FlightPlanPerformanceData(), FpmConfigs.A380, true);
    service.createFlightPlans();
    for (let i = 1; i <= FpmConfigs.A380.NUM_SECONDARY_FLIGHT_PLANS; i++) {
      await service.secondaryInit(i);
    }
    await service.active.setDestinationAirport('CYYZ');
    return service;
  };

  it('selects the alternate in a temporary flight plan, inserted with it', async () => {
    const service = await createService();

    await service.setAlternate('CYVR', FlightPlanIndex.Active, true);

    expect(service.hasTemporary).toBe(true);
    expect(service.temporary.alternateDestinationAirport?.ident).toBe('CYVR');
    expect(service.active.alternateDestinationAirport).toBeUndefined();

    await service.temporaryInsert();

    expect(service.hasTemporary).toBe(false);
    expect(service.active.alternateDestinationAirport?.ident).toBe('CYVR');
  });

  it('removes the alternate in a temporary flight plan (NO ALTN)', async () => {
    const service = await createService();
    await service.setAlternate('CYVR', FlightPlanIndex.Active);

    await service.setAlternate(undefined, FlightPlanIndex.Active, true);

    expect(service.hasTemporary).toBe(true);
    expect(service.temporary.alternateDestinationAirport).toBeUndefined();
    expect(service.active.alternateDestinationAirport?.ident).toBe('CYVR');
  });

  it('changes the alternate of a pending temporary flight plan', async () => {
    const service = await createService();
    await service.setAlternate('CYVR', FlightPlanIndex.Active, true);

    await service.setAlternate(undefined, FlightPlanIndex.Temporary, true);

    expect(service.temporary.alternateDestinationAirport).toBeUndefined();
  });

  it('sets the alternate directly from the INIT page', async () => {
    const service = await createService();

    await service.setAlternate('CYVR', FlightPlanIndex.Active);

    expect(service.hasTemporary).toBe(false);
    expect(service.active.alternateDestinationAirport?.ident).toBe('CYVR');
  });
});

// A380 INIT page ALTN RTE: an alternate route replaces the whole alternate flight plan, without a temporary flight
// plan.
describe('the alternate company route of the flight plan service', () => {
  beforeAll(() => setupTestDatabase());

  it('re-initializes the alternate flight plan with the fixes of the route, in order', async () => {
    const service = new FlightPlanService(new EventBus(), new A320FlightPlanPerformanceData(), FpmConfigs.A380, true);
    service.createFlightPlans();
    await service.active.setDestinationAirport('CYYZ');
    const [nosus] = await NavigationDatabaseService.activeDatabase.searchAllFix('NOSUS');
    const [dutil] = await NavigationDatabaseService.activeDatabase.searchAllFix('DUTIL');

    await service.insertAlternateCompanyRoute('CYVR', [nosus, dutil], FlightPlanIndex.Active);

    expect(service.hasTemporary).toBe(false);
    const alternate = service.active.alternateFlightPlan;
    expect(service.active.alternateDestinationAirport?.ident).toBe('CYVR');
    const idents = alternate.allLegs.filter((l) => l.isDiscontinuity === false).map((l) => l.ident);
    expect(idents.indexOf('NOSUS')).toBeGreaterThan(-1);
    expect(idents.indexOf('DUTIL')).toBe(idents.indexOf('NOSUS') + 1);
  });

  it('is not allowed on the temporary flight plan', async () => {
    const service = new FlightPlanService(new EventBus(), new A320FlightPlanPerformanceData(), FpmConfigs.A380, true);
    service.createFlightPlans();
    await expect(service.insertAlternateCompanyRoute('CYVR', [], FlightPlanIndex.Temporary)).rejects.toThrow();
  });
});
