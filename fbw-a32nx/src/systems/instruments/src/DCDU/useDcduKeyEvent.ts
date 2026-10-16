// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useInteractionEvents } from '@flybywiresim/fbw-sdk-react';
import { DcduKeySide, dcduKeyEvent, dcduKeyWorks } from './DcduFailures';

/** The failure state of the DCDUs, as the systems-host ATSU writes it (see DcduFailures) */
function dcduFailureStates() {
  return {
    dcdu1Failed: SimVar.GetSimVarValue('L:A32NX_DCDU_1_FAILED', 'bool') > 0,
    dcdu2Failed: SimVar.GetSimVarValue('L:A32NX_DCDU_2_FAILED', 'bool') > 0,
  };
}

/**
 * Calls the handler when the key is pressed on a DCDU that is not failed (both DCDUs share the one DCDU gauge).
 * @param key the key name of the events, e.g. PRINT for A32NX_DCDU_BTN_MPL_PRINT and A32NX_DCDU_BTN_MPR_PRINT
 * @param handler the key action
 */
export const useDcduKeyEvent = (key: string, handler: () => void): void => {
  const onSide = (side: DcduKeySide) => () => {
    if (dcduKeyWorks(side, dcduFailureStates())) {
      handler();
    }
  };
  useInteractionEvents([dcduKeyEvent('MPL', key)], onSide('MPL'));
  useInteractionEvents([dcduKeyEvent('MPR', key)], onSide('MPR'));
};
