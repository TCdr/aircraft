//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import type { VhfRadioInterface } from '@datalink/router';

/**
 * VHF 3, the only data medium of the A380X ACR router (Acr.ts; the sim has no HF or SATCOM datalink). It carries the
 * datalink when VHF 3 is in DATA mode on the RMP and is not failed (COM VHF 3 DATALINK FAULT covers a failed VHF 3 and
 * a failed data mode). With the flyPad failure 23007 (VHF 3) the router loses the datalink (CPDLC, AOC), as COM VHF 3
 * DATALINK FAULT tells the crew.
 */
export class A380xVhfProvider implements VhfRadioInterface {
  /**
   * @param isRmpDataModeSelected VHF 3 is in DATA mode on the RMP (L:FBW_RMP_MODE_ACTIVE_3)
   * @param isVhf3Failed VHF 3 is failed (flyPad failure 23007)
   */
  constructor(
    private readonly isRmpDataModeSelected: () => boolean,
    private readonly isVhf3Failed: () => boolean,
  ) {}

  public isDataModeActive(): boolean {
    return this.isRmpDataModeSelected() && !this.isVhf3Failed();
  }
}
