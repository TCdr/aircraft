// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { discreteWordWithBits, probedFailure, startCruiseFwc } from '../FwcControlsAlertProbe';
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

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/* F/CTL ALTN LAW: MAX SPEED 320 KT (320/.77 with a dual hydraulic low pressure), SPD BRK DO NOT USE only with a
   left or right elevator fault. */
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

/* F/CTL DIRECT LAW: USE SPD BRK WITH CARE, no SPD BRK DO NOT USE. */
describe('F/CTL DIRECT LAW lines', () => {
  it('shows the procedure lines and no contradicting SPD BRK DO NOT USE', () => {
    const text = shownText('2700365', 8, directLawLines(false));
    expect(text).toContain('MAX SPEED.......320/.77');
    expect(text).toContain('-MAN PITCH TRIM.....USE');
    expect(text).toContain('MANEUVER WITH CARE');
    expect(text).toContain('USE SPD BRK WITH CARE');
    expect(text).not.toContain('DO NOT USE');
  });

  /* No MAN PITCH TRIM USE with the green and yellow systems at low pressure: the THS has no hydraulic power. */
  it('drops MAN PITCH TRIM USE when the green and yellow hydraulic systems are both at low pressure', () => {
    const text = shownText('2700365', 8, directLawLines(true));
    expect(text).not.toContain('MAN PITCH TRIM');
    expect(text).toContain('MAX SPEED.......320/.77');
    expect(text).toContain('MANEUVER WITH CARE');
    expect(text).toContain('USE SPD BRK WITH CARE');
  });
});

/* F/CTL ELAC 1(2) FAULT: the procedure ends with FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE. */
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
    const rig = startCruiseFwc();
    const shownLines = (key: string) => probedFailure(rig.fwc, key).whichCodeToReturn();
    const ELAC_1_INVALID_BIT = 23;
    const ELAC_2_INVALID_BIT = 24;
    const ELAC_1_SIDESTICK_ONLY_BIT = 19;
    const bothFcdcs = (word: number, bits: number[]) => {
      for (const fcdc of [1, 2]) {
        rig.simvars.set(`L:A32NX_FCDC_${fcdc}_DISCRETE_WORD_${word}`, discreteWordWithBits(...bits));
      }
    };

    // ELAC 1 and ELAC 2 failed: both give the full procedure; with the word 3 bit 19 only the title for ELAC 1
    bothFcdcs(1, [ELAC_1_INVALID_BIT, ELAC_2_INVALID_BIT]);
    rig.run(3);
    expect(shownLines('2700110')).toEqual(elacFaultLines(true));
    expect(shownLines('2700120')).toEqual(elacFaultLines(true));
    // all servojacks available (bits 11 to 18), so that no elevator is lost
    bothFcdcs(3, [11, 12, 13, 14, 15, 16, 17, 18, ELAC_1_SIDESTICK_ONLY_BIT]);
    rig.run(1);
    expect(shownLines('2700110')).toEqual(elacFaultLines(false));
    expect(shownLines('2700120')).toEqual(elacFaultLines(true));

    // ALTN LAW and DIRECT LAW follow the green and yellow low pressure
    const altnAndDirectLines = () => [shownLines('2700375'), shownLines('2700390'), shownLines('2700365')];
    expect(altnAndDirectLines()).toEqual([
      altnLawLines(false, false),
      altnLawLines(false, false),
      directLawLines(false),
    ]);
    rig.simvars.set('L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH', 0);
    rig.simvars.set('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH', 0);
    rig.run(3);
    expect(altnAndDirectLines()).toEqual([altnLawLines(true, false), altnLawLines(true, false), directLawLines(true)]);
    expect(directLawLines(true)).not.toEqual(directLawLines(false));
    expect(altnLawLines(true, false)).not.toEqual(altnLawLines(false, false));
  });
});
