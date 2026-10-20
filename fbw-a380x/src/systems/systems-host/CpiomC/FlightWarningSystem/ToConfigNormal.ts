// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * T.O CONFIG NORMAL of the A380 (FWS T.O CONFIG test): shown when the test is completed and the configuration is
 * correct, i.e. none of the alerts the test can trigger (the list below) is active.
 */

/** The FWS states the T.O CONFIG test checks, one per alert the test can trigger */
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
  readonly brakesHot: boolean;
  readonly elecDriveDisconnected: readonly boolean[];
  readonly elecGenFault: readonly boolean[];
  readonly elecGenOff: readonly boolean[];
  readonly engineOilTempLo: readonly boolean[];
  readonly pitchTrimFmsCgDisagree: boolean;
  readonly toFlapsFmsDisagree: boolean;
  /**
   * NAV T.O SPEEDS NOT INSERTED, or the FBW T.O SPEEDS TOO LOW / T.O V1/VR/V2 DISAGREE alerts (not alerts of the A380
   * test). Design choice: those two are kept, so that T.O CONFIG NORMAL never shows together with a T.O alert of the
   * same test on the EWD.
   */
  readonly toSpeedsAlert: boolean;
  /** CONFIG L(R) SIDESTICK FAULT (BY TAKE-OVER): a sidestick deactivated by a take-over (FwsFctlSensorAlerts) */
  readonly sidestickDeactivatedByTakeover: boolean;
}

/**
 * Whether the T.O CONFIG test is successful (T.O CONFIG NORMAL): none of the alerts of the test is triggered.
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
    !state.toSpeedsAlert &&
    !state.sidestickDeactivatedByTakeover
  );
}
