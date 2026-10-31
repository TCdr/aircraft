// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320Failure, A320FailureDefinitions } from './a320';
import {
  AIR_AFT_CRG_VENT_FAULT_KEY,
  VENT_AVNCS_SYS_FAULT_KEY,
  VENT_BLOWER_FAULT_KEY,
  VENT_EXTRACT_FAULT_KEY,
  VENT_SKIN_VALVE_FAULT_EXTRACT_KEY,
  VENT_SKIN_VALVE_FAULT_INLET_KEY,
  VentilationAlerts,
  VentilationSystemInputs,
} from '../../systems-host/systems/FWC/Logic/VentilationAlerts';
import {
  COM_CIDS_FAULT_KEY,
  COM_SINGLE_PTT_STUCK_KEY,
  COM_VHF_EMITTING_KEYS,
  CommunicationAlerts,
  ComSystemInputs,
} from '../../systems-host/systems/FWC/Logic/CommunicationAlerts';
import { TCAS_MODE_FAULT_KEY, TcasModeFaultAlert } from '../../systems-host/systems/FWC/Logic/TcasModeFaultAlert';
import { IdgCoolingAlertKeys, IdgCoolingAlerts } from '../../systems-host/systems/FWC/Logic/IdgCoolingAlerts';
import { EisRecorderAlertKeys, EisRecorderAlerts } from '../../systems-host/systems/FWC/Logic/EisRecorderAlerts';
import {
  DATALINK_ATSU_FAULT_KEY,
  DATALINK_COMPANY_FAULT_KEY,
  DatalinkAlerts,
} from '../../systems-host/systems/FWC/Logic/DatalinkAlerts';
import {
  EngineFadecFaultAlerts,
  NO_FADEC_FAULT,
  TYPE_DISAGREE_KEY,
  VIB_SYS_FAULT_KEY,
} from '../../systems-host/systems/FWC/Logic/EngineFadecFaultAlerts';
import { FwcAlertItem } from '../../systems-host/systems/FWC/Logic/FwcAlertItem';

/*
 * The flyPad failures that are TS only (no Rust failure behind them) are read by the FWC Logic modules. These specs run
 * each module with a failures consumer in which only the failure under test is active, and check that the alert of that
 * failure is triggered and that nothing is triggered without a failure. A failure id the module does not read, or one
 * that is not in the flyPad failure list, fails here.
 */

/** A failures consumer double: the registered failures and the active ones */
class TestFailures {
  public readonly registered: number[] = [];

  public readonly active: Set<number>;

  constructor(activeFailures: number[]) {
    this.active = new Set(activeFailures);
  }

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(identifier: number): boolean {
    return this.active.has(identifier);
  }
}

/** The keys of the alerts that are triggered now */
const triggeredKeys = (items: Record<string, FwcAlertItem>): string[] =>
  Object.keys(items).filter((key) => items[key].simVarIsActive.get());

/** A module under test: runs it with the failures given and gives the alert keys that are triggered */
type Scenario = (activeFailures: number[]) => { registered: number[]; triggered: string[] };

/**
 * @param scenario runs the module with the failures active
 * @param expectations the failures that must trigger the alert key, together (some alerts need two failures)
 */
function expectEachFailureTriggers(scenario: Scenario, expectations: [number[], string][]): void {
  expect(scenario([]).triggered, 'no failure: no alert').toEqual([]);
  for (const [failures, alertKey] of expectations) {
    const { registered, triggered } = scenario(failures);
    for (const failure of failures) {
      expect(registered, `failure ${failure} is registered`).toContain(failure);
      expect(
        A320FailureDefinitions.some(([, id]) => id === failure),
        `failure ${failure} is in the flyPad list`,
      ).toBe(true);
    }
    expect(triggered, `failures ${failures.join('+')}`).toContain(alertKey);
  }
}

describe('A320 flyPad failures read by the FWC (TS only failures)', () => {
  it('the avionics and AFT cargo ventilation failures trigger their VENT alerts', () => {
    const system: VentilationSystemInputs = {
      blowerPbAuto: true,
      extractPbAuto: true,
      dcEssBusFault: false,
      aftCargoSmoke: false,
      aftIsolValvePbAuto: true,
      aftCargoIsolValvesOpen: true,
      aftCargoIsolValvesDisagree: false,
      flightPhase: 6,
      onGround: false,
    };
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alerts = new VentilationAlerts(failures);
      alerts.init();
      alerts.update(system, true);
      return { registered: failures.registered, triggered: triggeredKeys(alerts.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [
      [[A320Failure.AvionicsVentilationController], VENT_AVNCS_SYS_FAULT_KEY],
      [[A320Failure.AvionicsBlowerFan], VENT_BLOWER_FAULT_KEY],
      [[A320Failure.AvionicsExtractFan], VENT_EXTRACT_FAULT_KEY],
      [[A320Failure.AvionicsSkinExtractValveStuckOpen], VENT_SKIN_VALVE_FAULT_EXTRACT_KEY],
      [[A320Failure.AvionicsSkinInletValveStuckOpen], VENT_SKIN_VALVE_FAULT_INLET_KEY],
      [[A320Failure.AftCargoExtractionFan], AIR_AFT_CRG_VENT_FAULT_KEY],
    ]);
  });

  it('the CIDS, push-to-talk and VHF stuck failures trigger their COM alerts', () => {
    const system: ComSystemInputs = {
      acpTransmitVhf: [1, 2],
      vhfSupplied: [true, true, true],
      vhf3DataMode: false,
      audioSwitchingNorm: true,
    };
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alerts = new CommunicationAlerts(failures);
      alerts.init();
      // the PTT stuck and VHF emitting alerts are timed: 100 s is past both delays
      for (let second = 0; second < 100; second++) {
        alerts.update(system, 1);
      }
      return { registered: failures.registered, triggered: triggeredKeys(alerts.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [
      [[A320Failure.CidsDirector1, A320Failure.CidsDirector2], COM_CIDS_FAULT_KEY],
      [[A320Failure.CaptPttStuck], COM_SINGLE_PTT_STUCK_KEY],
      [[A320Failure.FoPttStuck], COM_SINGLE_PTT_STUCK_KEY],
      [[A320Failure.Vhf1StuckEmitting], COM_VHF_EMITTING_KEYS[0]],
      [[A320Failure.Vhf2StuckEmitting], COM_VHF_EMITTING_KEYS[1]],
      [[A320Failure.Vhf3StuckEmitting], COM_VHF_EMITTING_KEYS[2]],
    ]);
  });

  it('the FG TCAS mode failure triggers AUTO FLT TCAS MODE FAULT', () => {
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alert = new TcasModeFaultAlert(failures);
      alert.init();
      alert.update(true);
      return { registered: failures.registered, triggered: triggeredKeys(alert.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [[[A320Failure.TcasModeFailure], TCAS_MODE_FAULT_KEY]]);
  });

  it('the IDG fuel cooling failures trigger FUEL IDG 1 and IDG 2 COOL FAULT', () => {
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alerts = new IdgCoolingAlerts(failures);
      alerts.init();
      alerts.update();
      return { registered: failures.registered, triggered: triggeredKeys(alerts.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [
      [[A320Failure.Idg1FuelCoolingCommand], IdgCoolingAlertKeys.coolFault[0]],
      [[A320Failure.Idg2FuelCoolingCommand], IdgCoolingAlertKeys.coolFault[1]],
    ]);
  });

  it('the DMC, SDAC and recorder failures trigger their EIS and RECORDER alerts', () => {
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alerts = new EisRecorderAlerts(failures);
      alerts.init();
      // DMC 1(2) FAULT is inhibited for the first seconds of the takeoff phase only; phase 6 is cruise
      alerts.update(0, 6, 1);
      return { registered: failures.registered, triggered: triggeredKeys(alerts.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [
      [[A320Failure.Dmc1], EisRecorderAlertKeys.dmcFault[0]],
      [[A320Failure.Dmc2], EisRecorderAlertKeys.dmcFault[1]],
      [[A320Failure.Dmc3], EisRecorderAlertKeys.dmcFault[2]],
      [[A320Failure.DmcFwcBuses], EisRecorderAlertKeys.dmcFwcComFault],
      [[A320Failure.Sdac1], EisRecorderAlertKeys.sdacFault[0]],
      [[A320Failure.Sdac2], EisRecorderAlertKeys.sdacFault[1]],
      [[A320Failure.Dfdr], EisRecorderAlertKeys.dfdrFault],
      [[A320Failure.Fdiu], EisRecorderAlertKeys.recorderSysFault],
    ]);
  });

  it('the ATSU failures trigger DATALINK ATSU FAULT and DATALINK COMPANY FAULT', () => {
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alerts = new DatalinkAlerts(failures);
      alerts.init();
      alerts.update(true);
      return { registered: failures.registered, triggered: triggeredKeys(alerts.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [
      [[A320Failure.Atsu], DATALINK_ATSU_FAULT_KEY],
      [[A320Failure.AtsuAoc], DATALINK_COMPANY_FAULT_KEY],
    ]);
  });

  it('the vibration monitoring unit and rating plug failures trigger VIB SYS FAULT and ENG TYPE DISAGREE', () => {
    const scenario: Scenario = (active) => {
      const failures = new TestFailures(active);
      const alerts = new EngineFadecFaultAlerts(failures);
      alerts.init();
      alerts.update({
        faults: [NO_FADEC_FAULT, NO_FADEC_FAULT],
        onGround: false,
        flightPhase: 6,
        engineAntiIceOn: [false, false],
      });
      return { registered: failures.registered, triggered: triggeredKeys(alerts.ewdFailures) };
    };
    expectEachFailureTriggers(scenario, [
      [[A320Failure.EngineVibrationMonitoringUnit], VIB_SYS_FAULT_KEY],
      [[A320Failure.Eng1RatingPlug], TYPE_DISAGREE_KEY],
      [[A320Failure.Eng2RatingPlug], TYPE_DISAGREE_KEY],
    ]);
  });
});
