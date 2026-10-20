// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Accessible } from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { distanceToTopOfDescent } from '@fmgc/components/fms-messages/TopOfDescentDistance';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { EconSpeedSet } from '@fmgc/guidance/vnav/EconSpeeds';
import { locateRtaWaypoint, rtaWaypointPrediction } from '@fmgc/guidance/vnav/rta/RtaFlightPlanInputs';
import { A320_RTA_RULES, RtaCycleResult, RtaManager } from '@fmgc/guidance/vnav/rta/RtaManager';
import { applyRtaSpeedBias, RtaSpeedEnvelope, rtaSpeedSpan } from '@fmgc/guidance/vnav/rta/RtaSpeedBias';
import { A320_RTA_TOLERANCE } from '@fmgc/guidance/vnav/rta/RtaMissedMonitor';
import {
  constraintViolationSeconds,
  SECONDS_PER_DAY,
  sameTimeConstraint,
  secondsOfDay,
  TimeConstraint,
  timeErrorSeconds,
} from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { FmgcFlightPhase } from '@shared/flightphase';
import { NXSystemMessages, TypeIIMessage } from '../messages/NXSystemMessages';

const MILLISECONDS_PER_DAY = SECONDS_PER_DAY * 1000;

/** What the RTA function uses of the FMGC */
export interface A32nxRtaHost {
  readonly flightPlanService: FlightPlanService;
  readonly guidanceController?: GuidanceController;
  readonly flightPhaseManager: { readonly phase: FmgcFlightPhase };
  readonly isEngineOutCondition: Accessible<boolean>;
  isNavModeEngaged(): boolean;
  isFuelPlanningInProgress(forPlan: FlightPlanIndex): boolean;
  addMessageToQueue(message: TypeIIMessage, isResolved?: () => boolean): void;
  removeMessageFromQueue(text: string): void;
}

/**
 * The A32NX RTA function: the shared RTA core on the active flight plan of the FMGC, with the A320 messages
 * (RTA DELETED, SETTING SPD/RTA, TIME ERROR AT) and the takeoff time computed for the RTA in preflight.
 */
export class A32nxRtaFunction {
  private readonly manager = new RtaManager(A320_RTA_RULES);

  private result: RtaCycleResult | null = null;

  /** the ECON speeds and RTA speed range of the last managed speeds */
  private econ: EconSpeedSet | null = null;

  private envelope: RtaSpeedEnvelope | null = null;

  /** the ETT of the active flight plan was computed for the RTA, not entered by the crew */
  private ettIsComputed = false;

  private timeErrorMessageText: string | null = null;

  constructor(
    private readonly host: A32nxRtaHost,
    /** UTC time stamp of the aircraft clock, in milliseconds */
    private readonly utcTimestamp: () => number,
  ) {}

  /** The last results of the RTA function on the active flight plan, null without RTA */
  get activeResult(): RtaCycleResult | null {
    return this.result;
  }

  /** Whether the ETT of the active flight plan is the one computed for the RTA */
  get isEttComputed(): boolean {
    return this.ettIsComputed;
  }

  /** Aircraft clock, seconds of the UTC day */
  get utcSeconds(): number {
    return (this.utcTimestamp() % MILLISECONDS_PER_DAY) / 1000;
  }

  /**
   * Sets, or deletes with null, the RTA of a flight plan (through a temporary flight plan for the active one). An RTA
   * entered on another waypoint replaces the previous one, with RTA DELETED; an RTA entered during the fuel planning
   * is not used by it (BLOCK IGNORES RTA).
   */
  setTimeConstraint(rta: TimeConstraint | null, forPlan: FlightPlanIndex): void {
    const fps = this.host.flightPlanService;
    const previous = fps.timeConstraintOf(forPlan);
    if (rta && previous && previous.databaseId !== rta.databaseId) {
      this.host.addMessageToQueue(NXSystemMessages.rtaDeleted);
    }
    if (rta && this.host.isFuelPlanningInProgress(forPlan)) {
      this.host.addMessageToQueue(NXSystemMessages.blockIgnoresRta);
    }
    fps.setTimeConstraint(rta, forPlan);
  }

  /**
   * The ETA of a prediction of the active (or temporary) flight plan, seconds of the UTC day: from the clock in flight,
   * from the ETT in preflight when there is one.
   */
  etaUtcSeconds(secondsFromPresent: number): number {
    const nowMs = this.utcTimestamp();
    const performanceData = this.host.flightPlanService.active.performanceData;
    const ett = performanceData.estimatedTakeoffTime.get();
    const fromEtt =
      this.host.flightPhaseManager.phase === FmgcFlightPhase.Preflight &&
      ett !== null &&
      !performanceData.estimatedTakeoffTimeExpired.get();
    return secondsOfDay(((fromEtt ? ett : nowMs) % MILLISECONDS_PER_DAY) / 1000 + secondsFromPresent);
  }

  /**
   * Whether an RTA is predicted as missed: for the RTA of the active flight plan with the hysteresis of the RTA
   * function, otherwise (e.g. a new RTA in the temporary flight plan) with the 30 s criteria.
   */
  isPredictedMissed(rta: TimeConstraint, secondsFromPresent: number): boolean {
    const activeRta = this.host.flightPlanService.hasActive
      ? this.host.flightPlanService.active.performanceData.timeConstraint.get()
      : null;
    if (this.result && activeRta && sameTimeConstraint(activeRta, rta)) {
      return this.result.missed;
    }
    const violation = constraintViolationSeconds(
      timeErrorSeconds(this.etaUtcSeconds(secondsFromPresent), rta.utcSeconds),
      rta.type,
    );
    return Math.abs(violation) > A320_RTA_TOLERANCE.missedAboveSeconds;
  }

  /**
   * Replaces a flight plan by another one (SEC activated, COPY ACTIVE into the SEC): the RTA of the replaced flight
   * plan is deleted, with RTA DELETED.
   */
  async replaceFlightPlan(forPlan: FlightPlanIndex, replace: () => Promise<void>): Promise<void> {
    const fps = this.host.flightPlanService;
    const rtaOf = () => (fps.has(forPlan) ? fps.get(forPlan).performanceData.timeConstraint.get() : null);
    const previous = rtaOf();
    await replace();
    if (forPlan === FlightPlanIndex.Active) {
      // The ETT of the new active flight plan is its own
      this.ettIsComputed = false;
    }
    const current = rtaOf();
    if (previous && !(current && sameTimeConstraint(previous, current))) {
      this.host.addMessageToQueue(NXSystemMessages.rtaDeleted);
    }
  }

  /** The crew entered an ETT: it is no longer the computed one */
  onCrewEttEntered(): void {
    this.ettIsComputed = false;
  }

  /** The managed speeds: the ECON speeds moved by the RTA speed bias */
  applySpeedBias(econ: EconSpeedSet | null, envelope: RtaSpeedEnvelope | null): EconSpeedSet | null {
    this.econ = econ;
    this.envelope = envelope;
    return econ && envelope ? applyRtaSpeedBias(econ, this.manager.speedBias, envelope) : econ;
  }

  /** One cycle of the RTA function, before the managed speeds are updated */
  update(): void {
    const fps = this.host.flightPlanService;
    if (!fps.hasActive) {
      this.manager.clear();
      this.result = null;
      return;
    }
    const plan = fps.active;
    const rta = plan.performanceData.timeConstraint.get();
    const phase = this.host.flightPhaseManager.phase;
    const nowMs = this.utcTimestamp();
    const nowUtcSeconds = (nowMs % MILLISECONDS_PER_DAY) / 1000;
    const location = rta ? locateRtaWaypoint(plan.allLegs, plan.activeLegIndex, rta) : null;
    const guidance = this.host.guidanceController;
    const profile = guidance?.vnavDriver.mcduProfile;
    const parameters = guidance?.verticalProfileComputationParametersObserver.get();
    const activeLeg = plan.maybeElementAt(plan.activeLegIndex);
    const span = this.econ && this.envelope ? rtaSpeedSpan(this.econ, this.envelope) : { up: 0, down: 0 };

    const result = this.manager.update({
      rta,
      flightPhase: phase,
      engineOut: this.host.isEngineOutCondition.get(),
      // Design choice: the aircraft clock does not fail in the sim
      clockValid: true,
      // The RTA is deleted when the aircraft enters a holding pattern
      inHold: phase >= FmgcFlightPhase.Takeoff && isLeg(activeLeg) && activeLeg.isHX(),
      waypointInPlan: location?.inPlan ?? false,
      waypointAhead: location?.ahead ?? false,
      prediction:
        guidance && profile?.isReadyToDisplay && location
          ? rtaWaypointPrediction(profile.waypointPredictions, guidance.vnavDriver.version, location.index)
          : null,
      nowUtcSeconds,
      crewEttUtcSeconds: this.crewEttUtcSeconds(nowUtcSeconds),
      distanceToTopOfDescentNm: guidance ? distanceToTopOfDescent(guidance) : null,
      lateralManaged: this.host.isNavModeEngaged(),
      managedSpeedActive: phase === FmgcFlightPhase.Preflight || !!parameters?.fcuSpeedManaged,
      speedSpanUp: span.up,
      speedSpanDown: span.down,
    });
    this.result = rta && !result.deletion ? result : null;

    if (result.deletion) {
      fps.deleteActiveTimeConstraint();
      if (result.deletion.message) {
        this.host.addMessageToQueue(NXSystemMessages.rtaDeleted);
      }
    }
    this.updateComputedEtt(result.computedEttUtcSeconds, nowMs, nowUtcSeconds);
    if (result.speedAdjustmentStarted) {
      this.host.addMessageToQueue(NXSystemMessages.settingSpdRta, () => !this.manager.isAdjustingSpeed);
    }
    this.updateTimeErrorMessage(result.timeErrorMessage && rta ? rta.ident : null);
  }

  /** The ETT entered by the crew, or the clock time once it is passed; null without one */
  private crewEttUtcSeconds(nowUtcSeconds: number): number | null {
    const performanceData = this.host.flightPlanService.active.performanceData;
    const ett = performanceData.estimatedTakeoffTime.get();
    if (ett === null || this.ettIsComputed) {
      return null;
    }
    return performanceData.estimatedTakeoffTimeExpired.get() ? nowUtcSeconds : (ett % MILLISECONDS_PER_DAY) / 1000;
  }

  private updateComputedEtt(computedUtcSeconds: number | null, nowMs: number, nowUtcSeconds: number): void {
    const fps = this.host.flightPlanService;
    if (computedUtcSeconds !== null) {
      const timestamp = Math.round((nowMs + secondsOfDay(computedUtcSeconds - nowUtcSeconds) * 1000) / 1000) * 1000;
      if (fps.active.performanceData.estimatedTakeoffTime.get() !== timestamp) {
        fps.setPerformanceData('estimatedTakeoffTime', timestamp, FlightPlanIndex.Active);
        fps.setPerformanceData('estimatedTakeoffTimeExpired', false, FlightPlanIndex.Active);
      }
      this.ettIsComputed = true;
    } else if (this.ettIsComputed) {
      this.ettIsComputed = false;
      fps.setPerformanceData('estimatedTakeoffTime', null, FlightPlanIndex.Active);
      fps.setPerformanceData('estimatedTakeoffTimeExpired', false, FlightPlanIndex.Active);
    }
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
