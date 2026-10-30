// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { IsisDisplayUnitState, IsisPowerSequence, IsisPowerSequenceChange } from './IsisPowerSequence';

type Frame = { state: IsisDisplayUnitState; shownSeconds: number | null };

/** The ISIS display unit with the timer as a React state set every frame. */
class PerFrameStateReference {
  state = IsisDisplayUnitState.Off;

  timer: number | null = null;

  timerSetCalls = 0;

  frame(deltaMilliseconds: number, hasElectricity: boolean): Frame {
    if (this.timer !== null) {
      if (this.timer > 0) {
        this.timer -= deltaMilliseconds / 1000;
        this.timerSetCalls++;
      } else if (this.state === IsisDisplayUnitState.Standby) {
        this.state = IsisDisplayUnitState.Off;
        this.timer = null;
      } else if (this.state === IsisDisplayUnitState.Selftest) {
        this.state = IsisDisplayUnitState.On;
        this.timer = null;
      }
    }

    if (this.state === IsisDisplayUnitState.On && !hasElectricity) {
      this.state = IsisDisplayUnitState.Standby;
      this.timer = 10;
    } else if (this.state === IsisDisplayUnitState.Standby && hasElectricity) {
      this.state = IsisDisplayUnitState.On;
      this.timer = null;
    } else if (this.state === IsisDisplayUnitState.Off && hasElectricity) {
      this.state = IsisDisplayUnitState.Selftest;
      this.timer = 90;
    } else if (this.state === IsisDisplayUnitState.Selftest && !hasElectricity) {
      this.state = IsisDisplayUnitState.Off;
      this.timer = null;
    }

    return { state: this.state, shownSeconds: this.timer === null ? null : Math.max(0, Math.ceil(this.timer)) };
  }
}

/** The display unit with the countdown in IsisPowerSequence: it only renders again for the changes it reports. */
class SequenceDisplay {
  readonly sequence = new IsisPowerSequence(IsisDisplayUnitState.Off);

  state = IsisDisplayUnitState.Off;

  timer: number | null = null;

  renders = 0;

  private apply(change: IsisPowerSequenceChange) {
    if (change & IsisPowerSequenceChange.State) {
      this.state = this.sequence.state;
    }
    if (change & IsisPowerSequenceChange.Timer) {
      this.timer = this.sequence.remainingSeconds;
    }
    if (change !== IsisPowerSequenceChange.None) {
      this.renders++;
    }
  }

  frame(deltaMilliseconds: number, hasElectricity: boolean, skipCountdown = false): Frame {
    this.apply(this.sequence.update(deltaMilliseconds, skipCountdown));
    this.apply(this.sequence.applyPower(hasElectricity));

    return { state: this.state, shownSeconds: this.timer === null ? null : Math.max(0, Math.ceil(this.timer)) };
  }
}

const steady = (milliseconds: number) => () => milliseconds;

const irregular = () => {
  let seed = 12345;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return 5 + (seed % 7600) / 100;
  };
};

/** Runs both displays over the same frames and returns every frame of each */
const runBoth = (nextDelta: () => number, totalSeconds: number, hasElectricityAt: (seconds: number) => boolean) => {
  const reference = new PerFrameStateReference();
  const display = new SequenceDisplay();
  const referenceFrames: Frame[] = [];
  const displayFrames: Frame[] = [];

  for (let elapsed = 0; elapsed < totalSeconds * 1000; ) {
    const delta = nextDelta();
    elapsed += delta;
    referenceFrames.push(reference.frame(delta, hasElectricityAt(elapsed / 1000)));
    displayFrames.push(display.frame(delta, hasElectricityAt(elapsed / 1000)));
  }

  return { reference, display, referenceFrames, displayFrames };
};

const powered = () => true;

describe('IsisPowerSequence', () => {
  describe.each([
    ['16.7 ms frames', steady(16.7)],
    ['irregular frames', irregular()],
  ])('with %s', (_, nextDelta) => {
    it('shows the same state and second in every frame of a 90 s self-test as the per-frame state countdown', () => {
      const { referenceFrames, displayFrames } = runBoth(nextDelta, 100, powered);

      expect(displayFrames).toEqual(referenceFrames);
      expect(displayFrames[displayFrames.length - 1].state).toBe(IsisDisplayUnitState.On);
    });

    it('ends the self-test in On at the same frame as the per-frame state countdown', () => {
      const { referenceFrames, displayFrames } = runBoth(nextDelta, 100, powered);

      const firstOn = (frames: Frame[]) => frames.findIndex((frame) => frame.state === IsisDisplayUnitState.On);
      expect(firstOn(displayFrames)).toBe(firstOn(referenceFrames));
      expect(firstOn(displayFrames)).toBeGreaterThan(0);
    });

    it('goes to Standby on power loss and to Off 10 s later, like the per-frame state countdown', () => {
      const { referenceFrames, displayFrames } = runBoth(nextDelta, 140, (seconds) => seconds < 100);

      expect(displayFrames).toEqual(referenceFrames);
      expect(displayFrames.some((frame) => frame.state === IsisDisplayUnitState.Standby)).toBe(true);
      expect(displayFrames[displayFrames.length - 1].state).toBe(IsisDisplayUnitState.Off);
    });

    it('returns to On when power comes back within the standby time', () => {
      const { referenceFrames, displayFrames } = runBoth(nextDelta, 130, (seconds) => seconds < 100 || seconds > 105);

      expect(displayFrames).toEqual(referenceFrames);
      expect(displayFrames[displayFrames.length - 1].state).toBe(IsisDisplayUnitState.On);
    });

    it('goes to Off when power is lost during the self-test', () => {
      const { referenceFrames, displayFrames } = runBoth(nextDelta, 60, (seconds) => seconds < 30);

      expect(displayFrames).toEqual(referenceFrames);
      expect(displayFrames[displayFrames.length - 1].state).toBe(IsisDisplayUnitState.Off);
    });
  });

  it('renders at most 92 times during a 90 s self-test, where a state countdown renders every frame', () => {
    const { reference, display } = runBoth(steady(16.7), 91, powered);

    expect(reference.timerSetCalls).toBeGreaterThan(5000);
    // 90 shown seconds, the start of the self-test and its end are the only changes
    expect(display.renders).toBeLessThanOrEqual(92);
    expect(display.renders).toBeLessThan(reference.timerSetCalls / 50);
  });

  it('skips a running countdown at once when asked, and ends it a frame later', () => {
    const display = new SequenceDisplay();
    display.frame(16, true);
    expect(display.state).toBe(IsisDisplayUnitState.Selftest);

    expect(display.frame(16, true, true)).toEqual({ state: IsisDisplayUnitState.Selftest, shownSeconds: 0 });
    expect(display.frame(16, true, true).state).toBe(IsisDisplayUnitState.On);
  });

  it('ends a running standby countdown at once when asked, and goes to Off a frame later', () => {
    const sequence = new IsisPowerSequence(IsisDisplayUnitState.On);
    sequence.applyPower(false);
    expect(sequence.state).toBe(IsisDisplayUnitState.Standby);

    sequence.update(16, true);
    expect(sequence.remainingSeconds).toBe(0);
    expect(sequence.state).toBe(IsisDisplayUnitState.Standby);
    sequence.update(16, true);
    expect(sequence.state).toBe(IsisDisplayUnitState.Off);
  });

  it('holds the self-test back while the power-up stagger has not passed', () => {
    const sequence = new IsisPowerSequence(IsisDisplayUnitState.Off);

    expect(sequence.applyPower(true, false)).toBe(IsisPowerSequenceChange.None);
    expect(sequence.state).toBe(IsisDisplayUnitState.Off);
    expect(sequence.applyPower(true, true)).not.toBe(IsisPowerSequenceChange.None);
    expect(sequence.state).toBe(IsisDisplayUnitState.Selftest);
  });
});
