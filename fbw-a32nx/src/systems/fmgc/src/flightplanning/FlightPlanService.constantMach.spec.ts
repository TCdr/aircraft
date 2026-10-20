// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanService } from './FlightPlanService';
import { FpmConfigs } from './FpmConfig';
import { FlightPlanIndex } from './FlightPlanManager';
import { A320FlightPlanPerformanceData } from './plans/performance/A320FlightPlanPerformanceData';
import { setupTestDatabase } from './test/Database';
import { NavigationDatabaseService } from './NavigationDatabaseService';
import { FlightPlanOperationEvents } from '../events/FlightPlanOperationEvents';
import {
  A320AnnouncedConstantMachDeletions,
  A380AnnouncedConstantMachDeletions,
  ConstantMachSegmentDeletionReason,
  findConstantMachSegment,
} from './ConstantMachSegment';
import { ConstantMachSegmentAutoDeletion } from './ConstantMachSegmentAutoDeletion';

describe('the constant Mach segment of the flight plan service', () => {
  beforeAll(() => setupTestDatabase());

  const createService = async () => {
    const bus = new EventBus();
    const service = new FlightPlanService(bus, new A320FlightPlanPerformanceData(), FpmConfigs.A320_HONEYWELL_H4);
    service.createFlightPlans();
    await service.secondaryInit(1);
    await service.active.setOriginAirport('CYYZ');
    await service.active.setDestinationAirport('CYVR');

    const nosus = await NavigationDatabaseService.activeDatabase.searchWaypoint('NOSUS');
    await service.active.nextWaypoint(1, nosus[0]);
    const dutil = await NavigationDatabaseService.activeDatabase.searchWaypoint('DUTIL');
    await service.active.nextWaypoint(2, dutil[0]);

    const start = service.active.findLegIndexByFixIdent('NOSUS');
    const end = service.active.findLegIndexByFixIdent('DUTIL');

    const deletions: ConstantMachSegmentDeletionReason[] = [];
    bus
      .getSubscriber<FlightPlanOperationEvents>()
      .on('fms_constant_mach_segment_auto_deleted')
      .handle((reason) => deletions.push(reason));

    return { service, start, end, deletions };
  };

  it('is inserted and deleted through the temporary flight plan', async () => {
    const { service, start, end } = await createService();

    await service.setConstantMachSegment(start, end, 0.8);

    expect(service.hasTemporary).toBe(true);
    expect(findConstantMachSegment(service.active.allLegs)).toBeNull();
    expect(findConstantMachSegment(service.temporary.allLegs)).toEqual({
      mach: 0.8,
      startLegIndex: start,
      endLegIndex: end,
    });

    await service.temporaryInsert();
    expect(findConstantMachSegment(service.active.allLegs)).toEqual({
      mach: 0.8,
      startLegIndex: start,
      endLegIndex: end,
    });

    await service.deleteConstantMachSegment();
    expect(findConstantMachSegment(service.temporary.allLegs)).toBeNull();
    expect(findConstantMachSegment(service.active.allLegs)).not.toBeNull();

    await service.temporaryInsert();
    expect(findConstantMachSegment(service.active.allLegs)).toBeNull();
  });

  it('keeps one segment: a new one replaces the old one', async () => {
    const { service, start, end } = await createService();

    await service.setConstantMachSegment(start, end, 0.8);
    await service.setConstantMachSegment(end, null, 0.78);

    expect(findConstantMachSegment(service.temporary.allLegs)).toEqual({
      mach: 0.78,
      startLegIndex: end,
      endLegIndex: null,
    });
    expect(service.temporary.allLegs.filter((l) => l.isDiscontinuity === false && l.constantMachSegment)).toHaveLength(
      1,
    );
  });

  it('is deleted in the active flight plan, without a temporary one, when the FMS deletes it', async () => {
    const { service, start, end, deletions } = await createService();
    await service.setConstantMachSegment(start, end, 0.8);
    await service.temporaryInsert();

    await service.autoDeleteConstantMachSegment(ConstantMachSegmentDeletionReason.EngineOut);

    expect(service.hasTemporary).toBe(false);
    expect(findConstantMachSegment(service.active.allLegs)).toBeNull();
    expect(deletions).toEqual([ConstantMachSegmentDeletionReason.EngineOut]);

    await service.autoDeleteConstantMachSegment(ConstantMachSegmentDeletionReason.EngineOut);
    expect(deletions).toHaveLength(1);
  });

  it('is announced when the secondary flight plan is activated over an active one with a segment', async () => {
    const { service, start, end, deletions } = await createService();
    await service.setConstantMachSegment(start, end, 0.8);
    await service.temporaryInsert();

    await service.secondaryActivate(1, true);

    expect(deletions).toEqual([ConstantMachSegmentDeletionReason.SecondaryActivated]);
  });

  it('is deleted when the alternate is enabled, announced once the alternate is inserted', async () => {
    const { service, start, end, deletions } = await createService();
    await service.setConstantMachSegment(start, end, 0.8);
    await service.temporaryInsert();
    await service.setAlternate('CYYZ');

    await service.enableAltn(start, 100);

    expect(findConstantMachSegment(service.temporary.allLegs)).toBeNull();
    expect(deletions).toEqual([]);

    await service.temporaryInsert();

    expect(findConstantMachSegment(service.active.allLegs)).toBeNull();
    expect(deletions).toEqual([ConstantMachSegmentDeletionReason.AlternateEnabled]);
  });

  it('is kept, without a message, when the enabled alternate is erased', async () => {
    const { service, start, end, deletions } = await createService();
    await service.setConstantMachSegment(start, end, 0.8);
    await service.temporaryInsert();
    await service.setAlternate('CYYZ');

    await service.enableAltn(start, 100);
    await service.temporaryDelete();
    await service.setConstantMachSegment(start, end, 0.82);
    await service.temporaryInsert();

    expect(findConstantMachSegment(service.active.allLegs)?.mach).toBe(0.82);
    expect(deletions).toEqual([]);
  });

  it('is copied with the flight plan to the secondary', async () => {
    const { service, start, end } = await createService();
    await service.setConstantMachSegment(start, end, 0.8);
    await service.temporaryInsert();

    await service.secondaryCopyFromActive(1, true);

    expect(findConstantMachSegment(service.secondary(1).allLegs)).toEqual({
      mach: 0.8,
      startLegIndex: start,
      endLegIndex: end,
    });
    expect(service.active.index).toBe(FlightPlanIndex.Active);
  });
});

describe('the automatic deletion of the constant Mach segment by the aircraft', () => {
  const setup = (announcedReasons: readonly ConstantMachSegmentDeletionReason[]) => {
    const bus = new EventBus();
    const autoDeleteConstantMachSegment = vi.fn(async (reason: ConstantMachSegmentDeletionReason) => {
      bus.getPublisher<FlightPlanOperationEvents>().pub('fms_constant_mach_segment_auto_deleted', reason);
    });
    const announce = vi.fn();
    const deletion = new ConstantMachSegmentAutoDeletion(
      bus,
      { autoDeleteConstantMachSegment },
      announcedReasons,
      announce,
    );
    return { deletion, autoDeleteConstantMachSegment, announce };
  };

  it('deletes the segment when the cruise phase ends, with a message on both aircraft', () => {
    for (const reasons of [A320AnnouncedConstantMachDeletions, A380AnnouncedConstantMachDeletions]) {
      const { deletion, autoDeleteConstantMachSegment, announce } = setup(reasons);

      deletion.onFlightPhaseChanged(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise);
      expect(autoDeleteConstantMachSegment).not.toHaveBeenCalled();

      deletion.onFlightPhaseChanged(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent);
      expect(autoDeleteConstantMachSegment).toHaveBeenCalledWith(ConstantMachSegmentDeletionReason.CruisePhaseExit);
      expect(announce).toHaveBeenCalledTimes(1);
    }
  });

  it('deletes the segment when an engine fails, with a message on the A320 only', () => {
    const a320 = setup(A320AnnouncedConstantMachDeletions);
    a320.deletion.onEngineOutChanged(false);
    expect(a320.autoDeleteConstantMachSegment).not.toHaveBeenCalled();
    a320.deletion.onEngineOutChanged(true);
    a320.deletion.onEngineOutChanged(true);
    expect(a320.autoDeleteConstantMachSegment).toHaveBeenCalledTimes(1);
    expect(a320.announce).toHaveBeenCalledTimes(1);

    const a380 = setup(A380AnnouncedConstantMachDeletions);
    a380.deletion.onEngineOutChanged(true);
    expect(a380.autoDeleteConstantMachSegment).toHaveBeenCalledWith(ConstantMachSegmentDeletionReason.EngineOut);
    expect(a380.announce).not.toHaveBeenCalled();
  });
});
