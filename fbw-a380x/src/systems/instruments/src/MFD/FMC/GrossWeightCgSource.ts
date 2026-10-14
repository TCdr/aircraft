// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/**
 * The gross weight CG that the FMS uses: the FQMS one, or the WBBC one when the FQMS gives none (A380 FCOM DSC-28-10
 * WEIGHT AND BALANCE BACKUP COMPUTER, a380_fcom.txt l.57741-57744: the WBBC GW and CG are "Used to compute flight control
 * laws and characteristic speeds when both FQMS are failed").
 * @param fqmsCg the FQMS CG word (A32NX_FQMS_CENTER_OF_GRAVITY_MAC)
 * @param wbbcCg the WBBC CG word (A380X_WBBC_CENTER_OF_GRAVITY_MAC, CpiomF/WeightBalanceBackup)
 * @returns the CG in % MAC, null when neither gives one
 */
export function grossWeightCgFromFqmsOrWbbc(fqmsCg: Arinc429WordData, wbbcCg: Arinc429WordData): number | null {
  return fqmsCg.valueOr(wbbcCg.valueOr(null));
}
