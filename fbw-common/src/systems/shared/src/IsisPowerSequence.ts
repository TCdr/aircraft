// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export enum IsisDisplayUnitState {
  On,
  Off,
  Selftest,
  Standby,
}

/** Bit flags: what a call changed that the display has to render again for. */
export enum IsisPowerSequenceChange {
  None = 0,
  State = 1,
  Timer = 2,
}

/**
 * The power-up self-test and power-loss standby sequence of an ISIS.
 *
 * All instruments share one JavaScript heap, so every garbage collection pause hits all of them. Counting the time
 * down here, instead of in a React state that changes every frame, makes the display render again only when the shown
 * second or the state changes.
 */
export class IsisPowerSequence {
  private static readonly SELF_TEST_SECONDS = 90;

  private static readonly STANDBY_SECONDS = 10;

  private currentState: IsisDisplayUnitState;

  private remaining: number | null = null;

  private shownSeconds = 0;

  constructor(initialState: IsisDisplayUnitState) {
    this.currentState = initialState;
  }

  get state(): IsisDisplayUnitState {
    return this.currentState;
  }

  /** The time left in seconds, null when no countdown is running. It is current as of the last change reported. */
  get remainingSeconds(): number | null {
    return this.remaining;
  }

  /**
   * Applies a change of the electrical power.
   * @param hasElectricity whether the ISIS is powered.
   * @param mayStartSelfTest false while the power-up stagger holds the self-test back.
   */
  applyPower(hasElectricity: boolean, mayStartSelfTest = true): IsisPowerSequenceChange {
    if (this.currentState === IsisDisplayUnitState.On && !hasElectricity) {
      return this.enter(IsisDisplayUnitState.Standby, IsisPowerSequence.STANDBY_SECONDS);
    }
    if (this.currentState === IsisDisplayUnitState.Standby && hasElectricity) {
      return this.enter(IsisDisplayUnitState.On, null);
    }
    if (this.currentState === IsisDisplayUnitState.Off && hasElectricity && mayStartSelfTest) {
      return this.enter(IsisDisplayUnitState.Selftest, IsisPowerSequence.SELF_TEST_SECONDS);
    }
    if (this.currentState === IsisDisplayUnitState.Selftest && !hasElectricity) {
      return this.enter(IsisDisplayUnitState.Off, null);
    }
    return IsisPowerSequenceChange.None;
  }

  /**
   * Advances the countdown by one frame.
   * @param deltaMilliseconds the time since the last frame.
   * @param skipCountdown ends a running countdown, self-test or standby, at once.
   */
  update(deltaMilliseconds: number, skipCountdown = false): IsisPowerSequenceChange {
    if (this.remaining === null) {
      return IsisPowerSequenceChange.None;
    }

    if (this.remaining > 0) {
      if (skipCountdown) {
        this.remaining = 0;
      } else {
        this.remaining -= deltaMilliseconds / 1000;
      }

      const shownSeconds = Math.max(0, Math.ceil(this.remaining));
      if (shownSeconds === this.shownSeconds) {
        return IsisPowerSequenceChange.None;
      }
      this.shownSeconds = shownSeconds;
      return IsisPowerSequenceChange.Timer;
    }

    // The countdown ends one frame after it reached zero
    if (this.currentState === IsisDisplayUnitState.Standby) {
      return this.enter(IsisDisplayUnitState.Off, null);
    }
    if (this.currentState === IsisDisplayUnitState.Selftest) {
      return this.enter(IsisDisplayUnitState.On, null);
    }
    return IsisPowerSequenceChange.None;
  }

  private enter(state: IsisDisplayUnitState, countdownSeconds: number | null): IsisPowerSequenceChange {
    this.currentState = state;
    this.remaining = countdownSeconds;
    this.shownSeconds = countdownSeconds === null ? 0 : Math.ceil(countdownSeconds);
    return IsisPowerSequenceChange.State | IsisPowerSequenceChange.Timer;
  }
}
