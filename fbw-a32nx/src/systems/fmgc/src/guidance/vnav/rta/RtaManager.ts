// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmgcFlightPhase } from '@shared/flightphase';
import { RtaDeletion, rtaAutoDeletion } from './RtaAutoDeletion';
import { A320_RTA_TOLERANCE, A380_RTA_TOLERANCE, RtaMissedMonitor, RtaToleranceRule } from './RtaMissedMonitor';
import { RtaSpeedController } from './RtaSpeedController';
import {
  constraintViolationSeconds,
  secondsOfDay,
  TimeConstraint,
  TimeConstraintType,
  timeErrorSeconds,
} from './TimeConstraint';

/** The RTA rules that differ between the aircraft */
export interface RtaAircraftRules {
  tolerance: RtaToleranceRule;
  /** whether the loss of the RTA waypoint (sequenced, cleared, ABEAM) or of its flight plan raises RTA DELETED */
  messageOnWaypointLoss: boolean;
  /**
   * In descent and approach the RTA is not taken into account (A380: back to ECON speed), or the speed of the RTA
   * is kept, as the descent speeds are frozen from the descent on (A320)
   */
  descentSpeedControl: 'ignore' | 'hold';
  /** cruise distance to the T/D below which the RTA is not taken into account (A380: 40 NM), null when none */
  ignoreWithinTopOfDescentNm: number | null;
  /** whether TIME ERROR AT needs the lateral managed mode (A320) */
  timeErrorMessageNeedsLateralManaged: boolean;
}

export const A320_RTA_RULES: RtaAircraftRules = {
  tolerance: A320_RTA_TOLERANCE,
  messageOnWaypointLoss: true,
  descentSpeedControl: 'hold',
  ignoreWithinTopOfDescentNm: null,
  timeErrorMessageNeedsLateralManaged: true,
};

export const A380_RTA_RULES: RtaAircraftRules = {
  tolerance: A380_RTA_TOLERANCE,
  messageOnWaypointLoss: false,
  descentSpeedControl: 'ignore',
  ignoreWithinTopOfDescentNm: 40,
  timeErrorMessageNeedsLateralManaged: false,
};

/** The VNAV prediction at the RTA waypoint */
export interface RtaWaypointPrediction {
  /** version of the VNAV profile that made it */
  version: number;
  /** in seconds */
  secondsToWaypoint: number;
  /** along the flight plan, in NM */
  distanceToWaypointNm: number;
}

export interface RtaCycleInput {
  /** the RTA of the active flight plan */
  rta: TimeConstraint | null;
  flightPhase: FmgcFlightPhase;
  engineOut: boolean;
  /** valid aircraft clock data */
  clockValid: boolean;
  /** in the hold that deletes the RTA, or in its deceleration zone */
  inHold: boolean;
  waypointInPlan: boolean;
  /** the RTA waypoint is the TO waypoint or after it */
  waypointAhead: boolean;
  prediction: RtaWaypointPrediction | null;
  /** aircraft clock, seconds of the UTC day */
  nowUtcSeconds: number;
  /** ETT entered by the flight crew, seconds of the UTC day, null when none */
  crewEttUtcSeconds: number | null;
  /** NM, null without a T/D */
  distanceToTopOfDescentNm: number | null;
  lateralManaged: boolean;
  /** the managed speed is the active speed target (the predictions follow the managed speeds) */
  managedSpeedActive: boolean;
  /** see rtaSpeedSpan */
  speedSpanUp: number;
  speedSpanDown: number;
}

export interface RtaCycleResult {
  /** the RTA must be deleted (by the aircraft, from its flight plan) */
  deletion: RtaDeletion | null;
  /** ETA - RTA in seconds, null without predictions */
  timeError: number | null;
  /** ETA at the RTA waypoint, seconds of the UTC day, null without predictions */
  etaUtcSeconds: number | null;
  missed: boolean;
  /** whether TIME ERROR AT (the RTA waypoint) is displayed */
  timeErrorMessage: boolean;
  /** the FMS just started to change the managed speed to meet the RTA */
  speedAdjustmentStarted: boolean;
  /** the FMS is changing the managed speed to meet the RTA */
  adjustingSpeed: boolean;
  /** the takeoff time that meets the RTA at ECON speed, in preflight without a crew ETT, null when none */
  computedEttUtcSeconds: number | null;
}

/**
 * Design choice: a speed step is judged on the second VNAV profile computed after it, since the first one may have
 * started with the previous managed speeds.
 */
const PREDICTION_VERSIONS_AFTER_SPEED_CHANGE = 2;

const NO_RTA: RtaCycleResult = {
  deletion: null,
  timeError: null,
  etaUtcSeconds: null,
  missed: false,
  timeErrorMessage: false,
  speedAdjustmentStarted: false,
  adjustingSpeed: false,
  computedEttUtcSeconds: null,
};

/**
 * The RTA function of the FMS, shared by both aircraft: automatic deletion, time error and missed RTA, speed control
 * (a speed bias on the ECON speeds that the aircraft applies to its managed speeds), and the computed takeoff time.
 */
export class RtaManager {
  private readonly controller = new RtaSpeedController();

  private readonly missedMonitor: RtaMissedMonitor;

  private previousPhase: FmgcFlightPhase | null = null;

  private rtaKey: string | null = null;

  /** the VNAV profile version a speed step waits for, null when none */
  private awaitedVersion: number | null = null;

  private lastSeenVersion = -1;

  /** predicted flight time to the RTA waypoint at ECON speed, in seconds */
  private econSecondsToWaypoint: number | null = null;

  constructor(private readonly rules: RtaAircraftRules) {
    this.missedMonitor = new RtaMissedMonitor(rules.tolerance);
  }

  /** speed bias of the managed speeds (see applyRtaSpeedBias) */
  get speedBias(): number {
    return this.controller.bias;
  }

  /** whether the FMS is changing the managed speed to meet the RTA */
  get isAdjustingSpeed(): boolean {
    return this.controller.isAdjusting;
  }

  update(input: RtaCycleInput): RtaCycleResult {
    const previousPhase = this.previousPhase;
    this.previousPhase = input.flightPhase;

    if (input.rta === null) {
      this.clear();
      return NO_RTA;
    }

    const deletion = rtaAutoDeletion(previousPhase, input, this.rules.messageOnWaypointLoss);
    if (deletion) {
      this.clear();
      return { ...NO_RTA, deletion };
    }

    const key = `${input.rta.databaseId}/${input.rta.type}/${input.rta.utcSeconds}`;
    if (key !== this.rtaKey) {
      this.rtaKey = key;
      this.controller.forgetSamples();
      this.missedMonitor.reset();
    }

    const prediction = input.prediction;
    if (prediction === null || !Number.isFinite(prediction.secondsToWaypoint)) {
      return NO_RTA;
    }
    const newPrediction = prediction.version !== this.lastSeenVersion;
    if (prediction.version < this.lastSeenVersion) {
      // The VNAV profile was reset
      this.awaitedVersion = null;
    }
    this.lastSeenVersion = prediction.version;

    const preflight = input.flightPhase === FmgcFlightPhase.Preflight;
    if (this.controller.bias === 0 && (this.awaitedVersion === null || prediction.version >= this.awaitedVersion)) {
      this.econSecondsToWaypoint = prediction.secondsToWaypoint;
    }
    const computedEttUtcSeconds =
      preflight && input.crewEttUtcSeconds === null ? this.computedEtt(input.rta, input.nowUtcSeconds) : null;
    const referenceTime = preflight
      ? input.crewEttUtcSeconds ?? computedEttUtcSeconds ?? input.nowUtcSeconds
      : input.nowUtcSeconds;
    const etaUtcSeconds = secondsOfDay(referenceTime + prediction.secondsToWaypoint);
    const timeError = timeErrorSeconds(etaUtcSeconds, input.rta.utcSeconds);
    const missed = this.missedMonitor.update(
      constraintViolationSeconds(timeError, input.rta.type),
      prediction.distanceToWaypointNm,
    );

    const ignored = this.isIgnored(input);
    // In preflight without a crew ETT, the takeoff time absorbs an early arrival: the speed is only increased
    const takeoffTimeFree = preflight && input.crewEttUtcSeconds === null;
    const wasAdjusting = this.controller.isAdjusting;
    let speedChanged = false;
    if (ignored || computedEttUtcSeconds !== null) {
      // The ETT absorbs the time error at ECON speed; an RTA not taken into account leaves the ECON speed
      if (this.controller.bias !== 0) {
        this.controller.reset();
        this.awaitedVersion = prediction.version + PREDICTION_VERSIONS_AFTER_SPEED_CHANGE;
      }
    } else if (this.holdsSpeed(input) || (takeoffTimeFree && this.econSecondsToWaypoint === null)) {
      this.controller.forgetSamples();
    } else if (newPrediction && (this.awaitedVersion === null || prediction.version >= this.awaitedVersion)) {
      speedChanged = this.controller.update({
        timeError,
        type: takeoffTimeFree ? TimeConstraintType.AtOrBefore : input.rta.type,
        secondsToWaypoint: prediction.secondsToWaypoint,
        speedSpanUp: input.speedSpanUp,
        speedSpanDown: input.speedSpanDown,
      });
      this.awaitedVersion = speedChanged ? prediction.version + PREDICTION_VERSIONS_AFTER_SPEED_CHANGE : null;
    }

    return {
      deletion: null,
      timeError,
      etaUtcSeconds,
      missed,
      timeErrorMessage: missed && !ignored && (!this.rules.timeErrorMessageNeedsLateralManaged || input.lateralManaged),
      speedAdjustmentStarted: speedChanged && !wasAdjusting,
      adjustingSpeed: this.controller.isAdjusting,
      computedEttUtcSeconds,
    };
  }

  /** Back to ECON speed, without RTA */
  clear(): void {
    this.controller.reset();
    this.missedMonitor.reset();
    this.rtaKey = null;
    this.awaitedVersion = null;
    this.econSecondsToWaypoint = null;
  }

  /**
   * The takeoff time that meets the RTA at ECON speed: there is one when the flight time to the RTA waypoint is less
   * than the time left until the RTA.
   */
  private computedEtt(rta: TimeConstraint, nowUtcSeconds: number): number | null {
    if (this.econSecondsToWaypoint === null) {
      return null;
    }
    const timeLeft = secondsOfDay(rta.utcSeconds - nowUtcSeconds);
    return this.econSecondsToWaypoint < timeLeft ? secondsOfDay(rta.utcSeconds - this.econSecondsToWaypoint) : null;
  }

  private inDescentOrApproach(phase: FmgcFlightPhase): boolean {
    return phase === FmgcFlightPhase.Descent || phase === FmgcFlightPhase.Approach;
  }

  /** The RTA is not taken into account: ECON speed, no TIME ERROR message */
  private isIgnored(input: RtaCycleInput): boolean {
    if (this.rules.descentSpeedControl === 'ignore' && this.inDescentOrApproach(input.flightPhase)) {
      return true;
    }
    return (
      this.rules.ignoreWithinTopOfDescentNm !== null &&
      input.flightPhase === FmgcFlightPhase.Cruise &&
      input.distanceToTopOfDescentNm !== null &&
      input.distanceToTopOfDescentNm < this.rules.ignoreWithinTopOfDescentNm
    );
  }

  /**
   * The speed of the RTA is kept as it is: with a selected speed the predictions do not follow the managed speed, and
   * in descent the descent speeds are frozen.
   */
  private holdsSpeed(input: RtaCycleInput): boolean {
    return (
      !input.managedSpeedActive ||
      (this.rules.descentSpeedControl === 'hold' && this.inDescentOrApproach(input.flightPhase))
    );
  }
}
