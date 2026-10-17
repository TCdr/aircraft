// Copyright (c) 2023 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export class NavRadioUtils {
  public static vhfFrequenciesAreEqual(a?: number | null, b?: number | null): boolean {
    return Math.abs((a ?? 0) - (b ?? 0)) < 0.01;
  }

  /**
   * The L:var of the BFO (beat frequency oscillator) of ADF 1 or 2: set by the FMGC from the MCDU RADIO NAV page, or by
   * the RMP BFO key in the NAV backup mode.
   * @param index ADF 1 or 2
   * @returns the L:var name
   */
  public static adfBfoVar(index: 1 | 2): string {
    return `L:A32NX_ADF_${index}_BFO_ON`;
  }

  /**
   * The BFO state of an ADF: the BFO is a mode of a tuned ADF, the MCDU RADIO NAV page shows its ADF/BFO prompt only
   * when an ADF is tuned.
   * @param frequency the tuned ADF frequency, null without one
   * @param bfoSelected the BFO is selected
   * @returns whether the BFO is on
   */
  public static adfBfo(frequency: number | null, bfoSelected: boolean): boolean {
    return bfoSelected && frequency !== null;
  }
}
