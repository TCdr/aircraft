// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The WINDSHEAR synthetic voice: once per reactive windshear warning of the PRIMs (L:A32NX_REACTIVE_WINDSHEAR_WARNING),
 * the clip says WINDSHEAR three times. a380_fcom.txt l.9274-9276: the windshear alert consists of the red message on
 * both PFDs and "An aural WINDSHEAR alert"; l.73643: Windshear (Synthetic voice), WINDSHEAR alert, "Sounds 3 times".
 */
export class FwsWindshearAural {
  private warningPreviously = false;

  /**
   * @param windshearWarning the reactive windshear warning is active
   * @returns true when the WINDSHEAR voice is to be said now
   */
  public update(windshearWarning: boolean): boolean {
    const trigger = windshearWarning && !this.warningPreviously;
    this.warningPreviously = windshearWarning;
    return trigger;
  }
}
