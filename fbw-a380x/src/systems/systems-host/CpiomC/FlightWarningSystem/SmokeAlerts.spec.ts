// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  avionicsBaySmokeAlerts,
  avionicsSmokeItemsChecked,
  CARGO_BOTTLE_FAULT_INOP_SYS,
  cargoSmokeItemsChecked,
  cargoSmokeItemsToShow,
  SMOKE_ZONES,
  SmokeProcedureState,
  smokeWarnings,
} from './SmokeAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata26 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata26.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** The number of items of an ata26.ts procedure */
function itemCount(id: string): number {
  const start = ata26.indexOf(`  ${id}: {`);
  expect(start, id).toBeGreaterThan(0);
  const end = ata26.indexOf('\n  },', start);
  return (ata26.slice(start, end).match(/ name: '/g) ?? []).length;
}

/** The title of an ata26.ts procedure, without its formatting */
function title(id: string): string {
  const start = ata26.indexOf(`  ${id}: {`);
  const match = ata26.slice(start).match(/title: '([^']*)'/);
  return (match ? match[1] : '').replace(/\\x1b<\dm|\\x1b4m|\\x1bm/g, '');
}

const state: SmokeProcedureState = {
  cabFansOn: true,
  galleyOff: false,
  signsOn: false,
  oneEngineRunning: true,
  isolValvesPbOn: true,
  agentDischarged: false,
};

const noSmoke = SMOKE_ZONES.map(() => false);
const smokeIn = (...zones: string[]) => SMOKE_ZONES.map((smokeZone) => zones.includes(smokeZone.zone));
const warningsOf = (warnings: boolean[]) => SMOKE_ZONES.filter((_, index) => warnings[index]).map((zone) => zone.zone);

describe('A380X SMOKE alerts of the SDF', () => {
  it('each compartment has its own SMOKE warning and DET FAULT caution, with the right titles', () => {
    const titles: Record<string, [string, string]> = {
      FWD_CARGO: ['SMOKE FWD CARGO SMOKE', 'SMOKE FWD CARGO DET FAULT'],
      AFT_CARGO: ['SMOKE AFT CARGO SMOKE', 'SMOKE AFT CARGO DET FAULT'],
      BULK_CARGO: ['SMOKE BULK CARGO SMOKE', 'SMOKE BULK CARGO DET FAULT'],
      L_MAIN_AVNCS: ['SMOKE L MAIN AVNCS SMOKE', 'SMOKE L MAIN AVNCS DET FAULT'],
      R_MAIN_AVNCS: ['SMOKE R MAIN AVNCS SMOKE', 'SMOKE R MAIN AVNCS DET FAULT'],
      L_UPPER_AVNCS: ['SMOKE L UPPER AVNCS SMOKE', 'SMOKE L UPPER AVNCS DET FAULT'],
      R_UPPER_AVNCS: ['SMOKE R UPPER AVNCS SMOKE', 'SMOKE R UPPER AVNCS DET FAULT'],
      AFT_AVNCS: ['SMOKE AFT AVNCS SMOKE', 'SMOKE AFT AVNCS DET FAULT'],
      IFE_BAY: ['SMOKE IFE BAY SMOKE', 'SMOKE IFE BAY DET FAULT'],
    };
    expect(SMOKE_ZONES.map((zone) => zone.zone)).toEqual(Object.keys(titles));
    for (const zone of SMOKE_ZONES) {
      expect([title(zone.smokeAlert), title(zone.detFaultAlert)]).toEqual(titles[zone.zone]);
    }
  });

  it('the DET FAULT INOP SYS lines are the SMK DET of the compartment', () => {
    const inopSys = (id: string) => messageIndex.match(new RegExp(`  ${id}: '\\\\x1b<4m([^']*)'`))?.[1];
    expect(SMOKE_ZONES.map((zone) => inopSys(zone.detFaultInopSys))).toEqual([
      'FWD CARGO SMK DET',
      'AFT CARGO SMK DET',
      'AFT CARGO SMK DET',
      'L MAIN AVNCS SMK DET',
      'R MAIN AVNCS SMK DET',
      'L UPPR AVNCS SMK DET',
      'R UPPR AVNCS SMK DET',
      'AFT AVNCS SMK DET',
      'IFE BAY SMK DET',
    ]);
    expect(CARGO_BOTTLE_FAULT_INOP_SYS.map(inopSys)).toEqual(['FWD+AFT CRGs BTL 1', 'FWD+AFT CRGs BTL 2']);
  });

  it('MAIN AND UPPER AVIONICS: upper bay smoke gives UPPER, main bay smoke alone gives MAIN', () => {
    expect(avionicsBaySmokeAlerts(false, false)).toEqual({ mainAvncsSmoke: false, upperAvncsSmoke: false });
    expect(avionicsBaySmokeAlerts(false, true)).toEqual({ mainAvncsSmoke: false, upperAvncsSmoke: true });
    expect(avionicsBaySmokeAlerts(true, false)).toEqual({ mainAvncsSmoke: true, upperAvncsSmoke: false });
    expect(avionicsBaySmokeAlerts(true, true)).toEqual({ mainAvncsSmoke: false, upperAvncsSmoke: true });
  });

  it('smokeWarnings applies the avionics bay logic per side and passes the other compartments through', () => {
    expect(warningsOf(smokeWarnings(noSmoke))).toEqual([]);
    expect(warningsOf(smokeWarnings(smokeIn('BULK_CARGO')))).toEqual(['BULK_CARGO']);
    expect(warningsOf(smokeWarnings(smokeIn('L_MAIN_AVNCS', 'L_UPPER_AVNCS', 'R_MAIN_AVNCS')))).toEqual([
      'R_MAIN_AVNCS',
      'L_UPPER_AVNCS',
    ]);
  });

  it('CARGO SMOKE: AGENT DISCH after the CRG CLOSED condition with all engines shut down, else directly', () => {
    expect(cargoSmokeItemsToShow(state)).toEqual([true, false, false, true, true, true, true, true]);
    expect(cargoSmokeItemsToShow({ ...state, oneEngineRunning: false })).toEqual([
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(cargoSmokeItemsChecked(state)).toEqual([false, false, false, false, false, false, false, false]);
    expect(
      cargoSmokeItemsChecked({
        ...state,
        isolValvesPbOn: false,
        agentDischarged: true,
        cabFansOn: false,
        signsOn: true,
      }),
    ).toEqual([true, false, true, true, true, true, false, false]);
  });

  it('every item list matches its ata26.ts procedure', () => {
    for (const id of ['260800045', '260800046', '260800047']) {
      expect(cargoSmokeItemsToShow(state)).toHaveLength(itemCount(id));
      expect(cargoSmokeItemsChecked(state)).toHaveLength(itemCount(id));
    }
    expect(avionicsSmokeItemsChecked(state, false, false)).toHaveLength(itemCount('260800030'));
    expect(avionicsSmokeItemsChecked(state, false, true)).toHaveLength(itemCount('260800038'));
    expect(avionicsSmokeItemsChecked(state, false, true)).toHaveLength(itemCount('260800039'));
    expect(avionicsSmokeItemsChecked(state, true, false)).toHaveLength(itemCount('260800040'));
    expect(avionicsSmokeItemsChecked(state, true, false)).toHaveLength(itemCount('260800041'));
    expect(itemCount('260800033')).toBe(3);
    expect(itemCount('260800048')).toBe(2);
    expect(itemCount('260800049')).toBe(3);
    expect(itemCount('260800050')).toBe(3);
    expect(itemCount('260800052')).toBe(0);
    expect(itemCount('260800053')).toBe(0);
  });

  it('avionics smoke items: CAB FANS OFF, GALLEY OFF and SIGNS ON are sensed', () => {
    const done = { ...state, cabFansOn: false, galleyOff: true, signsOn: true };
    expect(avionicsSmokeItemsChecked(done, false, true)).toEqual([false, true, true, true, false, false]);
    expect(avionicsSmokeItemsChecked(done, true, false)).toEqual([false, true, true, false, true, false, false, false]);
  });

  // The SDF variables are written by systems.wasm (fire_protection/smoke_detection.rs of the shared fire model)
  it('reads the SDF variables and wires the alerts', () => {
    expect(fwsCore).toContain('`L:A32NX_SMOKE_${smokeZone.zone}_DETECTED`');
    expect(fwsCore).toContain('`L:A32NX_SMOKE_${smokeZone.zone}_DET_FAULT`');
    expect(fwsCore).toContain('`L:A32NX_CARGOSMOKE_BOTTLE_${index + 1}_LOW_PRESSURE`');
    expect(abnormalSensed).toContain('...this.smokeAlerts(),');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.smokeZoneWarning[index],');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.smokeZoneDetFault[index],');
    expect(abnormalSensed).toContain('alerts[260800052 + index] = {');
  });
});
