// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  BleedMonitoringInputs,
  bleedLeakInopSys,
  bleedLeakItems,
  bleedLeakLimitations,
  ENG_BLEED_FAULT_ALERT_IDS,
  ENG_BLEED_LEAK_ALERT_IDS,
  engineBleedFaultInopSys,
  engineBleedFaultItems,
  isBleedLeak,
  isEngineBleedFault,
  WING_LEAK_ALERT_IDS,
} from './BleedMonitoringAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
const ata36 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42.ts'),
  'utf-8',
);
const ecamMessages = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
  'utf-8',
);

/** Four engines running in flight, all bleeds open, crossbleed valves closed */
const cruise: BleedMonitoringInputs = {
  overheat: [false, false, false, false],
  overpressure: [false, false, false, false],
  pylonLeak: [false, false, false, false],
  wingLeak: [false, false, false, false],
  bleedValveOpen: [true, true, true, true],
  bleedPbAuto: [true, true, true, true],
  engineRunning: [true, true, true, true],
  xbleedValveOpen: [false, false, false],
  pack1On: true,
  pack2On: true,
  apuBleedOn: false,
  wingAntiIceOn: false,
  onGround: false,
};

/** The indexes of the lines shown */
const shown = (items: { show: boolean[] }) =>
  items.show.map((isShown, index) => (isShown ? index : -1)).filter((index) => index >= 0);

describe('AIR ENG 1(2)(3)(4) BLEED FAULT', () => {
  it('triggers on the CPIOM-A overtemperature or overpressure of the engine', () => {
    expect([0, 1, 2, 3].some((engine) => isEngineBleedFault(cruise, engine))).toBe(false);
    expect(isEngineBleedFault({ ...cruise, overheat: [false, true, false, false] }, 1)).toBe(true);
    expect(isEngineBleedFault({ ...cruise, overpressure: [false, false, true, false] }, 2)).toBe(true);
    expect(isEngineBleedFault({ ...cruise, overpressure: [false, false, true, false] }, 1)).toBe(false);
  });

  it('asks for ENG BLEED OFF only when the bleed valve did not close automatically', () => {
    const closed = { ...cruise, overheat: [true, false, false, false], bleedValveOpen: [false, true, true, true] };
    expect(shown(engineBleedFaultItems(closed, 0))).toEqual([]);
    const stuckOpen = { ...cruise, overheat: [true, false, false, false] };
    expect(shown(engineBleedFaultItems(stuckOpen, 0))).toEqual([0]);
    expect(engineBleedFaultItems(stuckOpen, 0).checked).toEqual([false]);
    const pbOff = { ...stuckOpen, bleedPbAuto: [false, true, true, true] };
    expect(shown(engineBleedFaultItems(pbOff, 0))).toEqual([0]);
    expect(engineBleedFaultItems(pbOff, 0).checked).toEqual([true]);
  });

  it('STATUS INOP SYS: ENG n BLEED, PACK 1(2) with two or more bleeds failed', () => {
    const oneFault = { ...cruise, overpressure: [false, false, false, true] };
    expect(engineBleedFaultInopSys(oneFault, 3)).toEqual(['260300005']);
    const twoRight = { ...oneFault, bleedPbAuto: [true, true, false, true] };
    expect(engineBleedFaultInopSys(twoRight, 3)).toEqual(['260300005', '210300010']);
  });
});

describe('AIR bleed leak alerts', () => {
  it('triggers on the pylon duct leak and on the wing zone leak, each with its own alert', () => {
    const leaks = { ...cruise, pylonLeak: [false, true, false, false], wingLeak: [false, false, false, true] };
    expect(isBleedLeak(leaks, 1, false)).toBe(true);
    expect(isBleedLeak(leaks, 1, true)).toBe(false);
    expect(isBleedLeak(leaks, 3, true)).toBe(true);
    expect(isBleedLeak(leaks, 3, false)).toBe(false);
  });

  it('on ground before any engine start: the four ENG MASTER: KEEP OFF lines, no INOP SYS', () => {
    const coldAndDark = {
      ...cruise,
      onGround: true,
      engineRunning: [false, false, false, false],
      bleedValveOpen: [false, false, false, false],
      wingLeak: [false, true, false, false],
    };
    expect(shown(bleedLeakItems(coldAndDark, 1, true))).toEqual([0, 1, 2, 3, 11]);
    expect(bleedLeakInopSys(coldAndDark, 1, true)).toEqual([]);
  });

  it('inner leak isolated in flight: AIR LEAK ISOLATED, no WING A-ICE lines with one bleed of the side lost', () => {
    const isolated = { ...cruise, wingLeak: [false, true, false, false], bleedValveOpen: [true, false, true, true] };
    expect(shown(bleedLeakItems(isolated, 1, true))).toEqual([11]);
    expect(bleedLeakInopSys(isolated, 1, true)).toEqual(['260300003', '800300002']);
    expect(bleedLeakLimitations(isolated, 1)).toEqual([]);
  });

  it('inner leak with the bleed valve and the side crossbleed valve still open: ENG BLEED OFF, XBLEED CLOSE', () => {
    const notIsolated = { ...cruise, pylonLeak: [false, false, true, false], xbleedValveOpen: [true, true, true] };
    expect(shown(bleedLeakItems(notIsolated, 2, false))).toEqual([4, 6]);
    // The center crossbleed valve stays open for an inner leak
    const sideClosed = {
      ...notIsolated,
      bleedValveOpen: [true, true, false, true],
      xbleedValveOpen: [true, true, false],
    };
    expect(shown(bleedLeakItems(sideClosed, 2, false))).toEqual([11]);
  });

  it('inner leak in flight with both bleeds of the side lost: PACK OFF, WING A-ICE OFF, AVOID ICING CONDs', () => {
    const sideLost = { ...cruise, wingLeak: [false, false, true, false], bleedValveOpen: [true, true, false, false] };
    expect(shown(bleedLeakItems(sideLost, 2, true))).toEqual([5, 8, 9, 10, 11]);
    expect(bleedLeakLimitations(sideLost, 2)).toEqual(['300400001']);
    expect(bleedLeakInopSys(sideLost, 2, true)).toEqual(['260300004', '210300010', '800300003', '300300001']);
  });

  it('left outer wing leak with the crossbleed valves open: XBLEED CLOSE then APU BLEED OFF; in flight WING A-ICE OFF', () => {
    const outer = {
      ...cruise,
      wingLeak: [true, false, false, false],
      bleedValveOpen: [false, true, true, true],
      xbleedValveOpen: [false, true, false],
      apuBleedOn: true,
    };
    expect(shown(bleedLeakItems(outer, 0, true))).toEqual([6, 7, 8, 9, 10]);
    expect(bleedLeakItems(outer, 0, true).checked[7]).toBe(false);
    expect(bleedLeakInopSys(outer, 0, true)).toEqual(['260300002', '260300006', '800300001', '300300001']);
    // The engine 1 pylon leak has no APU BLEED line
    expect(shown(bleedLeakItems({ ...outer, wingLeak: [false, false, false, false] }, 0, false))).toEqual([
      6, 8, 9, 10,
    ]);
  });

  it('outer leak: PACK 1(2) INOP SYS only once the pack is set OFF', () => {
    const outer = { ...cruise, pylonLeak: [false, false, false, true], bleedValveOpen: [true, true, true, false] };
    expect(bleedLeakInopSys(outer, 3, false)).toEqual(['260300005', '800300004', '300300001']);
    expect(bleedLeakInopSys({ ...outer, pack2On: false }, 3, false)).toEqual([
      '260300005',
      '210300010',
      '800300004',
      '300300001',
    ]);
  });
});

describe('AIR bleed alerts wiring', () => {
  it('has a message for every alert, with the lines the logic gives', () => {
    for (const id of [...ENG_BLEED_FAULT_ALERT_IDS, ...ENG_BLEED_LEAK_ALERT_IDS, ...WING_LEAK_ALERT_IDS]) {
      expect(ata36).toContain(`  ${id}: `);
    }
    const leakProcedure = ata36.slice(ata36.indexOf('function bleedLeak('));
    expect(leakProcedure.match(/\{ name: /g)).toHaveLength(bleedLeakItems(cruise, 0, true).show.length);
    const faultProcedure = ata36.slice(
      ata36.indexOf('function engineBleedFault('),
      ata36.indexOf('function bleedLeak('),
    );
    expect(faultProcedure.match(/name: /g)).toHaveLength(engineBleedFaultItems(cruise, 0).show.length);
    for (const engine of [1, 2, 3, 4]) {
      expect(ecamMessages).toContain(`80030000${engine}: '\\x1b<4mENG ${engine} STARTER',`);
    }
  });

  it('reads the CPIOM-A monitoring and creates the alerts', () => {
    expect(fwsCore).toContain('readBoolVar(`L:A32NX_PNEU_ENG_${engine}_OVERHEAT`)');
    expect(fwsCore).toContain('readBoolVar(`L:A32NX_PNEU_${zone}_WING_LEAK`)');
    expect(fwsCore).toContain(
      'this.engineBleedFault[engine].set(isEngineBleedFault(this.bleedMonitoringInputs, engine));',
    );
    expect(abnormalSensed).toContain('...this.bleedMonitoringAlerts(),');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.engineBleedFault[engine],');
  });
});
