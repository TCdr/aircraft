// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatStatusPage, orderStatusCodes } from '../../../../shared/src/StatusMessages';
import { StatusLines } from './CondStatus';
import {
  FlightControlStatusCodes,
  aileronFaultStatus,
  altnLawStatus,
  directLawStatus,
  elac12FaultStatus,
  elacFaultStatus,
  elacPitchFaultStatus,
  elevServoFaultStatus,
  elevatorFaultStatus,
  fcdc12FaultStatus,
  fcdcFaultStatus,
  leftAndRightElevatorFaultStatus,
  secFaultStatus,
  spoilerFaultStatus,
} from './FlightControlStatus';

/** The STATUS page of a set of active alerts, as the FWC builds it (codes merged, each shown once) */
function page(...alerts: StatusLines[]) {
  const texts = formatStatusPage(
    alerts.flatMap((alert) => alert.left),
    alerts.flatMap((alert) => alert.inopSys),
  );
  const lines = (column: string) =>
    // eslint-disable-next-line no-control-regex
    column === '' ? [] : column.split('\r').map((line) => line.replace(/\x1b<\dm|\x1b4m|\x1bm/g, ''));
  return { left: lines(texts.left), right: lines(texts.right) };
}

const ALL_STATUS: StatusLines[] = [
  altnLawStatus(false, false, false),
  altnLawStatus(true, true, true),
  directLawStatus(),
  elacFaultStatus(1),
  elacFaultStatus(2),
  elac12FaultStatus(),
  elacPitchFaultStatus(true),
  elevServoFaultStatus(),
  elevatorFaultStatus('L'),
  elevatorFaultStatus('R'),
  leftAndRightElevatorFaultStatus(),
  aileronFaultStatus('L'),
  aileronFaultStatus('R'),
  spoilerFaultStatus([true, true, true, true, true]),
  spoilerFaultStatus([true, false, true, false, false]),
  spoilerFaultStatus([false, true, false, true, false]),
  secFaultStatus(true, true, true),
  fcdcFaultStatus(1),
  fcdcFaultStatus(2),
  fcdc12FaultStatus(),
];

describe('F/CTL STATUS codes', () => {
  it('every code exists in StatusMessages', () => {
    const codes = ALL_STATUS.flatMap((status) => [...status.left, ...status.inopSys]);
    expect(orderStatusCodes(codes)).toEqual(orderStatusCodes([...new Set(codes)]));
    expect(new Set(orderStatusCodes(codes))).toEqual(new Set(codes));
  });

  it('every F/CTL code is used and its text fits the STATUS column (24 characters)', () => {
    const used = new Set(ALL_STATUS.flatMap((status) => [...status.left, ...status.inopSys]));
    for (const code of Object.values(FlightControlStatusCodes)) {
      expect(used.has(code)).toBe(true);
    }
    const { left, right } = page(...ALL_STATUS);
    [...left, ...right].forEach((line) => expect(line.length).toBeLessThanOrEqual(24));
  });
});

describe('F/CTL ALTN LAW STATUS', () => {
  it('MAX SPEED 320 KT, the approach procedure, ALTN LAW: PROT LOST, WHEN L/G DN: DIRECT LAW; INOP SYS F/CTL PROT', () => {
    expect(page(altnLawStatus(false, false, false))).toEqual({
      left: [
        'MAX SPEED........320 KT',
        'APPR PROC:',
        'FOR LDG......USE FLAP 3',
        'GPWS LDG FLAP 3......ON',
        'APPR SPD.....VREF+10 KT',
        'LDG DIST PROC....APPLY',
        'ALTN LAW: PROT LOST',
        'WHEN L/G DN: DIRECT LAW',
      ],
      right: ['INOP SYS', 'F/CTL PROT'],
    });
  });

  it('320/.77 with dual hydraulic low pressure, SPD BRK DO NOT USE with an elevator fault, AP OFF variant', () => {
    const { left } = page(altnLawStatus(true, true, true));
    expect(left.slice(0, 2)).toEqual(['MAX SPEED.......320/.77', 'SPD BRK......DO NOT USE']);
    expect(left.slice(-2)).toEqual(['WHEN L/G DN AND AP OFF:', 'DIRECT LAW']);
    expect(left).not.toContain('MAX SPEED........320 KT');
  });
});

describe('F/CTL DIRECT LAW STATUS', () => {
  it('shows the procedure lines', () => {
    expect(page(directLawStatus()).left).toEqual([
      'MAX SPEED.......320/.77',
      'MANEUVER WITH CARE',
      'USE SPD BRK WITH CARE',
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'GPWS LDG FLAP 3......ON',
      'MAN PITCH TRIM......USE',
      'APPR SPD.....VREF+10 KT',
      'LDG DIST PROC....APPLY',
      'DIRECT LAW',
    ]);
  });
});

describe('F/CTL ELAC STATUS', () => {
  it('ELAC 1 FAULT: CAT 3 SINGLE ONLY, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE; ELAC 1 then CAT 3 DUAL', () => {
    expect(page(elacFaultStatus(1))).toEqual({
      left: ['CAT 3 SINGLE ONLY', 'FUEL CONSUMPT INCRSD', 'FMS PRED UNRELIABLE'],
      right: ['INOP SYS', 'ELAC 1', 'CAT 3 DUAL'],
    });
  });

  it('ELAC 1+2 FAULT with its ALTN LAW: each line once, the limitations before the information', () => {
    const { left, right } = page(elac12FaultStatus(), altnLawStatus(false, false, false));
    expect(left).toEqual([
      'MAX SPEED........320 KT',
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'GPWS LDG FLAP 3......ON',
      'APPR SPD.....VREF+10 KT',
      'LDG DIST PROC....APPLY',
      'ALTN LAW: PROT LOST',
      'WHEN L/G DN: DIRECT LAW',
      'FUEL CONSUMPT INCRSD',
      'FMS PRED UNRELIABLE',
    ]);
    expect(right).toEqual(['INOP SYS', 'F/CTL PROT', 'L+R AIL', 'ELAC 1+2', 'AP 1+2', 'CAT 2']);
  });

  it('ELAC PITCH in INOP SYS only with both ELAC PITCH FAULTs', () => {
    expect(page(elacPitchFaultStatus(false)).right).toEqual(['INOP SYS', 'CAT 3 DUAL']);
    expect(page(elacPitchFaultStatus(true)).right).toEqual(['INOP SYS', 'ELAC PITCH', 'CAT 3 DUAL']);
  });
});

describe('F/CTL elevator and aileron STATUS', () => {
  it('L ELEV FAULT', () => {
    const { left, right } = page(elevatorFaultStatus('L'));
    expect(left.slice(0, 4)).toEqual([
      'MAX SPEED........320 KT',
      'MANEUVER WITH CARE',
      'SPD BRK......DO NOT USE',
      'FOR GA: MAX PITCH 15 DEG',
    ]);
    expect(right).toEqual(['INOP SYS', 'F/CTL PROT', 'L ELEV', 'ELAC PITCH', 'AP 1+2', 'CAT 2']);
  });

  it('L+R ELEV FAULT', () => {
    const { left, right } = page(leftAndRightElevatorFaultStatus());
    expect(left).toContain('MAN PITCH TRIM......USE');
    expect(left.slice(-2)).toEqual(['PITCH MECH BACK UP', 'ROLL DIRECT LAW']);
    expect(right).toEqual(['INOP SYS', 'L+R ELEV', 'ELAC PITCH', 'AP 1+2', 'CAT 2']);
  });

  it('R AIL FAULT', () => {
    expect(page(aileronFaultStatus('R'))).toEqual({
      left: ['FUEL CONSUMPT INCRSD', 'FMS PRED UNRELIABLE'],
      right: ['INOP SYS', 'R AIL'],
    });
  });

  it('ELEV SERVO FAULT', () => {
    expect(page(elevServoFaultStatus())).toEqual({ left: ['CAT 3 SINGLE ONLY'], right: ['INOP SYS', 'CAT 3 DUAL'] });
  });
});

describe('F/CTL SEC and spoiler STATUS', () => {
  it('SEC 1 FAULT: SPD BRK DO NOT USE, LDG DIST PROC; SPLR 3+4, SEC 1', () => {
    expect(page(secFaultStatus(true, false, false))).toEqual({
      left: ['SPD BRK......DO NOT USE', 'LDG DIST PROC....APPLY'],
      right: ['INOP SYS', 'SPLR 3+4', 'SEC 1'],
    });
  });

  it('SEC 1 + 2: REVERSER 1 and AUTO BRK; SEC 1 + 3: REVERSER 2', () => {
    expect(page(secFaultStatus(true, true, false)).right).toEqual([
      'INOP SYS',
      'SPLR 3+4',
      'SPLR 5',
      'SEC 1',
      'SEC 2',
      'AUTO BRK',
      'REVERSER 1',
    ]);
    expect(page(secFaultStatus(true, false, true)).right).toContain('REVERSER 2');
    expect(page(secFaultStatus(false, true, true)).right).not.toContain('REVERSER 1');
  });

  it('SEC 1 + 2 + 3: FOR LDG USE FLAP 3 and APPR SPD VREF+10 KT', () => {
    const { left } = page(secFaultStatus(true, true, true));
    expect(left).toEqual([
      'SPD BRK......DO NOT USE',
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'APPR SPD.....VREF+10 KT',
      'LDG DIST PROC....APPLY',
    ]);
  });

  it('SPLR FAULT: the SEC pair in one line, SPD BRK when spoilers 2+3+4 are affected', () => {
    expect(page(spoilerFaultStatus([false, false, true, true, false]))).toEqual({
      left: ['SPD BRK......DO NOT USE'],
      right: ['INOP SYS', 'SPLR 3+4'],
    });
    expect(page(spoilerFaultStatus([false, true, true, false, false])).right).toEqual([
      'INOP SYS',
      'SPLR 2',
      'SPLR 3',
      'SPD BRK',
    ]);
    expect(page(spoilerFaultStatus([true, false, false, false, false]))).toEqual({
      left: [],
      right: ['INOP SYS', 'SPLR 1'],
    });
  });

  it('FCDC 1+2 FAULT: F/CTL INDICATIONS LOST; FCDC 1+2', () => {
    expect(page(fcdc12FaultStatus())).toEqual({ left: ['F/CTL INDICATIONS LOST'], right: ['INOP SYS', 'FCDC 1+2'] });
  });
});

describe('PseudoFWC STATUS wiring', () => {
  const pseudoFwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf8');
  const entry = (key: string) => {
    const start = pseudoFwc.indexOf(`    ${key}: {`);
    expect(start).toBeGreaterThan(0);
    return pseudoFwc.slice(start, pseudoFwc.indexOf('\n    },', start));
  };

  it.each([
    ['2700110', 'FctlStatus.elacFaultStatus(1)'],
    ['2700120', 'FctlStatus.elacFaultStatus(2)'],
    ['2700210', 'this.secFaultStatus()'],
    ['2700220', 'this.secFaultStatus()'],
    ['2700230', 'this.secFaultStatus()'],
    ['2700360', 'FctlStatus.fcdc12FaultStatus()'],
    ['2700365', 'FctlStatus.directLawStatus()'],
    ['2700375', 'this.altnLawStatus()'],
    ['2700390', 'this.altnLawStatus()'],
    ['2700400', 'FctlStatus.leftAndRightElevatorFaultStatus()'],
    ['2701010', 'FctlStatus.elac12FaultStatus()'],
    ['2701050', "FctlStatus.elevatorFaultStatus('L')"],
    ['2701080', "FctlStatus.aileronFaultStatus('L')"],
  ])('%s gives its STATUS (%s)', (key, status) => {
    expect(entry(key)).toContain(`inopSys: () => ${status}.inopSys`);
    expect(entry(key)).toContain(`statusInfo: () => ${status}.left`);
  });

  it.each([
    ['2700555', 'FctlStatus.fcdcFaultStatus(1)'],
    ['2700557', 'FctlStatus.fcdcFaultStatus(2)'],
  ])('%s gives its INOP SYS (%s)', (key, status) => {
    expect(entry(key)).toContain(`inopSys: () => ${status}.inopSys`);
  });
});
