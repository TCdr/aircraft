// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The tuning of an ADF as the RADIO NAV page shows it */
export interface AdfBfoState {
  /** The tuned frequency in kHz, null without one */
  frequency: number | null;
  bfo: boolean;
}

/**
 * The line 6 ADF1/BFO and BFO/ADF2 prompts of the RADIO NAV page (A320 FCOM DSC-22_20-50-10-28, a320_fcom.txt
 * l.21508-21509, l.21521-21523): "When an ADF is selected, these fields display an ADF/BFO prompt. The flight crew
 * presses this key once to erase the arrow and revert ADF to BFO mode."
 * @param receiverIndex ADF 1 (left) or 2 (right)
 * @param adf the ADF tuning
 * @returns the MCDU cell, empty without a tuned ADF
 */
export function adfBfoCell(receiverIndex: 1 | 2, adf: AdfBfoState): string {
  if (adf.frequency === null) {
    return '';
  }
  if (receiverIndex === 1) {
    return `${adf.bfo ? '' : '{'}ADF1/BFO[color]cyan`;
  }
  return `BFO/ADF2${adf.bfo ? '' : '}'}[color]cyan`;
}

/** What a press of the ADF/BFO prompt key does */
export type AdfBfoAction = 'activate' | 'cancel' | 'notAllowed';

/**
 * A press of the ADF/BFO prompt key: with an empty scratchpad it activates the BFO, "A clear action recalls the
 * arrow, and cancels BFO" (a320_fcom.txt l.21522-21523).
 * @param input the scratchpad content
 * @param isClear the scratchpad holds CLR
 * @param adf the ADF tuning
 * @returns the action
 */
export function adfBfoAction(input: string, isClear: boolean, adf: AdfBfoState): AdfBfoAction {
  if (adf.frequency === null) {
    return 'notAllowed';
  }
  if (isClear) {
    return adf.bfo ? 'cancel' : 'notAllowed';
  }
  if (input === '') {
    return adf.bfo ? 'notAllowed' : 'activate';
  }
  return 'notAllowed';
}
