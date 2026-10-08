// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EngineStartFault,
  EngineStartPhase,
  START_FAULT_ITEM_COUNT,
  START_VALVE_NOT_CLOSED_ITEM_COUNT,
  START_VALVE_NOT_OPEN_ITEM_COUNT,
  StartFaultInputs,
  startFaultItems,
  StartValveFaultInputs,
  startValveNotClosedItems,
  startValveNotOpenItems,
} from './EngineStartAlerts';

/*
 * The ECAM items of the procedures, read from the source text of ata70.ts (importing the EcamMessages tables in a test fails on
 * a circular import, see FwsAbnormalSensedItems.spec.ts).
 */
const ata70 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
  'utf-8',
);
function itemCount(key: number): number {
  const start = ata70.indexOf(`  ${key}: {`);
  expect(start).toBeGreaterThan(0);
  const block = ata70.slice(start, ata70.indexOf('\n  },', start));
  return block.split('{ name:').length - 1;
}

const shown = (show: boolean[]) => show.flatMap((value, index) => (value ? [index] : []));

const groundAutoStart: StartFaultInputs = {
  fault: EngineStartFault.NoLightUp,
  phase: EngineStartPhase.AutomaticCrank,
  attempt: 1,
  manualStart: false,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
  engStartSelector: 2,
  apuBleedPbOn: true,
  allThrustLeversIdle: true,
};

describe('A380X ENG START FAULT', () => {
  it('has as many items as its ECAM procedures', () => {
    for (let key = 701800117; key <= 701800120; key++) {
      expect(itemCount(key)).toBe(START_FAULT_ITEM_COUNT);
    }
    for (let key = 701800121; key <= 701800124; key++) {
      expect(itemCount(key)).toBe(START_VALVE_NOT_CLOSED_ITEM_COUNT);
    }
    for (let key = 701800125; key <= 701800128; key++) {
      expect(itemCount(key)).toBe(START_VALVE_NOT_OPEN_ITEM_COUNT);
    }
  });

  it('shows NEW START IN PROGRESS during the automatic retries, then ENG MASTER OFF', () => {
    expect(shown(startFaultItems(groundAutoStart).show)).toEqual([4, 11]);
    expect(shown(startFaultItems({ ...groundAutoStart, phase: EngineStartPhase.Starting, attempt: 2 }).show)).toEqual([
      4, 11,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, phase: EngineStartPhase.Aborted }).show)).toEqual([4, 12]);
  });

  it('has the dry crank lines of a manual start on the ground', () => {
    const manual = {
      ...groundAutoStart,
      fault: EngineStartFault.EgtOverlimit,
      manualStart: true,
      manualStartPbOn: true,
    };
    expect(shown(startFaultItems(manual).show)).toEqual([3, 12, 13, 14, 15, 16]);
    const checked = startFaultItems({ ...manual, masterOn: false, engStartSelector: 0 }).checked;
    expect(checked[12]).toBe(true);
    expect(checked[13]).toBe(true);
  });

  it('asks for air for NO STARTER AIR PRESSURE', () => {
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure }).show)).toEqual([
      0, 8, 9,
    ]);
    expect(
      shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure, onGround: false }).show),
    ).toEqual([0, 8, 9, 10]);
  });

  it('has the other faults', () => {
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterTimeExceeded }).show)).toEqual([
      6, 12,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.ThrustLeverNotAtIdle }).show)).toEqual([
      7, 17,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterFault }).show)).toEqual([1, 12]);
    expect(shown(startFaultItems({ ...groundAutoStart, onGround: false }).show)).toEqual([4, 12]);
  });
});

const valveOnGround: StartValveFaultInputs = {
  engineNumber: 1,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
  apuBleedPbOn: true,
};

describe('A380X ENG START VLV FAULT', () => {
  it('removes the bleed sources of a start valve not closed', () => {
    expect(shown(startValveNotClosedItems(valveOnGround).show)).toEqual([1, 2, 4, 5, 6]);
    expect(shown(startValveNotClosedItems({ ...valveOnGround, engineNumber: 2, onGround: false }).show)).toEqual([
      0, 2,
    ]);
  });

  it('asks for ENG MASTER OFF on the ground for a start valve stuck closed, a windmill start in flight', () => {
    expect(shown(startValveNotOpenItems({ ...valveOnGround, manualStartPbOn: true }).show)).toEqual([0, 1, 2]);
    expect(shown(startValveNotOpenItems({ ...valveOnGround, onGround: false }).show)).toEqual([0, 3, 4, 5]);
  });
});
