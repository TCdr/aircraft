// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * A380 FCOM DSC-70-90 ENG MASTER FAULT light (a380_fcom.txt l.112849-112859): it comes on when an automatic start
 * sequence aborts (or for an abnormal HP fuel valve position or an overthrust shutdown, which FBW does not model). The
 * FADEC start sequence of systems.wasm writes L:A32NX_ENGINE_n_FAULT_LIGHT for an aborted automatic start. The light is
 * the SEQ2 of the cockpit XML template FBW_Airbus_Engine_Lights, so this checks that template, evaluated for each engine.
 */
const behaviourDir = resolve(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model',
);
const engineXml = readFileSync(resolve(behaviourDir, 'behaviour/legacy/generated/A32NX_Interior_Engine.xml'), 'utf-8');
const cockpitXml = readFileSync(resolve(behaviourDir, 'A380_Cockpit_Behavior.xml'), 'utf-8');

/** The SEQ2_CODE (FAULT light) of the FBW_Airbus_Engine_Lights template, for one engine */
function faultLightCode(engine: number): string {
  const template = /<Template Name="FBW_Airbus_Engine_Lights">([\s\S]*?)<\/Template>/.exec(engineXml);
  if (!template) {
    throw new Error('FBW_Airbus_Engine_Lights template not found');
  }
  const code = /<SEQ2_CODE>([\s\S]*?)<\/SEQ2_CODE>/.exec(template[1]);
  if (!code) {
    throw new Error('SEQ2_CODE not found');
  }
  return code[1].replace(/#ID#/g, engine.toString()).trim();
}

/**
 * Evaluates a code made of a single variable read, the only form the light uses: (L:NAME, unit) or (A:NAME, unit).
 * @returns the value of the variable, false when unset
 */
function evaluate(code: string, variables: Record<string, boolean>): boolean {
  const read = /^\(([LA]:[^,)]+),\s*\w+\)$/.exec(code);
  if (!read) {
    throw new Error(`Unsupported light code: ${code}`);
  }
  return !!variables[read[1].trim()];
}

describe('ENG MASTER FAULT light (A380 FCOM DSC-70-90)', () => {
  it('is used for the four ENG MASTER levers, with engine ids 1 to 4', () => {
    expect(cockpitXml.match(/<UseTemplate Name="FBW_Airbus_Engine_Lights">/g)).toHaveLength(4);
    for (const engine of [1, 2, 3, 4]) {
      expect(cockpitXml).toContain(`<NODE_ID>PUSH_ENGINES_${engine}</NODE_ID>`);
    }
  });

  for (const engine of [1, 2, 3, 4]) {
    it(`engine ${engine}: comes on for an aborted automatic start of its own engine`, () => {
      expect(evaluate(faultLightCode(engine), { [`L:A32NX_ENGINE_${engine}_FAULT_LIGHT`]: true })).toBe(true);
    });

    it(`engine ${engine}: stays off for an aborted start of another engine`, () => {
      const other = (engine % 4) + 1;
      expect(evaluate(faultLightCode(engine), { [`L:A32NX_ENGINE_${other}_FAULT_LIGHT`]: true })).toBe(false);
    });

    it(`engine ${engine}: no longer follows the MSFS engine failure`, () => {
      expect(evaluate(faultLightCode(engine), { [`A:ENG FAILED:${engine}`]: true })).toBe(false);
    });
  }
});
