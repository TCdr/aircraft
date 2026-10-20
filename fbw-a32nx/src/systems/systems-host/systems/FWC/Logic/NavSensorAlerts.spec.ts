// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { FwcAlertItem } from './FwcAlertItem';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';
import {
  NAV_SENSOR_ALERT_KEYS as KEYS,
  NavSensorAlertInputs,
  NavSensorAlerts,
  NavSensorFailuresSource,
  areProbesInopWithStaticFault,
  isAirspeedDiscrepancy,
  isAngleOfAttackLost,
} from './NavSensorAlerts';
import { ProbeHeatComputerFlags } from './ProbeWindowHeatAlerts';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements NavSensorFailuresSource {
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

const HEAT_OK: ProbeHeatComputerFlags = {
  computerFault: false,
  pitot: false,
  leftStatic: false,
  rightStatic: false,
  aoa: false,
  tat: false,
};

const ALL_HEAT_OK = [HEAT_OK, HEAT_OK, HEAT_OK];

const LEVEL = { awareness: 1, caution: 2 };

/** Everything normal: both sides show the same attitude, heading and airspeed */
function normalInputs(): NavSensorAlertInputs {
  const side = { pitchDegrees: 2, rollDegrees: 0, headingDegrees: 90 };
  return {
    ilsFailed: [false, false],
    onGround: false,
    angleOfAttackLost: [false, false, false],
    captAttitudeHeading: { ...side },
    foAttitudeHeading: { ...side },
    captAirspeedKt: 250,
    foAirspeedKt: 250,
    staticProbeFailed: [false, false, false, false],
    probeHeatComputers: ALL_HEAT_OK,
    adsbFailed: [false, false],
    xpdrFailed: [false, false],
    selectedXpdr: 1,
  };
}

/** The keys of the alerts that are on */
function activeKeys(alerts: NavSensorAlerts): string[] {
  return Object.keys(alerts.ewdFailures).filter((key) => alerts.ewdFailures[key].simVarIsActive.get());
}

/** Runs the alerts with the inputs for the given time, in 100 ms frames */
function run(alerts: NavSensorAlerts, inputs: NavSensorAlertInputs, seconds = 0.1): void {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.1) {
    alerts.update(inputs, 100);
  }
}

/** The STATUS page lines (left and right column) of an alert item */
const statusOf = (item: FwcAlertItem) => statusLines({ left: item.statusInfo(), inopSys: item.inopSys() });

const word = (value: number, ssm: Arinc429SignStatusMatrix) => new Arinc429Word(Arinc429Word.getRawWord(value, ssm));

describe('A32NX FWC NAV sensor alerts', () => {
  let alerts: NavSensorAlerts;

  beforeEach(() => {
    alerts = new NavSensorAlerts(new TestFailures());
  });

  it('shows nothing when all the sensors work', () => {
    run(alerts, normalInputs(), 10);
    expect(activeKeys(alerts)).toEqual([]);
  });

  describe('NAV ILS 1(2)(1+2) FAULT', () => {
    it('shows one alert per combination of failed receivers', () => {
      const inputs = normalInputs();
      inputs.ilsFailed = [true, false];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([KEYS.ils1Fault]);
      inputs.ilsFailed = [false, true];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([KEYS.ils2Fault]);
      inputs.ilsFailed = [true, true];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([KEYS.ils12Fault]);
      inputs.ilsFailed = [false, false];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);
    });

    it('is crew awareness, inhibited in phases 3, 4, 5, with its title', () => {
      for (const key of [KEYS.ils1Fault, KEYS.ils2Fault, KEYS.ils12Fault]) {
        const item = alerts.ewdFailures[key];
        expect(item.failure).toBe(LEVEL.awareness);
        expect(item.flightPhaseInhib).toEqual([3, 4, 5]);
      }
      expect(ewdLines(alerts.ewdFailures[KEYS.ils1Fault])).toEqual(['NAV ILS 1 FAULT']);
      expect(ewdLines(alerts.ewdFailures[KEYS.ils2Fault])).toEqual(['NAV ILS 2 FAULT']);
      expect(ewdLines(alerts.ewdFailures[KEYS.ils12Fault])).toEqual(['NAV ILS 1+2 FAULT']);
    });

    it('STATUS: INOP SYS ILS, CAT 2 for one receiver, GPWS for ILS 1 on the ground or both', () => {
      const inputs = normalInputs();
      const status = (key: string) => statusOf(alerts.ewdFailures[key]).right;
      run(alerts, inputs);
      expect(status(KEYS.ils1Fault)).toEqual(['INOP SYS', 'ILS 1', 'CAT 2']);
      expect(status(KEYS.ils2Fault)).toEqual(['INOP SYS', 'ILS 2', 'CAT 2']);
      expect(status(KEYS.ils12Fault)).toContain('ILS 1+2');
      expect(status(KEYS.ils12Fault)).toContain('GPWS');
      expect(status(KEYS.ils12Fault)).not.toContain('CAT 2');
      inputs.onGround = true;
      run(alerts, inputs);
      expect(status(KEYS.ils1Fault)).toContain('GPWS');
      expect(status(KEYS.ils2Fault)).not.toContain('GPWS');
    });
  });

  describe('NAV CAPT(F/O)(STBY) AOA FAULT', () => {
    it('is the angle of attack of a working ADR lost', () => {
      const failed = word(0, Arinc429SignStatusMatrix.FailureWarning);
      const normal = word(3, Arinc429SignStatusMatrix.NormalOperation);
      const noComputedData = word(0, Arinc429SignStatusMatrix.NoComputedData);
      expect(isAngleOfAttackLost(failed, normal)).toBe(true);
      // The whole ADR lost: NAV ADR FAULT instead
      expect(isAngleOfAttackLost(failed, failed)).toBe(false);
      // Below the minimum airspeed the AOA is not computed, it is not failed
      expect(isAngleOfAttackLost(noComputedData, normal)).toBe(false);
      expect(isAngleOfAttackLost(normal, normal)).toBe(false);
    });

    it('shows the alert of the ADR side, crew awareness, only in phases 1 and 10, STATUS INOP SYS the AOA', () => {
      const inputs = normalInputs();
      const titles = ['NAV CAPT AOA FAULT', 'NAV F/O AOA FAULT', 'NAV STBY AOA FAULT'];
      const inopSys = ['CAPT AOA', 'F/O AOA', 'STBY AOA'];
      [KEYS.captAoaFault, KEYS.foAoaFault, KEYS.stbyAoaFault].forEach((key, adr) => {
        inputs.angleOfAttackLost = [0, 1, 2].map((index) => index === adr);
        run(alerts, inputs);
        expect(activeKeys(alerts)).toEqual([key]);
        const item = alerts.ewdFailures[key];
        expect(item.failure).toBe(LEVEL.awareness);
        expect(item.flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
        expect(ewdLines(item)).toEqual([titles[adr]]);
        expect(statusOf(item).right).toEqual(['INOP SYS', inopSys[adr]]);
      });
      inputs.angleOfAttackLost = [false, false, false];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);
    });
  });

  describe('NAV ATT DISCREPANCY', () => {
    it('comes on after 5 s of 5 degrees or more of pitch or roll between the sides, goes when they agree', () => {
      const inputs = normalInputs();
      inputs.captAttitudeHeading.pitchDegrees = 12;
      run(alerts, inputs, 4.8);
      expect(activeKeys(alerts)).toEqual([]);
      run(alerts, inputs, 0.5);
      expect(activeKeys(alerts)).toEqual([KEYS.attDiscrepancy]);

      inputs.captAttitudeHeading.pitchDegrees = 2;
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);

      inputs.foAttitudeHeading.rollDegrees = 5;
      run(alerts, inputs, 5.5);
      expect(activeKeys(alerts)).toEqual([KEYS.attDiscrepancy]);
    });

    it('does not compare a side whose attitude is not valid', () => {
      const inputs = normalInputs();
      inputs.captAttitudeHeading.pitchDegrees = null;
      inputs.foAttitudeHeading.pitchDegrees = 30;
      run(alerts, inputs, 10);
      expect(activeKeys(alerts)).toEqual([]);
    });

    it('is a caution inhibited in phases 3, 4, 8, with ATT X CHECK and ATT HDG SWTG AS REQD', () => {
      const item = alerts.ewdFailures[KEYS.attDiscrepancy];
      expect(item.failure).toBe(LEVEL.caution);
      expect(item.flightPhaseInhib).toEqual([3, 4, 8]);
      expect(ewdLines(item)).toEqual(['NAV ATT DISCREPANCY', ' -ATT............X CHECK', ' -ATT HDG SWTG...AS REQD']);
      expect(item.inopSys()).toEqual([]);
    });
  });

  describe('NAV HDG DISCREPANCY', () => {
    it('comes on after 5 s of 5 degrees or more of heading between the sides, across north', () => {
      const inputs = normalInputs();
      inputs.captAttitudeHeading.headingDegrees = 358;
      inputs.foAttitudeHeading.headingDegrees = 2;
      run(alerts, inputs, 10);
      expect(activeKeys(alerts)).toEqual([]);
      inputs.foAttitudeHeading.headingDegrees = 3;
      run(alerts, inputs, 5.5);
      expect(activeKeys(alerts)).toEqual([KEYS.hdgDiscrepancy]);
      inputs.foAttitudeHeading.headingDegrees = 358;
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);
    });

    it('is a caution inhibited in phases 4, 8, with HDG X CHECK and ATT HDG SWTG AS REQD', () => {
      const item = alerts.ewdFailures[KEYS.hdgDiscrepancy];
      expect(item.failure).toBe(LEVEL.caution);
      expect(item.flightPhaseInhib).toEqual([4, 8]);
      expect(ewdLines(item)).toEqual(['NAV HDG DISCREPANCY', ' -HDG............X CHECK', ' -ATT HDG SWTG...AS REQD']);
    });
  });

  describe('NAV IAS DISCREPANCY', () => {
    it('compares the airspeeds of the two PFDs with a 16 kt threshold, valid airspeeds only', () => {
      expect(isAirspeedDiscrepancy(250, 234)).toBe(false);
      expect(isAirspeedDiscrepancy(250, 233)).toBe(true);
      expect(isAirspeedDiscrepancy(210, 250)).toBe(true);
      expect(isAirspeedDiscrepancy(null, 250)).toBe(false);
      expect(isAirspeedDiscrepancy(250, null)).toBe(false);
    });

    it('comes on after 5 s, goes when the airspeeds agree', () => {
      const inputs = normalInputs();
      inputs.foAirspeedKt = 210;
      run(alerts, inputs, 4.8);
      expect(activeKeys(alerts)).toEqual([]);
      run(alerts, inputs, 0.5);
      expect(activeKeys(alerts)).toEqual([KEYS.iasDiscrepancy]);
      inputs.foAirspeedKt = 250;
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);
    });

    it('is a caution inhibited in phases 4, 5, 7, 8; STATUS CAT 3 SINGLE ONLY, INOP SYS CAT 3 DUAL', () => {
      const item = alerts.ewdFailures[KEYS.iasDiscrepancy];
      expect(item.failure).toBe(LEVEL.caution);
      expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
      expect(ewdLines(item)).toEqual(['NAV IAS DISCREPANCY', ' -AIR SPD........X CHECK', ' -AIR DATA SWTG..AS REQD']);
      const status = statusOf(item);
      expect(status.left).toEqual(['CAT 3 SINGLE ONLY']);
      expect(status.right).toEqual(['INOP SYS', 'CAT 3 DUAL']);
    });
  });

  describe('NAV L(R) CAPT(F/O) STATIC FAULT', () => {
    const keys = [KEYS.leftCaptStaticFault, KEYS.rightCaptStaticFault, KEYS.leftFoStaticFault, KEYS.rightFoStaticFault];

    it('shows the alert of the lost probe with IAS/ALTI MAY BE UNREL, only in phases 1 and 2', () => {
      const titles = [
        'NAV L CAPT STATIC FAULT',
        'NAV R CAPT STATIC FAULT',
        'NAV L F/O STATIC FAULT',
        'NAV R F/O STATIC FAULT',
      ];
      const inopSys = ['CAPT L STAT', 'CAPT R STAT', 'F/O L STAT', 'F/O R STAT'];
      const inputs = normalInputs();
      keys.forEach((key, probe) => {
        inputs.staticProbeFailed = [0, 1, 2, 3].map((index) => index === probe);
        run(alerts, inputs);
        expect(activeKeys(alerts)).toEqual([key]);
        const item = alerts.ewdFailures[key];
        expect(item.failure).toBe(LEVEL.caution);
        expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
        expect(ewdLines(item)).toEqual([titles[probe], ' IAS/ALTI MAY BE UNREL']);
        expect(statusOf(item).right).toEqual(['INOP SYS', inopSys[probe]]);
      });
      inputs.staticProbeFailed = [false, false, false, false];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);
    });

    it('lists the PROBES of the side with its AOA lost and its pitot and TAT heating lost, or all its heating lost', () => {
      const pitotAndTat = { ...HEAT_OK, pitot: true, tat: true };
      const allHeating = { ...HEAT_OK, pitot: true, tat: true, leftStatic: true, rightStatic: true, aoa: true };
      expect(areProbesInopWithStaticFault(true, pitotAndTat)).toBe(true);
      expect(areProbesInopWithStaticFault(false, pitotAndTat)).toBe(false);
      expect(areProbesInopWithStaticFault(true, { ...HEAT_OK, pitot: true })).toBe(false);
      expect(areProbesInopWithStaticFault(false, allHeating)).toBe(true);
      expect(areProbesInopWithStaticFault(false, { ...HEAT_OK, computerFault: true })).toBe(true);

      const inputs = normalInputs();
      inputs.staticProbeFailed = [false, false, true, false];
      inputs.probeHeatComputers = [HEAT_OK, { ...HEAT_OK, computerFault: true }, HEAT_OK];
      run(alerts, inputs);
      const item = alerts.ewdFailures[KEYS.leftFoStaticFault];
      expect(statusOf(item).right).toEqual(['INOP SYS', 'F/O PROBES', 'F/O L STAT']);
    });
  });

  describe('NAV ADS-B RPTG 1(2) FAULT', () => {
    it('shows when the ADS-B function fails, not when its transponder has failed (NAV ATC/XPDR FAULT)', () => {
      const inputs = normalInputs();
      inputs.adsbFailed = [true, false];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([KEYS.adsbReporting1Fault]);
      inputs.xpdrFailed = [true, false];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([]);
      inputs.xpdrFailed = [false, false];
      inputs.adsbFailed = [false, true];
      run(alerts, inputs);
      expect(activeKeys(alerts)).toEqual([KEYS.adsbReporting2Fault]);
    });

    it('asks for the other transponder while the failed one is selected and the other one works', () => {
      const inputs = normalInputs();
      inputs.adsbFailed = [true, false];
      inputs.selectedXpdr = 1;
      run(alerts, inputs);
      const item = alerts.ewdFailures[KEYS.adsbReporting1Fault];
      expect(ewdLines(item)).toEqual(['NAV ADS-B RPTG 1 FAULT', ' -ATC/XPDR.........SYS 2']);
      inputs.selectedXpdr = 2;
      run(alerts, inputs);
      expect(ewdLines(item)).toEqual(['NAV ADS-B RPTG 1 FAULT']);
      inputs.selectedXpdr = 1;
      inputs.adsbFailed = [true, true];
      run(alerts, inputs);
      expect(ewdLines(item)).toEqual(['NAV ADS-B RPTG 1 FAULT']);
    });

    it('is a caution inhibited in phases 3, 4, 5, 7, 8, STATUS INOP SYS ADS-B RPTG', () => {
      const item = alerts.ewdFailures[KEYS.adsbReporting2Fault];
      expect(item.failure).toBe(LEVEL.caution);
      expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
      expect(statusOf(item).right).toEqual(['INOP SYS', 'ADS-B RPTG 2']);
    });
  });

  describe('readAndUpdate', () => {
    const simVars = new Map<string, number>();
    const setVar = (name: string, value: number) => simVars.set(name, value);
    const normalWord = (value: number) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
    const { GetSimVarValue } = SimVar;
    /** Reads and updates for 6 s, past the confirmation time of the discrepancies */
    const readFor6Seconds = (reader: NavSensorAlerts) => {
      for (let frame = 0; frame < 60; frame++) {
        reader.readAndUpdate(100, false, ALL_HEAT_OK);
      }
    };

    afterEach(() => {
      SimVar.GetSimVarValue = GetSimVarValue;
    });

    beforeEach(() => {
      simVars.clear();
      SimVar.GetSimVarValue = (name: string) => simVars.get(name) ?? 0;
      for (const ir of [1, 2, 3]) {
        setVar(`L:A32NX_ADIRS_IR_${ir}_PITCH`, normalWord(2));
        setVar(`L:A32NX_ADIRS_IR_${ir}_ROLL`, normalWord(0));
        setVar(`L:A32NX_ADIRS_IR_${ir}_HEADING`, normalWord(90));
      }
      for (const adr of [1, 2, 3]) {
        setVar(`L:A32NX_ADIRS_ADR_${adr}_COMPUTED_AIRSPEED`, normalWord(250));
        setVar(`L:A32NX_ADIRS_ADR_${adr}_ALTITUDE`, normalWord(10000));
        setVar(`L:A32NX_ADIRS_ADR_${adr}_ANGLE_OF_ATTACK`, normalWord(3));
      }
      setVar('L:A32NX_ATT_HDG_SWITCHING_KNOB', 1);
      setVar('L:A32NX_AIR_DATA_SWITCHING_KNOB', 1);
      setVar('L:A32NX_ILS_1_FAILED', 0);
      setVar('L:A32NX_ILS_2_FAILED', 0);
    });

    it('registers the static probe and ADS-B failures', () => {
      const failures = new TestFailures();
      new NavSensorAlerts(failures).init();
      expect(failures.registered).toEqual([
        A320Failure.CaptLeftStaticProbe,
        A320Failure.CaptRightStaticProbe,
        A320Failure.FoLeftStaticProbe,
        A320Failure.FoRightStaticProbe,
        A320Failure.AdsbReporting1,
        A320Failure.AdsbReporting2,
      ]);
    });

    it('reads the failures, the ILS receivers and the ADR angle of attack', () => {
      const failures = new TestFailures();
      const reader = new NavSensorAlerts(failures);
      reader.readAndUpdate(100, false, ALL_HEAT_OK);
      expect(activeKeys(reader)).toEqual([]);

      failures.active.add(A320Failure.FoRightStaticProbe);
      failures.active.add(A320Failure.AdsbReporting2);
      setVar('L:A32NX_ILS_2_FAILED', 1);
      setVar(
        'L:A32NX_ADIRS_ADR_3_ANGLE_OF_ATTACK',
        Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.FailureWarning),
      );
      reader.readAndUpdate(100, false, ALL_HEAT_OK);
      expect(activeKeys(reader).sort()).toEqual(
        [KEYS.ils2Fault, KEYS.stbyAoaFault, KEYS.rightFoStaticFault, KEYS.adsbReporting2Fault].sort(),
      );
    });

    it('compares the IR the ATT HDG switching selects: IR 3 on the CAPT side with CAPT 3', () => {
      const reader = new NavSensorAlerts(new TestFailures());
      setVar('L:A32NX_ADIRS_IR_3_PITCH', normalWord(12));
      readFor6Seconds(reader);
      expect(activeKeys(reader)).toEqual([]);

      setVar('L:A32NX_ATT_HDG_SWITCHING_KNOB', 0);
      readFor6Seconds(reader);
      expect(activeKeys(reader)).toEqual([KEYS.attDiscrepancy]);
    });

    it('compares the ADR the AIR DATA switching selects: ADR 3 on the F/O side with F/O 3', () => {
      const reader = new NavSensorAlerts(new TestFailures());
      setVar('L:A32NX_ADIRS_ADR_3_COMPUTED_AIRSPEED', normalWord(210));
      readFor6Seconds(reader);
      expect(activeKeys(reader)).toEqual([]);

      setVar('L:A32NX_AIR_DATA_SWITCHING_KNOB', 2);
      readFor6Seconds(reader);
      expect(activeKeys(reader)).toEqual([KEYS.iasDiscrepancy]);
    });
  });
});
