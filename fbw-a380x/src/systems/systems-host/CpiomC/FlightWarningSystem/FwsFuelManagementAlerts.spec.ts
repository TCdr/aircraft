// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import { fuelQuantitySystemFaults } from '@shared/FuelQuantityMeasurement';
import {
  FUEL_MANAGEMENT_ALERT_IDS,
  FUEL_MANAGEMENT_PHASE_INHIBITION,
  FuelManagementAlerts,
  fuelManagementAbnormalItems,
  FuelManagementInputs,
  readFuelManagementInputs,
} from './FwsFuelManagementAlerts';
import { TrimTankFeedSelector } from './FwsFuelCgWeightAlerts';
import {
  EcamAbnormalProcedures,
  EcamInfos,
  EcamInopSys,
  EcamLimitations,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

/** Title (without the FUEL prefix codes) and item names of an ata28.ts alert */
function alert(key: number): { title: string; items: string[] } {
  const procedure = EcamAbnormalProcedures[key];
  expect(procedure).toBeDefined();
  const title = procedure.title.replace('\x1b<4m\x1b4mFUEL\x1bm ', '');
  return { title, items: procedure.items.map((item) => item.name) };
}

const FQMS_1 = 1 << 0;
const FQMS_2 = 1 << 1;
const FQDC_1 = 1 << 2;
const FQDC_2 = 1 << 3;
const AGP_1 = 1 << 4;
const AGP_2 = 1 << 5;
/** Tank bits in the A380FuelTankType order */
const TANK_BIT = { LEFT_OUTER: 1, FEED_1: 2, FEED_2: 16, FEED_3: 32, FEED_4: 256, TRIM: 1024 };

/** Inputs of a normal aircraft in cruise */
function normal(): FuelManagementInputs {
  return {
    quantitySystemFaults: fuelQuantitySystemFaults(0),
    fqiLostTanksWord: 0,
    gaugingDegradedTanksWord: 0,
    manualTransferRequired: false,
    outerGravityTransferInProgress: false,
    fwdGalleryInletValveOpen: false,
    aftGalleryInletValveOpen: false,
    trimTankIsolationValveClosed: false,
    trimAndApuLineDamaged: false,
    outerTankPumpFailed: [false, false],
    outerXfrMan: false,
    midXfrMan: false,
    innerXfrMan: false,
    trimXfrFwd: false,
    trimTankFeed: TrimTankFeedSelector.Auto,
    emerOuterXfrOn: false,
    outerPumpPbOn: [true, true],
    trimPumpPbOn: [true, true],
    innerAftPumpPbOn: [true, true],
    midAftPumpPbOn: [true, true],
    feedMainPbOn: [true, true, true, true],
    feedStbyPbOn: [true, true, true, true],
    crossFeedPbOn: [false, false, false, false],
    apuMasterOn: false,
    feedKg: [20_000, 20_000, 20_000, 20_000],
    feedTankFull: [false, false, false, false],
    innerKg: [30_000, 30_000],
    midKg: [25_000, 25_000],
    outerKg: [8_000, 8_000],
    trimKg: 10_000,
    pitchDeg: 2,
    fqmsCgPercent: 38,
    wbbcCgPercent: 38,
    onGround: false,
    enginesRunning: 4,
  };
}

function alertsWith(inputs: Partial<FuelManagementInputs>, faultWord = 0): FuelManagementAlerts {
  const alerts = new FuelManagementAlerts();
  alerts.update({ ...normal(), quantitySystemFaults: fuelQuantitySystemFaults(faultWord), ...inputs }, 1);
  return alerts;
}

/** The alerts that are raised */
function raised(a: FuelManagementAlerts): string[] {
  const names: string[] = [];
  const add = (name: string, active: boolean) => active && names.push(name);
  add('FQDC 1', a.fqdcFault[0].get());
  add('FQDC 2', a.fqdcFault[1].get());
  add('FQI', a.fqiFault.get());
  add('FQMS 1', a.fqmsFault[0].get());
  add('FQMS 2', a.fqmsFault[1].get());
  add('FQMS 1+2', a.fqms12Fault.get());
  add('GAUGING', a.gaugingFault.get());
  add('SYS COMPONENT', a.sysComponentFault.get());
  add('MAN XFR', a.manXfrProcedure.get());
  add('WINGS MAN BALANCING', a.wingsManBalancing.get());
  add('NORM XFR', a.normXfrFault.get());
  add('NORM + ALTN XFR', a.normAltnXfrFault.get());
  add('OUTR TK XFR', a.outrTkXfrFault.get());
  add('TRIM TK XFR', a.trimTkXfrFault.get());
  add('TRIM TK GRVTY FWD XFR', a.trimTkGrvtyFwdXfrFault.get());
  add('TRIM & APU LINES', a.trimAndApuLinesFault.get());
  return names;
}

describe('FUEL quantity measurement alerts', () => {
  it('raises nothing on a normal aircraft', () => {
    expect(raised(alertsWith({}))).toEqual([]);
  });

  it.each([
    ['FQDC 1 (with its AGP)', FQDC_1 | AGP_1, ['FQDC 1']],
    ['FQDC 2 (with its AGP)', FQDC_2 | AGP_2, ['FQDC 2']],
    ['both FQDCs', FQDC_1 | FQDC_2 | AGP_1 | AGP_2, ['FQI', 'FQMS 1+2']],
    ['FQMS 1', FQMS_1, ['FQMS 1']],
    ['FQMS 2', FQMS_2, ['FQMS 2']],
    ['both FQMS', FQMS_1 | FQMS_2, ['FQMS 1+2']],
    ['the AGP of FQDC 1', AGP_1, ['SYS COMPONENT']],
    ['both AGPs', AGP_1 | AGP_2, ['FQMS 1+2']],
  ])('%s failed', (_name, word, expected) => {
    expect(raised(alertsWith({}, word))).toEqual(expected);
  });

  it('FQI FAULT with the quantity of one tank lost; all the feed tanks lost adds LAND ANSA', () => {
    const one = alertsWith({ fqiLostTanksWord: TANK_BIT.LEFT_OUTER });
    expect(raised(one)).toEqual(['FQI']);
    expect(one.allFeedTanksLost).toBe(false);
    const feeds = alertsWith({
      fqiLostTanksWord: TANK_BIT.FEED_1 | TANK_BIT.FEED_2 | TANK_BIT.FEED_3 | TANK_BIT.FEED_4,
      manualTransferRequired: true,
    });
    expect(feeds.allFeedTanksLost).toBe(true);
    const item = fuelManagementAbnormalItems(feeds)[FUEL_MANAGEMENT_ALERT_IDS.fqiFault];
    expect(item.limitationsAllPhases?.([])).toEqual(['2', '280400020', '280400021', '280400022']);
    expect(item.limitationsPfd?.([])).toEqual(['2']);
    expect(item.whichItemsToShow()[4]).toBe(true);
  });

  it('GAUGING FAULT with a degraded tank, not when its quantity is lost', () => {
    expect(raised(alertsWith({ gaugingDegradedTanksWord: TANK_BIT.TRIM }))).toEqual(['GAUGING']);
    expect(raised(alertsWith({ gaugingDegradedTanksWord: TANK_BIT.TRIM, fqiLostTanksWord: TANK_BIT.TRIM }))).toEqual([
      'FQI',
    ]);
  });
});

describe('FUEL MAN XFR PROCEDURE and WINGS MAN BALANCING PROCEDURE', () => {
  it('MAN XFR PROCEDURE when the FQMS requires manual transfers', () => {
    expect(raised(alertsWith({ manualTransferRequired: true }))).toEqual(['MAN XFR']);
  });

  it('shows the next manual transfer: inner tanks, then mid, outer and trim', () => {
    const shown = (inputs: Partial<FuelManagementInputs>) =>
      fuelManagementAbnormalItems(alertsWith({ manualTransferRequired: true, ...inputs }))
        [FUEL_MANAGEMENT_ALERT_IDS.manXfrProcedure].whichItemsToShow()
        .map((show, line) => (show ? line : -1))
        .filter((line) => line >= 0);
    expect(shown({})).toEqual([1, 2]);
    expect(shown({ innerXfrMan: true })).toEqual([3, 4]);
    expect(shown({ innerXfrMan: true, innerKg: [0, 2_000] })).toEqual([3, 4, 5]);
    expect(shown({ innerKg: [0, 0] })).toEqual([7, 8]);
    expect(shown({ innerKg: [0, 0], midKg: [0, 0] })).toEqual([11, 12]);
    expect(shown({ innerKg: [0, 0], midKg: [0, 0], outerKg: [0, 0] })).toEqual([13]);
    // An aft CG requires the forward trim tank transfer at once
    expect(shown({ wbbcCgPercent: 48.5 })).toEqual([1, 2, 13]);
  });

  it('the CG above 43 % for more than 5 min also requires the forward trim tank transfer', () => {
    const alerts = new FuelManagementAlerts();
    const inputs = { ...normal(), manualTransferRequired: true, wbbcCgPercent: 44 };
    alerts.update(inputs, 299);
    expect(alerts.cgRequiresTrimFwdXfr).toBe(false);
    alerts.update(inputs, 2);
    expect(alerts.cgRequiresTrimFwdXfr).toBe(true);
  });

  it('WINGS MAN BALANCING with the FQMS failed and a tank pair out of balance, until balanced', () => {
    const alerts = new FuelManagementAlerts();
    const unbalanced = { ...normal(), manualTransferRequired: true, innerKg: [30_000, 26_000] as [number, number] };
    alerts.update(unbalanced, 1);
    expect(alerts.wingsManBalancing.get()).toBe(true);
    const shown = fuelManagementAbnormalItems(alerts)[FUEL_MANAGEMENT_ALERT_IDS.wingsManBalancing].whichItemsToShow();
    // The INR TKs block, with the AFT PMP of the lighter right tank
    expect(shown.map((show, line) => (show ? line : -1)).filter((line) => line >= 0)).toEqual([19, 20, 21, 22, 24, 25]);
    alerts.update({ ...unbalanced, innerKg: [28_000, 27_000] }, 1);
    expect(alerts.wingsManBalancing.get()).toBe(true);
    alerts.update({ ...unbalanced, innerKg: [27_000, 27_000] }, 1);
    expect(alerts.wingsManBalancing.get()).toBe(false);
  });

  it('no WINGS MAN BALANCING while the FQMS balances the tanks itself', () => {
    expect(raised(alertsWith({ innerKg: [30_000, 26_000] }))).toEqual([]);
  });

  it('WINGS NOT BALANCED gives way to WINGS MAN BALANCING', () => {
    const { core } = createFws();
    expect(core.abnormalSensed.ewdAbnormalSensed['281800100'].notActiveWhenItemActive).toEqual([
      FUEL_MANAGEMENT_ALERT_IDS.wingsManBalancing.toString(),
    ]);
  });
});

describe('FUEL transfer fault alerts', () => {
  it('NORM XFR FAULT: the outer tank gravity transfer after a pump failure, or one transfer gallery lost', () => {
    expect(raised(alertsWith({ outerGravityTransferInProgress: true }))).toEqual(['NORM XFR']);
    expect(raised(alertsWith({ aftGalleryInletValveOpen: true }))).toEqual(['NORM XFR']);
    expect(raised(alertsWith({ fwdGalleryInletValveOpen: true }))).toEqual(['NORM XFR']);
  });

  it('NORM + ALTN XFR FAULT, without NORM XFR FAULT, with both galleries lost', () => {
    expect(raised(alertsWith({ fwdGalleryInletValveOpen: true, aftGalleryInletValveOpen: true }))).toEqual([
      'NORM + ALTN XFR',
    ]);
  });

  it('NORM XFR FAULT in flight: EMER OUTR TK XFR ON when the outer tanks go by gravity', () => {
    const alerts = alertsWith({ outerGravityTransferInProgress: true, feedKg: [12_000, 12_000, 12_000, 12_000] });
    const item = fuelManagementAbnormalItems(alerts)[FUEL_MANAGEMENT_ALERT_IDS.normXfrFault];
    expect(item.whichItemsToShow()).toEqual([false, false, true, true, true, true]);
    expect(item.whichItemsChecked()).toEqual([false, false, true, false, false, false]);
    const onGround = fuelManagementAbnormalItems(alertsWith({ onGround: true, fwdGalleryInletValveOpen: true }));
    expect(onGround[FUEL_MANAGEMENT_ALERT_IDS.normXfrFault].whichItemsToShow()).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('OUTR TK XFR FAULT: a pumped manual outer tank transfer with a failed outer tank pump, until back to AUTO', () => {
    const alerts = new FuelManagementAlerts();
    const failedPump = { ...normal(), outerTankPumpFailed: [true, false] as [boolean, boolean], outerXfrMan: true };
    alerts.update(failedPump, 1);
    expect(alerts.outrTkXfrFault.get()).toBe(true);
    // The pumps OFF for the gravity transfer: the alert stays, its lines are done
    alerts.update({ ...failedPump, outerPumpPbOn: [false, false] }, 1);
    expect(alerts.outrTkXfrFault.get()).toBe(true);
    const item = fuelManagementAbnormalItems(alerts)[FUEL_MANAGEMENT_ALERT_IDS.outrTkXfrFault];
    expect(item.whichItemsChecked().slice(0, 2)).toEqual([true, true]);
    alerts.update({ ...failedPump, outerXfrMan: false }, 1);
    expect(alerts.outrTkXfrFault.get()).toBe(false);
  });

  it('no OUTR TK XFR FAULT for a manual gravity transfer, nor with both outer pumps working', () => {
    expect(raised(alertsWith({ outerXfrMan: true }))).toEqual([]);
    expect(
      raised(alertsWith({ outerXfrMan: true, outerTankPumpFailed: [true, false], outerPumpPbOn: [false, true] })),
    ).toEqual([]);
  });

  it.each([
    ['the trim tank isolation valve closed', { trimTankIsolationValveClosed: true }],
    ['the trim tank isolated with fuel', { trimTankFeed: TrimTankFeedSelector.Isol }],
    ['the FQMS CG above 49.5 %', { fqmsCgPercent: 49.6 }],
  ])('TRIM TK XFR FAULT with %s', (_name, inputs) => {
    expect(raised(alertsWith(inputs as Partial<FuelManagementInputs>))).toEqual(['TRIM TK XFR']);
  });

  it('TRIM TK XFR FAULT: the CG limit is 48.5 % with one FQMS failed', () => {
    expect(raised(alertsWith({ fqmsCgPercent: 49 }))).toEqual([]);
    expect(raised(alertsWith({ fqmsCgPercent: 49 }, FQMS_2))).toEqual(['FQMS 2', 'TRIM TK XFR']);
  });

  it('TRIM TK XFR FAULT with the isolation valve closed in flight: the gravity transfer lines', () => {
    const item = fuelManagementAbnormalItems(alertsWith({ trimTankIsolationValveClosed: true }))[
      FUEL_MANAGEMENT_ALERT_IDS.trimTkXfrFault
    ];
    expect(item.whichItemsToShow()).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('TRIM TK GRVTY FWD XFR FAULT: TRIM TK FEED OPEN above 3° of pitch, until OPEN again below 3°', () => {
    const alerts = new FuelManagementAlerts();
    const open = { ...normal(), trimTankFeed: TrimTankFeedSelector.Open, pitchDeg: 4 };
    alerts.update(open, 1);
    expect(alerts.trimTkGrvtyFwdXfrFault.get()).toBe(true);
    alerts.update({ ...open, trimTankFeed: TrimTankFeedSelector.Auto }, 1);
    expect(alerts.trimTkGrvtyFwdXfrFault.get()).toBe(true);
    alerts.update({ ...open, trimTankFeed: TrimTankFeedSelector.Auto, pitchDeg: 2 }, 1);
    const item = fuelManagementAbnormalItems(alerts)[FUEL_MANAGEMENT_ALERT_IDS.trimTkGrvtyFwdXfrFault];
    expect(item.whichItemsToShow()).toEqual([false, false, true, true]);
    alerts.update({ ...open, pitchDeg: 2 }, 1);
    expect(alerts.trimTkGrvtyFwdXfrFault.get()).toBe(false);
  });

  it('TRIM & APU LINES FAULT from the line damage: TRIM TK FEED ISOL, the trim pumps and the APU OFF', () => {
    const alerts = alertsWith({ trimAndApuLineDamaged: true });
    expect(raised(alerts)).toEqual(['TRIM & APU LINES']);
    const item = fuelManagementAbnormalItems(alerts)[FUEL_MANAGEMENT_ALERT_IDS.trimAndApuLinesFault];
    expect(item.inopSysAllPhases?.([])).toEqual(['490300001']);
  });
});

describe('FUEL alert entries and the ata28.ts procedures', () => {
  const titles: [number, string][] = [
    [281800043, 'FQDC 1 FAULT'],
    [281800044, 'FQDC 2 FAULT'],
    [281800045, 'FQI FAULT'],
    [281800046, 'FQMS 1 FAULT'],
    [281800047, 'FQMS 2 FAULT'],
    [281800048, 'FQMS 1+2 FAULT'],
    [281800049, 'GAUGING FAULT'],
    [281800074, 'MAN XFR PROCEDURE'],
    [281800077, 'NORM + ALTN XFR FAULT'],
    [281800078, 'NORM XFR FAULT'],
    [281800079, 'OUTR TK XFR FAULT'],
    [281800085, 'SYS COMPONENT FAULT'],
    [281800087, 'TRIM & APU LINES FAULT'],
    [281800088, 'TRIM TK GRVTY FWD XFR FAULT'],
    [281800094, 'TRIM TK XFR FAULT'],
    [281800099, 'WINGS MAN BALANCING PROCEDURE'],
  ];

  it.each(titles)('%s is %s, with one shown and one checked flag per procedure line', (key, title) => {
    expect(alert(key).title).toBe(title);
    const lines = alert(key).items.length;
    for (const alerts of [new FuelManagementAlerts(), alertsWith({ manualTransferRequired: true })]) {
      const item = fuelManagementAbnormalItems(alerts)[key];
      expect(item).toBeDefined();
      expect(item.whichItemsToShow()).toHaveLength(lines);
      expect(item.whichItemsChecked()).toHaveLength(lines);
    }
  });

  it('every alert of the module has its entry', () => {
    expect(Object.keys(fuelManagementAbnormalItems(new FuelManagementAlerts())).map(Number).sort()).toEqual(
      titles.map(([key]) => key).sort(),
    );
  });

  it('every STATUS message id it uses exists', () => {
    const alerts = alertsWith({
      fqiLostTanksWord: TANK_BIT.FEED_1 | TANK_BIT.FEED_2 | TANK_BIT.FEED_3 | TANK_BIT.FEED_4,
      manualTransferRequired: true,
      enginesRunning: 0,
      fwdGalleryInletValveOpen: true,
      trimTankIsolationValveClosed: true,
      trimTankFeed: TrimTankFeedSelector.Isol,
      fqmsCgPercent: 50,
      quantitySystemFaults: fuelQuantitySystemFaults(FQMS_1 | FQMS_2 | AGP_1 | AGP_2),
    });
    const ids = new Set<string>();
    for (const item of Object.values(fuelManagementAbnormalItems(alerts))) {
      for (const status of [
        item.inopSysAllPhases,
        item.inopSysApprLdg,
        item.info,
        item.redundLoss,
        item.limitationsAllPhases,
        item.limitationsPfd,
      ]) {
        status?.([]).forEach((id) => id !== null && ids.add(id));
      }
    }
    expect(ids.size).toBeGreaterThan(20);
    for (const id of ids) {
      expect(
        [EcamInopSys, EcamInfos, EcamLimitations].some((table) => id in table),
        `message ${id}`,
      ).toBe(true);
    }
  });

  it('takes the flight phase inhibitions of the alert figures', () => {
    const items = fuelManagementAbnormalItems(new FuelManagementAlerts());
    const ids = FUEL_MANAGEMENT_ALERT_IDS;
    expect(items[ids.fqdcFault[0]].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10, 11]);
    expect(items[ids.fqiFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(items[ids.fqms12Fault].flightPhaseInhib).toEqual([4, 5, 6, 7, 9, 10]);
    expect(items[ids.manXfrProcedure].flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(items[ids.normAltnXfrFault].flightPhaseInhib).toEqual(FUEL_MANAGEMENT_PHASE_INHIBITION.cruiseOnly);
    expect(items[ids.sysComponentFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(items[ids.trimAndApuLinesFault].flightPhaseInhib).toEqual([4, 5, 6, 9, 10]);
    // FQDC 1(2), FQMS 1(2) and SYS COMPONENT FAULT: no audio, no master light
    expect([ids.fqdcFault[0], ids.fqmsFault[1], ids.sysComponentFault].map((id) => items[id].failure)).toEqual([
      1, 1, 1,
    ]);
  });
});

describe('readFuelManagementInputs', () => {
  it('reads the fault words, the transfer state and the failures the FQMS detects', () => {
    const simVars = new Map<string, number>([
      ['L:A32NX_FUEL_QUANTITY_SYSTEM_FAULTS', FQMS_1],
      ['L:A32NX_FUEL_FQI_LOST_TANKS', TANK_BIT.TRIM],
      ['L:A380X_FUEL_XFR_MAN_ONLY', 1],
      ['L:A380X_OVHD_FUEL_TRIM_TK_FEED_SELECTOR', 2],
      ['L:A380X_OVHD_FUEL_OUTRTK_XFR_PB_IS_AUTO', 1],
      ['FUELSYSTEM TANK WEIGHT:2', 18_000],
      ['FUELSYSTEM TANK QUANTITY:5', 7_700],
      ['FUELSYSTEM TANK CAPACITY:5', 7_753.2],
      ['PLANE PITCH DEGREES', -4],
    ]);
    const inputs = readFuelManagementInputs(
      (name) => simVars.get(name) ?? 0,
      (failure) => failure === A380Failure.FuelFeedTank1AftInletValveOpen,
      false,
      4,
    );
    expect(inputs.quantitySystemFaults.fqms).toEqual([true, false]);
    expect(inputs.fqiLostTanksWord).toBe(TANK_BIT.TRIM);
    expect(inputs.manualTransferRequired).toBe(true);
    expect(inputs.trimTankFeed).toBe(TrimTankFeedSelector.Isol);
    expect(inputs.outerXfrMan).toBe(false);
    expect(inputs.midXfrMan).toBe(true);
    expect(inputs.feedKg[0]).toBe(18_000);
    expect(inputs.feedTankFull).toEqual([false, true, false, false]);
    expect(inputs.pitchDeg).toBe(4);
    expect(inputs.aftGalleryInletValveOpen).toBe(true);
    expect(inputs.fwdGalleryInletValveOpen).toBe(false);
  });
});
