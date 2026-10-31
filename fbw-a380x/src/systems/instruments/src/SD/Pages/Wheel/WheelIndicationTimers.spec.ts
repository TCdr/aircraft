// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { updateWheelIndicationTimers, WheelIndicationTimers, wheelIndicationTimers } from './WheelIndicationTimers';

function word(bits: number[]): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

const DOWNLOCKED = word([23, 24, 25]);
/** Left gear not downlocked with the lever down (bit 14) */
const LEFT_NOT_DOWNLOCKED = word([14, 24, 25]);

function inputs(lgciuWord: Arinc429Register, gravitySwitchDown = false) {
  return { word1Lgcis1: lgciuWord, word1Lgcis2: lgciuWord, gravitySwitchDown };
}

describe('WHEEL page indication timers outside the page', () => {
  it('shows L/G CTL as soon as the page asks, after 70 s of unlocked gear with the page not shown', () => {
    const timers = new WheelIndicationTimers();
    for (let t = 0; t < 70; t += 1) {
      timers.update(1, inputs(LEFT_NOT_DOWNLOCKED));
    }
    expect(timers.lgCtlVisible).toBe(true);
  });

  it('does not show L/G CTL before 60 s', () => {
    const timers = new WheelIndicationTimers();
    for (let t = 0; t < 50; t += 1) {
      timers.update(1, inputs(LEFT_NOT_DOWNLOCKED));
    }
    expect(timers.lgCtlVisible).toBe(false);
  });

  it('keeps counting the GRVTY EXTN 120 s across a page change', () => {
    const timers = new WheelIndicationTimers();
    for (let t = 0; t < 100; t += 1) {
      timers.update(1, inputs(LEFT_NOT_DOWNLOCKED, true));
    }
    expect(timers.gravityExtensionVisible).toBe(true);
    for (let t = 0; t < 30; t += 1) {
      timers.update(1, inputs(LEFT_NOT_DOWNLOCKED, true));
    }
    expect(timers.gravityExtensionVisible).toBe(false);
  });

  it('clamps a step after a pause, so a 10 min delta does not finish the 60 s timer', () => {
    const timers = new WheelIndicationTimers();
    timers.update(600, inputs(LEFT_NOT_DOWNLOCKED));
    expect(timers.lgCtlVisible).toBe(false);
  });

  it('ends GRVTY EXTN when all gears are downlocked', () => {
    const timers = new WheelIndicationTimers();
    timers.update(1, inputs(LEFT_NOT_DOWNLOCKED, true));
    expect(timers.gravityExtensionVisible).toBe(true);
    timers.update(1, inputs(DOWNLOCKED, true));
    expect(timers.gravityExtensionVisible).toBe(false);
  });
});

describe('updateWheelIndicationTimers wiring', () => {
  const names: string[] = [];

  function readerOf(gravitySwitch: number) {
    return (name: string) => {
      names.push(name);
      if (name === 'L:A32NX_LG_GRVTY_SWITCH_POS') {
        return gravitySwitch;
      }
      return LEFT_NOT_DOWNLOCKED.rawWord;
    };
  }

  it('reads both LGCIU discrete words and the gravity switch', () => {
    names.length = 0;
    updateWheelIndicationTimers(1, readerOf(0));
    expect(names).toEqual([
      'L:A32NX_LGCIU_1_DISCRETE_WORD_1',
      'L:A32NX_LGCIU_2_DISCRETE_WORD_1',
      'L:A32NX_LG_GRVTY_SWITCH_POS',
    ]);
  });

  it('starts the GRVTY EXTN only with the switch at position 2', () => {
    updateWheelIndicationTimers(1, readerOf(1));
    expect(wheelIndicationTimers.gravityExtensionVisible).toBe(false);
    updateWheelIndicationTimers(1, readerOf(2));
    expect(wheelIndicationTimers.gravityExtensionVisible).toBe(true);
  });
});
