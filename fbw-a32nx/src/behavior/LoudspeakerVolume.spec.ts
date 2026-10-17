// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The glareshield LOUDSPEAKER volume knobs of the A32NX (AirlinerCommon.xml FBW_AIRLINER_Loudspeaker_Volume_Knob_Template
// and FBW_AIRLINER_Audio_Panel_Updater, A320_NEO_INTERIOR.xml), run with RpnTestInterpreter.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn, RpnVariables } from './RpnTestInterpreter';

const BASE = join(__dirname, '..', 'base', 'flybywire-aircraft-a320-neo');
const AIRLINER_COMMON_XML = join(BASE, 'ModelBehaviorDefs', 'A32NX', 'AirlinerCommon.xml');
const INTERIOR_XML = join(BASE, 'SimObjects', 'AirPlanes', 'FlyByWire_A320_NEO', 'model', 'A320_NEO_INTERIOR.xml');

function template(xml: string, name: string): string {
  const block = new RegExp(`<Template Name="${name}">([\\s\\S]*?)</Template>`).exec(xml);
  if (!block) {
    throw new Error(`template ${name} not found`);
  }
  return block[1];
}

function element(xml: string, tag: string): string {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!block) {
    throw new Error(`${tag} not found`);
  }
  return block[1].replace(/<!--[\s\S]*?-->/g, ' ');
}

const airlinerCommon = readFileSync(AIRLINER_COMMON_XML, 'utf8');
const updaterCode = element(template(airlinerCommon, 'FBW_AIRLINER_Audio_Panel_Updater'), 'UPDATE_CODE');
const knobTemplate = template(airlinerCommon, 'FBW_AIRLINER_Loudspeaker_Volume_Knob_Template');

/** COM1 received on the CAPT audio panel at 80 %, with the two loudspeaker knobs at these positions (percent) */
function com1Volume(captLoudspeaker: number, foLoudspeaker: number): number | undefined {
  const variables: RpnVariables = {
    'A:COM RECEIVE EX1:1': 1,
    'L:XMLVAR_COM_1_VHF_L_Switch_Down': 1,
    'L:XMLVAR_COM_1_Volume_VHF_L': 0.8,
    'L:A32NX_LOUDSPEAKER_CAPT_VOLUME': captLoudspeaker,
    'L:A32NX_LOUDSPEAKER_FO_VOLUME': foLoudspeaker,
  };
  return runRpn(updaterCode, variables).writes.find((write) => write.target === 'K:COM1_VOLUME_SET')?.value;
}

/** The knob code with its template parameters, as the interior uses it */
function knobCode(tag: 'CLOCKWISE_CODE' | 'ANTICLOCKWISE_CODE' | 'ANIM_CODE', side: 'CAPT' | 'FO'): string {
  return element(knobTemplate, tag)
    .replace(/#SIDE#/g, side)
    .replace(/#VOLUME_STEP_PERCENT#/g, '5');
}

/*
 * LOUDSPEAKER volume knob: sets the loudspeaker volume of the radio communications, from OFF (the loudspeaker stays
 * silent) to full clockwise. It does not change the loudness of the aural alerts and voice messages.
 */
describe('A32NX loudspeaker volume knobs', () => {
  it('both knobs full clockwise: the radio volume of the audio panel', () => {
    expect(com1Volume(100, 100)).toBeCloseTo(80);
  });

  it('the louder loudspeaker sets the radio volume', () => {
    expect(com1Volume(50, 0)).toBeCloseTo(40);
    expect(com1Volume(0, 25)).toBeCloseTo(20);
  });

  it('both knobs OFF: the radios are silent', () => {
    expect(com1Volume(0, 0)).toBe(0);
  });

  it('only the COM receive volumes are set (not the aural alerts)', () => {
    const { writes } = runRpn(updaterCode, {
      'A:COM RECEIVE EX1:1': 1,
      'A:COM RECEIVE EX1:2': 1,
      'A:COM RECEIVE EX1:3': 1,
      'I:XMLVAR_COM_UpdateReceivers': 1,
    });
    for (const write of writes) {
      expect(write.target).toMatch(/^(K:COM[123]_VOLUME_SET|K:COM[123]_RECEIVE_SELECT|I:XMLVAR_COM_UpdateReceivers)$/);
    }
  });

  it('the knob turns from OFF (0 %) to full clockwise (100 %) in steps of 5 %', () => {
    const turn = (tag: 'CLOCKWISE_CODE' | 'ANTICLOCKWISE_CODE', from: number) =>
      runRpn(knobCode(tag, 'CAPT'), { 'L:A32NX_LOUDSPEAKER_CAPT_VOLUME': from }).writes[0];
    expect(turn('CLOCKWISE_CODE', 50)).toEqual({ target: 'L:A32NX_LOUDSPEAKER_CAPT_VOLUME', value: 55 });
    expect(turn('CLOCKWISE_CODE', 98)?.value).toBe(100);
    expect(turn('ANTICLOCKWISE_CODE', 50)?.value).toBe(45);
    expect(turn('ANTICLOCKWISE_CODE', 3)?.value).toBe(0);
    // the animation follows the knob position (0..100 over the knob's travel)
    expect(runRpn(knobCode('ANIM_CODE', 'FO'), { 'L:A32NX_LOUDSPEAKER_FO_VOLUME': 40 }).value).toBe(40);
  });

  it('the CAPT and F/O glareshield knobs use the template and start full clockwise', () => {
    const interior = readFileSync(INTERIOR_XML, 'utf8');
    for (const [node, side] of [
      ['KNOB_EFIS_CS_LOUDSPKR', 'CAPT'],
      ['KNOB_EFIS_FO_LOUDSPKR', 'FO'],
    ]) {
      expect(interior).toMatch(
        new RegExp(
          `<UseTemplate Name="FBW_AIRLINER_Loudspeaker_Volume_Knob_Template">\\s*<NODE_ID>${node}</NODE_ID>\\s*<SIDE>${side}</SIDE>`,
        ),
      );
      expect(interior).toContain(`100 (&gt;L:A32NX_LOUDSPEAKER_${side}_VOLUME, number)`);
    }
  });

  // The sim runs only the code of an <Update> element before its first XML comment (seen in the sim: the knobs written after a
  // comment stayed at 0 and muted the radios).
  it('the audio panel init sets both knobs full clockwise at each flight load', () => {
    const interior = readFileSync(INTERIOR_XML, 'utf8');
    const init = /<Component ID="Audio_Panel_Left">[\s\S]*?<Update Once="True">([\s\S]*?)<\/Update>/.exec(interior);
    const codeTheSimRuns = (init?.[1] ?? '').split('<!--')[0];
    const { writes } = runRpn(codeTheSimRuns);
    for (const side of ['CAPT', 'FO']) {
      expect(writes).toContainEqual({ target: `L:A32NX_LOUDSPEAKER_${side}_VOLUME`, value: 100 });
    }
  });
});
