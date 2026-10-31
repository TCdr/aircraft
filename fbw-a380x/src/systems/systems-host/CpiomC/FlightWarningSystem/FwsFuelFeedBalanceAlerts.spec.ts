// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '@shared/EcamSystemPages';
import { FeedTankPumpFlags } from './FuelPumpValveFlags';
import { FwcFlightPhase } from './FwsFlightPhases';
import {
  feedPumpAlertsWithWings,
  FuelProcedureInputs,
  innerTanksQtyLoLines,
  InnerTanksQtyLoInputs,
  isInnerTanksQtyLo,
  FUEL_FEED_BALANCE_PHASE_INHIBITION,
  SeenAllOffSincePulse,
  WING_FEED_PUMPS_FAULT_STATUS,
  wingFeedPumpsFaultLines,
  WingsBalanceInputs,
  WingsBalanceMonitor,
  wingsBalancedLines,
  wingsNotBalancedLines,
} from './FwsFuelFeedBalanceAlerts';

import {
  EcamAbnormalProcedures,
  EcamInfos,
  EcamLimitations,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

const itemCount = (id: string): number => EcamAbnormalProcedures[id].items.length;

function shownNames(id: string, show: boolean[]): string[] {
  return EcamAbnormalProcedures[id].items.map((item) => item.name).filter((_, n) => show[n]);
}

const pumpsOn = (): FeedTankPumpFlags => ({
  mainPbOn: true,
  stbyPbOn: true,
  mainLowPressure: false,
  stbyLowPressure: false,
});
const pumpsFailed = (): FeedTankPumpFlags => ({
  mainPbOn: true,
  stbyPbOn: true,
  mainLowPressure: true,
  stbyLowPressure: true,
});
const pumpsOff = (): FeedTankPumpFlags => ({
  mainPbOn: false,
  stbyPbOn: false,
  mainLowPressure: false,
  stbyLowPressure: false,
});
const NONE = [false, false, false, false];

describe('FUEL L(R) WING FEED PMPs FAULT', () => {
  it('is raised when both pumps of feed tanks 1 and 2 are faulty, and replaces their MAIN + STBY PMPs FAULT', () => {
    const alerts = feedPumpAlertsWithWings(
      [pumpsFailed(), pumpsFailed(), pumpsOn(), pumpsOn()],
      FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
      NONE,
    );
    expect(alerts.leftWing).toBe(true);
    expect(alerts.rightWing).toBe(false);
    expect(alerts.tanks.map((t) => t.mainAndStbyFault)).toEqual([false, false, false, false]);
  });

  it('is raised for the right wing with feed tanks 3 and 4', () => {
    const alerts = feedPumpAlertsWithWings(
      [pumpsOn(), pumpsOn(), pumpsFailed(), pumpsOff()],
      FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
      NONE,
    );
    expect(alerts.rightWing).toBe(true);
    expect(alerts.leftWing).toBe(false);
  });

  it('one feed tank alone keeps its FEED TK MAIN + STBY PMPs FAULT', () => {
    const alerts = feedPumpAlertsWithWings(
      [pumpsFailed(), pumpsOn(), pumpsOn(), pumpsOn()],
      FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
      NONE,
    );
    expect(alerts.leftWing).toBe(false);
    expect(alerts.tanks[0].mainAndStbyFault).toBe(true);
  });

  it('pumps turned off do not count in flight phases 1 and 12', () => {
    const alerts = feedPumpAlertsWithWings(
      [pumpsOff(), pumpsOff(), pumpsOn(), pumpsOn()],
      FwcFlightPhase.ElecPwr,
      NONE,
    );
    expect(alerts.leftWing).toBe(false);
  });

  it('pumps turned off on request of another procedure (WINGS NOT BALANCED) are not faulty, failed ones still are', () => {
    const offForBalancing = feedPumpAlertsWithWings(
      [pumpsOff(), pumpsOn(), pumpsOn(), pumpsOn()],
      FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
      [true, false, false, false],
    );
    expect(offForBalancing.tanks[0]).toEqual({ mainFault: false, stbyFault: false, mainAndStbyFault: false });
    const failed = feedPumpAlertsWithWings(
      [pumpsFailed(), pumpsOn(), pumpsOn(), pumpsOn()],
      FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
      [true, false, false, false],
    );
    expect(failed.tanks[0].mainAndStbyFault).toBe(true);
  });

  it('is a master caution on the FUEL page, inhibited in phases 4-7, 9, 10', () => {
    expect(FUEL_FEED_BALANCE_PHASE_INHIBITION.wingFeedPumpsFault).toEqual([4, 5, 6, 7, 9, 10]);
    for (const [id, side] of [
      ['281800070', 0],
      ['281800071', 1],
    ] as const) {
      const { core } = createFws();
      const alert = core.abnormalSensed.ewdAbnormalSensed[id];
      expect(alert.simVarIsActive).toBe(core.fuelWingFeedPumpsFault[side]);
      expect(alert.flightPhaseInhib).toEqual(FUEL_FEED_BALANCE_PHASE_INHIBITION.wingFeedPumpsFault);
      expect(alert.failure).toBe(2);
      expect(alert.sysPage).toBe(SdPages.Fuel);
    }
  });
});

function inputs(overrides: Partial<FuelProcedureInputs> = {}): FuelProcedureInputs {
  return {
    onGround: false,
    anyEngineRunning: true,
    moreThan30MinAboveFl300: false,
    crossFeedPbOn: [false, false, false, false],
    feedMainPbOn: [true, true, true, true],
    feedStbyPbOn: [true, true, true, true],
    engStartSelIgnStart: false,
    ...overrides,
  };
}

describe('FUEL L(R) WING FEED PMPs FAULT procedure', () => {
  it.each([0, 1] as const)('side %i: one shown and one checked flag per item of the ECAM procedure', (side) => {
    const lines = wingFeedPumpsFaultLines(inputs(), side, false);
    const id = side === 0 ? '281800070' : '281800071';
    expect(lines.show).toHaveLength(itemCount(id));
    expect(lines.checked).toHaveLength(itemCount(id));
  });

  it('before takeoff: the four pumps OFF and the unusable quantities', () => {
    const names = shownNames('281800070', wingFeedPumpsFaultLines(inputs({ onGround: true }), 0, false).show);
    expect(names).toEqual([
      'FEED TK 1 MAIN PMP',
      'FEED TK 1 STBY PMP',
      'FEED TK 2 MAIN PMP',
      'FEED TK 2 STBY PMP',
      'FEED TK 1 : 1300 KG MAX NOT USABLE',
      'FEED TK 2 : 2000 KG MAX NOT USABLE',
    ]);
  });

  it('right wing: FEED TK 3 and 4 pumps, FEED TK 4 : 1300 KG and FEED TK 3 : 2000 KG', () => {
    const names = shownNames('281800071', wingFeedPumpsFaultLines(inputs({ onGround: true }), 1, false).show);
    expect(names).toEqual([
      'FEED TK 3 MAIN PMP',
      'FEED TK 3 STBY PMP',
      'FEED TK 4 MAIN PMP',
      'FEED TK 4 STBY PMP',
      'FEED TK 4 : 1300 KG MAX NOT USABLE',
      'FEED TK 3 : 2000 KG MAX NOT USABLE',
    ]);
  });

  it('after takeoff: ALL CROSSFEEDS OFF, IF NO FUEL LEAK ..., and the FL 50/MEA branch below 30 min above FL 300', () => {
    const names = shownNames('281800070', wingFeedPumpsFaultLines(inputs(), 0, false).show);
    expect(names[0]).toBe('ALL CROSSFEEDS');
    expect(names[1]).toBe('NO FUEL LEAK');
    expect(names).toContain('DESCENT TO FL 50/MEA');
    expect(names).not.toContain('DESCENT TO FL 280');
    expect(names).toContain('ENG START SEL');
    const after30 = shownNames(
      '281800070',
      wingFeedPumpsFaultLines(inputs({ moreThan30MinAboveFl300: true }), 0, false).show,
    );
    expect(after30).toContain('DESCENT TO FL 280');
    expect(after30).not.toContain('DESCENT TO FL 50/MEA');
  });

  it('the first ALL CROSSFEEDS OFF stays checked once seen, ALL CROSSFEEDS ON is sensed', () => {
    const lines = wingFeedPumpsFaultLines(inputs({ crossFeedPbOn: [true, true, true, true] }), 0, true);
    expect(lines.checked[6]).toBe(true); // ALL CROSSFEEDS OFF, seen before
    expect(lines.checked[8]).toBe(true); // ALL CROSSFEEDS ON
  });

  it('SeenAllOffSincePulse remembers the crossfeeds OFF until the alert triggers again', () => {
    const sensor = new SeenAllOffSincePulse();
    expect(sensor.update(true, false)).toBe(false);
    expect(sensor.update(true, true)).toBe(true);
    expect(sensor.update(true, false)).toBe(true);
    expect(sensor.update(false, false)).toBe(false);
    expect(sensor.update(true, false)).toBe(false);
  });

  it('STATUS: INOP SYS FEED TK 1 PMPs + FEED TK 2 PMPs (3 and 4 on the right), INFO WING FEED TKs BY GRVTY ONLY', () => {
    expect(WING_FEED_PUMPS_FAULT_STATUS.inopSysAllPhases).toEqual([
      ['280300011', '280300012'],
      ['280300013', '280300014'],
    ]);
    expect(EcamInfos['280200013']).toBe('\x1b<3mL WING FEED TKs BY GRVTY ONLY');
    expect(EcamInfos['280200014']).toBe('\x1b<3mR WING FEED TKs BY GRVTY ONLY');
  });
});

function balanceInputs(overrides: Partial<WingsBalanceInputs> = {}): WingsBalanceInputs {
  return {
    onGround: false,
    feedKg: [20_000, 20_000, 20_000, 20_000],
    innerKg: [10_000, 10_000],
    midKg: [10_000, 10_000],
    outerKg: [5_000, 5_000],
    fuelingInProgress: false,
    crossFeedPbOn: [false, false, false, false],
    feedMainPbOn: [true, true, true, true],
    feedStbyPbOn: [true, true, true, true],
    ...overrides,
  };
}

describe('FUEL WINGS NOT BALANCED / WINGS BALANCED', () => {
  it('in flight: more than 6 600 lb (2 994 kg) between feed tanks 1 and 4 triggers, 2 990 kg does not', () => {
    expect(
      new WingsBalanceMonitor().update(balanceInputs({ feedKg: [17_010, 20_000, 20_000, 20_000] })).notBalanced,
    ).toBe(false);
    const state = new WingsBalanceMonitor().update(balanceInputs({ feedKg: [17_000, 20_000, 20_000, 20_000] }));
    expect(state.notBalanced).toBe(true);
    expect(state.notBalancedPair).toEqual([true, false]);
    expect(state.lighterTank).toEqual([0, null]);
    expect(state.pumpsOffRequired).toEqual([true, false, false, false]);
  });

  it('in flight: the inner, mid and outer tanks do not trigger (the FQMS balances them itself)', () => {
    const state = new WingsBalanceMonitor().update(balanceInputs({ innerKg: [0, 10_000], outerKg: [0, 5_000] }));
    expect(state.notBalanced).toBe(false);
  });

  it('stays until the lighter tank is no longer lighter, then WINGS BALANCED until pumps ON and crossfeeds OFF', () => {
    const monitor = new WingsBalanceMonitor();
    monitor.update(balanceInputs({ feedKg: [20_000, 17_000, 17_000, 17_000] })); // feed tank 1 heavier than 4
    // Correcting: crossfeeds 1 + 4 ON, lighter tank 4 pumps OFF, imbalance below the threshold
    let state = monitor.update(
      balanceInputs({
        feedKg: [19_000, 17_000, 17_000, 17_500],
        crossFeedPbOn: [true, false, false, true],
        feedMainPbOn: [true, true, true, false],
        feedStbyPbOn: [true, true, true, false],
      }),
    );
    expect(state.notBalanced).toBe(true);
    expect(state.lighterTank[0]).toBe(3);
    state = monitor.update(
      balanceInputs({
        feedKg: [17_400, 17_000, 17_000, 17_500],
        crossFeedPbOn: [true, false, false, true],
        feedMainPbOn: [true, true, true, false],
        feedStbyPbOn: [true, true, true, false],
      }),
    );
    expect(state.notBalanced).toBe(false);
    expect(state.balanced).toBe(true);
    expect(state.balancedPair).toEqual([true, false]);
    expect(state.pumpsOffRequired).toEqual([true, false, false, true]);
    state = monitor.update(balanceInputs({ feedKg: [17_400, 17_000, 17_000, 17_500] }));
    expect(state.balanced).toBe(false);
  });

  it('on ground: inner (6 600 lb), mid (5 500 lb) and outer (2 600 lb = 1 179 kg) imbalances trigger', () => {
    const ground = (o: Partial<WingsBalanceInputs>) =>
      new WingsBalanceMonitor().update(balanceInputs({ onGround: true, ...o })).notBalanced;
    expect(ground({ innerKg: [7_000, 10_000] })).toBe(true);
    expect(ground({ innerKg: [7_010, 10_000] })).toBe(false);
    expect(ground({ midKg: [7_500, 10_000] })).toBe(true);
    expect(ground({ midKg: [7_510, 10_000] })).toBe(false);
    expect(ground({ outerKg: [3_820, 5_000] })).toBe(true);
    expect(ground({ outerKg: [3_825, 5_000] })).toBe(false);
  });

  it('on ground: inhibited during refueling and defueling', () => {
    const state = new WingsBalanceMonitor().update(
      balanceInputs({ onGround: true, innerKg: [0, 10_000], fuelingInProgress: true }),
    );
    expect(state.notBalanced).toBe(false);
  });

  it('landing ends the in-flight procedure', () => {
    const monitor = new WingsBalanceMonitor();
    monitor.update(balanceInputs({ feedKg: [17_000, 20_000, 20_000, 20_000] }));
    expect(monitor.update(balanceInputs({ onGround: true })).notBalanced).toBe(false);
  });

  it('procedure lines: on ground before engine start AUTO GND XFR, in flight the lighter side pumps OFF', () => {
    const monitor = new WingsBalanceMonitor();
    const ground = monitor.update(balanceInputs({ onGround: true, innerKg: [0, 10_000] }));
    const groundLines = wingsNotBalancedLines(inputs({ onGround: true, anyEngineRunning: false }), ground);
    expect(groundLines.show).toHaveLength(itemCount('281800100'));
    expect(shownNames('281800100', groundLines.show)).toEqual(['T.O PLANNED', 'AUTO GND XFR', 'DELAY T.O']);
    expect(shownNames('281800100', wingsNotBalancedLines(inputs({ onGround: true }), ground).show)).toEqual([
      'T.O PLANNED',
      'WINGS IMBALANCE',
      'DELAY T.O',
    ]);
    const flight = new WingsBalanceMonitor().update(balanceInputs({ feedKg: [20_000, 16_000, 20_000, 20_000] }));
    expect(shownNames('281800100', wingsNotBalancedLines(inputs(), flight).show)).toEqual([
      'FEED TK 2 & 3 NOT BALANCED',
      'NO FUEL LEAK',
      'CROSSFEED 2',
      'CROSSFEED 3',
      'FEED TK 2 STBY PMP',
      'FEED TK 2 MAIN PMP',
    ]);
  });

  it('WINGS BALANCED lines: the balanced pair pumps ON and crossfeeds OFF, sensed', () => {
    const state = {
      notBalanced: false,
      notBalancedPair: [false, false] as [boolean, boolean],
      lighterTank: [null, null] as [null, null],
      balanced: true,
      balancedPair: [false, true] as [boolean, boolean],
      pumpsOffRequired: [false, true, true, false] as [boolean, boolean, boolean, boolean],
    };
    const lines = wingsBalancedLines(inputs({ crossFeedPbOn: [false, true, false, false] }), state);
    expect(lines.show).toHaveLength(itemCount('281800098'));
    expect(shownNames('281800098', lines.show)).toEqual([
      'FEED TK 2 & 3 BALANCED',
      'FEED TK 2 MAIN PMP',
      'FEED TK 2 STBY PMP',
      'FEED TK 3 MAIN PMP',
      'FEED TK 3 STBY PMP',
      'CROSSFEED 2',
      'CROSSFEED 3',
    ]);
    expect(lines.checked.slice(7)).toEqual([false, true, true, true, true, false, true]);
  });

  it('both alerts are master cautions on the FUEL page, inhibited in phases 3-7, 9, 10', () => {
    expect(FUEL_FEED_BALANCE_PHASE_INHIBITION.wingsNotBalanced).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(FUEL_FEED_BALANCE_PHASE_INHIBITION.wingsBalanced).toEqual([3, 4, 5, 6, 7, 9, 10]);
    const { core } = createFws();
    const notBalanced = core.abnormalSensed.ewdAbnormalSensed['281800100'];
    const balanced = core.abnormalSensed.ewdAbnormalSensed['281800098'];
    expect(notBalanced.simVarIsActive).toBe(core.fuelWingsNotBalanced);
    expect(balanced.simVarIsActive).toBe(core.fuelWingsBalanced);
    expect(notBalanced.failure).toBe(2);
    expect(balanced.failure).toBe(2);
    expect(notBalanced.flightPhaseInhib).toEqual(FUEL_FEED_BALANCE_PHASE_INHIBITION.wingsNotBalanced);
    expect(balanced.flightPhaseInhib).toEqual(FUEL_FEED_BALANCE_PHASE_INHIBITION.wingsBalanced);
    // DELAY T.O on the ground
    core.aircraftOnGround.set(true);
    expect(notBalanced.limitationsAllPhases?.([])).toEqual(['280400002']);
    expect(EcamLimitations['280400002']).toBeDefined();
  });
});

function qtyLoInputs(overrides: Partial<InnerTanksQtyLoInputs> = {}): InnerTanksQtyLoInputs {
  return {
    onGround: true,
    zfwAndZfcgEntered: true,
    fobKg: 60_000,
    innerKg: [5_000, 20_000],
    outerTanksFull: false,
    refuelPanelOpenOrFueling: false,
    ...overrides,
  };
}

describe('FUEL INR TKs QTY LO', () => {
  it('FOB above 110 200 lb (49 986 kg) and an inner tank below 11 200 lb (5 080 kg), ZFW/ZFCG entered', () => {
    expect(isInnerTanksQtyLo(qtyLoInputs())).toBe(true);
    expect(isInnerTanksQtyLo(qtyLoInputs({ fobKg: 49_980 }))).toBe(false);
    expect(isInnerTanksQtyLo(qtyLoInputs({ innerKg: [5_090, 20_000] }))).toBe(false);
    expect(isInnerTanksQtyLo(qtyLoInputs({ zfwAndZfcgEntered: false }))).toBe(false);
    expect(isInnerTanksQtyLo(qtyLoInputs({ fobKg: null }))).toBe(false);
    expect(isInnerTanksQtyLo(qtyLoInputs({ onGround: false }))).toBe(false);
  });

  it('is inhibited with the outer tanks full or the refuel panel open', () => {
    expect(isInnerTanksQtyLo(qtyLoInputs({ outerTanksFull: true }))).toBe(false);
    expect(isInnerTanksQtyLo(qtyLoInputs({ refuelPanelOpenOrFueling: true }))).toBe(false);
  });

  it('procedure IF REFUEL NOT PLANNED : AUTO GND XFR ON, INFO EACH INR TK : 5100 KG MIN FOR T.O, phases 3-11', () => {
    expect(innerTanksQtyLoLines().show).toHaveLength(itemCount('281800051'));
    expect(FUEL_FEED_BALANCE_PHASE_INHIBITION.innerTanksQtyLo).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const { core } = createFws();
    expect(core.abnormalSensed.ewdAbnormalSensed['281800051'].info?.([])).toEqual(['280200012']);
    expect(EcamInfos['280200012']).toBe('\x1b<3mEACH INR TK : 5100 KG MIN FOR T.O');
  });
});
