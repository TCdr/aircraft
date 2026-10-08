// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { wingTankLowLevelLines, WingTankLowLevelInputs, wingTankLowLevelStatus } from './WingTankLowLevel';
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
