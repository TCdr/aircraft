// Copyright (c) 2021-2025 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0
// @ts-strict-ignore
import { soundList } from './A32NX_SoundManager';

// FIXME move GPWS logic to systems host, and ACOs to PseudoFWC
export class A32NX_GPWS {
  /**
   * A word the EGPWC keeps on its output is said again after this long. The predictive words come as pulses shorter than
   * this, so they are said once each. The repeat is decided here, with the output read in the same update: the sound
   * manager's own repeat ran before the output was read, and said a word again after it had left the output when the
   * MCDU updated late, over the next word.
   */
  private static readonly REPEAT_S = 1.1;

  private prevAuralWarning = 0;

  private timeSinceWordS = 0;

  private wordDue = false;

  constructor(private core) {
    console.log('A32NX_GPWS constructed');
  }

  init() {
    console.log('A32NX_GPWS init');
  }

  update(deltaTime, _core) {
    this.GPWSComputeLightsAndCallouts(deltaTime);
  }

  GetWarningFromEnum(num: number) {
    switch (num) {
      case 1:
        return soundList.pull_up;
      case 2:
        return soundList.terrain;
      case 3:
        return soundList.too_low_terrain;
      case 4:
        return soundList.too_low_gear;
      case 5:
        return soundList.too_low_flaps;
      case 6:
        return soundList.sink_rate;
      case 7:
        return soundList.dont_sink;
      case 8:
        return soundList.glideslope_quiet;
      case 9:
        return soundList.glideslope_loud;
      case 10:
        return soundList.terrain_ahead;
      case 11:
        return soundList.obstacle_ahead;
      case 12:
        // AVOID TERRAIN is not in the sound bank: sound.xml plays its own clip on this output
        return '';
      default:
        return '';
    }
  }

  GPWSComputeLightsAndCallouts(deltaTime: number) {
    const currentAuralWarning = SimVar.GetSimVarValue('L:A32NX_GPWS_AURAL_OUTPUT', 'number');
    if (currentAuralWarning !== this.prevAuralWarning) {
      this.prevAuralWarning = currentAuralWarning;
      this.timeSinceWordS = 0;
      this.wordDue = currentAuralWarning !== 0;
    } else if (currentAuralWarning !== 0) {
      this.timeSinceWordS += deltaTime / 1000;
      if (this.timeSinceWordS >= A32NX_GPWS.REPEAT_S) {
        this.wordDue = true;
      }
    }

    // A word that cannot start while another one is playing is tried again for as long as it is on the output
    if (this.wordDue && currentAuralWarning !== 0) {
      const sound = this.GetWarningFromEnum(currentAuralWarning);
      if (!sound || this.core.soundManager.tryPlaySound(sound)) {
        this.wordDue = false;
        this.timeSinceWordS = 0;
      }
    }
  }
}
