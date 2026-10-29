// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The WINDSHEAR synthetic voice: once per reactive windshear warning of the PRIMs (L:A32NX_REACTIVE_WINDSHEAR_WARNING),
 * the clip says WINDSHEAR three times. The windshear alert is the red message on both PFDs and this aural alert.
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
