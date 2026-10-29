// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { PowerUpGate } from '@shared/PowerUpStagger';

/**
 * The power states of the ISIS unit. The two ISIS of the A380 are the same unit, SFD or SND, so
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
const ISIS_POWER_UP_TEST_S = 90;

/** The display stays on this long after a power loss, seconds (as the SFD) */
const ISIS_STANDBY_S = 10;

export class IsisPowerUnit {
  private currentState: IsisUnitState;

  private timer: number | null = null;

  private readonly powerUpGate: PowerUpGate;

  /** The sum of the updates, the clock of the power-up gate */
  private clockSeconds = 0;

  /**
   * @param coldAndDark a cold and dark spawn: the unit starts unpowered, and runs its tests at the first power-up; in
   * any other spawn it starts in standby, on again as soon as it is powered
   * @param powerUpSlotSeconds the seconds the unit stays off after its supply appears, so that the displays do not
   * all start in the same frame
   */
  constructor(coldAndDark: boolean, powerUpSlotSeconds = 0) {
    this.powerUpGate = new PowerUpGate(powerUpSlotSeconds);
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
   * @param powered whether the unit is supplied
   * @param deltaSeconds the time since the previous update, in seconds
   * @returns true at a power-up: the unit was off and starts its tests (a power loss shorter than the standby is not
   * a power-up)
   */
  update(powered: boolean, deltaSeconds: number): boolean {
    this.clockSeconds += deltaSeconds;
    const powerUpWaitSeconds = this.powerUpGate.update(powered, this.clockSeconds);

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
    } else if (this.currentState === IsisUnitState.Off && powered && powerUpWaitSeconds === 0) {
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
