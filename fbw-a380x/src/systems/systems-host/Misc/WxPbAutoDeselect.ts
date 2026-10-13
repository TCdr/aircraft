// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';

/**
 * The EFIS CP WX pb after landing, A380 FCOM DSC-34-20-30 (a380_fcom.txt l.92444-92447): "ON GROUND, AFTER LANDING:
 * 60 s after touchdown, the WX pb on the EFIS CP is automatically deselected and the WXR automatically turns off."
 * (also l.89271-89272: "The WXR is turned off: Automatically, after landing"). The WXR transmits while an ND asks for
 * the weather (ndwxr), so deselecting the pbs also turns the radar off.
 *
 * Design choices (not in the FCOM): the touchdown is the first frame on ground after a frame in flight (no count after
 * a spawn on the ground); a lift-off before the 60 s (touch and go, bounce) cancels the count; the deselection is done
 * once, so the crew can select the WX pb again on ground.
 */

/** "60 s after touchdown" (a380_fcom.txt l.92446) */
export const WX_PB_AUTO_DESELECT_DELAY_SECONDS = 60;

/** The overlay of an EFIS CP while its WX pb is selected (L:A380X_EFIS_{L,R}_ACTIVE_OVERLAY: 0 none, 1 WX, 2 TERR) */
export const EFIS_OVERLAY_WX = 1;

/** The L:var of the overlay selected on one EFIS CP */
export function efisOverlayVar(side: 'L' | 'R'): string {
  return `L:A380X_EFIS_${side}_ACTIVE_OVERLAY`;
}

/** The FCU event of the WX pb of one EFIS CP (it toggles the pb) */
export function wxPbPushEvent(side: 'L' | 'R'): string {
  return `K:A32NX.FCU_EFIS_${side}_WX_PUSH`;
}

/** Counts the time since touchdown and says when to deselect the WX pbs. */
export class WxPbAutoDeselectLogic {
  /** The aircraft was on ground at the previous update; null before the first update */
  private wasOnGround: boolean | null = null;

  /** Seconds since touchdown while counting, null otherwise */
  private secondsSinceTouchdown: number | null = null;

  /**
   * @param onGround the aircraft is on ground
   * @param deltaSeconds simulation time since the previous update
   * @param wxSelectedLeft the captain's WX pb is selected
   * @param wxSelectedRight the first officer's WX pb is selected
   * @returns the sides whose WX pb is to be pushed (deselected) now
   */
  public update(
    onGround: boolean,
    deltaSeconds: number,
    wxSelectedLeft: boolean,
    wxSelectedRight: boolean,
  ): ('L' | 'R')[] {
    const touchdown = onGround && this.wasOnGround === false;
    this.wasOnGround = onGround;

    if (!onGround) {
      this.secondsSinceTouchdown = null;
      return [];
    }
    if (touchdown) {
      this.secondsSinceTouchdown = 0;
      return [];
    }
    if (this.secondsSinceTouchdown === null) {
      return [];
    }

    this.secondsSinceTouchdown += Math.max(0, deltaSeconds);
    if (this.secondsSinceTouchdown < WX_PB_AUTO_DESELECT_DELAY_SECONDS) {
      return [];
    }

    this.secondsSinceTouchdown = null;
    const sides: ('L' | 'R')[] = [];
    if (wxSelectedLeft) {
      sides.push('L');
    }
    if (wxSelectedRight) {
      sides.push('R');
    }
    return sides;
  }
}

/** Deselects the EFIS CP WX pbs 60 s after touchdown. */
export class WxPbAutoDeselect implements Instrument {
  private readonly logic = new WxPbAutoDeselectLogic();

  private lastSimTimeSeconds: number | null = null;

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    const simTimeSeconds: number = SimVar.GetSimVarValue('E:SIMULATION TIME', SimVarValueType.Seconds);
    const deltaSeconds = this.lastSimTimeSeconds === null ? 0 : simTimeSeconds - this.lastSimTimeSeconds;
    this.lastSimTimeSeconds = simTimeSeconds;

    const sides = this.logic.update(
      SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0,
      deltaSeconds,
      SimVar.GetSimVarValue(efisOverlayVar('L'), SimVarValueType.Number) === EFIS_OVERLAY_WX,
      SimVar.GetSimVarValue(efisOverlayVar('R'), SimVarValueType.Number) === EFIS_OVERLAY_WX,
    );
    for (const side of sides) {
      SimVar.SetSimVarValue(wxPbPushEvent(side), SimVarValueType.Number, 0);
    }
  }
}
