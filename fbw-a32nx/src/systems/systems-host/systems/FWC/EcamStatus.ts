// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface EcamStatusInputs {
  /** Whether the STATUS page has nothing to show (NORMAL) */
  statusEmpty: boolean;
  /** Whether a primary alert is shown on the E/WD */
  leftFailureDisplayed: boolean;
  /** Whether a CLR push has just cleared the last alert of the E/WD */
  lastAlertCleared: boolean;
  /** A CLR push */
  clearPressed: boolean;
  /** An STS push */
  statusPressed: boolean;
  /** The flaps lever has just been set to 1 in flight (CONF 1 for the approach) */
  conf1SelectedInFlight: boolean;
  /** Whether the SD shows the STATUS page */
  sdShowsStatus: boolean;
}

export interface EcamStatusOutputs {
  /** The FWC calls the STATUS page on the SD */
  requestStatusPage: boolean;
  /** The STS reminder on the E/WD */
  reminder: boolean;
}

/**
 * When the FWC calls the STATUS page and shows the STS reminder (A320 FCOM DSC-31-20 and DSC-31-25-20):
 * - The STATUS page appears automatically when it is not empty and the flight crew clears the last alert of the E/WD,
 *   or selects CONF 1 for the approach. The next CLR push (or an STS push) removes it.
 * - The STS reminder is shown on the E/WD while the STATUS page is not empty and not shown, when no alert is shown.
 */
export class EcamStatus {
  private statusPageCalled = false;

  update(inputs: EcamStatusInputs): EcamStatusOutputs {
    if (inputs.statusEmpty || inputs.leftFailureDisplayed) {
      this.statusPageCalled = false;
    } else if (inputs.lastAlertCleared || inputs.conf1SelectedInFlight) {
      this.statusPageCalled = true;
    } else if (inputs.clearPressed || inputs.statusPressed) {
      this.statusPageCalled = false;
    }

    return {
      requestStatusPage: this.statusPageCalled,
      reminder: !inputs.statusEmpty && !inputs.leftFailureDisplayed && !inputs.sdShowsStatus,
    };
  }
}
