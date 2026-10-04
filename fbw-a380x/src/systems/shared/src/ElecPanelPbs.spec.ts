// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * A380 FCOM DSC-24-20 ELEC PANEL: the ELMU pb-sw (automatic shedding of low commercial loads) is a function of its own.
 * The COMMERCIAL, COMMERCIAL 2 and ELMU pbs of the cockpit behaviour each toggle their own variable; before, all three
 * toggled L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON (the Rust COMMERCIAL pb), so pressing ELMU shed the commercial loads.
 */
const behaviour = readFileSync(
  resolve(
    __dirname,
    '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml',
  ),
  'utf-8',
);

/** The TOGGLE_SIMVAR of the FBW_Push_Toggle with that NODE_ID */
function toggleSimvarOf(nodeId: string): string | undefined {
  const start = behaviour.indexOf(`<NODE_ID>${nodeId}</NODE_ID>`);
  const block = behaviour.slice(start, behaviour.indexOf('</UseTemplate>', start));
  return block.match(/<TOGGLE_SIMVAR>([^<]*)<\/TOGGLE_SIMVAR>/)?.[1];
}

describe('ELEC panel COMMERCIAL, COMMERCIAL 2 and ELMU pbs', () => {
  it('toggle three different variables', () => {
    const vars = ['PUSH_OVHD_ELEC_COMMERCIAL', 'PUSH_OVHD_ELEC_COMMERCIAL2', 'PUSH_OVHD_ELEC_ELMU'].map(toggleSimvarOf);
    expect(vars).toEqual([
      'L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON',
      'L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF',
      'L:A380X_OVHD_ELEC_ELMU_PB_IS_OFF',
    ]);
  });
});
