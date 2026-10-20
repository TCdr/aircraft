// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** When an RTA is predicted as missed, and when it is predicted as made again */
export interface RtaToleranceRule {
  /** the RTA is missed when the time error is more than this, in seconds */
  missedAboveSeconds: number;
  /** a missed RTA is made again when the time error is less than this, in seconds */
  madeBelowSeconds: number;
  /** distance to the RTA waypoint beyond which both tolerances grow, in NM; null when they never grow */
  growthStartNm: number | null;
  /** growth of both tolerances beyond that distance, in seconds per NM */
  growthSecondsPerNm: number;
}

/** A320: the RTA is missed at 30 s of time error, the same criteria in both directions */
export const A320_RTA_TOLERANCE: RtaToleranceRule = {
  missedAboveSeconds: 30,
  madeBelowSeconds: 30,
  growthStartNm: null,
  growthSecondsPerNm: 0,
};

/** A380: missed above 30 s, made again below 15 s; beyond 2 000 NM both grow by 60 s per 1 000 NM */
export const A380_RTA_TOLERANCE: RtaToleranceRule = {
  missedAboveSeconds: 30,
  madeBelowSeconds: 15,
  growthStartNm: 2000,
  growthSecondsPerNm: 0.06,
};

/** The missed and made-again tolerances at a distance from the RTA waypoint, in seconds */
export function rtaTolerances(
  rule: RtaToleranceRule,
  distanceToWaypointNm: number,
): { missedAboveSeconds: number; madeBelowSeconds: number } {
  const growth =
    rule.growthStartNm !== null ? Math.max(0, distanceToWaypointNm - rule.growthStartNm) * rule.growthSecondsPerNm : 0;
  return {
    missedAboveSeconds: rule.missedAboveSeconds + growth,
    madeBelowSeconds: rule.madeBelowSeconds + growth,
  };
}

/** Whether the RTA is predicted as missed, with the hysteresis of the tolerance rule */
export class RtaMissedMonitor {
  private missed = false;

  constructor(private readonly rule: RtaToleranceRule) {}

  get isMissed(): boolean {
    return this.missed;
  }

  /**
   * @param violationSeconds the part of the time error the constraint does not accept
   * @param distanceToWaypointNm along the flight plan
   * @returns whether the RTA is predicted as missed
   */
  update(violationSeconds: number, distanceToWaypointNm: number): boolean {
    const { missedAboveSeconds, madeBelowSeconds } = rtaTolerances(this.rule, distanceToWaypointNm);
    const magnitude = Math.abs(violationSeconds);
    if (this.missed) {
      this.missed = magnitude >= madeBelowSeconds;
    } else {
      this.missed = magnitude > missedAboveSeconds;
    }
    return this.missed;
  }

  reset(): void {
    this.missed = false;
  }
}
