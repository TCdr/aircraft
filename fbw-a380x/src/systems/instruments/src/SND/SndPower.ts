// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The power states of the ISIS unit. The two ISIS of the A380 are the same unit, SFD or SND (FCOM DSC-34-10-20-10), so
 * the SND unit behaves as the SFD one (ISISlegacy/ISISDisplayUnit): the power-up tests (INIT and a countdown), and a
 * short standby on a power loss.
 */
export enum IsisUnitState {
  Off,
  SelfTest,
  On,
  Standby,
}

/** The duration of the power-up tests, seconds (as the SFD) */
export const ISIS_POWER_UP_TEST_S = 90;

/** The display stays on this long after a power loss, seconds (as the SFD) */
export const ISIS_STANDBY_S = 10;

export class IsisPowerUnit {
  private currentState: IsisUnitState;

  private timer: number | null = null;

  /**
   * @param coldAndDark a cold and dark spawn: the unit starts unpowered, and runs its tests at the first power-up; in
   * any other spawn it starts in standby, on again as soon as it is powered
   */
  constructor(coldAndDark: boolean) {
    this.currentState = coldAndDark ? IsisUnitState.Off : IsisUnitState.Standby;
  }

  get state(): IsisUnitState {
    return this.currentState;
  }

  /** The seconds of power-up tests left (rounded up), null out of the tests */
  get selfTestRemaining(): number | null {
    return this.currentState === IsisUnitState.SelfTest && this.timer !== null
      ? Math.max(0, Math.ceil(this.timer))
      : null;
  }

  /**
   * Updates the unit
   * @param powered whether the unit is supplied
   * @param deltaSeconds the time since the previous update
   * @returns true at a power-up: the unit was off and starts its tests (a power loss shorter than the standby is not
   * a power-up)
   */
  update(powered: boolean, deltaSeconds: number): boolean {
    if (this.timer !== null) {
      if (this.timer > 0) {
        this.timer -= deltaSeconds;
      } else if (this.currentState === IsisUnitState.Standby) {
        this.currentState = IsisUnitState.Off;
        this.timer = null;
      } else if (this.currentState === IsisUnitState.SelfTest) {
        this.currentState = IsisUnitState.On;
        this.timer = null;
      }
    }

    if (this.currentState === IsisUnitState.On && !powered) {
      this.currentState = IsisUnitState.Standby;
      this.timer = ISIS_STANDBY_S;
    } else if (this.currentState === IsisUnitState.Standby && powered) {
      this.currentState = IsisUnitState.On;
      this.timer = null;
    } else if (this.currentState === IsisUnitState.Off && powered) {
      this.currentState = IsisUnitState.SelfTest;
      this.timer = ISIS_POWER_UP_TEST_S;
      return true;
    } else if (this.currentState === IsisUnitState.SelfTest && !powered) {
      this.currentState = IsisUnitState.Off;
      this.timer = null;
    }
    return false;
  }
}
