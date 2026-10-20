// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';

/** The cruise altitude in feet read by the flight phase logic (CLB to CRZ, CRZ to DES), -1 without CRZ FL */
export const CRUISE_ALTITUDE_SIMVAR = 'L:A32NX_AIRLINER_CRUISE_ALTITUDE';

export const NO_CRUISE_ALTITUDE = -1;

/** The flight plans as seen by {@link ActivePlanCruiseAltitude} */
export interface ActivePlanCruiseLevelSource {
  readonly hasActive: boolean;
  readonly active: { readonly performanceData: { readonly cruiseFlightLevel: Subscribable<number | null> } };
}

/**
 * Keeps the cruise altitude simvar on the CRZ FL of the active flight plan.
 * The active plan gets its CRZ FL in many ways: INIT or PERF entry, CPNY F-PLN, insertion of a temporary plan in which
 * the CRZ FL was entered, SEC activation or swap, FCU altitude. Without the simvar the FMS never leaves the CLB phase.
 */
export class ActivePlanCruiseAltitude {
  private cruiseLevelSubscription: Subscription | null = null;

  constructor(
    private readonly flightPlans: ActivePlanCruiseLevelSource,
    private readonly flightPhase: () => FmgcFlightPhase,
    private readonly writeCruiseAltitude: (feet: number) => void = (feet) =>
      SimVar.SetSimVarValue(CRUISE_ALTITUDE_SIMVAR, 'number', feet),
  ) {}

  /** Copy, swap and create replace the active plan object: to call after every flight plan change */
  onFlightPlansChanged(): void {
    this.cruiseLevelSubscription?.destroy();
    this.cruiseLevelSubscription = this.flightPlans.hasActive
      ? this.flightPlans.active.performanceData.cruiseFlightLevel.sub((level) => this.write(level), true)
      : null;
  }

  destroy(): void {
    this.cruiseLevelSubscription?.destroy();
    this.cruiseLevelSubscription = null;
  }

  private write(cruiseFlightLevel: number | null): void {
    if (cruiseFlightLevel !== null && Number.isFinite(cruiseFlightLevel)) {
      this.writeCruiseAltitude(cruiseFlightLevel * 100);
    } else if (this.flightPhase() < FmgcFlightPhase.Descent) {
      // The FMS deletes the CRZ FL itself when the descent starts. The last cruise altitude stays: the cabin lighting
      // (LightSync) dims on it during the descent.
      this.writeCruiseAltitude(NO_CRUISE_ALTITUDE);
    }
  }
}
