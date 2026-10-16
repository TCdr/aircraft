// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  wingTankLowLevelLines,
  WingTankLowLevelInputs,
  wingTankLowLevelStatus,
  wingTanksLowLevelLines,
  WingTanksLowLevelInputs,
} from './WingTankLowLevel';
import { pseudoFwcItem } from './FwcAlertSpecHelpers';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

const inputs: WingTankLowLevelInputs = {
  modeSelMan: false,
  centreTankEmpty: false,
  crossFeedOn: false,
  pump1On: true,
  pump2On: true,
};

const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

/* A320 FCOM PRO-ABN-FUEL FUEL L (R) WING TK LO LVL: "If center tank not empty: FUEL MODE SEL ... MAN". */
describe('FUEL L(R) WING TK LO LVL lines', () => {
  it.each(['2800130', '2800140'])('%s: FUEL MODE SEL MAN with fuel in the centre tank', (prefix) => {
    expect(text(prefix, wingTankLowLevelLines(inputs))).toContain('-FUEL MODE SEL......MAN');
  });

  it.each(['2800130', '2800140'])('%s: no FUEL MODE SEL line with an empty centre tank', (prefix) => {
    const lines = text(prefix, wingTankLowLevelLines({ ...inputs, centreTankEmpty: true }));
    expect(lines).not.toContain('MODE SEL');
    expect(lines).toContain('-FUEL X FEED.........ON');
  });

  it('no FUEL MODE SEL line once it is at MAN', () => {
    expect(text('2800130', wingTankLowLevelLines({ ...inputs, modeSelMan: true }))).not.toContain('MODE SEL');
  });

  it('hides the done actions', () => {
    const lines = text(
      '2800130',
      wingTankLowLevelLines({ ...inputs, crossFeedOn: true, pump1On: false, pump2On: false }),
    );
    expect(lines).not.toContain('X FEED');
    expect(lines).not.toContain('TK PUMP');
  });
});

/* A320 FCOM PRO-ABN-FUEL FUEL L (R) WING TK LO LVL STATUS: INOP SYS TK PUMPS; if center tank not empty: CTR TK FEED: MAN
   ONLY. */
describe('FUEL L(R) WING TK LO LVL STATUS', () => {
  it('INOP SYS L TK PUMPS and CTR TK FEED: MAN ONLY with fuel in the centre tank', () => {
    const status = wingTankLowLevelStatus('L', false);
    const page = formatStatusPage(status.info, status.inopSys);
    expect(page.left).toBe('\x1b<3mCTR TK FEED: MAN ONLY');
    expect(page.right).toContain('\x1b<4mL TK PUMPS');
  });

  it('no CTR TK FEED line with an empty centre tank; R side gives R TK PUMPS', () => {
    const status = wingTankLowLevelStatus('R', true);
    const page = formatStatusPage(status.info, status.inopSys);
    expect(page.left).toBe('');
    expect(page.right).toContain('\x1b<4mR TK PUMPS');
  });

  it('PseudoFWC gives both alerts their STATUS', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    for (const [id, side] of [
      ['2800130', 'L'],
      ['2800140', 'R'],
    ]) {
      const start = fwc.indexOf(`    ${id}: {`);
      const block = fwc.slice(start, fwc.indexOf('\n    },', start));
      expect(block).toContain(`inopSys: () => wingTankLowLevelStatus('${side}', this.centerTankEmpty.get()).inopSys`);
      expect(block).toContain(`statusInfo: () => wingTankLowLevelStatus('${side}', this.centerTankEmpty.get()).info`);
    }
  });
});

/* A320 FCOM PRO-ABN-FUEL FUEL L + R WING TK LO LVL, jet pump variant (a320_fcom.txt l.86536-86569, FCOM PDF page 5316):
   "LAND ASAP" (amber), "FUEL MODE SEL (IF CENTER TANK NOT EMPTY) ... MAN", "ALL TK PUMPS ... ON", "CTR TK L+R XFR ... ON",
   "IF NO FUEL LEAK: FUEL X FEED ... ON", "IF GRVTY FEED: FUEL X FEED ... OFF". */
describe('FUEL L+R WING TK LO LVL lines', () => {
  const lrInputs: WingTanksLowLevelInputs = {
    modeSelMan: false,
    centreTankEmpty: false,
    leftPump1On: true,
    leftPump2On: true,
    rightPump1On: true,
    rightPump2On: true,
    centreLeftTransferOn: false,
    centreRightTransferOn: false,
  };

  it('asks for MODE SEL MAN and CTR TK L+R XFR ON, never for the CTR TK PUMPs of the other variant', () => {
    const lines = text('2800145', wingTanksLowLevelLines(lrInputs));
    expect(lines).toContain('-FUEL MODE SEL......MAN');
    expect(lines).toContain('-CTR TK L XFR........ON');
    expect(lines).toContain('-CTR TK R XFR........ON');
    expect(lines).not.toContain('CTR TK PUMP');
    expect(lines).toContain('-FUEL X FEED.........ON');
    expect(lines).toContain('-FUEL X FEED........OFF');
  });

  it('no MODE SEL line with an empty centre tank or once at MAN', () => {
    expect(text('2800145', wingTanksLowLevelLines({ ...lrInputs, centreTankEmpty: true }))).not.toContain('MODE SEL');
    expect(text('2800145', wingTanksLowLevelLines({ ...lrInputs, modeSelMan: true }))).not.toContain('MODE SEL');
  });

  it('drives the L and R transfer lines on their own pb-sw', () => {
    const lines = text('2800145', wingTanksLowLevelLines({ ...lrInputs, centreLeftTransferOn: true }));
    expect(lines).not.toContain('CTR TK L XFR');
    expect(lines).toContain('-CTR TK R XFR........ON');
  });

  it('asks for the wing tank pumps that are off only', () => {
    const lines = text('2800145', wingTanksLowLevelLines({ ...lrInputs, leftPump2On: false }));
    expect(lines).toContain('-L TK PUMP 2.........ON');
    expect(lines).not.toContain('L TK PUMP 1');
  });

  it('PseudoFWC uses these lines, and the alert gives the amber LAND ASAP', () => {
    expect(pseudoFwcItem('2800145')).toContain('wingTanksLowLevelLines(');
    expect(pseudoFwcItem('0000360')).toContain('this.lrTankLow');
  });
});
