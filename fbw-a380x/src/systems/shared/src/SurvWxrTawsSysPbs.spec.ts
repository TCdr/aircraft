// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn } from '../../../../../fbw-a32nx/src/behavior/RpnTestInterpreter';
import { wxrTawsSystemSelectedByButton } from '../../instruments/src/MFD/pages/SURV/SurvStatus';

/*
 * SURV panel: the WXR/TAWS SYS 1(2) pb selects the system that provides the WXR/TAWS functions, and the MFD SURV
 * STATUS & SWITCHING SYS buttons follow. Pressing the lit pb (or MFD button) must not write 0 to
 * L:A32NX_WXR_TAWS_SYS_SELECTED: the TAWS, the GPWS and the radar read 0 as "no system" (TERR and GPWS failed).
 */
const pedestal = readFileSync(
  resolve(
    __dirname,
    '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/pedestal/pedestal.xml',
  ),
  'utf-8',
);

const SELECTED_VAR = 'L:A32NX_WXR_TAWS_SYS_SELECTED';

/** The BUTTON_CODE of the template with that NODE_ID */
function buttonCodeOf(nodeId: string): string | undefined {
  const start = pedestal.indexOf(`<NODE_ID>${nodeId}</NODE_ID>`);
  const block = pedestal.slice(start, pedestal.indexOf('</UseTemplate>', start));
  return block.match(/<BUTTON_CODE>([^<]*)<\/BUTTON_CODE>/)?.[1];
}

describe('SURV panel WXR/TAWS SYS pbs', () => {
  // Pressed with the system already selected (lit pb) and with the other one selected: the result must not depend on it
  for (const [pb, system] of [
    ['PUSH_SURV_WXR_TAWS_SYS1', 1],
    ['PUSH_SURV_WXR_TAWS_SYS2', 2],
  ] as const) {
    it(`${pb} always selects system ${system}`, () => {
      for (const selected of [0, 1, 2]) {
        const { writes } = runRpn(buttonCodeOf(pb) ?? '', { [SELECTED_VAR]: selected });
        expect(writes, `selected ${selected}`).toEqual([{ target: SELECTED_VAR, value: system }]);
      }
    });
  }

  it('the MFD SURV STATUS & SWITCHING SYS buttons never select no system', () => {
    expect(wxrTawsSystemSelectedByButton('1')).toBe(1);
    expect(wxrTawsSystemSelectedByButton('2')).toBe(2);
  });
});
