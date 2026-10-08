// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { altnLawLines, directLawLines, elacFaultLines } from './FlightControlLawAlerts';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';

/** The E/WD text of the shown lines of an alert */
const shownText = (prefix: string, count: number, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`)
      .slice(0, count),
  ).join(' | ');

/* A320 FCOM PRO-ABN-F_CTL F/CTL ALTN LAW: MAX SPEED 320 KT (320/.77 if dual hydraulic system low pressure),
   SPD BRK (IF L OR R ELEVATOR FAULT) DO NOT USE. */
describe('F/CTL ALTN LAW lines', () => {
  it.each(['2700390', '2700375'])('%s: MAX SPEED 320 KT, no MANEUVER WITH CARE, no SPD BRK line', (prefix) => {
    const text = shownText(prefix, 7, altnLawLines(false, false));
    expect(text).toContain('MAX SPEED........320 KT');
    expect(text).not.toContain('320/.77');
    expect(text).not.toContain('MANEUVER WITH CARE');
    expect(text).not.toContain('SPD BRK');
    expect(text).not.toContain('MAX FL');
  });

  it('MAX SPEED 320/.77 with a dual hydraulic low pressure', () => {
    const text = shownText('2700390', 7, altnLawLines(true, false));
    expect(text).toContain('MAX SPEED.......320/.77');
    expect(text).not.toContain('320 KT');
  });

  it('SPD BRK DO NOT USE only with an L or R elevator fault', () => {
    expect(shownText('2700390', 7, altnLawLines(false, true))).toContain('SPD BRK......DO NOT USE');
  });
});

/* A320 FCOM PRO-ABN-F_CTL F/CTL DIRECT LAW: USE SPD BRK WITH CARE, no SPD BRK DO NOT USE. */
describe('F/CTL DIRECT LAW lines', () => {
  it('shows the FCOM lines and no contradicting SPD BRK DO NOT USE', () => {
    const text = shownText('2700365', 8, directLawLines());
    expect(text).toContain('MAX SPEED.......320/.77');
    expect(text).toContain('-MAN PITCH TRIM.....USE');
    expect(text).toContain('MANEUVER WITH CARE');
    expect(text).toContain('USE SPD BRK WITH CARE');
    expect(text).not.toContain('DO NOT USE');
  });
});

/* A320 FCOM PRO-ABN-F_CTL F/CTL ELAC 1(2) FAULT: the procedure ends with FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE. */
describe('F/CTL ELAC 1(2) FAULT lines', () => {
  it.each(['2700110', '2700120'])('%s: shows FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE', (prefix) => {
    const text = shownText(prefix, 6, elacFaultLines(true));
    expect(text).toContain('OFF THEN ON');
    expect(text).toContain('FUEL CONSUMPT INCRSD');
    expect(text).toContain('FMS PRED UNRELIABLE');
  });

  it('shows the title only in the sidestick transducer case (no procedure)', () => {
    expect(elacFaultLines(false)).toEqual([0, null, null, null, null, null]);
  });

  it('PseudoFWC uses the rules for both ELACs, both ALTN LAW alerts and DIRECT LAW', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc.match(/whichCodeToReturn: \(\) => elacFaultLines\(/g)).toHaveLength(2);
    expect(fwc.match(/whichCodeToReturn: \(\) => altnLawLines\(/g)).toHaveLength(2);
    expect(fwc).toContain('whichCodeToReturn: () => directLawLines()');
  });
});
