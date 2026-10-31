// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { createFws, procedureItemNames } from './FwsSpecFixture';

const { core } = createFws();
const sensed = (id: string) => core.abnormalSensed.ewdAbnormalSensed[Number(id)];
const nonSensed = (id: string) => core.abnormalNonSensed.ewdAbnormalNonSensed[Number(id)];

/* The ticked lines are found by their text: the lines of the shared procedure may move */
function checkedOnly(procedureId: string, lineText: string): boolean[] {
  const names = procedureItemNames(procedureId);
  expect(names).toContain(lineText);
  return names.map((name) => name === lineText);
}

describe('FUEL LEAK procedure outcome', () => {
  const entries: [string, () => ReturnType<typeof sensed>][] = [
    ['281800073 FUEL LEAK DETECTED', () => sensed('281800073')],
    ['280900002 ABN PROC FUEL LEAK', () => nonSensed('280900002')],
  ];

  it.each(entries)('%s: ticking LEAK STOPS removes FUEL PARTLY UNUSABLE', (name, entry) => {
    const id = name.split(' ')[0];
    expect(entry().limitationsAllPhases?.(procedureItemNames(id).map(() => false))).toEqual(['2', '280400001']);
    expect(entry().limitationsAllPhases?.(checkedOnly(id, 'LEAK STOPS'))).toEqual(['2', null]);
  });

  it.each(entries)('%s: ticking LEAK CONTINUES shows MIN FUEL USABLE', (name, entry) => {
    const id = name.split(' ')[0];
    expect(entry().info?.(procedureItemNames(id).map(() => false))).toEqual([]);
    expect(entry().info?.(checkedOnly(id, 'LEAK CONTINUES'))).toEqual(['280200001', '280200002']);
  });
});

describe('ENG 2 FIRE timer', () => {
  it('the agent 1 discharge timer line uses the ENG 2 discharge time stamp', () => {
    vi.spyOn(core.fireEng1Agent1Discharge10sTimeStamp, 'get').mockReturnValue(null);
    vi.spyOn(core.fireEng2Agent1Discharge10sTimeStamp, 'get').mockReturnValue(4242);
    expect(sensed('260800006').whichItemsTimer?.()).toContain(4242);
  });
});

describe('transfer pump FAULT alerts are not raised by the pumps a procedure orders OFF', () => {
  const MAN_XFR = '281800074';
  const WINGS_MAN_BALANCING = '281800099';
  const FQI_FAULT = '281800045';
  const OUTR_TK_XFR_FAULT = '281800079';
  const TRIM_AND_APU_LINES_FAULT = '281800087';
  const TRIM_TK_XFR_FAULT = '281800094';
  const FUEL_LEAK = '281800073';

  it.each([
    ['281800068', 'L OUTR TK PMP', [FQI_FAULT, OUTR_TK_XFR_FAULT, FUEL_LEAK]],
    ['281800069', 'R OUTR TK PMP', [FQI_FAULT, OUTR_TK_XFR_FAULT, FUEL_LEAK]],
    ['281800063', 'L INR TK FWD PMP', [FUEL_LEAK]],
    ['281800065', 'R INR TK FWD PMP', [FUEL_LEAK]],
    ['281800058', 'L INR TK AFT PMP', [MAN_XFR, WINGS_MAN_BALANCING, FUEL_LEAK]],
    ['281800060', 'R INR TK AFT PMP', [MAN_XFR, WINGS_MAN_BALANCING, FUEL_LEAK]],
    ['281800056', 'L INR TK FWD+AFT PMPs', [FUEL_LEAK]],
    ['281800057', 'R INR TK FWD+AFT PMPs', [FUEL_LEAK]],
    ['281800062', 'L MID TK FWD PMP', [FUEL_LEAK]],
    ['281800064', 'R MID TK FWD PMP', [FUEL_LEAK]],
    ['281800059', 'L MID TK AFT PMP', [WINGS_MAN_BALANCING, FUEL_LEAK]],
    ['281800061', 'R MID TK AFT PMP', [WINGS_MAN_BALANCING, FUEL_LEAK]],
    ['281800066', 'L MID TK FWD+AFT PMPs', [FUEL_LEAK]],
    ['281800067', 'R MID TK FWD+AFT PMPs', [FUEL_LEAK]],
    ['281800089', 'TRIM TK L PMP', [TRIM_AND_APU_LINES_FAULT, TRIM_TK_XFR_FAULT, FUEL_LEAK]],
    ['281800090', 'TRIM TK R PMP', [TRIM_AND_APU_LINES_FAULT, TRIM_TK_XFR_FAULT, FUEL_LEAK]],
    ['281800091', 'TRIM TK L+R PMPs', [TRIM_AND_APU_LINES_FAULT, TRIM_TK_XFR_FAULT, FUEL_LEAK]],
  ])('%s %s', (id, _name, orderingProcedures) => {
    const suppressedBy = sensed(id).notActiveWhenItemActive ?? [];
    for (const procedure of orderingProcedures) {
      expect(suppressedBy).toContain(procedure);
    }
  });
});
