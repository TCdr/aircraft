// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  adrToSwitchOff,
  allPitotLines,
  NO_PROBE_WINDOW_HEAT_FAULT,
  PITOT_LINE,
  PROBE_WINDOW_HEAT_ALERTS,
  ProbeHeatComputerFlags,
  ProbeWindowHeatInputs,
  probeWindowHeatAlerts,
  pitotPairLines,
  pitotStatus,
} from './ProbeWindowHeatAlerts';

const healthy: ProbeHeatComputerFlags = {
  computerFault: false,
  pitot: false,
  leftStatic: false,
  rightStatic: false,
  aoa: false,
  tat: false,
};

/** The inputs with some probe heat computer flags changed: index 0 CAPT, 1 F/O, 2 STBY */
function withComputers(changes: Partial<ProbeHeatComputerFlags>[], rest: Partial<ProbeWindowHeatInputs> = {}) {
  return {
    ...NO_PROBE_WINDOW_HEAT_FAULT,
    probeHeatComputers: [0, 1, 2].map((index) => ({ ...healthy, ...(changes[index] ?? {}) })),
    ...rest,
  };
}

const activeKeys = (inputs: ProbeWindowHeatInputs) => {
  const alerts = probeWindowHeatAlerts(inputs);
  return PROBE_WINDOW_HEAT_ALERTS.filter((alert) => alert.isActive(alerts)).map((alert) => alert.key);
};

describe('ANTI ICE probe and window heat cautions', () => {
  it('raises no caution without a fault', () => {
    expect(activeKeys(NO_PROBE_WINDOW_HEAT_FAULT)).toEqual([]);
  });

  it('CAPT PITOT OR L(R) STAT OR AOA: one caution per failed probe heater', () => {
    expect(activeKeys(withComputers([{ pitot: true }]))).toEqual(['3001221']);
    expect(activeKeys(withComputers([{}, { leftStatic: true, aoa: true }]))).toEqual(['3001232', '3001252']);
    expect(activeKeys(withComputers([{}, {}, { rightStatic: true }]))).toEqual(['3001243']);
  });

  it('CAPT(F/O) TAT: crew awareness', () => {
    expect(activeKeys(withComputers([{ tat: true }]))).toEqual(['3001261']);
  });

  it('a failed probe heat computer gives its PROBES caution, which replaces the single probe cautions', () => {
    expect(activeKeys(withComputers([{}, { computerFault: true, aoa: true }]))).toEqual(['3001212']);
  });

  it('two lost pitot heaters give the pitot pair caution instead of the single cautions', () => {
    expect(activeKeys(withComputers([{ pitot: true }, { pitot: true }]))).toEqual(['3001202']);
    expect(activeKeys(withComputers([{ pitot: true }, {}, { pitot: true }]))).toEqual(['3001203']);
    expect(activeKeys(withComputers([{}, { pitot: true }, { computerFault: true }]))).toEqual(['3001204', '3001213']);
    expect(activeKeys(withComputers([{ pitot: true }, { pitot: true }, { pitot: true }]))).toEqual(['3001201']);
  });

  it('L + R WINDSHIELD replaces the single windshield cautions; L(R) WINDOW', () => {
    expect(activeKeys({ ...NO_PROBE_WINDOW_HEAT_FAULT, windshieldHeatFault: [true, true] })).toEqual(['3001271']);
    expect(activeKeys({ ...NO_PROBE_WINDOW_HEAT_FAULT, windshieldHeatFault: [false, true] })).toEqual(['3001273']);
    expect(activeKeys({ ...NO_PROBE_WINDOW_HEAT_FAULT, windowHeatFault: [true, false] })).toEqual(['3001274']);
  });

  it('the flight phase inhibitions: 4, 5, 8 for the pitot pairs, 3, 4, 5, 7, 8 for the others', () => {
    PROBE_WINDOW_HEAT_ALERTS.forEach((alert) => {
      const pitotPair = ['3001201', '3001202', '3001203', '3001204'].includes(alert.key);
      expect(alert.phaseInhibition).toEqual(pitotPair ? [4, 5, 8] : [3, 4, 5, 7, 8]);
    });
  });
});

describe('ANTI ICE CAPT(F/O) probe lines', () => {
  it('AIR DATA SWTG CAPT 3 until the selector is at CAPT 3', () => {
    const captPitot = PROBE_WINDOW_HEAT_ALERTS.find((alert) => alert.key === '3001221')!;
    expect(captPitot.lines(withComputers([{ pitot: true }]))).toEqual([0, 1]);
    expect(captPitot.lines(withComputers([{ pitot: true }], { airDataSwitching: 0 }))).toEqual([0]);
    const stbyPitot = PROBE_WINDOW_HEAT_ALERTS.find((alert) => alert.key === '3001223')!;
    expect(stbyPitot.lines(withComputers([{}, {}, { pitot: true }]))).toEqual([0]);
    expect(captPitot.status(NO_PROBE_WINDOW_HEAT_FAULT)).toEqual({ info: [], inopSys: ['300300010'] });
  });
});

describe('ANTI ICE pitot pair and ALL PITOT lines', () => {
  it('switches OFF the ADR whose other probes lost the most heating, else the higher one to keep ADR 1', () => {
    expect(adrToSwitchOff(withComputers([{ pitot: true }, { pitot: true }]), [1, 2])).toBe(2);
    expect(adrToSwitchOff(withComputers([{ pitot: true, aoa: true }, { pitot: true }]), [1, 2])).toBe(1);
  });

  it('CAPT + F/O PITOT: ADR 2 OFF with ADR 3 on, IF ICING EXPECTED lines with ADR 3 off', () => {
    const inputs = withComputers([{ pitot: true }, { pitot: true }]);
    expect(pitotPairLines(inputs, [1, 2], 3)).toEqual([PITOT_LINE.title, PITOT_LINE.adr2Off]);
    // Done: the line goes
    expect(pitotPairLines({ ...inputs, adrPbOn: [true, false, true] }, [1, 2], 3)).toEqual([PITOT_LINE.title]);
    const adr3Off = { ...inputs, adrOnAndOperative: [true, true, false], adrPbOn: [true, true, false] };
    expect(pitotPairLines(adr3Off, [1, 2], 3)).toEqual([
      PITOT_LINE.title,
      PITOT_LINE.ifIcingExpected,
      PITOT_LINE.icingAdr2Off,
      PITOT_LINE.unreliableSpeedProcedure,
    ]);
    expect(pitotStatus(adr3Off, [1, 2])).toEqual({
      info: ['300500001', '300400003', '300400005'],
      inopSys: ['300300010', '300300011'],
    });
    expect(pitotStatus(inputs, [1, 2])).toEqual({ info: [], inopSys: ['300300010', '300300011'] });
  });

  it('ALL PITOT: ADR 3 OFF, then IF ICING EXPECTED ADR 2 OFF and UNREL SPD PROC', () => {
    const inputs = withComputers([{ pitot: true }, { pitot: true }, { pitot: true }]);
    expect(allPitotLines(inputs)).toEqual([
      PITOT_LINE.title,
      PITOT_LINE.adr3Off,
      PITOT_LINE.ifIcingExpected,
      PITOT_LINE.icingAdr2Off,
      PITOT_LINE.unreliableSpeedProcedure,
    ]);
    expect(pitotStatus(inputs, [1, 2, 3]).info).toEqual(['300500001', '300400003', '300400005']);
  });
});
