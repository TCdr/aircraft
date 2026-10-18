// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

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

/** The BUTTON_CODE of the template with that NODE_ID */
function buttonCodeOf(nodeId: string): string | undefined {
  const start = pedestal.indexOf(`<NODE_ID>${nodeId}</NODE_ID>`);
  const block = pedestal.slice(start, pedestal.indexOf('</UseTemplate>', start));
  return block.match(/<BUTTON_CODE>([^<]*)<\/BUTTON_CODE>/)?.[1];
}

describe('SURV panel WXR/TAWS SYS pbs', () => {
  it('SYS 1 always selects system 1', () => {
    expect(buttonCodeOf('PUSH_SURV_WXR_TAWS_SYS1')).toBe('1 (&gt;L:A32NX_WXR_TAWS_SYS_SELECTED, Number)');
  });

  it('SYS 2 always selects system 2', () => {
    expect(buttonCodeOf('PUSH_SURV_WXR_TAWS_SYS2')).toBe('2 (&gt;L:A32NX_WXR_TAWS_SYS_SELECTED, Number)');
  });

  it('the MFD SURV STATUS & SWITCHING SYS buttons never select no system', () => {
    const page = readFileSync(
      resolve(__dirname, '../../instruments/src/MFD/pages/SURV/MfdSurvStatusSwitching.tsx'),
      'utf-8',
    );
    // the page writes the selected system, and no SYS button writes 0 (no system) when it is pressed lit
    expect(page).toContain("'L:A32NX_WXR_TAWS_SYS_SELECTED', SimVarValueType.Number,");
    expect(page).not.toMatch(/'L:A32NX_WXR_TAWS_SYS_SELECTED',\s*SimVarValueType\.Number,\s*[^)]*\? 0 :/);
  });
});
