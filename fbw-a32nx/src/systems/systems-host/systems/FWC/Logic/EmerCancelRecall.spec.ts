// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
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

const hold = (pb: RecallPushbutton, seconds: number) => {
  const pulses: number[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.1) {
    if (pb.update(true, 0.1)) {
      pulses.push(t);
    }
  }
  return pulses.length;
};

/* A320 FCOM DSC-31-30 (3) RCL pb, a320_fcom.txt l.46754-46766 */
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

  it('shows NORMAL for 3 s when there is no alert to recall (l.46763)', () => {
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

/* A320 FCOM DSC-31-30 (7) EMER CANC pb, l.46809-46823 */
describe('EMER CANC pb', () => {
  const caution = (key: string) => ({ key, level: 2 });
  const warning = (key: string) => ({ key, level: 3 });

  it('stops the aurals and MASTER WARN of the warnings while they sound (l.46811-46813)', () => {
    expect(emerCancelAction(true, [warning('W'), caution('C')])).toEqual({ kind: 'silenceWarnings' });
  });

  it('otherwise cancels the first caution of the E/WD, one per press (l.46815-46816, design choice)', () => {
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

  it('RCL for more than 3 s restores the cancelled cautions; the active ones come back (l.46820-46821)', () => {
    const memory = new EmerCancelMemory();
    memory.cancelCaution('C1');
    memory.cancelCaution('C2');
    expect(memory.restoreCancelledCautions((key) => key === 'C2')).toEqual(['C2']);
    expect(memory.isCancelledCaution('C1')).toBe(false);
    expect(memory.cancelledCautions).toEqual([]);
  });

  it('restores them automatically in phase 1 or 2 once IRs 1 and 2 are aligned (l.46821-46823)', () => {
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

/* A320 FCOM DSC-31-20 l.46193 "(5) Cancelled caution: White", l.46221-46222 blank line between blocks */
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

describe('PseudoFWC wiring', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');

  it('reads the EMER CANC pulse (before, it was computed and never read)', () => {
    expect(fwc).toContain('this.emergencyCancel();');
    expect(fwc).toMatch(/if \(this\.emerCancel\.isCancelledCaution\(key\)\) \{\s+continue;/);
  });

  it('overrides the flight phase inhibition after a long RCL press only, also for the alerts', () => {
    expect(fwc).toContain('this.flightPhaseInhibitOverrideNode.write(this.ecpRecallLongPress,');
    expect(fwc).not.toContain('this.flightPhaseInhibitOverrideNode.write(this.ecpRecallPulseUp,');
    expect(fwc).toMatch(/newWarning &&\s+!this\.flightPhaseInhibitOverrideNode\.read\(\) &&/);
  });

  it('shows NORMAL on a RCL press with nothing to recall and the CANCELLED CAUTION on the STATUS page', () => {
    expect(fwc).toContain('this.recallNormalMessage.show();');
    expect(fwc).toContain('[RECALL_NORMAL_MEMO_CODE]');
    expect(fwc).toContain('this.statusNormal.set(statusEmpty && cancelledCautions.length === 0);');
  });
});
