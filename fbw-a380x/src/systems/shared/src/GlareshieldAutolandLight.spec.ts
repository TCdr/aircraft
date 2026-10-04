// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * A380 FCOM DSC-22-FG-80-100 AUTOLAND light: it flashes in autoland below 200 ft RA when the autoland conditions are
 * lost, and "as long as the AUTOLAND light is pressed, the AUTOLAND light flashes" (light test). The behaviour lives in
 * the cockpit XML, so this checks the glareshield template of both lights.
 */
const glareshield = readFileSync(
  resolve(
    __dirname,
    '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/glareshield.xml',
  ),
  'utf-8',
);

/** The UseTemplate block of a glareshield node */
function block(nodeId: string): string {
  const node = glareshield.indexOf(`<NODE_ID>${nodeId}</NODE_ID>`);
  const start = glareshield.lastIndexOf('<UseTemplate', node);
  return glareshield.slice(start, glareshield.indexOf('</UseTemplate>', node));
}

describe('AUTOLAND light (glareshield.xml)', () => {
  for (const [side, holdVar] of [
    ['CS', 'L:A380X_GLARESHIELD_AUTOLAND_TEST_L'],
    ['FO', 'L:A380X_GLARESHIELD_AUTOLAND_TEST_R'],
  ]) {
    it(`${side}: flashes while pressed (light test) and on the autoland warning`, () => {
      const autoland = block(`PUSH_GLARESHIELD_${side}_AUTOLAND`);
      // A held pushbutton: the test variable is 1 only while the button is pressed
      expect(autoland).toContain('<UseTemplate Name="FBW_Push_Held">');
      expect(autoland).toContain(`<HOLD_SIMVAR>${holdVar}</HOLD_SIMVAR>`);
      // Lit and flashing from the systems host (AutolandLights.ts): the lamp code cannot read the sim time
      const light = autoland.match(/<SEQ1_CODE>([^<]*)<\/SEQ1_CODE>/)?.[1] ?? '';
      expect(light).toBe(`(${holdVar.replace('_TEST_', '_LIGHT_')}, bool)`);
    });
  }
});
