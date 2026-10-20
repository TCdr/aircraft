// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320Failure } from '@failures';
import {
  SLAT_FLAP_COMPONENT_PHASE_INHIBITION,
  SLAT_FLAP_LOCK_PHASE_INHIBITION,
  SfccSystemStatusWord,
  SlatFlapFailuresSource,
  SlatFlapLockAlerts,
  SlatFlapLockInputs,
  SlatFlapLockKeys,
} from './SlatFlapLockAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements SlatFlapFailuresSource {
  public readonly registered: number[] = [];

  public readonly active = new Set<number>();

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(identifier: number): boolean {
    return this.active.has(identifier);
  }
}

/** An SFCC status word with the given bits set; an unpowered SFCC sends no word */
const sfccWord = (bits: number[] = [], powered = true): SfccSystemStatusWord => ({
  isNormalOperation: () => powered,
  bitValueOr: (bit, valueIfInvalid) => (powered ? bits.includes(bit) : valueIfInvalid),
});

const SLAT_FAULT = 11;
const FLAP_FAULT = 12;
const SLAT_WTB = 15;
const FLAP_WTB = 16;

/** FPPU angles: slats at 1 (222.27), flaps at 2 (145.51), 3 (168.35) and FULL (251.97) */
const SLATS_1 = 222.27;
const FLAPS_2 = 145.51;
const FLAPS_3 = 168.35;
const FLAPS_FULL = 251.97;

const inputs = (overrides: Partial<SlatFlapLockInputs>): SlatFlapLockInputs => ({
  sfcc1: sfccWord(),
  sfcc2: sfccWord(),
  slatsFppuAngle: 0,
  flapsFppuAngle: 0,
  ...overrides,
});

const alertsWith = (overrides: Partial<SlatFlapLockInputs>, failures = new TestFailures()) => {
  const alerts = new SlatFlapLockAlerts(failures);
  alerts.init();
  alerts.update(inputs(overrides));
  return alerts;
};

const activeKeys = (alerts: SlatFlapLockAlerts) =>
  Object.keys(alerts.ewdFailures).filter((key) => alerts.ewdFailures[key].simVarIsActive.get());

const status = (alerts: SlatFlapLockAlerts, key: string) => {
  const item = alerts.ewdFailures[key];
  return statusLines({ left: item.statusInfo(), inopSys: item.inopSys() });
};

describe('F/CTL slat and flap fault and locked cautions', () => {
  it('shows nothing without a fault', () => {
    expect(activeKeys(alertsWith({ flapsFppuAngle: FLAPS_2, slatsFppuAngle: SLATS_1 }))).toEqual([]);
  });

  it('shows FLAPS FAULT when both flap channels have failed, not with one', () => {
    const one = alertsWith({ sfcc1: sfccWord([FLAP_FAULT]), slatsFppuAngle: SLATS_1, flapsFppuAngle: FLAPS_2 });
    expect(activeKeys(one)).toEqual([]);

    const both = alertsWith({
      sfcc1: sfccWord([FLAP_FAULT]),
      sfcc2: sfccWord([FLAP_FAULT]),
      slatsFppuAngle: SLATS_1,
      flapsFppuAngle: FLAPS_2,
    });
    expect(activeKeys(both)).toEqual([SlatFlapLockKeys.flaps]);
    const item = both.ewdFailures[SlatFlapLockKeys.flaps];
    expect(ewdLines(item)).toEqual([
      'F/CTL FLAPS FAULT',
      ' MAX SPEED......VFE NEXT',
      ' -FLAPS LEVER....RECYCLE',
      ' FUEL CONSUMPT INCRSD',
      ' FMS PRED UNRELIABLE',
    ]);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual(SLAT_FLAP_LOCK_PHASE_INHIBITION);
    expect(status(both, SlatFlapLockKeys.flaps)).toEqual({
      left: [
        'APPR PROC:',
        'FOR LDG......USE FLAP 3',
        'GPWS FLAP MODE......OFF',
        'APPR SPD.........SEE QRH',
        'LDG DIST PROC....APPLY',
        'ENG 1 APPR IDLE ONLY',
        'ENG 2 APPR IDLE ONLY',
        'FUEL CONSUMPT INCRSD',
        'FMS PRED UNRELIABLE',
      ],
      right: ['INOP SYS', 'FLAPS'],
    });
  });

  it('shows FLAPS LOCKED with the wing tip brake lines and no RECYCLE when the flap wing tip brakes are on', () => {
    const alerts = alertsWith({ sfcc2: sfccWord([FLAP_WTB]), slatsFppuAngle: SLATS_1, flapsFppuAngle: FLAPS_3 });
    expect(activeKeys(alerts)).toEqual([SlatFlapLockKeys.flaps]);
    expect(ewdLines(alerts.ewdFailures[SlatFlapLockKeys.flaps])).toEqual([
      'F/CTL FLAPS LOCKED',
      ' WING TIP BRK ON OR',
      ' ALIGNMENT FAULT',
      ' MAX SPEED......VFE NEXT',
      ' FUEL CONSUMPT INCRSD',
      ' FMS PRED UNRELIABLE',
    ]);
    // Flaps at 3: GPWS LDG FLAP 3 instead of GPWS FLAP MODE OFF, no APPR IDLE (LOCKED is not a FAULT)
    expect(status(alerts, SlatFlapLockKeys.flaps).left).toEqual([
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'GPWS LDG FLAP 3......ON',
      'APPR SPD.........SEE QRH',
      'LDG DIST PROC....APPLY',
      'FUEL CONSUMPT INCRSD',
      'FMS PRED UNRELIABLE',
    ]);
  });

  it('keeps CONF FULL when the flaps stopped beyond 3', () => {
    const alerts = alertsWith({ sfcc1: sfccWord([FLAP_WTB]), slatsFppuAngle: 334.16, flapsFppuAngle: FLAPS_FULL });
    expect(status(alerts, SlatFlapLockKeys.flaps).left.slice(0, 3)).toEqual([
      'APPR PROC:',
      'FLAPS.....KEEP CONF FULL',
      'GPWS LDG FLAP 3......ON',
    ]);
  });

  it('shows SLATS FAULT with both slat channels failed and SLATS LOCKED with the slat wing tip brakes on', () => {
    const fault = alertsWith({
      sfcc1: sfccWord([SLAT_FAULT]),
      sfcc2: sfccWord([SLAT_FAULT]),
      slatsFppuAngle: SLATS_1,
      flapsFppuAngle: FLAPS_2,
    });
    expect(activeKeys(fault)).toEqual([SlatFlapLockKeys.slats]);
    expect(ewdLines(fault.ewdFailures[SlatFlapLockKeys.slats])).toEqual([
      'F/CTL SLATS FAULT',
      ' MAX SPEED......VFE NEXT',
      ' -FLAPS LEVER....RECYCLE',
      ' FUEL CONSUMPT INCRSD',
      ' FMS PRED UNRELIABLE',
    ]);
    expect(status(fault, SlatFlapLockKeys.slats)).toEqual({
      left: [
        'APPR PROC:',
        'FOR LDG......USE FLAP 3',
        'GPWS LDG FLAP 3......ON',
        'APPR SPD.........SEE QRH',
        'LDG DIST PROC....APPLY',
        'FUEL CONSUMPT INCRSD',
        'FMS PRED UNRELIABLE',
      ],
      right: ['INOP SYS', 'SLATS'],
    });

    // Slats locked retracted: no aerodynamic penalty
    const locked = alertsWith({ sfcc1: sfccWord([SLAT_WTB]), flapsFppuAngle: FLAPS_2 });
    expect(activeKeys(locked)).toEqual([SlatFlapLockKeys.slats]);
    expect(ewdLines(locked.ewdFailures[SlatFlapLockKeys.slats])).toEqual([
      'F/CTL SLATS LOCKED',
      ' WING TIP BRK ON',
      ' MAX SPEED......VFE NEXT',
    ]);
  });

  it('shows SLATS AND FLAPS FAULT IN CONF 0 instead of both faults with the surfaces retracted', () => {
    const alerts = alertsWith({
      sfcc1: sfccWord([SLAT_FAULT, FLAP_FAULT]),
      sfcc2: sfccWord([SLAT_FAULT, FLAP_FAULT]),
    });
    expect(activeKeys(alerts)).toEqual([SlatFlapLockKeys.slatsAndFlapsFaultInConf0]);
    const item = alerts.ewdFailures[SlatFlapLockKeys.slatsAndFlapsFaultInConf0];
    expect(ewdLines(item)).toEqual(['F/CTL SLATS AND FLAPS FAULT', '      IN CONF 0', ' -FLAPS LEVER....RECYCLE']);
    expect(status(alerts, SlatFlapLockKeys.slatsAndFlapsFaultInConf0)).toEqual({
      left: [
        'MAX SPEED........320 KT',
        'APPR PROC:',
        'FOR LDG......USE FLAP 1',
        'GPWS FLAP MODE......OFF',
        'APPR SPD.....VREF+60 KT',
        'AT 300 FT AGL:',
        'TARGET SPD...VREF+50 KT',
        'LDG DIST PROC....APPLY',
        'ENG 1 APPR IDLE ONLY',
        'ENG 2 APPR IDLE ONLY',
      ],
      right: ['INOP SYS', 'SLATS', 'FLAPS'],
    });

    // Out of CONF 0 both cautions show
    const extended = alertsWith({
      sfcc1: sfccWord([SLAT_FAULT, FLAP_FAULT]),
      sfcc2: sfccWord([SLAT_FAULT, FLAP_FAULT]),
      slatsFppuAngle: SLATS_1,
    });
    expect(activeKeys(extended)).toEqual([SlatFlapLockKeys.slats, SlatFlapLockKeys.flaps]);
  });

  it('shows nothing from unpowered SFCCs', () => {
    expect(activeKeys(alertsWith({ sfcc1: sfccWord([], false), sfcc2: sfccWord([], false) }))).toEqual([]);
  });
});

describe('F/CTL slat and flap component cautions', () => {
  const cases = [
    [A320Failure.SlatWingTipBrake, SlatFlapLockKeys.slatTipBrakeFault, 'F/CTL SLAT TIP BRK FAULT'],
    [A320Failure.FlapWingTipBrake, SlatFlapLockKeys.flapTipBrakeFault, 'F/CTL FLAP TIP BRK FAULT'],
    [A320Failure.FlapAttachmentSensor, SlatFlapLockKeys.flapAttachSensor, 'F/CTL FLAP ATTACH SENSOR'],
  ] as const;

  it('registers the failures of the monitored parts', () => {
    const failures = new TestFailures();
    alertsWith({}, failures);
    expect(failures.registered).toEqual([
      A320Failure.SlatWingTipBrake,
      A320Failure.FlapWingTipBrake,
      A320Failure.FlapAttachmentSensor,
    ]);
  });

  it.each(cases)('failure %i raises %s while an SFCC is powered, a crew awareness caution', (failure, key, title) => {
    const failures = new TestFailures();
    failures.active.add(failure);
    const alerts = alertsWith({ sfcc1: sfccWord([], false) }, failures);
    expect(activeKeys(alerts)).toEqual([key]);
    const item = alerts.ewdFailures[key];
    expect(ewdLines(item)).toEqual([title]);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual(SLAT_FLAP_COMPONENT_PHASE_INHIBITION);
    expect(item.statusInfo()).toEqual([]);

    failures.active.delete(failure);
    alerts.update(inputs({}));
    expect(activeKeys(alerts)).toEqual([]);
  });

  it('shows no component caution with both SFCCs unpowered', () => {
    const failures = new TestFailures();
    cases.forEach(([failure]) => failures.active.add(failure));
    const alerts = alertsWith({ sfcc1: sfccWord([], false), sfcc2: sfccWord([], false) }, failures);
    expect(activeKeys(alerts)).toEqual([]);
  });
});

describe('PseudoFWC wiring of the slat and flap cautions', () => {
  it('adds the items, registers the failures and updates them from the SFCC words and the FPPU angles', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.slatFlapLockAlerts.ewdFailures,');
    expect(fwc).toContain('this.slatFlapLockAlerts.init();');
    expect(fwc).toMatch(/this\.slatFlapLockAlerts\.update\(\{\s+sfcc1: sfcc1SystemStatusWord,/);
  });
});
