// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  COLLECTOR_CELL_CAPACITY_KG,
  collectorCellQuantityVar,
  fuelTankTemperatureVar,
} from '@shared/FuelTankIndications';
import { MockedSimVarValues, mockSimVars } from '../../../../../fbw-common/src/jest/MockedSimVars';
import { APU_FEED_ABNORMALLY_CLOSED_VAR, APU_FEED_ABNORMALLY_OPEN_VAR, FuelApuFeed } from './FuelApuFeed';
import { FuelCollectorCells } from './FuelCollectorCells';
import { FuelEmerOuterTransfer } from './FuelEmerOuterTransfer';
import { FuelLeak } from './FuelLeak';
import { FUEL_XFR_PB_IS_AUTO_VARS } from './FuelManualTransfer';
import { FuelOverflow, L_WING_TK_OVERFLOW_VAR } from './FuelOverflow';
import { FuelPumpsAndValves } from './FuelPumpsAndValves';
import { FuelRefuelFaults, REFUEL_FAULT_VAR, REFUEL_STARTED_VAR } from './FuelRefuelFaults';
import { A380_FUEL_TANKS, FuelTankTemperatures, FuelTemperatures } from './FuelTankTemperatures';
import { FuelTransferFaults } from './FuelTransferFaults';
import { WeightBalanceBackup } from './WeightBalanceBackup';

/*
 * The fuel systems run on every frame of the systems host, in the one JavaScript heap of the cockpit: they read and
 * write their simvars through registered handles (RegisteredSimVar), made once, instead of building the simvar names
 * and looking them up on every update, which makes garbage that the collector has to clear.
 */

const UPDATES = 5;
const FRAME_MS = 50;

let simVars: MockedSimVarValues;
let spies: ReturnType<typeof mockSimVars>;
let activeFailures: Set<number>;
const failures = { isActive: (failure: number) => activeFailures.has(failure) };
const sysHost = { deltaTime: FRAME_MS };

beforeEach(() => {
  simVars = new Map();
  activeFailures = new Set();
  spies = mockSimVars(simVars);
});

/** Runs the updates after the construction, and checks that no simvar was read or written by name on the way */
function runUpdatesWithoutNameLookups(update: () => void, updates = UPDATES): void {
  spies.getSimVarValue.mockClear();
  spies.setSimVarValue.mockClear();
  for (let i = 0; i < updates; i++) {
    update();
  }
  expect(spies.getSimVarValue).not.toHaveBeenCalled();
  // the K: events that command a switch are sent by name; they only go out when a switch is commanded
  const writesByName = spies.setSimVarValue.mock.calls.filter(([name]) => !String(name).startsWith('K:'));
  expect(writesByName).toEqual([]);
}

describe('fuel tank temperatures', () => {
  it('reads the registered simvars and writes the same temperatures as the model', () => {
    const quantitiesGal = A380_FUEL_TANKS.map(({ capacityGal }, index) => capacityGal * (0.2 + 0.07 * index));
    simVars.set('SIM ON GROUND', 1);
    simVars.set('AMBIENT TEMPERATURE', 20);
    simVars.set('TOTAL AIR TEMPERATURE', -40);
    A380_FUEL_TANKS.forEach(({ msfsTank }, index) =>
      simVars.set(`FUELSYSTEM TANK QUANTITY:${msfsTank}`, quantitiesGal[index]),
    );
    const instrument = new FuelTemperatures(sysHost);
    const model = new FuelTankTemperatures();
    const inputs = {
      onGround: true,
      outsideAirTemperatureC: 20,
      totalAirTemperatureC: -40,
      fillRatios: A380_FUEL_TANKS.map(({ capacityGal }, index) => quantitiesGal[index] / capacityGal),
    };

    let expected: readonly number[] = [];
    runUpdatesWithoutNameLookups(() => {
      instrument.onUpdate();
      expected = model.update(inputs, FRAME_MS / 1000);
    });

    A380_FUEL_TANKS.forEach(({ name }, index) => {
      expect(simVars.get(fuelTankTemperatureVar(name))).toBeCloseTo(expected[index], 10);
    });
  });
});

describe('fuel collector cells', () => {
  it.each([
    { cell: 1, tankKg: 12_000, pump: 1, expectedKg: COLLECTOR_CELL_CAPACITY_KG },
    { cell: 2, tankKg: 800, pump: 4, expectedKg: 800 },
    { cell: 3, tankKg: 12_000, pump: 5, expectedKg: COLLECTOR_CELL_CAPACITY_KG },
    { cell: 4, tankKg: 300, pump: 7, expectedKg: 300 },
  ])('cell $cell: reads the registered simvars and gives $expectedKg kg', ({ cell, tankKg, pump, expectedKg }) => {
    const msfsTank = [2, 5, 6, 9][cell - 1];
    simVars.set(`FUELSYSTEM TANK WEIGHT:${msfsTank}`, tankKg);
    simVars.set(`FUELSYSTEM PUMP ACTIVE:${pump}`, 1);
    simVars.set(`L:A32NX_ENGINE_STATE:${cell}`, 1);
    const instrument = new FuelCollectorCells(sysHost);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    expect(simVars.get(collectorCellQuantityVar(cell))).toBeCloseTo(expectedKg, 6);
  });
});

describe('fuel transfer failures', () => {
  const manualOnlyVar = 'L:A380X_FUEL_XFR_MAN_ONLY';

  beforeEach(() => {
    for (const pbVar of FUEL_XFR_PB_IS_AUTO_VARS) {
      simVars.set(pbVar, 1);
    }
  });

  it('a wing tank overflow with the transfers in AUTO makes the transfers manual', () => {
    simVars.set(L_WING_TK_OVERFLOW_VAR, 1);
    const instrument = new FuelTransferFaults(failures);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    expect(instrument.restrictions.manualTransferRequired).toBe(true);
    expect(simVars.get(manualOnlyVar)).toBe(true);
  });

  it('a wing tank overflow with a transfer selected manually leaves the transfers as they are', () => {
    simVars.set(L_WING_TK_OVERFLOW_VAR, 1);
    simVars.set(FUEL_XFR_PB_IS_AUTO_VARS[2], 0);
    const instrument = new FuelTransferFaults(failures);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    expect(instrument.restrictions.manualTransferRequired).toBe(false);
    expect(simVars.get(manualOnlyVar)).toBe(false);
  });

  it('a gallery inlet valve stuck open inhibits the CG control transfers', () => {
    activeFailures.add(A380Failure.FuelFeedTank1FwdInletValveOpen);
    const instrument = new FuelTransferFaults(failures);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    expect(instrument.restrictions.cgTransfersInhibited).toBe(true);
    expect(instrument.restrictions.outerPumpedTransferLost).toBe(true);
    expect(instrument.restrictions.manualTransferRequired).toBe(false);
  });
});

describe('fuel leak', () => {
  it('reads the registered simvars: the engine leak detection runs from the engine state', () => {
    activeFailures.add(A380Failure.Eng2FuelLeak);
    for (let engine = 1; engine <= 4; engine++) {
      simVars.set(`L:A32NX_ENGINE_STATE:${engine}`, 1);
    }
    simVars.set('SIM ON GROUND', 0);
    simVars.set('L:A32NX_TOTAL_FUEL_QUANTITY', 100_000);
    const instrument = new FuelLeak({ deltaTime: 60_000 }, failures);

    // 5 minutes of detection time at 1 minute a frame
    spies.getSimVarValue.mockClear();
    for (let frame = 0; frame < 5; frame++) {
      instrument.onUpdate();
    }
    // the leaked fuel is taken out of the tank every 500 ms by name, which is not a per frame read
    const readNames = spies.getSimVarValue.mock.calls.map(([name]) => String(name));
    expect(readNames.filter((name) => !name.startsWith('FUELSYSTEM TANK QUANTITY'))).toEqual([]);

    expect(simVars.get('L:A32NX_ENGINE_2_FUEL_LEAK')).toBe(true);
    expect(simVars.get('L:A32NX_ENGINE_1_FUEL_LEAK')).toBe(false);
  });
});

describe('weight and balance backup computer', () => {
  /** A slat/flap actual position word with the slats and flaps retracted and their data valid */
  const retractedWord = Arinc429Word.getRawWord(
    (1 << 10) | (1 << 11) | (1 << 17) | (1 << 18),
    Arinc429SignStatusMatrix.NormalOperation,
  );

  it('writes the gross weight and CG words from the registered simvars, and rewrites them only when they change', () => {
    simVars.set('SIM ON GROUND', 0);
    simVars.set('L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD', retractedWord);
    simVars.set('TOTAL WEIGHT', 400_000);
    simVars.set('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', 30);
    const instrument = new WeightBalanceBackup(failures);
    const registeredWrites = vi.spyOn(Coherent as any, 'call');

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    // the gross weight and the CG are each written once over the unchanged updates
    expect(registeredWrites).toHaveBeenCalledTimes(2);
    expect(simVars.get('L:A380X_WBBC_GROSS_WEIGHT')).toBe(
      Arinc429Word.getRawWord(400_000, Arinc429SignStatusMatrix.NormalOperation).toString(),
    );
    expect(simVars.get('L:A380X_WBBC_CENTER_OF_GRAVITY_MAC')).toBe(
      Arinc429Word.getRawWord(30, Arinc429SignStatusMatrix.NormalOperation).toString(),
    );

    simVars.set('TOTAL WEIGHT', 390_000);
    instrument.onUpdate();
    expect(registeredWrites).toHaveBeenCalledTimes(3);
    expect(simVars.get('L:A380X_WBBC_GROSS_WEIGHT')).toBe(
      Arinc429Word.getRawWord(390_000, Arinc429SignStatusMatrix.NormalOperation).toString(),
    );
  });

  it('gives no computed data on the ground', () => {
    simVars.set('SIM ON GROUND', 1);
    const instrument = new WeightBalanceBackup(failures);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    expect(simVars.get('L:A380X_WBBC_GROSS_WEIGHT')).toBe(
      Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData).toString(),
    );
  });
});

describe('fuel valves and pumps driven through the MSFS access', () => {
  it('APU feed: closes the APU valves when the APU is off, from the registered simvars', () => {
    simVars.set('A:FUELSYSTEM VALVE SWITCH:50', 1);
    simVars.set('A:FUELSYSTEM VALVE SWITCH:51', 1);
    simVars.set('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 0);
    const instrument = new FuelApuFeed(sysHost, failures);
    // the first update takes the valve switches as the selection, the second one commands them
    instrument.onUpdate();
    instrument.onUpdate();
    expect(spies.setSimVarValue).toHaveBeenCalledWith('K:FUELSYSTEM_VALVE_CLOSE', 'number', 50);
    expect(spies.setSimVarValue).toHaveBeenCalledWith('K:FUELSYSTEM_VALVE_CLOSE', 'number', 51);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate(), 2);

    expect(simVars.get(APU_FEED_ABNORMALLY_CLOSED_VAR)).toBe(false);
    expect(simVars.get(APU_FEED_ABNORMALLY_OPEN_VAR)).toBe(false);
  });

  it('emergency outer tank transfer: opens the valves from the EMER OUTR TK XFR pb-sw', () => {
    simVars.set('L:A380X_OVHD_FUEL_EMER_OUTR_XFR_PB_IS_ON', 1);
    simVars.set('L:A380X_OVHD_FUEL_OUTR_XFR_PB_IS_AUTO', 1);
    const instrument = new FuelEmerOuterTransfer(sysHost);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate(), 1);

    expect(spies.setSimVarValue).toHaveBeenCalledWith('K:FUELSYSTEM_VALVE_OPEN', 'number', 52);
    expect(spies.setSimVarValue).toHaveBeenCalledWith('K:FUELSYSTEM_VALVE_OPEN', 'number', 53);
  });

  it('feed pump and valve failures: holds a failed feed pump off and publishes the low pressure', () => {
    simVars.set('A:FUELSYSTEM PUMP SWITCH:5', 1);
    simVars.set('A:CIRCUIT CONNECTION ON:66', 1);
    activeFailures.add(A380Failure.FuelFeedTank3MainPump);
    const instrument = new FuelPumpsAndValves(sysHost, failures);
    // the first update confirms the failure confirm node (it reads L:A32NX_FWC_SKIP_STARTUP by name)
    instrument.onUpdate();
    expect(spies.setSimVarValue).toHaveBeenCalledWith('K:FUELSYSTEM_PUMP_OFF', 'number', 5);

    runUpdatesWithoutNameLookups(() => instrument.onUpdate());

    expect(simVars.get('L:A380X_FUEL_FEED_TK_3_MAIN_PMP_LO_PR')).toBe(true);
    expect(simVars.get('L:A380X_FUEL_FEED_TK_3_STBY_PMP_LO_PR')).toBe(false);
  });
});

describe('fuel overflow and refuel faults', () => {
  it('the refuel stops and the fault shows once a wing tank overflows', () => {
    activeFailures.add(A380Failure.FuelLeftOuterTankInletValveStuckOpen);
    simVars.set('FUEL WEIGHT PER GALLON', 6.7);
    simVars.set('FUELSYSTEM TANK QUANTITY:1', 5000);
    simVars.set('FUELSYSTEM TANK CAPACITY:1', 5000);
    simVars.set(REFUEL_STARTED_VAR, 1);
    const overflow = new FuelOverflow({ deltaTime: 1000 }, failures);
    const refuelFaults = new FuelRefuelFaults(failures);

    // 1 730 lb of surge tank fuel at 4 400 lb/h
    runUpdatesWithoutNameLookups(() => {
      overflow.onUpdate();
      refuelFaults.onUpdate();
    }, 1500);

    expect(simVars.get(L_WING_TK_OVERFLOW_VAR)).toBe(true);
    expect(simVars.get(REFUEL_FAULT_VAR)).toBe(true);
    expect(simVars.get(REFUEL_STARTED_VAR)).toBe(false);
  });
});
