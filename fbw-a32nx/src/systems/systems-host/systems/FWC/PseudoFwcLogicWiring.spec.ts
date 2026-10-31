// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFwc, installFwcSimVarMocks, runFwc, setHealthyCruise } from './PseudoFwcTestBed';
import { CommunicationAlerts } from './Logic/CommunicationAlerts';
import { DatalinkAlerts } from './Logic/DatalinkAlerts';
import { EisRecorderAlerts } from './Logic/EisRecorderAlerts';
import { EngineFadecFaultAlerts } from './Logic/EngineFadecFaultAlerts';
import { FuelSystemFaultAlerts } from './Logic/FuelSystemFaultAlerts';
import { IdgCoolingAlerts } from './Logic/IdgCoolingAlerts';
import { AirPackAlerts } from './Logic/AirPackAlerts';
import { PredictiveWindshearAlerts } from './Logic/PredictiveWindshearAlerts';
import { SidestickStabilizerAlerts } from './Logic/SidestickStabilizerAlerts';
import { SlatFlapLockAlerts } from './Logic/SlatFlapLockAlerts';
import { TcasModeFaultAlert } from './Logic/TcasModeFaultAlert';
import { VentilationAlerts } from './Logic/VentilationAlerts';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/**
 * The alert modules of the Logic folder, as the real PseudoFWC holds them: the name of the PseudoFWC member, and the
 * module's class when the FWC has to initialise it (register its failures or listeners) at start-up.
 */
const ALERT_MODULES: { member: string; initialisedBy?: { prototype: { init: (...args: any[]) => void } } }[] = [
  { member: 'airPackAlerts', initialisedBy: AirPackAlerts },
  { member: 'bleedAlerts' },
  { member: 'bleedLeakMonitoringAlerts' },
  { member: 'brakeGearFaultAlerts' },
  { member: 'cabinPressureAlerts' },
  { member: 'communicationAlerts', initialisedBy: CommunicationAlerts },
  { member: 'datalinkAlerts', initialisedBy: DatalinkAlerts },
  { member: 'doorAlerts' },
  { member: 'eisRecorderAlerts', initialisedBy: EisRecorderAlerts },
  { member: 'engineFadecFaultAlerts', initialisedBy: EngineFadecFaultAlerts },
  { member: 'engineIndicationDiscrepancyAlerts' },
  { member: 'fuelSystemFaultAlerts', initialisedBy: FuelSystemFaultAlerts },
  { member: 'fuelTemperatureAlerts' },
  { member: 'fuelTransferAlerts' },
  { member: 'gpwsAlerts' },
  { member: 'idgCoolingAlerts', initialisedBy: IdgCoolingAlerts },
  { member: 'landingGearAlerts' },
  { member: 'lavatorySmokeAlerts' },
  { member: 'predictiveWindshearAlerts', initialisedBy: PredictiveWindshearAlerts },
  { member: 'sidestickStabilizerAlerts', initialisedBy: SidestickStabilizerAlerts },
  { member: 'slatFlapLockAlerts', initialisedBy: SlatFlapLockAlerts },
  { member: 'tcasModeFaultAlert', initialisedBy: TcasModeFaultAlert },
  { member: 'thrustLockedAlert' },
  { member: 'ventilationAlerts', initialisedBy: VentilationAlerts },
  { member: 'wingAntiIceAlerts' },
  { member: 'wingAntiIceValveOpenAlerts' },
];

describe('the alert modules of the Logic folder inside the real PseudoFWC', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  it('initialises the modules that register failures or listeners when the FWC starts', () => {
    const initSpies = ALERT_MODULES.filter((module) => module.initialisedBy).map((module) => ({
      member: module.member,
      spy: vi.spyOn(module.initialisedBy!.prototype, 'init'),
    }));
    createFwc();
    for (const { member, spy } of initSpies) {
      expect(spy, member).toHaveBeenCalledTimes(1);
    }
    vi.restoreAllMocks();
  });

  it('updates every module on each cycle and offers its alerts in the E/WD message table', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    const members = fwc as unknown as Record<string, any>;
    const updateSpies = ALERT_MODULES.map((module) => ({
      member: module.member,
      spy: vi.spyOn(members[module.member], 'update'),
    }));
    runFwc(fwc, 1);
    for (const { member, spy } of updateSpies) {
      expect(spy, member).toHaveBeenCalled();
    }
    for (const module of ALERT_MODULES) {
      const items: Record<string, unknown> = members[module.member].ewdFailures;
      const keys = Object.keys(items);
      expect(keys.length, module.member).toBeGreaterThan(0);
      for (const key of keys) {
        expect(fwc.ewdMessageFailures[key], `${module.member} ${key}`).toBe(items[key]);
      }
    }
  });
});
