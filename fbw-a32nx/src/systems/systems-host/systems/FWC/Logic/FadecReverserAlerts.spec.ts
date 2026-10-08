// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { EwdMessageCodeOrder } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import {
  ThrustLeverRating,
  fadecFaultLines,
  fadecFaultStatus,
  fadecHiTempLines,
  isReverserFaultShown,
  isShownInTakeoffUnlessAutoIdle,
  reverseUnlockedLines,
  reverseUnlockedStatus,
  reverserFaultInopSys,
  revPressurizedLines,
  thrustLeverDisagreeLines,
  thrustLeverFaultLines,
  thrustLeverStatus,
} from './FadecReverserAlerts';

const TAXI = 2;
const TAKEOFF_ROLL_ABOVE_80_KT = 4;
const INITIAL_CLIMB = 5;
const CRUISE = 6;
const APPROACH = 7;
const AFTER_TOUCHDOWN = 8;

describe('FADEC, thrust lever and reverser alert phases', () => {
  it('inhibits THR LEVER FAULT / DISAGREE and REVERSE UNLOCKED in phases 4 and 5 unless the FADEC selects idle', () => {
    expect(isShownInTakeoffUnlessAutoIdle(true, TAKEOFF_ROLL_ABOVE_80_KT, false)).toBe(false);
    expect(isShownInTakeoffUnlessAutoIdle(true, INITIAL_CLIMB, false)).toBe(false);
    expect(isShownInTakeoffUnlessAutoIdle(true, INITIAL_CLIMB, true)).toBe(true);
    expect(isShownInTakeoffUnlessAutoIdle(true, CRUISE, false)).toBe(true);
    expect(isShownInTakeoffUnlessAutoIdle(false, CRUISE, true)).toBe(false);
  });

  it('inhibits REVERSER FAULT in phases 3, 4 and 5 unless the FADEC selects idle', () => {
    expect(isReverserFaultShown(true, 3, false)).toBe(false);
    expect(isReverserFaultShown(true, INITIAL_CLIMB, true)).toBe(true);
    expect(isReverserFaultShown(true, TAXI, false)).toBe(true);
    expect(isReverserFaultShown(true, AFTER_TOUCHDOWN, false)).toBe(true);
  });
});

describe('ENG FADEC FAULT', () => {
  it('asks for the lever not above idle on ground, then the parameters check', () => {
    expect(fadecFaultLines(TAXI, false)).toEqual([0, 1, 3, 4, 5]);
  });

  it('asks for the lever at idle in flight until it is at idle', () => {
    expect(fadecFaultLines(CRUISE, false)).toEqual([0, 2, 3, 4, 5]);
    expect(fadecFaultLines(CRUISE, true)).toEqual([0, 3, 4, 5]);
  });

  it('shows THR LVR NOT ABOVE IDLE on the STATUS on ground only', () => {
    expect(fadecFaultStatus(2, true)).toEqual(['700400051']);
    expect(fadecFaultStatus(2, false)).toEqual([]);
  });
});

describe('ENG FADEC HI TEMP', () => {
  it('shuts the engine down on the ground', () => {
    expect(fadecHiTempLines(TAXI, false, false)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fadecHiTempLines(TAXI, true, true)).toEqual([0, 1, 3, 5]);
  });

  it('checks the parameters in flight', () => {
    expect(fadecHiTempLines(CRUISE, false, true)).toEqual([0, 1, 6, 7, 2, 3]);
  });
});

describe('ENG THR LEVER FAULT', () => {
  const inputs = { flightPhase: CRUISE, rating: ThrustLeverRating.Climb, thrLeverIdle: false, athrEngaged: true };

  it('keeps the A/THR on at CLB', () => {
    expect(thrustLeverFaultLines(inputs)).toEqual([0, 3]);
  });

  it('warns of the high power in manual thrust, and before slats in for a frozen takeoff thrust', () => {
    expect(thrustLeverFaultLines({ ...inputs, athrEngaged: false })).toEqual([0, 4]);
    expect(thrustLeverFaultLines({ ...inputs, rating: ThrustLeverRating.TakeOff, athrEngaged: false })).toEqual([
      0, 4, 5, 6, 7,
    ]);
  });

  it('shows ENG AT IDLE and the lever line when the FADEC selects idle', () => {
    expect(thrustLeverFaultLines({ ...inputs, flightPhase: APPROACH, rating: ThrustLeverRating.Idle })).toEqual([
      0, 1, 2,
    ]);
    expect(
      thrustLeverFaultLines({ ...inputs, flightPhase: TAXI, rating: ThrustLeverRating.Idle, thrLeverIdle: true }),
    ).toEqual([0, 1]);
  });

  it('puts WHEN SLATS OUT: ENG AT IDLE, REVERSER and ENG THR on the STATUS', () => {
    const status = thrustLeverStatus(1, true, ThrustLeverRating.Climb);
    expect(status.left).toEqual(['700500050', '700400052']);
    expect(status.inopSys).toEqual(['780300001', '730300001']);
    const page = formatStatusPage(status.left, status.inopSys);
    expect(page.left).toContain('WHEN SLATS OUT:');
    expect(page.left).toContain('ENG 1 AT IDLE');
    expect(page.right).toContain('REVERSER 1');
    expect(page.right).toContain('ENG 1 THR');
  });

  it('drops WHEN SLATS OUT once the engine is at idle', () => {
    expect(thrustLeverStatus(2, true, ThrustLeverRating.Idle).left).toEqual([]);
  });
});

describe('ENG THR LEVER DISAGREE', () => {
  const inputs = { flightPhase: CRUISE, rating: ThrustLeverRating.Climb, thrLeverIdle: false, athrEngaged: false };

  it('gives CLB as the maximum power and asks for the A/THR', () => {
    expect(thrustLeverDisagreeLines(inputs)).toEqual([0, 4, 6]);
    expect(thrustLeverDisagreeLines({ ...inputs, athrEngaged: true })).toEqual([0, 4, 5]);
  });

  it('keeps the takeoff thrust during the takeoff', () => {
    expect(thrustLeverDisagreeLines({ ...inputs, rating: ThrustLeverRating.TakeOff })).toEqual([0, 3]);
  });

  it('is idle power only on ground and at idle in approach', () => {
    expect(thrustLeverDisagreeLines({ ...inputs, flightPhase: TAXI, rating: ThrustLeverRating.Idle })).toEqual([
      0, 1, 2,
    ]);
    expect(thrustLeverDisagreeLines({ ...inputs, flightPhase: APPROACH, rating: ThrustLeverRating.Idle })).toEqual([
      0, 7, 2,
    ]);
  });

  it('puts the CLB and ground idle limitations and ENG THR (no REVERSER) on the STATUS', () => {
    const status = thrustLeverStatus(2, false, ThrustLeverRating.Climb);
    expect(status.left).toEqual(['700500050', '700400053', '700400055', '700400057']);
    expect(status.inopSys).toEqual(['730300002']);
  });
});

describe('ENG REVERSE UNLOCKED', () => {
  it('limits the speed in flight and shuts the engine down if buffet', () => {
    expect(reverseUnlockedLines(CRUISE, true, false)).toEqual([0, 1, 2, 4, 5, 6, 3]);
    expect(reverseUnlockedLines(CRUISE, true, true)).toEqual([0, 1, 4, 5, 6, 3]);
  });

  it('shows ENG AT IDLE only when the FADEC sets the idle', () => {
    expect(reverseUnlockedLines(CRUISE, false, true)).toEqual([0, 4, 5, 6, 3]);
  });

  it('shuts the engine down on ground', () => {
    expect(reverseUnlockedLines(TAXI, true, true)).toEqual([0, 1, 3]);
  });

  it('puts MAX SPEED 300/.78 on the STATUS in flight', () => {
    expect(reverseUnlockedStatus(false)).toEqual(['700400058']);
    expect(formatStatusPage(reverseUnlockedStatus(false), []).left).toContain('MAX SPEED.......300/.78');
    expect(reverseUnlockedStatus(true)).toEqual([]);
  });
});

describe('ENG REVERSER FAULT and REV PRESSURIZED', () => {
  it('lists the reverser as inoperative', () => {
    expect(reverserFaultInopSys(2)).toEqual(['780300002']);
  });

  it('asks for the lever at idle in flight and not above idle on ground', () => {
    expect(revPressurizedLines(CRUISE, false)).toEqual([0, 1]);
    expect(revPressurizedLines(CRUISE, true)).toEqual([0]);
    expect(revPressurizedLines(TAXI, true)).toEqual([0, 2]);
  });
});

describe('PseudoFWC wiring of the FADEC, thrust lever and reverser alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const block = (key: string) => {
    const start = fwc.indexOf(`    ${key}: {`);
    expect(start, key).toBeGreaterThan(0);
    return fwc.slice(start, fwc.indexOf('\n    },', start));
  };
  const alertKeys = [
    '7700501',
    '7700502',
    '7700503',
    '7700504',
    '7700511',
    '7700512',
    '7700521',
    '7700522',
    '7700531',
    '7700532',
    '7700541',
    '7700542',
    '7700551',
    '7700552',
    '7700561',
    '7700562',
    '7700571',
    '7700572',
  ];

  it('has amber cautions on the ENG page, every line of which has a message', () => {
    for (const key of alertKeys) {
      const alert = block(key);
      expect(alert, key).toContain('failure: 2,');
      expect(alert, key).toContain('sysPage: EcamSysPage.ENG,');
      for (const code of alert.match(/'7700\d{5}'/g) ?? []) {
        expect(EwdMessageCodeOrder.has(code.slice(1, -1)), code).toBe(true);
      }
    }
  });

  it('uses the FCOM flight phase inhibitions', () => {
    expect(block('7700501')).toContain('flightPhaseInhib: [3, 4, 5, 7, 8],');
    expect(block('7700511')).toContain('flightPhaseInhib: [4, 5, 7, 8],');
    expect(block('7700521')).toContain('flightPhaseInhib: [3, 4, 5, 7, 8],');
    expect(block('7700551')).toContain('flightPhaseInhib: [8],');
    expect(block('7700571')).toContain('flightPhaseInhib: [4, 5, 8],');
  });

  it('calls LAND ASAP (amber) with THR LEVER FAULT and REVERSE UNLOCKED', () => {
    const landAsap = block("'0000360'");
    expect(landAsap).toContain('this.thrLeverFaultShown[0],');
    expect(landAsap).toContain('this.reverseUnlockedShown[1],');
  });
});
