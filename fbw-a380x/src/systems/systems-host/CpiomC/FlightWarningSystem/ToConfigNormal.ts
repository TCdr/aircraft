// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * T.O CONFIG NORMAL of the A380 (FWS T.O CONFIG test).
 *
 * A380 FCOM DSC-31-40-10 TAKEOFF CONFIGURATION TEST (a380_fcom.txt l.72715-72759): "T.O CONFIG NORMAL" appears when
 * "the configuration test is completed and is correct"; "If the test is not successful, any of the following alerts may
 * be triggered" (l.72728), the list below. The A320 condition was used before: GEN 1+2 potential normal and passenger
 * doors 1L / 2R only, and no oil temperature, generator 3 / 4 or PITCH TRIM/FMS/CG check.
 */

/** The FWS states the T.O CONFIG test checks, one per alert of the FCOM list (l.72729-72759) */
export interface ToConfigState {
  /**
   * CONFIG SLATS (FLAPS) NOT IN T.O CONFIG, CONFIG RUDDER TRIM NOT IN T.O RANGE, CONFIG PITCH TRIM NOT IN T.O RANGE or
   * CONFIG SPD BRKs NOT RETRACTED
   */
  readonly surfacesNotInToConfig: boolean;
  /**
   * No DOOR alert (NOT CLOSED, POS DET FAULT, CKPT SLIDING WINDOW NOT CLOSED). Computed by FwsCore from the door
   * states (the DOOR alerts are owned by the door code, this module only takes their result).
   */
  readonly doorsInTakeoffConfig: boolean;
  /** BRAKES BRAKES HOT */
  readonly brakesHot: boolean;
  /** ELEC DRIVE 1(2)(3)(4) DISCONNECTED, one per engine */
  readonly elecDriveDisconnected: readonly boolean[];
  /** ELEC GEN 1(2)(3)(4) FAULT, one per engine */
  readonly elecGenFault: readonly boolean[];
  /** ELEC GEN 1(2)(3)(4) OFF, one per engine */
  readonly elecGenOff: readonly boolean[];
  /** ENG 1(2)(3)(4) OIL TEMP LO, one per engine */
  readonly engineOilTempLo: readonly boolean[];
  /** F/CTL PITCH TRIM/FMS/CG DISAGREE */
  readonly pitchTrimFmsCgDisagree: boolean;
  /** F/CTL T.O FLAPS/FMS DISAGREE */
  readonly toFlapsFmsDisagree: boolean;
  /**
   * NAV T.O SPEEDS NOT INSERTED, or the FBW T.O SPEEDS TOO LOW / T.O V1/VR/V2 DISAGREE alerts (not in the A380 FCOM
   * list). Design choice: those two are kept, so that T.O CONFIG NORMAL never shows together with a T.O alert of the
   * same test on the EWD.
   */
  readonly toSpeedsAlert: boolean;
}

/*
 * Not checked: CONFIG L(R) SIDESTICK FAULT (BY TAKE-OVER) (l.72733). The FWS has its message (ata27.ts 271800001/2)
 * but no trigger: the sim has no sidestick take-over fault.
 */

/**
 * Whether the T.O CONFIG test is successful (T.O CONFIG NORMAL): none of the alerts of the FCOM list is triggered.
 * @param state the states the test checks
 * @returns true when the T.O CONFIG test is correct
 */
export function isToConfigNormal(state: ToConfigState): boolean {
  const anyTrue = (flags: readonly boolean[]) => flags.some((flag) => flag);
  const elecAlert = anyTrue(state.elecDriveDisconnected) || anyTrue(state.elecGenFault) || anyTrue(state.elecGenOff);
  const fmsDisagree = state.pitchTrimFmsCgDisagree || state.toFlapsFmsDisagree;

  return (
    !state.surfacesNotInToConfig &&
    state.doorsInTakeoffConfig &&
    !state.brakesHot &&
    !elecAlert &&
    !anyTrue(state.engineOilTempLo) &&
    !fmsDisagree &&
    !state.toSpeedsAlert
  );
}
