// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { A320FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/A320FlightPlanPerformanceData';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { EconSpeedSet } from '@fmgc/guidance/vnav/EconSpeeds';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { RtaSpeedEnvelope } from '@fmgc/guidance/vnav/rta/RtaSpeedBias';
import { TimeConstraint, TimeConstraintType } from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A32nxRtaFunction } from './A32nxRtaFunction';
import { TypeIIMessage } from '../messages/NXSystemMessages';

const NOW_MS = Date.UTC(2026, 9, 19, 10, 0, 0);
const NOW = 10 * 3600;

const leg = (ident: string) => ({
  isDiscontinuity: false,
  ident,
  definition: { waypoint: { databaseId: `W    ${ident}` } },
  isHX: () => false,
});

const rtaAt = (ident: string, utcSeconds: number): TimeConstraint => ({
  ident,
  databaseId: `W    ${ident}`,
  type: TimeConstraintType.At,
  utcSeconds,
});

const econ: EconSpeedSet = {
  climbSpeed: 300,
  climbMach: 0.78,
  cruiseSpeed: 280,
  cruiseMach: 0.78,
  descentSpeed: 290,
  descentMach: 0.78,
};

const envelope: RtaSpeedEnvelope = {
  climbMinSpeed: 220,
  cruiseMinSpeed: 230,
  descentMinSpeed: 210,
  cruiseMinMach: 0.66,
  maxSpeed: 340,
  maxMach: 0.8,
};

class Fixture {
  readonly performanceData = new A320FlightPlanPerformanceData();

  readonly plan = {
    performanceData: this.performanceData,
    allLegs: [leg('LFPG'), leg('PG270'), leg('KONAN'), leg('LUMAN'), leg('NEBRU'), leg('EGLL')],
    activeLegIndex: 2,
    maybeElementAt: (index: number) => this.plan.allLegs[index],
  };

  readonly flightPlanService = {
    hasActive: true,
    hasTemporary: false,
    active: this.plan,
    has: () => true,
    get: () => this.plan,
    setPerformanceData: (key: string, value: unknown) => (this.performanceData as any)[key].set(value),
    setTimeConstraint: (rta: TimeConstraint | null) => this.performanceData.timeConstraint.set(rta),
    timeConstraintOf: () => this.performanceData.timeConstraint.get(),
    deleteActiveTimeConstraint: () => this.performanceData.timeConstraint.set(null),
  } as unknown as FlightPlanService;

  readonly predictions = new Map<number, VerticalWaypointPrediction>();

  readonly vnavDriver = {
    version: 1,
    mcduProfile: {
      isReadyToDisplay: true,
      waypointPredictions: this.predictions,
      findVerticalCheckpoint: () => undefined,
    },
  };

  readonly flightPhaseManager = { phase: FmgcFlightPhase.Cruise };

  engineOut = false;

  nav = true;

  fuelPlanning = false;

  readonly messages: string[] = [];

  readonly removed: string[] = [];

  readonly resolvers = new Map<string, () => boolean>();

  readonly rtaFunction: A32nxRtaFunction;

  constructor() {
    this.rtaFunction = new A32nxRtaFunction(
      {
        flightPlanService: this.flightPlanService,
        guidanceController: {
          vnavDriver: this.vnavDriver,
          verticalProfileComputationParametersObserver: { get: () => ({ fcuSpeedManaged: true }) },
          getAlongTrackDistanceToDestination: () => undefined,
        } as unknown as GuidanceController,
        flightPhaseManager: this.flightPhaseManager,
        isEngineOutCondition: { get: () => this.engineOut },
        isNavModeEngaged: () => this.nav,
        isFuelPlanningInProgress: () => this.fuelPlanning,
        addMessageToQueue: (message: TypeIIMessage, isResolved?: () => boolean) => {
          this.messages.push(message.text);
          if (isResolved) {
            this.resolvers.set(message.text, isResolved);
          }
        },
        removeMessageFromQueue: (text: string) => this.removed.push(text),
      },
      () => NOW_MS,
    );
  }

  /** A new VNAV profile with the flight time to NEBRU (flight plan index 4) */
  predict(secondsToNebru: number): void {
    this.vnavDriver.version++;
    this.predictions.set(4, { secondsFromPresent: secondsToNebru, distanceFromAircraft: 400 } as any);
  }
}

let fixture: Fixture;

describe('the A32NX RTA function', () => {
  beforeEach(() => {
    fixture = new Fixture();
    fixture.rtaFunction.applySpeedBias(econ, envelope);
  });

  it('changes the managed speeds to meet the RTA, with SETTING SPD/RTA and TIME ERROR AT', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3700);

    fixture.rtaFunction.update();

    expect(fixture.messages).toEqual(['SETTING SPD/RTA', 'TIME ERROR AT NEBRU']);
    expect(fixture.rtaFunction.activeResult?.timeError).toBe(100);
    expect(fixture.rtaFunction.applySpeedBias(econ, envelope)!.cruiseMach).toBeGreaterThan(econ.cruiseMach);
  });

  it('removes TIME ERROR AT once the RTA is predicted as made, SETTING SPD/RTA once the speed is set', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3700);
    fixture.rtaFunction.update();
    fixture.predict(3700);
    fixture.predict(3602);

    fixture.rtaFunction.update();

    expect(fixture.removed).toEqual(['TIME ERROR AT NEBRU']);
    expect(fixture.resolvers.get('SETTING SPD/RTA')!()).toBe(true);
  });

  it('TIME ERROR AT needs the lateral managed mode', () => {
    fixture.nav = false;
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3700);

    fixture.rtaFunction.update();

    expect(fixture.messages).not.toContain('TIME ERROR AT NEBRU');
  });

  it('deletes the RTA with RTA DELETED on an engine out', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3600);
    fixture.engineOut = true;

    fixture.rtaFunction.update();

    expect(fixture.performanceData.timeConstraint.get()).toBeNull();
    expect(fixture.messages).toEqual(['RTA DELETED']);
  });

  it('deletes the RTA with RTA DELETED when its waypoint is sequenced', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('KONAN', NOW + 600));
    fixture.plan.activeLegIndex = 3;

    fixture.rtaFunction.update();

    expect(fixture.performanceData.timeConstraint.get()).toBeNull();
    expect(fixture.messages).toEqual(['RTA DELETED']);
  });

  it('a new RTA on another waypoint replaces the previous one, with RTA DELETED', () => {
    fixture.rtaFunction.setTimeConstraint(rtaAt('NEBRU', NOW + 3600), 0);
    expect(fixture.messages).toEqual([]);

    fixture.rtaFunction.setTimeConstraint(rtaAt('LUMAN', NOW + 3000), 0);

    expect(fixture.messages).toEqual(['RTA DELETED']);
    expect(fixture.performanceData.timeConstraint.get()?.ident).toBe('LUMAN');
  });

  it('an RTA entered during the fuel planning is not used by it: BLOCK IGNORES RTA', () => {
    fixture.fuelPlanning = true;

    fixture.rtaFunction.setTimeConstraint(rtaAt('NEBRU', NOW + 3600), 0);

    expect(fixture.messages).toEqual(['BLOCK IGNORES RTA']);
  });

  it('the ETT of a SEC flight plan that becomes active is a crew ETT', async () => {
    fixture.flightPhaseManager.phase = FmgcFlightPhase.Preflight;
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3 * 3600));
    fixture.predict(2 * 3600);
    fixture.rtaFunction.update();
    expect(fixture.rtaFunction.isEttComputed).toBe(true);

    await fixture.rtaFunction.replaceFlightPlan(0, async () => {
      fixture.performanceData.timeConstraint.set(null);
      fixture.performanceData.estimatedTakeoffTime.set(NOW_MS + 600 * 1000);
    });
    fixture.rtaFunction.update();

    expect(fixture.rtaFunction.isEttComputed).toBe(false);
    expect(fixture.performanceData.estimatedTakeoffTime.get()).toBe(NOW_MS + 600 * 1000);
  });

  it('the RTA of a flight plan replaced by the SEC is deleted, with RTA DELETED', async () => {
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));

    await fixture.rtaFunction.replaceFlightPlan(0, async () => fixture.performanceData.timeConstraint.set(null));

    expect(fixture.messages).toEqual(['RTA DELETED']);
  });

  it('preflight: computes the ETT that meets the RTA, cleared with the RTA', () => {
    fixture.flightPhaseManager.phase = FmgcFlightPhase.Preflight;
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3 * 3600));
    fixture.predict(2 * 3600);

    fixture.rtaFunction.update();

    expect(fixture.rtaFunction.isEttComputed).toBe(true);
    expect(fixture.performanceData.estimatedTakeoffTime.get()).toBe(NOW_MS + 3600 * 1000);

    fixture.performanceData.timeConstraint.set(null);
    fixture.rtaFunction.update();

    expect(fixture.rtaFunction.isEttComputed).toBe(false);
    expect(fixture.performanceData.estimatedTakeoffTime.get()).toBeNull();
  });

  it('preflight: a crew ETT is not replaced', () => {
    fixture.flightPhaseManager.phase = FmgcFlightPhase.Preflight;
    fixture.performanceData.estimatedTakeoffTime.set(NOW_MS + 1800 * 1000);
    fixture.rtaFunction.onCrewEttEntered();
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3 * 3600));
    fixture.predict(2 * 3600);

    fixture.rtaFunction.update();

    expect(fixture.rtaFunction.isEttComputed).toBe(false);
    expect(fixture.performanceData.estimatedTakeoffTime.get()).toBe(NOW_MS + 1800 * 1000);
    expect(fixture.rtaFunction.activeResult?.timeError).toBe(-1800);
  });
});
