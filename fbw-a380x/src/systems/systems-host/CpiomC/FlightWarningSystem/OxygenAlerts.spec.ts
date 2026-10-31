// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import { cabinOxygenMinimumPressurePsi, OXYGEN_ALERT_IDS, OxygenAlertInputs, oxygenAlerts } from './OxygenAlerts';

const normal: OxygenAlertInputs = {
  ckptBottlePressurePsi: 1850,
  cabinBottlePressurePsi: 1850,
  cabinValveClosed: false,
  oneEngineRunning: true,
  fmsPassengers: 500,
  cabinAltitudeFt: 8000,
  masksReleased: false,
};

/* OXY CKPT BOTTLE PRESS LO */
describe('OXY CKPT BOTTLE PRESS LO', () => {
  it('triggers below 350 PSI', () => {
    expect(oxygenAlerts({ ...normal, ckptBottlePressurePsi: 349 }).ckptBottlePressLo).toBe(true);
    expect(oxygenAlerts({ ...normal, ckptBottlePressurePsi: 350 }).ckptBottlePressLo).toBe(false);
    expect(oxygenAlerts(normal)).toEqual({
      cabinBottlePressLo: false,
      cabinValveClosed: false,
      ckptBottlePressLo: false,
    });
  });

  it('is inhibited above 13 800 ft of cabin altitude or with the masks released (MASK MAN ON pb)', () => {
    const low = { ...normal, ckptBottlePressurePsi: 100 };
    expect(oxygenAlerts({ ...low, cabinAltitudeFt: 14_000 }).ckptBottlePressLo).toBe(false);
    expect(oxygenAlerts({ ...low, masksReleased: true }).ckptBottlePressLo).toBe(false);
    // Without cabin altitude (no CPCS data) only the MASK MAN ON pb inhibits it
    expect(oxygenAlerts({ ...low, cabinAltitudeFt: null }).ckptBottlePressLo).toBe(true);
  });
});

/* OXY CABIN BOTTLE PRESS LO, and the emergency descent oxygen limitation table */
describe('OXY CABIN BOTTLE PRESS LO', () => {
  it('takes the minimum pressure of the emergency descent for the FMS passengers', () => {
    expect(cabinOxygenMinimumPressurePsi(100)).toBe(286);
    expect(cabinOxygenMinimumPressurePsi(500)).toBe(1003);
    expect(cabinOxygenMinimumPressurePsi(550)).toBeCloseTo(1090.5);
    expect(cabinOxygenMinimumPressurePsi(800)).toBe(1526);
    expect(cabinOxygenMinimumPressurePsi(0)).toBe(286);
    expect(cabinOxygenMinimumPressurePsi(853)).toBe(1526);

    expect(oxygenAlerts({ ...normal, cabinBottlePressurePsi: 1000 }).cabinBottlePressLo).toBe(true);
    expect(oxygenAlerts({ ...normal, cabinBottlePressurePsi: 1010 }).cabinBottlePressLo).toBe(false);
  });

  it('triggers below 800 PSI before one engine starts', () => {
    const beforeStart = { ...normal, oneEngineRunning: false, fmsPassengers: 800 };
    expect(oxygenAlerts({ ...beforeStart, cabinBottlePressurePsi: 799 }).cabinBottlePressLo).toBe(true);
    expect(oxygenAlerts({ ...beforeStart, cabinBottlePressurePsi: 801 }).cabinBottlePressLo).toBe(false);
  });

  it('is inhibited in a depressurization', () => {
    const low = { ...normal, cabinBottlePressurePsi: 100 };
    expect(oxygenAlerts({ ...low, cabinAltitudeFt: 14_000 }).cabinBottlePressLo).toBe(false);
    expect(oxygenAlerts({ ...low, masksReleased: true }).cabinBottlePressLo).toBe(false);
  });
});

/* OXY CABIN VLV CLOSED */
describe('OXY CABIN VLV CLOSED', () => {
  it('follows the closed regulator supply valve', () => {
    expect(oxygenAlerts({ ...normal, cabinValveClosed: true }).cabinValveClosed).toBe(true);
  });
});

describe('OXY alert definitions', () => {
  const { core, simVars } = createFws(new Set());
  const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[id];

  it('defines the three procedures and their FWS entries', () => {
    for (const id of Object.values(OXYGEN_ALERT_IDS)) {
      expect(EcamAbnormalProcedures[id]).toBeDefined();
      expect(alert(id)).toBeDefined();
    }
  });

  it('drives each FWS entry with its own signal', () => {
    expect(alert(OXYGEN_ALERT_IDS.cabinBottlePressLo).simVarIsActive).toBe(core.oxyCabinBottlePressLo);
    expect(alert(OXYGEN_ALERT_IDS.cabinValveClosed).simVarIsActive).toBe(core.oxyCabinValveClosed);
    expect(alert(OXYGEN_ALERT_IDS.ckptBottlePressLo).simVarIsActive).toBe(core.oxyCkptBottlePressLo);
  });

  it('raises the signals from the oxygen model variables', () => {
    simVars.set('L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE', 1850);
    simVars.set('L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE', 1850);
    runFwsCycle(core);
    expect([core.oxyCkptBottlePressLo.get(), core.oxyCabinBottlePressLo.get(), core.oxyCabinValveClosed.get()]).toEqual(
      [false, false, false],
    );

    simVars.set('L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE', 300);
    simVars.set('L:A32NX_OXYGEN_CABIN_VALVE_CLOSED', true);
    runFwsCycle(core);
    expect(core.oxyCkptBottlePressLo.get()).toBe(true);
    expect(core.oxyCabinValveClosed.get()).toBe(true);
    expect(core.oxyCabinBottlePressLo.get()).toBe(false);
  });
});

describe('OXY BOTTLE PRESS LO depressurization inhibit in flight', () => {
  it('reads the cabin altitude in cruise too', () => {
    const { core, simVars } = createFws(new Set());
    const normalWord = (value: number) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
    // Hold the phase: the cycle would compute phase 1 from the all-zero simvars
    core.flightPhase.set(6);
    core.flightPhase.set = () => undefined;
    simVars.set('L:A32NX_AFDX_3_7_REACHABLE', true);
    simVars.set('L:A32NX_COND_CPIOM_B1_CPCS_DISCRETE_WORD', normalWord(0));
    simVars.set('L:A32NX_PRESS_CABIN_ALTITUDE_B1', normalWord(8000));
    simVars.set('L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE', 100);
    simVars.set('L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE', 100);
    runFwsCycle(core);
    expect(core.oxyCkptBottlePressLo.get()).toBe(true);

    simVars.set('L:A32NX_PRESS_CABIN_ALTITUDE_B1', normalWord(20_000));
    runFwsCycle(core);
    expect(core.oxyCkptBottlePressLo.get()).toBe(false);
    expect(core.oxyCabinBottlePressLo.get()).toBe(false);
  });
});
