// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { FlightPlanService } from './FlightPlanService';
import { FpmConfigs } from './FpmConfig';
import { FlightPlanIndex } from './FlightPlanManager';
import { A320FlightPlanPerformanceData } from './plans/performance/A320FlightPlanPerformanceData';
import { TimeConstraint, TimeConstraintType } from '../guidance/vnav/rta/TimeConstraint';

const rta: TimeConstraint = {
  ident: 'KONAN',
  databaseId: 'WEUR    KONAN',
  type: TimeConstraintType.AtOrBefore,
  utcSeconds: 45_000,
};

const createService = async (config: typeof FpmConfigs.A380) => {
  const service = new FlightPlanService(new EventBus(), new A320FlightPlanPerformanceData(), config, true);
  service.createFlightPlans();
  await service.secondaryInit(1);
  return service;
};

describe('the time constraint (RTA) of the flight plan service', () => {
  for (const [aircraft, config] of [
    ['A32NX', FpmConfigs.A320_HONEYWELL_H4],
    ['A380X', FpmConfigs.A380],
  ] as const) {
    it(`${aircraft}: an RTA revision of the active flight plan is made in a temporary flight plan`, async () => {
      const service = await createService(config);

      service.setTimeConstraint(rta);

      expect(service.hasTemporary).toBe(true);
      expect(service.get(FlightPlanIndex.Temporary).performanceData.timeConstraint.get()).toEqual(rta);
      expect(service.active.performanceData.timeConstraint.get()).toBeNull();

      await service.temporaryInsert();

      expect(service.active.performanceData.timeConstraint.get()).toEqual(rta);
    });

    it(`${aircraft}: an erased temporary flight plan leaves the RTA as it was`, async () => {
      const service = await createService(config);
      service.setTimeConstraint(rta);
      await service.temporaryInsert();

      service.setTimeConstraint(null);
      await service.temporaryDelete();

      expect(service.active.performanceData.timeConstraint.get()).toEqual(rta);
    });
  }

  it('an automatic deletion also deletes the RTA from a pending temporary flight plan', async () => {
    const service = await createService(FpmConfigs.A380);
    service.setTimeConstraint(rta);
    await service.temporaryInsert();
    service.setTimeConstraint(rta);
    expect(service.timeConstraintOf()).toEqual(rta);

    service.deleteActiveTimeConstraint();
    await service.temporaryInsert();

    expect(service.active.performanceData.timeConstraint.get()).toBeNull();
  });

  it('the RTA of a secondary flight plan is set directly and goes with it when it is activated', async () => {
    const service = await createService(FpmConfigs.A380);

    service.setTimeConstraint(rta, FlightPlanIndex.FirstSecondary);

    expect(service.hasTemporary).toBe(false);
    expect(service.secondary(1).performanceData.timeConstraint.get()).toEqual(rta);

    await service.secondaryActivate(1, true);

    expect(service.active.performanceData.timeConstraint.get()).toEqual(rta);
  });
});
