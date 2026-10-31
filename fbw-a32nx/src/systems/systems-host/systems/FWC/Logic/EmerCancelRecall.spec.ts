// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { CANCELLED_CAUTION_STATUS_CODE, formatStatusPage } from '@shared/StatusMessages';
import { formatEwdMessages } from '@shared/EwdMessages';
import {
  EmerCancelMemory,
  IrAlignmentRestore,
  RECALL_NORMAL_MEMO_CODE,
  RECALL_NORMAL_SECONDS,
  RecallPushbutton,
  TimedMessage,
  cancelledCautionStatusCodes,
  emerCancelAction,
  isIrAligned,
  isNothingToRecall,
} from './EmerCancelRecall';
import { PseudoFWC } from '../PseudoFWC';
import { createFwc, installFwcSimVarMocks, runFwc, setHealthyCruise, writtenEwdLines } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name), and the last value it wrote to each simvar */
let simvars: Map<string, number>;
let writes: Map<string, unknown>;

beforeEach(() => {
  ({ simvars, writes } = installFwcSimVarMocks());
});

const hold = (pb: RecallPushbutton, seconds: number) => {
  const pulses: number[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.1) {
    if (pb.update(true, 0.1)) {
      pulses.push(t);
    }
  }
  return pulses.length;
};

/* RCL pb */
describe('RCL pb', () => {
  it('held for more than 3 s gives one long press, a short press none', () => {
    const pb = new RecallPushbutton();
    expect(hold(pb, 2.5)).toBe(0);
    pb.update(false, 0.1);
    expect(hold(pb, 3.5)).toBe(1);
    // still held: no second long press until released
    expect(hold(pb, 5)).toBe(0);
    pb.update(false, 0.1);
    expect(hold(pb, 3.2)).toBe(1);
  });

  it('shows NORMAL for 3 s when there is no alert to recall', () => {
    expect(isNothingToRecall(0, 0)).toBe(true);
    expect(isNothingToRecall(1, 0)).toBe(false);
    expect(isNothingToRecall(0, 1)).toBe(false);
    const normal = new TimedMessage(RECALL_NORMAL_SECONDS);
    expect(normal.isShown).toBe(false);
    normal.show();
    normal.update(2.9);
    expect(normal.isShown).toBe(true);
    normal.update(0.2);
    expect(normal.isShown).toBe(false);
    expect(formatEwdMessages([RECALL_NORMAL_MEMO_CODE])[0]).toContain('NORMAL');
  });
});

/* EMER CANC pb */
describe('EMER CANC pb', () => {
  const caution = (key: string) => ({ key, level: 2 });
  const warning = (key: string) => ({ key, level: 3 });

  it('stops the aurals and MASTER WARN of the warnings while they sound', () => {
    expect(emerCancelAction(true, [warning('W'), caution('C')])).toEqual({ kind: 'silenceWarnings' });
  });

  it('otherwise cancels the first caution of the E/WD, one per press', () => {
    expect(emerCancelAction(false, [warning('W'), caution('C1'), caution('C2')])).toEqual({
      kind: 'cancelCaution',
      key: 'C1',
    });
    expect(emerCancelAction(false, [{ key: 'L1', level: 1 }])).toEqual({ kind: 'cancelCaution', key: 'L1' });
    expect(emerCancelAction(false, [warning('W')])).toEqual({ kind: 'none' });
    expect(emerCancelAction(false, [])).toEqual({ kind: 'none' });
  });

  it('a cancelled caution stays cancelled for the rest of the flight, even when it goes and comes back', () => {
    const memory = new EmerCancelMemory();
    memory.cancelCaution('C1');
    memory.forgetInactiveWarnings([]);
    expect(memory.isCancelledCaution('C1')).toBe(true);
    expect(memory.isCancelledCaution('C2')).toBe(false);
  });

  it('a silenced warning sounds again once triggered a second time', () => {
    const memory = new EmerCancelMemory();
    memory.silenceWarnings(['W']);
    memory.forgetInactiveWarnings(['W']);
    expect(memory.isSilencedWarning('W')).toBe(true);
    memory.forgetInactiveWarnings([]);
    expect(memory.isSilencedWarning('W')).toBe(false);
  });

  it('RCL for more than 3 s restores the cancelled cautions; the active ones come back', () => {
    const memory = new EmerCancelMemory();
    memory.cancelCaution('C1');
    memory.cancelCaution('C2');
    expect(memory.restoreCancelledCautions((key) => key === 'C2')).toEqual(['C2']);
    expect(memory.isCancelledCaution('C1')).toBe(false);
    expect(memory.cancelledCautions).toEqual([]);
  });

  it('restores them automatically in phase 1 or 2 once IRs 1 and 2 are aligned', () => {
    const restore = new IrAlignmentRestore();
    expect(restore.update(2, true, false)).toBe(false);
    expect(restore.update(2, true, true)).toBe(true);
    expect(restore.update(2, true, true)).toBe(false);
    const inFlight = new IrAlignmentRestore();
    inFlight.update(6, false, false);
    expect(inFlight.update(6, true, true)).toBe(false);
  });

  it('IR aligned: normal operation, NAV mode and alignment ready (IR maintenance word)', () => {
    expect(isIrAligned(true, false, true)).toBe(true);
    expect(isIrAligned(true, true, true)).toBe(false);
    expect(isIrAligned(true, false, false)).toBe(false);
    expect(isIrAligned(false, false, true)).toBe(false);
  });
});

/* STATUS page: the cancelled cautions in white, a blank line between blocks */
describe('STATUS CANCELLED CAUTION', () => {
  it('the FWC sends the CANCELLED CAUTION code then the E/WD titles', () => {
    expect(cancelledCautionStatusCodes([])).toEqual([]);
    expect(cancelledCautionStatusCodes(['361100101', undefined])).toEqual([CANCELLED_CAUTION_STATUS_CODE, '361100101']);
  });

  it('the SD shows the title and the cancelled caution in white, after the other left lines', () => {
    const page = formatStatusPage(
      ['700200001', CANCELLED_CAUTION_STATUS_CODE, '361100101', '000000000'],
      ['360300001'],
    );
    expect(page.normal).toBe(false);
    const lines = page.left.split('\r');
    expect(lines).toEqual([
      '\x1b<3mONE PACK ONLY IF WAI ON',
      '',
      '\x1b<7m\x1b4mCANCELLED CAUTION\x1bm',
      '\x1b<7mAIR ENG 1 BLEED FAULT',
    ]);
  });

  it('a page with only a cancelled caution is not NORMAL', () => {
    const page = formatStatusPage([CANCELLED_CAUTION_STATUS_CODE, '361101301'], []);
    expect(page.normal).toBe(false);
    expect(page.left).toBe('\x1b<7m\x1b4mCANCELLED CAUTION\x1bm\r\x1b<7mAIR APU BLEED FAULT');
  });
});

describe('the real PseudoFWC with the EMER CANC and RCL pbs', () => {
  const L_AFT_CABIN_DOOR_ALERT = '5200103';
  const L_AFT_CABIN_DOOR_TITLE = '520010301';
  /** The door sensor of the L AFT cabin door: any opening is a door not closed */
  const L_AFT_CABIN_DOOR_OPEN = 'INTERACTIVE POINT OPEN:2';
  const FLIGHT_PHASE_INHIBITING_DOORS = 4;

  /**
   * Holds a pb of the ECP (the hardwired discrete the FWC reads), then releases it
   * @param whileHeld what to check before the release: a long RCL press also brings the alerts of the flight phase
   * inhibition, which fill the E/WD once the pb is released
   */
  const pressButton = (bus: EventBus, fwc: PseudoFWC, discrete: string, seconds: number, whileHeld = () => {}) => {
    bus.getPublisher<any>().pub(discrete, true, false, true);
    runFwc(fwc, seconds);
    whileHeld();
    bus.getPublisher<any>().pub(discrete, false, false, true);
    runFwc(fwc, 1);
  };
  const leftMemos = () => writtenEwdLines(writes, 'LEFT');
  const statusPageShowsCancelledCaution = () =>
    Array.from(writes.entries()).some(
      ([name, value]) => name.includes('STATUS_LEFT_LINE') && value === CANCELLED_CAUTION_STATUS_CODE,
    );

  it('cancels the displayed caution with EMER CANC (also on the STATUS page) until a long RCL press restores it', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    runFwc(fwc, 2);
    simvars.set(L_AFT_CABIN_DOOR_OPEN, 40);
    runFwc(fwc, 3);
    expect(leftMemos()).toContain(L_AFT_CABIN_DOOR_TITLE);
    expect(statusPageShowsCancelledCaution()).toBe(false);

    pressButton(bus, fwc, 'a32nx_ecp_discrete_out_emer_canc', 0.2);
    expect(fwc.ewdMessageFailures[L_AFT_CABIN_DOOR_ALERT].simVarIsActive.get()).toBe(true);
    expect(leftMemos()).not.toContain(L_AFT_CABIN_DOOR_TITLE);
    expect(statusPageShowsCancelledCaution()).toBe(true);
    expect(writes.get('L:A32NX_ECAM_STATUS_NORMAL')).toBe(false);

    // a short RCL press does not bring it back, a long one does
    const isCancelled = () => (fwc as any).emerCancel.isCancelledCaution(L_AFT_CABIN_DOOR_ALERT);
    pressButton(bus, fwc, 'a32nx_ecp_discrete_out_rcl', 0.2);
    expect(isCancelled()).toBe(true);
    expect(statusPageShowsCancelledCaution()).toBe(true);
    pressButton(bus, fwc, 'a32nx_ecp_discrete_out_rcl', 3.5, () => {
      expect(isCancelled()).toBe(false);
    });
    expect(statusPageShowsCancelledCaution()).toBe(false);
  });

  it('overrides the flight phase inhibition after a long RCL press only', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    simvars.set('L:A32NX_FWC_FLIGHT_PHASE', FLIGHT_PHASE_INHIBITING_DOORS);
    runFwc(fwc, 2);
    simvars.set(L_AFT_CABIN_DOOR_OPEN, 40);
    runFwc(fwc, 3);
    expect(leftMemos()).not.toContain(L_AFT_CABIN_DOOR_TITLE);

    pressButton(bus, fwc, 'a32nx_ecp_discrete_out_rcl', 0.2);
    expect(leftMemos()).not.toContain(L_AFT_CABIN_DOOR_TITLE);

    pressButton(bus, fwc, 'a32nx_ecp_discrete_out_rcl', 3.5, () =>
      expect(leftMemos()).toContain(L_AFT_CABIN_DOOR_TITLE),
    );
  });

  it('shows NORMAL for 3 s on a RCL press with nothing to recall', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    runFwc(fwc, 2);
    const shownNormal = () =>
      [...writtenEwdLines(writes, 'LEFT'), ...writtenEwdLines(writes, 'RIGHT')].includes(RECALL_NORMAL_MEMO_CODE);
    expect(shownNormal()).toBe(false);
    bus.getPublisher<any>().pub('a32nx_ecp_discrete_out_rcl', true, false, true);
    runFwc(fwc, 0.5);
    bus.getPublisher<any>().pub('a32nx_ecp_discrete_out_rcl', false, false, true);
    runFwc(fwc, 1);
    expect(shownNormal()).toBe(true);
    runFwc(fwc, RECALL_NORMAL_SECONDS + 1);
    expect(shownNormal()).toBe(false);
  });
});
