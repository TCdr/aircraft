// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isCabinCalledFromCockpit } from '../CpiomC/FlightWarningSystem/CommunicationAlerts';

// The CALLS panel and the ELT selector of the overhead panel (A380_Cockpit_Behavior.xml) and the call chimes (sound.xml)

const AIRCRAFT_DIR = resolve(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X',
);
const cockpitXml = readFileSync(
  resolve(AIRCRAFT_DIR, 'attachments/flybywire/Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml'),
  'utf-8',
).replace(/<!--[\s\S]*?-->/g, ' ');
const soundXml = readFileSync(resolve(AIRCRAFT_DIR, 'common/sound/sound.xml'), 'utf-8').replace(
  /<!--[\s\S]*?-->/g,
  ' ',
);

/** The UseTemplate block (template name and content) that holds a NODE_ID */
function templateOf(node: string): { name: string; body: string } {
  const block = new RegExp(
    `<UseTemplate Name="([^"]+)">((?:(?!</UseTemplate>)[\\s\\S])*?<NODE_ID>${node}</NODE_ID>(?:(?!</UseTemplate>)[\\s\\S])*)</UseTemplate>`,
  ).exec(cockpitXml);
  if (!block) {
    throw new Error(`template of ${node} not found`);
  }
  return { name: block[1], body: block[2] };
}

/** A parameter of a block, undefined when absent */
function parameter(block: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block)?.[1].replace(/\s+/g, ' ').trim();
}

/**
 * Runs the small RPN subset of these codes: numbers, (L:NAME, unit) reads, (&gt;L:NAME) writes, ! and `and`.
 * @returns the writes and the value left on the stack
 */
function run(code: string, variables: Record<string, number>): { value: number; writes: Record<string, number> } {
  const writes: Record<string, number> = {};
  const stack: number[] = [];
  const tokens = code.replace(/&gt;/g, '>').match(/\([^)]*\)|\S+/g) ?? [];
  for (const token of tokens) {
    const write = /^\(>(L:[^,)]+)\)$/.exec(token);
    const read = /^\((L:[^,)]+)(,[^)]*)?\)$/.exec(token);
    if (write) {
      writes[write[1].trim()] = stack.pop() ?? 0;
    } else if (read) {
      const name = read[1].trim();
      stack.push(writes[name] ?? variables[name] ?? 0);
    } else if (token === '!') {
      stack.push((stack.pop() ?? 0) > 0 ? 0 : 1);
    } else if (token === 'and') {
      const b = stack.pop() ?? 0;
      const a = stack.pop() ?? 0;
      stack.push(a > 0 && b > 0 ? 1 : 0);
    } else if (/^-?\d+(\.\d+)?$/.test(token)) {
      stack.push(Number(token));
    } else {
      throw new Error(`unsupported token ${token}`);
    }
  }
  return { value: stack.pop() ?? 0, writes };
}

/*
 * CALLS panel: PURS, PILOT REST, DECK, ALL, MECH and EMER each call their own station, not the A320 FWD/AFT calls
 * (through those, a PILOT REST call made the cabin crew report CABIN READY).
 */
describe('CALLS panel', () => {
  const stations = ['MECH', 'ALL', 'DECK_UPPER', 'DECK_MAIN', 'REST_FWD', 'REST_MAIN', 'PURS'];

  it('each pushbutton has its own L:var, held while pressed', () => {
    for (const station of stations) {
      const pb = templateOf(`PUSH_OVHD_CALLS_${station}`);
      expect(pb.name, station).toBe('FBW_Push_Held');
      expect(parameter(pb.body, 'HOLD_SIMVAR'), station).toBe(`L:PUSH_OVHD_CALLS_${station}`);
    }
    expect(cockpitXml).not.toMatch(/L:PUSH_OVHD_CALLS_(FWD|AFT)\b/);
  });

  it('each pushbutton sounds its call (chime, MECH horn while held)', () => {
    for (const station of stations) {
      expect(soundXml, station).toMatch(new RegExp(`LocalVar="PUSH_OVHD_CALLS_${station}"`));
    }
    expect(soundXml).not.toMatch(/LocalVar="PUSH_OVHD_CALLS_(FWD|AFT)"/);
  });

  it('the cabin calls (ALL, DECK, PURS) make the cabin crew report CABIN READY, PILOT REST and MECH do not', () => {
    const pressed = (station: string) => (name: string) => (name === `L:PUSH_OVHD_CALLS_${station}` ? 1 : 0);
    for (const station of ['ALL', 'DECK_UPPER', 'DECK_MAIN', 'PURS']) {
      expect(isCabinCalledFromCockpit(pressed(station)), station).toBe(true);
    }
    for (const station of ['REST_FWD', 'REST_MAIN', 'MECH']) {
      expect(isCabinCalledFromCockpit(pressed(station)), station).toBe(false);
    }
    expect(isCabinCalledFromCockpit(() => 0)).toBe(false);
  });

  // EMER pb-sw: pressed, the ON and CALL lights come on steady. XML lamp codes cannot read E:ABSOLUTE TIME, so a
  // flash driven from it leaves the lights dark.
  it('EMER: ON and CALL lights steady while the emergency call is on, off without it', () => {
    const emer = templateOf('PUSH_OVHD_CALLS_EMER').body;
    for (const seq of ['SEQ1_CODE', 'SEQ2_CODE']) {
      const code = parameter(emer, seq) ?? '';
      expect(code, seq).not.toContain('ABSOLUTE TIME');
      expect(run(code, { 'L:A32NX_CALLS_EMER_ON': 1 }).value, seq).toBe(1);
      expect(run(code, {}).value, seq).toBe(0);
    }
  });
});

/*
 * ELT panel: ARMED/ON and TEST/RESET. The cockpit model has one 3-position selector, SWITCH_OVHD_ELT_SELECTOR
 * (ON / ARMED / TEST/RESET, as the A320 selector), and no PUSH_OVHD_ELT_TEST or PUSH_OVHD_ELT_ON pushbuttons.
 */
describe('ELT selector', () => {
  const selector =
    /<Component ID="SWITCH_OVHD_ELT_SELECTOR" Node="SWITCH_OVHD_ELT_SELECTOR">([\s\S]*?)<\/Component>/.exec(
      cockpitXml,
    )?.[1] ?? '';

  it('drives the selector of the model, not the A320 pushbuttons', () => {
    expect(selector).toContain('<UseTemplate Name="ASOBO_GT_Switch_3States">');
    expect(parameter(selector, 'ANIM_NAME')).toBe('SWITCH_OVHD_ELT_SELECTOR');
    expect(cockpitXml).not.toContain('PUSH_OVHD_ELT_TEST');
    expect(cockpitXml).not.toContain('PUSH_OVHD_ELT_ON');
  });

  const positions = [
    { position: 0, name: 'ON', eltOn: 1, testReset: 0 },
    { position: 1, name: 'ARMED', eltOn: 0, testReset: 0 },
    { position: 2, name: 'TEST/RESET', eltOn: 0, testReset: 1 },
  ];

  for (const { position, name, eltOn, testReset } of positions) {
    it(`${name}: sets the ELT L:vars and only its own position test is true`, () => {
      // from any position (the switch moves one step at a time, any start state is checked)
      for (const from of positions) {
        const start = { 'L:A32NX_ELT_ON': from.eltOn, 'L:A32NX_ELT_TEST_RESET': from.testReset };
        const { writes } = run(parameter(selector, `CODE_POS_${position}`) ?? '', start);
        expect(writes['L:A32NX_ELT_ON'], name).toBe(eltOn);
        expect(writes['L:A32NX_ELT_TEST_RESET'], name).toBe(testReset);
        for (const test of [0, 1, 2]) {
          expect(run(parameter(selector, `STATE${test}_TEST`) ?? '', writes).value, `${name} STATE${test}`).toBe(
            test === position ? 1 : 0,
          );
        }
      }
    });
  }

  it('ARMED at flight load (both L:vars 0)', () => {
    expect(run(parameter(selector, 'STATE1_TEST') ?? '', {}).value).toBe(1);
  });
});
