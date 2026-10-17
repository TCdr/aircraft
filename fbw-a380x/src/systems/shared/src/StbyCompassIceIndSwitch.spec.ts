// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * STBY COMPASS / ICE IND / OFF switch: the up position lights the standby compass and the eye reference lights, the
 * middle position the ice indicator lights. The switch is SWITCH_OVHD_INTLT_STBYCOMPAS in the cockpit XML; the ice
 * indicator lights read its L:var.
 *
 * MSFS runs only the code BEFORE the first XML comment inside a code block. A comment at the start of each CODE_POS
 * block made the switch dead: the L:var stayed 0 and the switch snapped back to OFF.
 */
const cockpitXml = readFileSync(
  resolve(
    __dirname,
    '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml',
  ),
  'utf-8',
);

const SWITCH_LVAR = 'L:A380X_OVHD_EXTLT_STBY_COMPASS_ICE_IND_SWITCH_POS';

function switchComponent(): string {
  const component = /<Component ID="SWITCH_OVHD_INTLT_STBYCOMPAS"[^>]*>([\s\S]*?)<\/Component>/.exec(cockpitXml);
  if (!component) {
    throw new Error('SWITCH_OVHD_INTLT_STBYCOMPAS not found');
  }
  return component[1];
}

/** The code of one block as MSFS runs it: cut at the first XML comment, RPN (* ... *) comments removed */
function codeAsRun(tag: string): string {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(switchComponent());
  if (!block) {
    throw new Error(`${tag} not found`);
  }
  return block[1]
    .split('<!--')[0]
    .replace(/\(\*[\s\S]*?\*\)/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Switch position (ASOBO_GT_Switch_3States index) -> value written to the L:var
const POSITIONS = [
  { pos: 0, name: 'STBY COMPASS', value: 2 },
  { pos: 1, name: 'ICE IND', value: 1 },
  { pos: 2, name: 'OFF', value: 0 },
];

describe('A380X STBY COMPASS / ICE IND switch', () => {
  for (const { pos, name, value } of POSITIONS) {
    it(`${name}: the click writes ${value} to the switch L:var`, () => {
      expect(codeAsRun(`CODE_POS_${pos}`)).toBe(`${value} (>${SWITCH_LVAR})`);
    });

    it(`${name}: the state test holds the switch in that position`, () => {
      expect(codeAsRun(`STATE${pos}_TEST`)).toBe(`(${SWITCH_LVAR}) ${value} ==`);
    });
  }

  it('ICE IND: both ice indicator lights come on with the written value', () => {
    const iceLights = cockpitXml.match(
      /<EMISSIVE_CODE>\(L:A380X_OVHD_EXTLT_STBY_COMPASS_ICE_IND_SWITCH_POS\) 1 ==<\/EMISSIVE_CODE>/g,
    );
    expect(iceLights).toHaveLength(2);
  });
});
