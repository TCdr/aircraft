// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { A380FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/A380FlightPlanPerformanceData';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { EconSpeedSet } from '@fmgc/guidance/vnav/EconSpeeds';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { RtaSpeedEnvelope } from '@fmgc/guidance/vnav/rta/RtaSpeedBias';
import { TimeConstraint, TimeConstraintType } from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A380xRtaFunction } from './A380xRtaFunction';
import { TypeIIMessage, TypeIMessage } from '../shared/NXSystemMessages';

const NOW = 10 * 3600;

const leg = (ident: string) => ({
  isDiscontinuity: false,
  ident,
  definition: { waypoint: { databaseId: `W ${ident}` } },
});

const rtaAt = (ident: string, utcSeconds: number): TimeConstraint => ({
  ident,
  databaseId: `W ${ident}`,
  type: TimeConstraintType.At,
  utcSeconds,
});

const econ: EconSpeedSet = {
  climbSpeed: 300,
  climbMach: 0.85,
  cruiseSpeed: 290,
  cruiseMach: 0.85,
  descentSpeed: 300,
  descentMach: 0.85,
};

const envelope: RtaSpeedEnvelope = {
  climbMinSpeed: 240,
  cruiseMinSpeed: 250,
  descentMinSpeed: 240,
  cruiseMinMach: 0.72,
  maxSpeed: 330,
  maxMach: 0.87,
};

class Fixture {
  readonly performanceData = new A380FlightPlanPerformanceData();

  readonly plan = {
    performanceData: this.performanceData,
    allLegs: [leg('LFPG'), leg('PG270'), leg('KONAN'), leg('NEBRU'), leg('EGLL')],
    activeLegIndex: 2,
    maybeElementAt: (index: number) => this.plan.allLegs[index],
  };

  readonly flightPlanService = {
    hasActive: true,
    active: this.plan,
    setPerformanceData: (key: string, value: unknown) => (this.performanceData as any)[key].set(value),
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

  readonly guidanceController = {
    vnavDriver: this.vnavDriver,
    verticalProfileComputationParametersObserver: { get: () => ({ fcuSpeedManaged: true }) },
    getAlongTrackDistanceToDestination: () => undefined,
  } as unknown as GuidanceController;

  phase = FmgcFlightPhase.Cruise;

  engineOut = false;

  inManualHold = false;

  utc = NOW;

  speedBias = 0;

  readonly estimatedTakeoffTime = Subject.create<number | null>(null);

  readonly messages: string[] = [];

  readonly resolvers = new Map<string, () => boolean>();

  readonly rtaFunction = new A380xRtaFunction({
    flightPlanService: this.flightPlanService,
    guidanceController: () => this.guidanceController,
    flightPhase: () => this.phase,
    engineOut: () => this.engineOut,
    inManualHoldOrItsDeceleration: () => this.inManualHold,
    utcSeconds: () => this.utc,
    estimatedTakeoffTime: this.estimatedTakeoffTime,
    activeRtaSpeeds: () => ({ econ, envelope }),
    setRtaSpeedBias: (bias) => (this.speedBias = bias),
    addMessageToQueue: (message: TypeIMessage | TypeIIMessage, isResolved?: () => boolean) => {
      this.messages.push(message.text);
      if (isResolved) {
        this.resolvers.set(message.text, isResolved);
      }
    },
    removeMessageFromQueue: () => {},
  });

  /** A new VNAV profile with the flight time to NEBRU (flight plan index 3) */
  predict(secondsToNebru: number, distanceNm = 400): void {
    this.vnavDriver.version++;
    this.predictions.set(3, { secondsFromPresent: secondsToNebru, distanceFromAircraft: distanceNm } as any);
  }
}

let fixture: Fixture;

describe('the A380X RTA function', () => {
  beforeEach(() => {
    fixture = new Fixture();
  });

  it('sets the RTA speed bias, with ADJUSTING SPD DUE TO RTA cleared after 15 s', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3700);

    fixture.rtaFunction.update();

    expect(fixture.speedBias).toBeGreaterThan(0);
    expect(fixture.messages).toEqual(['ADJUSTING SPD DUE TO RTA', 'TIME ERROR AT NEBRU']);
    const resolved = fixture.resolvers.get('ADJUSTING SPD DUE TO RTA')!;
    fixture.utc = NOW + 14;
    expect(resolved()).toBe(false);
    fixture.utc = NOW + 15;
    expect(resolved()).toBe(true);
  });

  it('deletes the RTA with RTA DELETED in a hold with manual termination', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3600);
    fixture.inManualHold = true;

    fixture.rtaFunction.update();

    expect(fixture.performanceData.timeConstraint.get()).toBeNull();
    expect(fixture.messages).toEqual(['RTA DELETED']);
    expect(fixture.speedBias).toBe(0);
  });

  it('deletes the RTA without message when its waypoint is sequenced', () => {
    fixture.performanceData.timeConstraint.set(rtaAt('KONAN', NOW + 600));
    fixture.plan.activeLegIndex = 3;

    fixture.rtaFunction.update();

    expect(fixture.performanceData.timeConstraint.get()).toBeNull();
    expect(fixture.messages).toEqual([]);
  });

  it('not taken into account in descent: ECON speed, no TIME ERROR AT', () => {
    fixture.phase = FmgcFlightPhase.Descent;
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3600));
    fixture.predict(3700);

    fixture.rtaFunction.update();

    expect(fixture.speedBias).toBe(0);
    expect(fixture.messages).toEqual([]);
  });

  it('preflight: the computed ETT can only be cleared with its RTA (RTA ALREADY EXISTING)', () => {
    fixture.phase = FmgcFlightPhase.Preflight;
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3 * 3600));
    fixture.predict(2 * 3600);

    fixture.rtaFunction.update();
    expect(fixture.estimatedTakeoffTime.get()).toBe(NOW + 3600);

    fixture.estimatedTakeoffTime.set(null);

    expect(fixture.messages).toEqual(['RTA ALREADY EXISTING']);
    expect(fixture.estimatedTakeoffTime.get()).toBe(NOW + 3600);
  });

  it('preflight: a crew ETT replaces the computed one and is the time reference', () => {
    fixture.phase = FmgcFlightPhase.Preflight;
    fixture.performanceData.timeConstraint.set(rtaAt('NEBRU', NOW + 3 * 3600));
    fixture.predict(2 * 3600);
    fixture.rtaFunction.update();

    fixture.estimatedTakeoffTime.set(NOW + 1800);
    fixture.predict(2 * 3600);
    fixture.rtaFunction.update();

    expect(fixture.rtaFunction.isEttComputed).toBe(false);
    expect(fixture.estimatedTakeoffTime.get()).toBe(NOW + 1800);
    expect(fixture.rtaFunction.activeResult?.timeError).toBe(-1800);
  });

  it('the ETA is from the ETT in preflight, from the clock without ETT or once the ETT is reached', () => {
    fixture.phase = FmgcFlightPhase.Preflight;
    expect(fixture.rtaFunction.etaUtcSeconds(600)).toBe(NOW + 600);
    fixture.estimatedTakeoffTime.set(NOW + 1800);
    expect(fixture.rtaFunction.etaUtcSeconds(600)).toBe(NOW + 2400);
    fixture.utc = NOW + 1801;
    expect(fixture.rtaFunction.etaUtcSeconds(600)).toBe(NOW + 2401);
    fixture.phase = FmgcFlightPhase.Climb;
    fixture.estimatedTakeoffTime.set(23 * 3600 + 59 * 60);
    fixture.utc = 23 * 3600 + 59 * 60;
    expect(fixture.rtaFunction.etaUtcSeconds(120)).toBe(60);
  });

  it('the RTA SPD of a pending RTA is the first speed step after its insertion', () => {
    const late = fixture.rtaFunction.pendingRtaSpeeds(rtaAt('NEBRU', NOW + 3600), 3700);
    expect(late!.cruiseMach).toBeGreaterThan(econ.cruiseMach);
    expect(late!.cruiseMach).toBeLessThanOrEqual(envelope.maxMach);
    const early = fixture.rtaFunction.pendingRtaSpeeds(rtaAt('NEBRU', NOW + 3600), 3500);
    expect(early!.cruiseMach).toBeLessThan(econ.cruiseMach);
  });

  it('missed with the A380 tolerance: more than 30 s, growing beyond 2 000 NM', () => {
    const rta = rtaAt('NEBRU', NOW + 3600);
    expect(fixture.rtaFunction.isPredictedMissed(rta, NOW + 3640, 100)).toBe(true);
    expect(fixture.rtaFunction.isPredictedMissed(rta, NOW + 3640, 2500)).toBe(false);
  });
});
