// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { allGearsDownlocked, GravityExtensionIndication, LgciuWord, LgCtlIndication } from './LgersIndications';

/*
 * The timers of the L/G CTL and L/G GRVTY EXTN indications run from the SD instrument loop (SD/index.tsx) whatever SD
 * page is shown. The WHEEL page is a React page that unmounts on every SD page change, so timers kept in the page
 * would restart from 0 at each mount: the page called by the FWS after 60 s of unlocked gear would show L/G CTL 60 s
 * late.
 */

/** How often the SD instrument loop updates the timers (real time, ms) */
export const WHEEL_TIMERS_UPDATE_INTERVAL_MS = 500;

/** A step longer than this (a pause, a menu with the gear in transit) is cut, so the timers do not finish at once */
export const WHEEL_MAX_STEP_S = 1;

export interface WheelIndicationTimerInputs {
  word1Lgcis1: LgciuWord;
  word1Lgcis2: LgciuWord;
  /** the L/G GRVTY switch is DOWN */
  gravitySwitchDown: boolean;
}

export class WheelIndicationTimers {
  private readonly lgCtl = new LgCtlIndication();

  private readonly gravityExtension = new GravityExtensionIndication();

  /** Whether L/G CTL shows, as of the last update */
  public lgCtlVisible = false;

  /** Whether L/G GRVTY EXTN IN PROGRESS shows, as of the last update */
  public gravityExtensionVisible = false;

  /**
   * @param deltaTime the time since the last update, in seconds
   * @param inputs the LGCIU words and the L/G GRVTY switch
   */
  public update(deltaTime: number, inputs: WheelIndicationTimerInputs): void {
    const step = Math.min(deltaTime, WHEEL_MAX_STEP_S);
    this.lgCtlVisible = this.lgCtl.update(step, inputs.word1Lgcis1, inputs.word1Lgcis2);
    this.gravityExtensionVisible = this.gravityExtension.update(
      step,
      inputs.gravitySwitchDown,
      allGearsDownlocked(inputs.word1Lgcis1, inputs.word1Lgcis2),
    );
  }
}

/** The timers shared by the SD instrument loop and the WHEEL page */
export const wheelIndicationTimers = new WheelIndicationTimers();

/**
 * Updates the shared timers from the SimVars. Called by the SD instrument loop whatever page is shown.
 * @param deltaTime the time since the last call, in seconds
 * @param read reads one SimVar as a number (SimVar.GetSimVarValue(name, 'number') in the sim)
 */
export function updateWheelIndicationTimers(deltaTime: number, read: (name: string) => number): void {
  wheelIndicationTimers.update(deltaTime, {
    word1Lgcis1: new Arinc429Word(read('L:A32NX_LGCIU_1_DISCRETE_WORD_1')),
    word1Lgcis2: new Arinc429Word(read('L:A32NX_LGCIU_2_DISCRETE_WORD_1')),
    gravitySwitchDown: read('L:A32NX_LG_GRVTY_SWITCH_POS') === 2,
  });
}
