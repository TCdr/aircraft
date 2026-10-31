// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { FwcRig, probedFailure, probedMemo, startCruiseFwc, triggeredAmong } from '../FwcControlsAlertProbe';
import {
  HydraulicAlert,
  HydraulicAlertMonitor,
  HydraulicInputs,
  HydSystemInputs,
  NORMAL_HYDRAULIC_INPUTS,
  blueElecPumpLines,
  blueYellowSysLoPrLines,
  greenEnginePumpLines,
  greenReservoirLines,
  greenYellowSysLoPrLines,
  hydraulicStatus,
  ptuFaultLines,
  yellowReservoirLines,
  yellowReservoirLowAirPressureLines,
} from './HydraulicAlerts';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

type SystemOverrides = Partial<HydSystemInputs>;
type Overrides = Partial<Omit<HydraulicInputs, 'green' | 'blue' | 'yellow'>> & {
  green?: SystemOverrides;
  blue?: SystemOverrides;
  yellow?: SystemOverrides;
};

/** In flight, all systems normal, with some changes */
const state = (overrides: Overrides = {}): HydraulicInputs => ({
  ...NORMAL_HYDRAULIC_INPUTS,
  ...overrides,
  green: { ...NORMAL_HYDRAULIC_INPUTS.green, ...overrides.green },
  blue: { ...NORMAL_HYDRAULIC_INPUTS.blue, ...overrides.blue },
  yellow: { ...NORMAL_HYDRAULIC_INPUTS.yellow, ...overrides.yellow },
});

/** Cold and dark on ground: engines and masters off; Rust sets the ENG pump low pressures (pbs at AUTO, no pressure) */
const COLD_AND_DARK: Overrides = {
  onGround: true,
  engine1Running: false,
  engine2Running: false,
  engine1MasterOn: false,
  engine2MasterOn: false,
  greenEnginePumpLowPressure: true,
  yellowEnginePumpLowPressure: true,
  greenEnginePumpSectionLow: true,
  yellowEnginePumpSectionLow: true,
  greenPressurePsi: 0,
  yellowPressurePsi: 0,
};

/** Runs the monitor for some seconds at 10 Hz, returns the alerts shown */
const run = (monitor: HydraulicAlertMonitor, inputs: HydraulicInputs, seconds: number, flightPhase = 6) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) {
    monitor.update(inputs, flightPhase, 0.1);
  }
  return (Object.keys(monitor.alerts) as HydraulicAlert[]).filter((alert) => monitor.alerts[alert].get());
};

const shownAfter = (inputs: HydraulicInputs, seconds = 6, flightPhase = 6) =>
  run(new HydraulicAlertMonitor(), inputs, seconds, flightPhase);

/** The E/WD texts of the lines of an alert */
const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

const statusPage = (status: { left: string[]; inopSys: string[] }) => formatStatusPage(status.left, status.inopSys);

const NO_PUMP_LO_PR = {
  blueElecPumpLoPr: false,
  yellowElecPumpLoPr: false,
  greenEngPumpLoPr: false,
  yellowEngPumpLoPr: false,
};

describe('A320 HYD alert triggers', () => {
  it('no alert with the systems normal', () => {
    expect(shownAfter(state())).toEqual([]);
  });

  it('no alert cold and dark on ground: the ENG pump LO PR is inhibited with the engine stopped', () => {
    expect(shownAfter(state(COLD_AND_DARK), 30, 1)).toEqual([]);
  });

  it('no alert in a normal engine start: the blue pump builds its pressure within the confirmation time', () => {
    const monitor = new HydraulicAlertMonitor();
    const engine2Started = state({
      ...COLD_AND_DARK,
      engine2Running: true,
      engine2MasterOn: true,
      yellowEnginePumpLowPressure: false,
      yellowEnginePumpSectionLow: false,
      yellowPressurePsi: 3000,
      blueElecPumpLowPressure: true,
    });
    expect(run(monitor, engine2Started, 3, 2)).toEqual([]);
    expect(run(monitor, { ...engine2Started, blueElecPumpLowPressure: false }, 30, 2)).toEqual([]);
  });

  it('HYD G ENG 1 PUMP LO PR after its confirmation time, alone while the PTU keeps the green system pressurised', () => {
    const pumpLow = state({ greenEnginePumpLowPressure: true, greenEnginePumpSectionLow: true });
    expect(shownAfter(pumpLow, 4)).toEqual([]);
    expect(shownAfter(pumpLow)).toEqual(['greenEngPumpLoPr']);
  });

  it('the ENG pump LO PR stays after the crew sets the pump OFF, and goes with the pb back to AUTO', () => {
    const monitor = new HydraulicAlertMonitor();
    expect(run(monitor, state({ greenEnginePumpLowPressure: true }), 6)).toEqual(['greenEngPumpLoPr']);
    // pb OFF: Rust clears the discrete (the pump is no longer commanded), the alert stays
    const pumpOff = state({ greenEnginePumpPbAuto: false, greenEnginePumpSectionLow: true });
    expect(run(monitor, pumpOff, 10)).toEqual(['greenEngPumpLoPr']);
    expect(run(monitor, state(), 1)).toEqual([]);
  });

  it('no ENG pump LO PR with the ENG MASTER OFF: ENG SHUT DOWN has G ENG 1 PUMP in its STATUS', () => {
    expect(shownAfter(state({ greenEnginePumpLowPressure: true, engine1MasterOn: false }))).toEqual([]);
  });

  it('HYD B SYS LO PR alone without a cause alert', () => {
    expect(shownAfter(state({ blue: { lowPressure: true } }))).toEqual(['blueSysLoPr']);
  });

  it('B SYS LO PR is a line of HYD B RSVR OVHT, not a second alert', () => {
    expect(shownAfter(state({ blue: { lowPressure: true, reservoirOverheat: true } }))).toEqual(['blueRsvrOvht']);
  });

  it('the G reservoir alerts cover the G ENG 1 PUMP LO PR and the G SYS LO PR', () => {
    const leak = state({
      green: { lowPressure: true, reservoirLowLevel: true },
      greenEnginePumpLowPressure: true,
      greenEnginePumpSectionLow: true,
    });
    // A green system lost by a low level may also give HYD PTU FAULT
    expect(shownAfter(leak)).toEqual(['greenRsvrLoLvl', 'ptuFault']);
    const overheat = state({ green: { lowPressure: true, reservoirOverheat: true }, greenEnginePumpLowPressure: true });
    expect(shownAfter(overheat)).toEqual(['greenRsvrOvht']);
  });

  it('B ELEC PUMP OVHT replaces B ELEC PUMP LO PR', () => {
    expect(shownAfter(state({ blueElecPumpLowPressure: true, blueElecPumpOverheat: true }))).toEqual([
      'blueElecPumpOvht',
    ]);
  });

  it('a dual SYS LO PR warning replaces the alerts of both systems', () => {
    const monitor = new HydraulicAlertMonitor();
    const blueLost = state({ blue: { lowPressure: true } });
    expect(run(monitor, blueLost, 6)).toEqual(['blueSysLoPr']);
    expect(monitor.landAsapRed).toBe(false);
    const blueAndYellowLost = state({
      blue: { lowPressure: true },
      yellow: { lowPressure: true, reservoirOverheat: true },
    });
    expect(run(monitor, blueAndYellowLost, 6)).toEqual(['blueYellowSysLoPr']);
    expect(monitor.landAsapRed).toBe(true);
  });

  it.each([
    [{ green: { lowPressure: true }, blue: { lowPressure: true } }, ['greenBlueSysLoPr']],
    [{ green: { lowPressure: true }, yellow: { lowPressure: true } }, ['greenYellowSysLoPr']],
    // Design choice: no triple failure procedure, G+Y and the blue system alone
    [
      { green: { lowPressure: true }, blue: { lowPressure: true }, yellow: { lowPressure: true } },
      ['blueSysLoPr', 'greenYellowSysLoPr'],
    ],
  ] as [Overrides, HydraulicAlert[]][])('dual failures %#', (overrides, expected) => {
    expect(shownAfter(state(overrides))).toEqual(expected);
  });

  it('HYD G RSVR LO LVL is inhibited for the first 15 s of phase 5 only', () => {
    const monitor = new HydraulicAlertMonitor();
    const lowLevel = state({ green: { reservoirLowLevel: true } });
    expect(run(monitor, lowLevel, 14, 5)).toEqual([]);
    expect(run(monitor, lowLevel, 2, 5)).toEqual(['greenRsvrLoLvl']);
  });

  it('HYD PTU FAULT on ground: both masters ON, more than 650 PSI between G and Y and the PTU stopped', () => {
    const secondEngineStart = state({
      ...COLD_AND_DARK,
      engine1MasterOn: true,
      engine2MasterOn: true,
      engine2Running: true,
      yellowPressurePsi: 3000,
      greenPressurePsi: 200,
      greenEnginePumpLowPressure: false,
      yellowEnginePumpLowPressure: false,
      yellowEnginePumpSectionLow: false,
    });
    expect(shownAfter({ ...secondEngineStart, ptuShaftRpm: 0 })).toEqual(['ptuFault']);
    // the PTU runs: the normal second engine start
    expect(shownAfter({ ...secondEngineStart, ptuShaftRpm: 3000 })).toEqual([]);
    // one master ON: the PTU is inhibited on purpose for the first engine start
    expect(shownAfter({ ...secondEngineStart, engine1MasterOn: false })).toEqual([]);
    expect(shownAfter({ ...secondEngineStart, ptuPbAuto: false })).toEqual([]);
  });

  it('HYD PTU FAULT in flight: a G or Y reservoir low level with a G or Y system low pressure', () => {
    const shown = shownAfter(state({ green: { reservoirLowLevel: true, lowPressure: true } }));
    expect(shown).toContain('ptuFault');
    expect(shown).toContain('greenRsvrLoLvl');
  });
});

describe('A320 HYD alert lines', () => {
  it('HYD B RSVR OVHT: BLUE ELEC PUMP OFF, then B SYS LO PR with FUEL CONSUMPT INCRSD', () => {
    expect(text('2900126', blueElecPumpLines(state({ blue: { reservoirOverheat: true } })))).toBe(
      '\x1b<4m\x1b4mHYD\x1bm B RSVR OVHT | \x1b<5m -BLUE ELEC PUMP.....OFF',
    );
    const pumpOff = text(
      '2900126',
      blueElecPumpLines(state({ blue: { reservoirOverheat: true, lowPressure: true }, blueElecPumpPbAuto: false })),
    );
    expect(pumpOff).not.toContain('BLUE ELEC PUMP');
    expect(pumpOff).toContain('B SYS LO PR');
    expect(pumpOff).toContain('FUEL CONSUMPT INCRSD');
    expect(pumpOff).toContain('FMS PRED UNRELIABLE');
  });

  it('HYD G RSVR OVHT: PTU OFF, GREEN ENG 1 PUMP OFF, G ENG 1 PUMP LO PR, G SYS LO PR', () => {
    const lines = text(
      '2900128',
      greenReservoirLines(state({ green: { lowPressure: true }, greenEnginePumpSectionLow: true })),
    );
    expect(lines).toContain('-PTU................OFF');
    expect(lines).toContain('-GREEN ENG 1 PUMP...OFF');
    expect(lines.indexOf('G ENG 1 PUMP LO PR')).toBeLessThan(lines.indexOf('G SYS LO PR'));
  });

  it('HYD Y RSVR OVHT and LO LVL: the YELLOW ENG 2 PUMP and BRK Y ACCU PR MONITOR lines', () => {
    const inputs = state({ yellow: { lowPressure: true }, yellowElecPumpPbOn: true, yellowEnginePumpSectionLow: true });
    for (const prefix of ['2900127', '2900112']) {
      const lines = text(prefix, yellowReservoirLines(inputs));
      expect(lines).toContain('-YELLOW ENG 2 PUMP..OFF');
      expect(lines).toContain('-YELLOW ELEC PUMP...OFF');
      expect(lines).toContain('-BRK Y ACCU PR..MONITOR');
      expect(lines).toContain('Y ENG 2 PUMP LO PR');
      expect(lines).toContain('Y SYS LO PR');
    }
  });

  it('HYD Y RSVR LO AIR PR: the IF PRESS FLUCTUATES condition with its actions', () => {
    const lines = text(
      '2900109',
      yellowReservoirLowAirPressureLines(state({ yellow: { reservoirLowAirPressure: true } })),
    );
    expect(lines).toContain('HYD\x1bm Y RSVR LO AIR PR');
    expect(lines).toContain('.IF PRESS FLUCTUATES:');
    expect(lines).not.toContain('Y SYS LO PR');
  });

  it('HYD G ENG 1 PUMP LO PR: GREEN ENG 1 PUMP OFF', () => {
    expect(text('2900105', greenEnginePumpLines(state()))).toBe(
      '\x1b<4m\x1b4mHYD\x1bm G ENG 1 PUMP LO PR | \x1b<5m -GREEN ENG 1 PUMP...OFF',
    );
  });

  it('HYD B+Y SYS LO PR: YELLOW ELEC PUMP ON when lost by the ENG 2 pump, RAT MAN ON when lost by the B pump', () => {
    const inputs = state({
      blue: { lowPressure: true },
      yellow: { lowPressure: true },
      yellowEnginePumpSectionLow: true,
    });
    const pumps = {
      blueElecPumpLoPr: true,
      yellowElecPumpLoPr: false,
      greenEngPumpLoPr: false,
      yellowEngPumpLoPr: true,
    };
    const lines = text('2900120', blueYellowSysLoPrLines(inputs, pumps));
    expect(lines).toContain('\x1b<2m\x1b4mHYD\x1bm B+Y SYS LO PR');
    expect(lines).toContain('-YELLOW ELEC PUMP....ON');
    expect(lines).toContain('-RAT.............MAN ON');
    expect(lines).toContain('MIN RAT SPD......140 KT');
    expect(lines).toContain('MAX SPEED.......320/.77');
    expect(lines).toContain('FOR GA:MAX PITCH 15 DEG');
    const noPumpCause = text(
      '2900120',
      blueYellowSysLoPrLines(
        state({ blue: { lowPressure: true, reservoirOverheat: true }, yellow: { lowPressure: true } }),
        {
          ...pumps,
          yellowEngPumpLoPr: false,
        },
      ),
    );
    expect(noPumpCause).not.toContain('RAT');
    expect(noPumpCause).not.toContain('YELLOW ELEC PUMP');
  });

  it('HYD G+Y SYS LO PR: PTU OFF, AFFECTED PUMPS OFF, MANEUVER WITH CARE', () => {
    const lines = text('2900122', greenYellowSysLoPrLines(state(), NO_PUMP_LO_PR));
    expect(lines).toContain('-PTU................OFF');
    expect(lines).toContain('-AFFECTED PUMPS.....OFF');
    expect(lines).toContain('MANEUVER WITH CARE');
  });

  it('HYD PTU FAULT: PTU OFF only for a reservoir low level with its system low pressure', () => {
    expect(text('2900116', ptuFaultLines(state()))).toBe('\x1b<4m\x1b4mHYD\x1bm PTU FAULT');
    expect(text('2900116', ptuFaultLines(state({ yellow: { reservoirLowLevel: true, lowPressure: true } })))).toContain(
      '-PTU................OFF',
    );
  });
});

describe('A320 HYD STATUS', () => {
  it('HYD B RSVR OVHT: APPR PROC, LDG DIST PROC, INOP SYS BLUE HYD', () => {
    const page = statusPage(hydraulicStatus.blueRsvrOvht());
    expect(page.left.split('\r')).toEqual([
      '\x1b<7mAPPR PROC: HYD LO PR',
      '\x1b<7mIF BLUE OVHT OUT:',
      '\x1b<5mBLUE ELEC PUMP.....AUTO',
      '\x1b<7mIF SYS NOT RECOVERED:',
      '\x1b<5mLDG DIST PROC....APPLY',
      '\x1b<5mFUEL CONSUMPT INCRSD',
      '\x1b<5mFMS PRED UNRELIABLE',
      '\x1b<3mSLATS SLOW',
      '\x1b<3mCAT 3 SINGLE ONLY',
    ]);
    expect(page.right.split('\r')).toEqual([
      '\x1b<7m\x1b4mINOP SYS\x1bm',
      '\x1b<4mBLUE HYD',
      '\x1b<4mSPLR 3',
      '\x1b<4mCAT 3 DUAL',
      '\x1b<4mB ELEC PUMP',
    ]);
  });

  it('HYD G RSVR LO AIR PR: GREEN ENG 1 PUMP ON, IF HYD NOT RECOVERED: L/G GRVTY EXTN', () => {
    const left = statusPage(hydraulicStatus.greenRsvrLoAirPr()).left;
    expect(left.indexOf('GREEN ENG 1 PUMP.....ON')).toBeLessThan(left.indexOf('IF HYD NOT RECOVERED:'));
    expect(left.indexOf('IF HYD NOT RECOVERED:')).toBeLessThan(left.indexOf('L/G..........GRVTY EXTN'));
    expect(left).toContain('ALTN Y BRK WITH A/SKID');
  });

  it('HYD G(Y) ENG PUMP LO PR: only the pump with the PTU operative, the lost system without', () => {
    expect(statusPage(hydraulicStatus.greenEngPumpLoPr(false))).toEqual({
      normal: false,
      left: '',
      right: '\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mG ENG 1 PUMP',
    });
    const ptuInoperative = statusPage(hydraulicStatus.yellowEngPumpLoPr(true));
    expect(ptuInoperative.right).toContain('YELLOW HYD');
    expect(ptuInoperative.right).toContain('PTU');
    expect(ptuInoperative.right).toContain('Y ENG 2 PUMP');
  });

  it('HYD G+B SYS LO PR: the limitations, then the approach procedure; no APPR PROC title for a dual LO LVL', () => {
    const lost = statusPage(hydraulicStatus.greenBlueSysLoPr(state(), NO_PUMP_LO_PR));
    const left = lost.left.split('\r');
    expect(left.slice(0, 4)).toEqual([
      '\x1b<5mMAX SPEED.......320/.77',
      '\x1b<5mMANEUVER WITH CARE',
      '\x1b<5mSPD BRK......DO NOT USE',
      '\x1b<5mFOR GA: MAX PITCH 15 DEG',
    ]);
    expect(lost.left).toContain('APPR PROC: DUAL HYD LO PR');
    expect(lost.left).toContain('APPR SPD.....VREF+25 KT');
    expect(lost.right).toContain('G+B HYD');
    expect(lost.right).toContain('L+R AIL');
    const dualLowLevel = statusPage(
      hydraulicStatus.greenBlueSysLoPr(
        state({ green: { reservoirLowLevel: true }, blue: { reservoirLowLevel: true } }),
        NO_PUMP_LO_PR,
      ),
    );
    expect(dualLowLevel.left).not.toContain('APPR PROC');
    expect(dualLowLevel.right).toContain('EMER GEN');
  });

  it('RAT FAULT and PTU FAULT: INOP SYS RAT and PTU', () => {
    expect(statusPage(hydraulicStatus.ratFault()).right).toBe('\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mRAT');
    expect(statusPage(hydraulicStatus.ptuFault()).right).toBe('\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mPTU');
  });
});

/*
 * The Rust hydraulic system writes the simvars that the FWC reads. vitest cannot run it: the first two tests read its
 * source for the names it writes, the FWC half is the whole-FWC describe below.
 */
describe('A320 HYD variables that the Rust hydraulic system writes', () => {
  const a320Hydraulic = readFileSync(
    resolve(__dirname, '../../../../../wasm/systems/a320_systems/src/hydraulic/mod.rs'),
    'utf8',
  );
  const commonHydraulic = readFileSync(
    resolve(__dirname, '../../../../../../../fbw-common/src/wasm/systems/systems/src/hydraulic/mod.rs'),
    'utf8',
  );

  it('writes the blue electric pump low pressure as HYD_BLUE_EPUMP_LOW_PRESS, not EDPUMP', () => {
    expect(a320Hydraulic).toContain('"HYD_BLUE_EPUMP_LOW_PRESS"');
    expect(a320Hydraulic).not.toContain('"HYD_BLUE_EDPUMP_LOW_PRESS"');
  });

  it('writes the other variables that the FWC reads', () => {
    expect(a320Hydraulic).toContain('"HYD_YELLOW_EPUMP_LOW_PRESS"');
    expect(a320Hydraulic).toContain('"HYD_GREEN_EDPUMP_LOW_PRESS"');
    expect(commonHydraulic).toContain('"HYD_{}_RESERVOIR_LEVEL_IS_LOW"');
    expect(commonHydraulic).toContain('"HYD_{}_RESERVOIR_AIR_PRESSURE_IS_LOW"');
    expect(commonHydraulic).toContain('"HYD_{}_RESERVOIR_OVHT"');
    expect(commonHydraulic).toContain('"HYD_{}_EPUMP_OVHT"');
    expect(commonHydraulic).toContain('"HYD_PTU_SHAFT_RPM"');
    expect(commonHydraulic).toContain('"{}_PRESSURE_SWITCH"');
    expect(commonHydraulic).toContain('"HYD_{}_{}_{}_SECTION"');
  });
});

describe('A320 HYD alert wiring in the whole FWC', () => {
  const ALERT_KEYS = [
    '2900101',
    '2900102',
    '2900103',
    '2900104',
    '2900105',
    '2900106',
    '2900107',
    '2900108',
    '2900109',
    '2900110',
    '2900111',
    '2900112',
    '2900113',
    '2900114',
    '2900115',
    '2900116',
    '2900120',
    '2900121',
    '2900122',
    '2900126',
    '2900127',
    '2900128',
  ];

  /** The FWC in cruise, the hydraulic alerts settled (the systems normal) */
  function startNormal(): FwcRig {
    const rig = startCruiseFwc();
    rig.run(10);
    return rig;
  }

  it('raises no alert with the systems normal', () => {
    expect(triggeredAmong(startNormal().fwc, ALERT_KEYS)).toEqual([]);
  });

  it('reads the blue electric pump low pressure (HYD_BLUE_EPUMP_LOW_PRESS, not EDPUMP)', () => {
    const edpump = startNormal();
    edpump.simvars.set('L:A32NX_HYD_BLUE_EDPUMP_LOW_PRESS', 1);
    edpump.run(10);
    expect(triggeredAmong(edpump.fwc, ALERT_KEYS)).toEqual([]);

    const epump = startNormal();
    epump.simvars.set('L:A32NX_HYD_BLUE_EPUMP_LOW_PRESS', 1);
    epump.run(10);
    expect(triggeredAmong(epump.fwc, ALERT_KEYS)).toContain('2900101');
  });

  it('reads the other variables that the Rust hydraulic system writes', () => {
    for (const [simvar, key] of [
      ['L:A32NX_HYD_GREEN_RESERVOIR_LEVEL_IS_LOW', '2900111'],
      ['L:A32NX_HYD_BLUE_RESERVOIR_LEVEL_IS_LOW', '2900110'],
      ['L:A32NX_HYD_YELLOW_RESERVOIR_LEVEL_IS_LOW', '2900112'],
      ['L:A32NX_HYD_GREEN_RESERVOIR_AIR_PRESSURE_IS_LOW', '2900108'],
      ['L:A32NX_HYD_BLUE_RESERVOIR_AIR_PRESSURE_IS_LOW', '2900107'],
      ['L:A32NX_HYD_YELLOW_RESERVOIR_AIR_PRESSURE_IS_LOW', '2900109'],
      ['L:A32NX_HYD_GREEN_RESERVOIR_OVHT', '2900128'],
      ['L:A32NX_HYD_BLUE_RESERVOIR_OVHT', '2900126'],
      ['L:A32NX_HYD_YELLOW_RESERVOIR_OVHT', '2900127'],
      ['L:A32NX_HYD_BLUE_EPUMP_OVHT', '2900102'],
      ['L:A32NX_HYD_YELLOW_EPUMP_OVHT', '2900104'],
      ['L:A32NX_HYD_YELLOW_EPUMP_LOW_PRESS', '2900103'],
      ['L:A32NX_HYD_GREEN_EDPUMP_LOW_PRESS', '2900105'],
      ['L:A32NX_HYD_YELLOW_EDPUMP_LOW_PRESS', '2900106'],
    ]) {
      const rig = startNormal();
      rig.simvars.set(simvar, 1);
      rig.run(10);
      expect(triggeredAmong(rig.fwc, ALERT_KEYS), simvar).toContain(key);
    }
  });

  it('reads the pump section pressure switches, the PTU shaft speed and the system pressures', () => {
    const rig = startNormal();
    const monitorInputs = () => (rig.fwc as any).hydraulicAlerts.inputs;
    expect(monitorInputs().greenEnginePumpSectionLow).toBe(false);
    expect(monitorInputs().yellowEnginePumpSectionLow).toBe(false);
    rig.simvars.set('L:A32NX_HYD_GREEN_PUMP_1_SECTION_PRESSURE_SWITCH', 0);
    rig.simvars.set('L:A32NX_HYD_YELLOW_PUMP_1_SECTION_PRESSURE_SWITCH', 0);
    rig.simvars.set('L:A32NX_HYD_PTU_SHAFT_RPM', 1234);
    rig.simvars.set('L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE', 2345);
    rig.simvars.set('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE', 3456);
    rig.run(1);
    expect(monitorInputs().greenEnginePumpSectionLow).toBe(true);
    expect(monitorInputs().yellowEnginePumpSectionLow).toBe(true);
    expect(monitorInputs().ptuShaftRpm).toBe(1234);
    expect(monitorInputs().greenPressurePsi).toBe(2345);
    expect(monitorInputs().yellowPressurePsi).toBe(3456);
  });

  it('the alert table uses the monitor, and the red LAND ASAP its dual failures', () => {
    const { fwc } = startNormal();
    const monitor = (fwc as any).hydraulicAlerts as HydraulicAlertMonitor;
    for (const [id, alert] of [
      ['2900126', 'blueRsvrOvht'],
      ['2900127', 'yellowRsvrOvht'],
      ['2900128', 'greenRsvrOvht'],
      ['2900101', 'blueElecPumpLoPr'],
      ['2900105', 'greenEngPumpLoPr'],
      ['2900113', 'blueSysLoPr'],
      ['2900116', 'ptuFault'],
      ['2900120', 'blueYellowSysLoPr'],
      ['2900121', 'greenBlueSysLoPr'],
      ['2900122', 'greenYellowSysLoPr'],
    ] as const) {
      expect(probedFailure(fwc, id).simVarIsActive).toBe(monitor.alerts[alert]);
    }
  });

  it('calls the red LAND ASAP with the dual system failures', () => {
    const rig = startNormal();
    const landAsapRed = probedMemo(rig.fwc, '0000350');
    expect(landAsapRed.simVarIsActive.get()).toBe(false);
    rig.simvars.set('L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH', 0);
    rig.simvars.set('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH', 0);
    rig.run(10);
    expect(triggeredAmong(rig.fwc, ['2900122'])).toEqual(['2900122']);
    expect(landAsapRed.simVarIsActive.get()).toBe(true);
  });
});

describe('A320 HYD alert monitor in the sim JS runtime', () => {
  it('builds without Object.fromEntries (absent from Coherent GT; the throw stopped the systems host)', () => {
    const objectWithFromEntries = Object as unknown as { fromEntries?: unknown };
    const fromEntries = objectWithFromEntries.fromEntries;
    delete objectWithFromEntries.fromEntries;
    try {
      const monitor = new HydraulicAlertMonitor();
      const alerts = Object.keys(monitor.alerts) as HydraulicAlert[];
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.every((alert) => monitor.alerts[alert].get() === false)).toBe(true);
    } finally {
      objectWithFromEntries.fromEntries = fromEntries;
    }
  });
});
