// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Contract between the extras-host "baro unit on load" callback and the A380X cockpit: a variable the callback writes
// has an effect only if the EFIS CP baro unit switch toggles it and the FCU reads it as its panel input.
const EXTRAS_HOST_INDEX = resolve(__dirname, 'index.ts');
const EFIS_CP_BEHAVIOUR = resolve(
  __dirname,
  '../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/efis-cp.xml',
);
const FCU_INTERFACE = resolve(__dirname, '../../wasm/fbw_a380/src/FlyByWireInterface.cpp');

const SIDES = ['L', 'R'];
const SIDE_IN_NAME = /_([LR])_/;

interface SimVarWrite {
  name: string;
  valueText: string;
}

function baroUnitCallbackBody(): string {
  const match = /new BaroUnitSelector\(\(isHpa\) => \{([\s\S]*?)\n\s*\}\);/.exec(
    readFileSync(EXTRAS_HOST_INDEX, 'utf8'),
  );
  if (!match) {
    throw new Error('BaroUnitSelector callback not found in ' + EXTRAS_HOST_INDEX);
  }
  return match[1];
}

function simVarWrites(body: string): SimVarWrite[] {
  const writes: SimVarWrite[] = [];
  const setCall = /SimVar\.SetSimVarValue\(\s*'([^']+)'\s*,\s*[^,]+,\s*([^)]+)\)/g;
  let match = setCall.exec(body);
  while (match) {
    writes.push({ name: match[1], valueText: match[2].trim() });
    match = setCall.exec(body);
  }
  return writes;
}

function localVarNamesToggledByBaroSwitch(): string[] {
  const template = /<Template Name="FBW_AIRLINER_Switch_Baro_Selector_Template">([\s\S]*?)<\/Template>/.exec(
    readFileSync(EFIS_CP_BEHAVIOUR, 'utf8'),
  );
  if (!template) {
    throw new Error('baro unit switch template not found in ' + EFIS_CP_BEHAVIOUR);
  }
  const names: string[] = [];
  const toggledVar = /\(&gt;L:([A-Za-z0-9_#]+)\)/g;
  let match = toggledVar.exec(template[1]);
  while (match) {
    const templateName = match[1];
    SIDES.forEach((side) => {
      const name = templateName.replace('#SIDE#', side).replace('#OFFSIDE#', side);
      if (names.indexOf(name) < 0) {
        names.push(name);
      }
    });
    match = toggledVar.exec(template[1]);
  }
  return names;
}

// The FCU declares its per-side variables as "<prefix>_" + idString + "_<suffix>"
function fcuDeclaresLocalVar(localVarName: string): boolean {
  const declaration = '"' + localVarName.replace(SIDE_IN_NAME, '_" + idString + "_') + '"';
  return readFileSync(FCU_INTERFACE, 'utf8').indexOf(declaration) >= 0;
}

describe('baro unit on load (A380X extras-host)', () => {
  const writes = simVarWrites(baroUnitCallbackBody());

  it('writes only variables the EFIS CP baro unit switch toggles', () => {
    const toggled = localVarNamesToggledByBaroSwitch();
    expect(writes.length).toBeGreaterThan(0);
    writes.forEach((write) => {
      expect(toggled).toContain(write.name.replace(/^L:/, ''));
    });
  });

  it('writes only variables the FCU reads as its panel input', () => {
    writes.forEach((write) => {
      expect(fcuDeclaresLocalVar(write.name.replace(/^L:/, ''))).toBe(true);
    });
  });

  it('sets both the captain and first officer sides', () => {
    const sidesWritten = writes.map((write) => {
      const side = SIDE_IN_NAME.exec(write.name);
      return side ? side[1] : '';
    });
    SIDES.forEach((side) => expect(sidesWritten).toContain(side));
  });

  it('writes the inverse of isHpa, because the variable means "is inHg"', () => {
    writes.forEach((write) => expect(write.valueText).toBe('!isHpa'));
  });
});
