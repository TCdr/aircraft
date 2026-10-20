// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MutableSubscribable, Subscription } from '@microsoft/msfs-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { distanceToTopOfDescent } from '@fmgc/components/fms-messages/TopOfDescentDistance';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { EconSpeedSet } from '@fmgc/guidance/vnav/EconSpeeds';
import { locateRtaWaypoint, rtaWaypointPrediction } from '@fmgc/guidance/vnav/rta/RtaFlightPlanInputs';
import { A380_RTA_RULES, RtaCycleResult, RtaManager } from '@fmgc/guidance/vnav/rta/RtaManager';
import { A380_RTA_TOLERANCE, rtaTolerances } from '@fmgc/guidance/vnav/rta/RtaMissedMonitor';
import { applyRtaSpeedBias, RtaSpeedEnvelope, rtaSpeedSpan } from '@fmgc/guidance/vnav/rta/RtaSpeedBias';
import { RtaSpeedController } from '@fmgc/guidance/vnav/rta/RtaSpeedController';
import {
  constraintViolationSeconds,
  sameTimeConstraint,
  SECONDS_PER_DAY,
  secondsOfDay,
  TimeConstraint,
  timeErrorSeconds,
} from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { FmgcFlightPhase } from '@shared/flightphase';
import { NXSystemMessages, TypeIIMessage, TypeIMessage } from '../shared/NXSystemMessages';

/** ADJUSTING SPD DUE TO RTA is cleared after 15 s */
const ADJUSTING_SPEED_MESSAGE_SECONDS = 15;

/** What the RTA function uses of the FMS */
export interface A380xRtaHost {
  readonly flightPlanService: FlightPlanService;
  guidanceController(): GuidanceController | undefined;
  flightPhase(): FmgcFlightPhase;
  engineOut(): boolean;
  /** in a hold with manual termination, or in its deceleration zone */
  inManualHoldOrItsDeceleration(): boolean;
  /** aircraft clock, seconds of the UTC day */
  utcSeconds(): number;
  /** the ETT, seconds of the UTC day */
  readonly estimatedTakeoffTime: MutableSubscribable<number | null>;
  /** the ECON speeds and RTA speed range of the active flight plan */
  activeRtaSpeeds(): { econ: EconSpeedSet; envelope: RtaSpeedEnvelope } | null;
  /** sets the speed bias of the managed speeds */
  setRtaSpeedBias(bias: number): void;
  addMessageToQueue(message: TypeIMessage | TypeIIMessage, isResolved?: () => boolean): void;
  removeMessageFromQueue(text: string): void;
}

/**
 * The A380X RTA function: the shared RTA core on the active flight plan, with the A380 messages (RTA DELETED,
 * ADJUSTING SPD DUE TO RTA, TIME ERROR AT, RTA ALREADY EXISTING) and the ETT computed for the RTA in preflight.
 */
export class A380xRtaFunction {
  private readonly manager = new RtaManager(A380_RTA_RULES);

  private result: RtaCycleResult | null = null;

  /** the ETT is the one computed for the RTA, not a crew entry */
  private ettIsComputed = false;

  private writingEtt = false;

  private timeErrorMessageText: string | null = null;

  private readonly subscriptions: Subscription[] = [];

  constructor(private readonly host: A380xRtaHost) {
    this.subscriptions.push(host.estimatedTakeoffTime.sub((ett) => this.onEttChanged(ett)));
  }

  destroy(): void {
    this.subscriptions.forEach((s) => s.destroy());
  }

  /** The last results of the RTA function on the active flight plan, null without RTA */
  get activeResult(): RtaCycleResult | null {
    return this.result;
  }

  /** whether the ETT is the one computed for the RTA */
  get isEttComputed(): boolean {
    return this.ettIsComputed;
  }

  /**
   * Whether an RTA is predicted as missed: for the RTA of the active flight plan with the hysteresis of the RTA
   * function, otherwise (a new RTA in the temporary flight plan) with the 30 s criteria.
   * @param etaUtcSeconds ETA at the RTA waypoint
   * @param distanceNm distance to the RTA waypoint
   */
  isPredictedMissed(rta: TimeConstraint, etaUtcSeconds: number, distanceNm: number): boolean {
    const fps = this.host.flightPlanService;
    const activeRta = fps.hasActive ? fps.active.performanceData.timeConstraint.get() : null;
    if (this.result && activeRta && sameTimeConstraint(activeRta, rta)) {
      return this.result.missed;
    }
    const violation = constraintViolationSeconds(timeErrorSeconds(etaUtcSeconds, rta.utcSeconds), rta.type);
    return Math.abs(violation) > rtaTolerances(A380_RTA_TOLERANCE, distanceNm).missedAboveSeconds;
  }

  /**
   * The ETA of a prediction of the active (or temporary) flight plan, seconds of the UTC day: from the clock in flight,
   * from the ETT in preflight until the clock reaches it.
   */
  etaUtcSeconds(secondsFromPresent: number): number {
    const now = this.host.utcSeconds();
    const ett = this.host.estimatedTakeoffTime.get();
    const fromEtt = this.host.flightPhase() === FmgcFlightPhase.Preflight && ett !== null && !this.isReached(ett, now);
    return secondsOfDay((fromEtt ? ett : now) + secondsFromPresent);
  }

  /**
   * The managed speeds of an RTA not yet in the active flight plan (pending temporary flight plan): the first speed step
   * the RTA function will take after its insertion, from the present predictions
   * @param secondsToWaypoint predicted flight time to the RTA waypoint
   */
  pendingRtaSpeeds(rta: TimeConstraint, secondsToWaypoint: number): EconSpeedSet | null {
    const speeds = this.host.activeRtaSpeeds();
    if (!speeds) {
      return null;
    }
    const span = rtaSpeedSpan(speeds.econ, speeds.envelope);
    const controller = new RtaSpeedController();
    controller.update({
      timeError: timeErrorSeconds(this.etaUtcSeconds(secondsToWaypoint), rta.utcSeconds),
      type: rta.type,
      secondsToWaypoint,
      speedSpanUp: span.up,
      speedSpanDown: span.down,
    });
    return applyRtaSpeedBias(speeds.econ, controller.bias, speeds.envelope);
  }

  /** One FMS cycle of the RTA function */
  update(): void {
    const fps = this.host.flightPlanService;
    if (!fps.hasActive) {
      this.manager.clear();
      this.host.setRtaSpeedBias(0);
      this.result = null;
      return;
    }
    const plan = fps.active;
    const rta = plan.performanceData.timeConstraint.get();
    const phase = this.host.flightPhase();
    const nowUtcSeconds = this.host.utcSeconds();
    const location = rta ? locateRtaWaypoint(plan.allLegs, plan.activeLegIndex, rta) : null;
    const guidance = this.host.guidanceController();
    const profile = guidance?.vnavDriver.mcduProfile;
    const speeds = this.host.activeRtaSpeeds();
    const span = speeds ? rtaSpeedSpan(speeds.econ, speeds.envelope) : { up: 0, down: 0 };

    const result = this.manager.update({
      rta,
      flightPhase: phase,
      engineOut: this.host.engineOut(),
      // Design choice: the aircraft clock does not fail in the sim
      clockValid: true,
      inHold: this.host.inManualHoldOrItsDeceleration(),
      waypointInPlan: location?.inPlan ?? false,
      waypointAhead: location?.ahead ?? false,
      prediction:
        guidance && profile?.isReadyToDisplay && location
          ? rtaWaypointPrediction(profile.waypointPredictions, guidance.vnavDriver.version, location.index)
          : null,
      nowUtcSeconds,
      crewEttUtcSeconds: this.crewEttUtcSeconds(nowUtcSeconds),
      distanceToTopOfDescentNm: guidance ? distanceToTopOfDescent(guidance) : null,
      lateralManaged: true,
      managedSpeedActive:
        phase === FmgcFlightPhase.Preflight ||
        !!guidance?.verticalProfileComputationParametersObserver.get().fcuSpeedManaged,
      speedSpanUp: span.up,
      speedSpanDown: span.down,
    });
    this.result = rta && !result.deletion ? result : null;
    this.host.setRtaSpeedBias(this.manager.speedBias);

    if (result.deletion) {
      fps.deleteActiveTimeConstraint();
      if (result.deletion.message) {
        this.host.addMessageToQueue(NXSystemMessages.rtaDeleted);
      }
    }
    this.updateComputedEtt(result.computedEttUtcSeconds);
    if (result.speedAdjustmentStarted) {
      const startedAt = nowUtcSeconds;
      this.host.addMessageToQueue(
        NXSystemMessages.adjustingSpdDueToRta,
        () => secondsOfDay(this.host.utcSeconds() - startedAt) >= ADJUSTING_SPEED_MESSAGE_SECONDS,
      );
    }
    this.updateTimeErrorMessage(result.timeErrorMessage && rta ? rta.ident : null);
  }

  /** The crew ETT, or the clock time once it is reached; null without a crew ETT */
  private crewEttUtcSeconds(nowUtcSeconds: number): number | null {
    const ett = this.host.estimatedTakeoffTime.get();
    if (ett === null || this.ettIsComputed) {
      return null;
    }
    return this.isReached(ett, nowUtcSeconds) ? nowUtcSeconds : ett;
  }

  /** Whether the clock has reached a time of the day (within the last 12 h) */
  private isReached(utcSeconds: number, nowUtcSeconds: number): boolean {
    return secondsOfDay(utcSeconds - nowUtcSeconds) > SECONDS_PER_DAY / 2;
  }

  private updateComputedEtt(computedUtcSeconds: number | null): void {
    if (computedUtcSeconds !== null) {
      this.ettIsComputed = true;
      this.writeEtt(Math.round(computedUtcSeconds) % SECONDS_PER_DAY);
    } else if (this.ettIsComputed) {
      this.ettIsComputed = false;
      this.writeEtt(null);
    }
  }

  private writeEtt(ett: number | null): void {
    if (this.host.estimatedTakeoffTime.get() === ett) {
      return;
    }
    this.writingEtt = true;
    this.host.estimatedTakeoffTime.set(ett);
    this.writingEtt = false;
  }

  /**
   * A crew change of the ETT: an entry replaces the computed ETT; the computed ETT is cleared only with its RTA (RTA
   * ALREADY EXISTING).
   */
  private onEttChanged(ett: number | null): void {
    if (this.writingEtt || !this.ettIsComputed) {
      return;
    }
    if (ett === null && this.result?.computedEttUtcSeconds != null) {
      this.host.addMessageToQueue(NXSystemMessages.rtaAlreadyExisting);
      this.writeEtt(Math.round(this.result.computedEttUtcSeconds) % SECONDS_PER_DAY);
      return;
    }
    this.ettIsComputed = false;
  }

  private updateTimeErrorMessage(ident: string | null): void {
    const message = ident !== null ? NXSystemMessages.timeErrorAt.getModifiedMessage(ident) : null;
    const text = message?.text ?? null;
    if (text === this.timeErrorMessageText) {
      return;
    }
    if (this.timeErrorMessageText !== null) {
      this.host.removeMessageFromQueue(this.timeErrorMessageText);
    }
    this.timeErrorMessageText = text;
    if (message) {
      this.host.addMessageToQueue(message, () => this.timeErrorMessageText !== text);
    }
  }
}
