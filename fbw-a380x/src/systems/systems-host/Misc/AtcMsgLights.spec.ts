// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn } from '../../../../../fbw-a32nx/src/behavior/RpnTestInterpreter';
import { ATC_MSG_LIGHT_VAR, isAtcMsgLightLit } from './AtcMsgLights';

const COCKPIT_MODEL =
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model';

describe('ATC MSG lights (flashes at 2 Hz)', () => {
  it('stays dark without a waiting message', () => {
    for (let t = 0; t < 2000; t += 50) {
      expect(isAtcMsgLightLit(false, t)).toBe(false);
    }
  });

  it('flashes at 2 Hz (250 ms on, 250 ms off) while a message waits', () => {
    expect(isAtcMsgLightLit(true, 0)).toBe(true);
    expect(isAtcMsgLightLit(true, 249)).toBe(true);
    expect(isAtcMsgLightLit(true, 250)).toBe(false);
    expect(isAtcMsgLightLit(true, 499)).toBe(false);
    expect(isAtcMsgLightLit(true, 500)).toBe(true);
    // two flashes per second
    let flashes = 0;
    let wasLit = false;
    for (let t = 0; t < 1000; t += 10) {
      const lit = isAtcMsgLightLit(true, t);
      if (lit && !wasLit) {
        flashes++;
      }
      wasLit = lit;
    }
    expect(flashes).toBe(2);
  });

  it('stays dark in takeoff and landing, flashes again after', () => {
    // FWS phases 3 to 7 (takeoff) and 9 to 10 (landing)
    for (const phase of [3, 4, 5, 6, 7, 9, 10]) {
      expect(isAtcMsgLightLit(true, 0, phase)).toBe(false);
    }
    // taxi out, cruise, taxi in
    for (const phase of [2, 8, 11]) {
      expect(isAtcMsgLightLit(true, 0, phase)).toBe(true);
    }
  });

  // The lamp codes are run through the RPN interpreter: the XML is data the systems host drives, not a unit under test
  const lampCodes = (xml: string) => {
    const codes: string[] = [];
    const seq1Code = /<SEQ1_CODE>([^<]*ATC_MSG[^<]*)<\/SEQ1_CODE>/g;
    let match: RegExpExecArray | null;
    while ((match = seq1Code.exec(xml)) !== null) {
      codes.push(match[1]);
    }
    return codes;
  };

  it('is what the glareshield ATC MSG pbs show, not the steady waiting flag', () => {
    const glareshield = readFileSync(resolve(__dirname, COCKPIT_MODEL, 'behaviour/glareshield.xml'), 'utf-8');
    const lamps = lampCodes(glareshield);
    expect(lamps).toHaveLength(2);
    for (const lamp of lamps) {
      expect(runRpn(lamp, { [ATC_MSG_LIGHT_VAR]: 1 }).value).toBe(1);
      expect(runRpn(lamp, { [ATC_MSG_LIGHT_VAR]: 0, 'L:A32NX_DCDU_ATC_MSG_WAITING': 1 }).value).toBe(0);
    }
  });

  it('no lamp of the shared legacy cockpit template follows the steady waiting flag', () => {
    const legacy = readFileSync(
      resolve(__dirname, COCKPIT_MODEL, 'behaviour/legacy/generated/A32NX_Interior_Misc.xml'),
      'utf-8',
    );
    const lamps = lampCodes(legacy);
    expect(lamps.length).toBeGreaterThan(0);
    for (const lamp of lamps) {
      expect(runRpn(lamp, { [ATC_MSG_LIGHT_VAR]: 0, 'L:A32NX_DCDU_ATC_MSG_WAITING': 1 }).value).toBe(0);
    }
  });
});
