// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { EwdMessageCodeOrder, formatEwdMessages } from '../../../../shared/src/EwdMessages';
import {
  ELEC_BUS_ALERT_CONFIRM_SECONDS,
  ElecAlertStatus,
  ElecBusAlert,
  ElecBusAlertMonitor,
  ElecNetworkState,
  acBus1FaultLines,
  acBus1FaultStatus,
  acBus2FaultLines,
  acBus2FaultStatus,
  acEssBusFaultLines,
  acEssBusFaultStatus,
  acEssBusShedLines,
  acEssBusShedStatus,
  apuGenFaultStatus,
  dcBatBusFaultStatus,
  dcBus1And2FaultLines,
  dcBus1And2FaultStatus,
  dcBus1FaultLines,
  dcBus1FaultStatus,
  dcBus2FaultLines,
  dcBus2FaultStatus,
  dcEmerConfigLines,
  dcEmerConfigStatus,
  dcEssBusFaultLines,
  dcEssBusFaultStatus,
  dcEssBusShedLines,
  dcEssBusShedStatus,
  elecBusAlertConditions,
  elecEmerConfigFuelLines,
  elecEmerConfigStatus,
  engineGeneratorLostStatus,
  essBusesOnBatLines,
  trFaultStatus,
} from './ElecBusAlerts';
import { SdPages as EcamSysPage } from '../../../../shared/src/SdPages';
import { isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

/** The normal network: generators on line, every bus powered, the AC ESS BUS on the AC BUS 1 */
const normal: ElecNetworkState = {
  acBus1Powered: true,
  acBus2Powered: true,
  acEssBusPowered: true,
  acEssShedBusPowered: true,
  dcBus1Powered: true,
  dcBus2Powered: true,
  dcEssBusPowered: true,
  dcEssShedBusPowered: true,
  dcBatBusPowered: true,
  acEssFedByAcBus2: false,
  acEssFeedPbNormal: true,
  staticInverterSuppliesAcEss: false,
  battery2SuppliesDcEss: false,
  tr1PotentialNormal: true,
  tr2PotentialNormal: true,
};

/** The alerts that are active for a network state */
function activeAlerts(state: Partial<ElecNetworkState>, elecEmerConfig = false): ElecBusAlert[] {
  const conditions = elecBusAlertConditions({ ...normal, ...state }, elecEmerConfig);
  return (Object.keys(conditions) as ElecBusAlert[]).filter((alert) => conditions[alert]);
}

/** A monitor after the given network states, each held for some seconds, in 0.1 s steps */
function monitorAfter(...steps: [Partial<ElecNetworkState>, number][]): ElecBusAlertMonitor {
  const monitor = new ElecBusAlertMonitor();
  for (const [state, seconds] of steps) {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      monitor.update({ ...normal, ...state }, false, 0.1);
    }
  }
  return monitor;
}

/* The alert triggers */
describe('ELEC bus alert triggers', () => {
  it('no alert with the normal network', () => {
    expect(activeAlerts({})).toEqual([]);
  });

  it('AC BUS 1(2) FAULT: the AC 1(2) busbar is not supplied', () => {
    expect(activeAlerts({ acBus1Powered: false })).toEqual(['acBus1Fault']);
    expect(activeAlerts({ acBus2Powered: false })).toEqual(['acBus2Fault']);
  });

  it('AC ESS BUS ALTN: supplied from the AC 2 busbar with the AC ESS FEED pb-sw at normal', () => {
    expect(activeAlerts({ acEssFedByAcBus2: true })).toEqual(['acEssBusAltn']);
    expect(activeAlerts({ acEssFedByAcBus2: true, acEssFeedPbNormal: false })).toEqual([]);
  });

  it('AC ESS BUS FAULT covers AC ESS BUS SHED', () => {
    expect(activeAlerts({ acEssBusPowered: false, acEssShedBusPowered: false })).toEqual(['acEssBusFault']);
    expect(activeAlerts({ acEssShedBusPowered: false })).toEqual(['acEssBusShed']);
  });

  it('DC BUS 1(2) FAULT, and DC BUS 1+2 FAULT instead of both', () => {
    expect(activeAlerts({ dcBus1Powered: false })).toEqual(['dcBus1Fault']);
    expect(activeAlerts({ dcBus2Powered: false })).toEqual(['dcBus2Fault']);
    expect(activeAlerts({ dcBus1Powered: false, dcBus2Powered: false, dcBatBusPowered: false })).toEqual([
      'dcBatBusFault',
      'dcBus1And2Fault',
    ]);
  });

  it('DC EMER CONFIG: DC 1, DC 2 and DC ESS not supplied, instead of the DC BUS and DC ESS faults', () => {
    expect(
      activeAlerts({
        dcBus1Powered: false,
        dcBus2Powered: false,
        dcEssBusPowered: false,
        dcEssShedBusPowered: false,
        dcBatBusPowered: false,
      }),
    ).toEqual(['dcBatBusFault', 'dcEmerConfig']);
  });

  it('DC ESS BUS FAULT covers DC ESS BUS SHED', () => {
    expect(activeAlerts({ dcEssBusPowered: false, dcEssShedBusPowered: false })).toEqual(['dcEssBusFault']);
    expect(activeAlerts({ dcEssShedBusPowered: false })).toEqual(['dcEssBusShed']);
  });

  it('DC BAT BUS FAULT', () => {
    expect(activeAlerts({ dcBatBusPowered: false })).toEqual(['dcBatBusFault']);
  });

  it('TR 1(2) FAULT: the TR output is lost while its AC bus is supplied', () => {
    expect(activeAlerts({ tr1PotentialNormal: false })).toEqual(['tr1Fault']);
    expect(activeAlerts({ tr2PotentialNormal: false })).toEqual(['tr2Fault']);
    // An unsupplied TR is not a failed TR: only the AC BUS fault
    expect(activeAlerts({ acBus1Powered: false, tr1PotentialNormal: false })).toEqual(['acBus1Fault']);
  });

  it('ESS BUSES ON BAT: the ESS buses on the batteries, their SHED buses shed on purpose', () => {
    expect(
      activeAlerts({
        staticInverterSuppliesAcEss: true,
        battery2SuppliesDcEss: true,
        acEssShedBusPowered: false,
        dcEssShedBusPowered: false,
      }),
    ).toEqual(['essBusesOnBat']);
  });

  it('in ELEC EMER CONFIG only the further failures are shown', () => {
    const emerConfig: Partial<ElecNetworkState> = {
      acBus1Powered: false,
      acBus2Powered: false,
      dcBus1Powered: false,
      dcBus2Powered: false,
      dcBatBusPowered: false,
      tr1PotentialNormal: false,
      tr2PotentialNormal: false,
    };
    expect(activeAlerts(emerConfig, true)).toEqual([]);
    expect(
      activeAlerts({ ...emerConfig, staticInverterSuppliesAcEss: true, battery2SuppliesDcEss: true }, true),
    ).toEqual(['essBusesOnBat']);
    expect(activeAlerts({ ...emerConfig, dcEssBusPowered: false, dcEssShedBusPowered: false }, true)).toEqual([
      'dcEmerConfig',
    ]);
  });
});

describe('ELEC bus alert confirmation times', () => {
  it('AC BUS 1 FAULT after 1 s', () => {
    expect(monitorAfter([{ acBus1Powered: false }, 0.8]).alerts.acBus1Fault.get()).toBe(false);
    expect(monitorAfter([{ acBus1Powered: false }, 1.1]).alerts.acBus1Fault.get()).toBe(true);
  });

  it('no AC or DC ESS BUS FAULT during the 3 s AC ESS FEED automatic transfer', () => {
    const transfer: Partial<ElecNetworkState> = {
      acBus1Powered: false,
      acEssBusPowered: false,
      acEssShedBusPowered: false,
      dcEssBusPowered: false,
      dcEssShedBusPowered: false,
    };
    const monitor = monitorAfter([transfer, 3], [{ acBus1Powered: false, acEssFedByAcBus2: true }, 1]);
    expect(monitor.alerts.acEssBusFault.get()).toBe(false);
    expect(monitor.alerts.dcEssBusFault.get()).toBe(false);
    expect(monitor.alerts.acBus1Fault.get()).toBe(true);
    expect(monitorAfter([transfer, 5.1]).alerts.acEssBusFault.get()).toBe(true);
  });

  it('ESS BUSES ON BAT after 10 s, with LAND ASAP', () => {
    const onBat: Partial<ElecNetworkState> = { staticInverterSuppliesAcEss: true, battery2SuppliesDcEss: true };
    expect(monitorAfter([onBat, 8]).alerts.essBusesOnBat.get()).toBe(false);
    expect(monitorAfter([onBat, 8]).landAsap).toBe(false);
    expect(monitorAfter([onBat, 10.1]).alerts.essBusesOnBat.get()).toBe(true);
    expect(monitorAfter([onBat, 10.1]).landAsap).toBe(true);
  });

  it('a short loss does not accumulate', () => {
    const monitor = monitorAfter([{ dcBus2Powered: false }, 0.8], [{}, 0.5], [{ dcBus2Powered: false }, 0.8]);
    expect(monitor.alerts.dcBus2Fault.get()).toBe(false);
  });

  it('every alert has a confirmation time', () => {
    for (const seconds of Object.values(ELEC_BUS_ALERT_CONFIRM_SECONDS)) {
      expect(seconds).toBeGreaterThan(0);
    }
  });
});

describe('ELEC bus alert procedure lines', () => {
  it('AC BUS 1 FAULT: -BLOWER OVRD until done', () => {
    expect(acBus1FaultLines(true)).toEqual([0, 1]);
    expect(acBus1FaultLines(false)).toEqual([0]);
  });

  it('AC BUS 2 FAULT: -EXTRACT OVRD, -ATC/XPDR SYS 1 with the XPDR 2 selected', () => {
    expect(acBus2FaultLines(true, true)).toEqual([0, 1, 2]);
    expect(acBus2FaultLines(false, false)).toEqual([0]);
  });

  it('AC ESS BUS FAULT and SHED: -AC ESS FEED ALTN, -ATC/XPDR SYS 2 with the XPDR 1 selected', () => {
    expect(acEssBusFaultLines(true, true)).toEqual([0, 1, 2]);
    expect(acEssBusFaultLines(false, false)).toEqual([0]);
    expect(acEssBusShedLines(true)).toEqual([0, 1]);
  });

  it('DC BUS 1 FAULT: -BLOWER OVRD, -EXTRACT OVRD', () => {
    expect(dcBus1FaultLines(true, true)).toEqual([0, 1, 2]);
    expect(dcBus1FaultLines(false, false)).toEqual([0]);
  });

  it('DC BUS 2 FAULT: -AIR DATA SWTG F/O 3, -BARO REF CHECK, L/G GRVTY EXTN if the DC ESS BUS is failed', () => {
    expect(dcBus2FaultLines(false, false, false)).toEqual([0, 1, 2]);
    expect(dcBus2FaultLines(true, true, false)).toEqual([0, 2, 3]);
    expect(dcBus2FaultLines(true, true, true)).toEqual([0, 2]);
  });

  it('DC BUS 1+2 FAULT and DC EMER CONFIG keep BARO REF and MAX BRK PR', () => {
    expect(dcBus1And2FaultLines(false, false)).toEqual([0, 3, 4]);
    expect(dcEmerConfigLines(false, true, true)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(dcEmerConfigLines(true, false, false)).toEqual([0, 4, 5]);
  });

  it('DC ESS BUS FAULT: -GPWS SYS OFF until done, L/G GRVTY EXTN if the DC BUS 2 is failed', () => {
    expect(dcEssBusFaultLines(false, false, false, true)).toEqual([0, 1, 2, 3, 4, 6]);
    expect(dcEssBusFaultLines(true, true, false, true)).toEqual([0, 1, 2, 3, 5, 6]);
  });

  // the AUDIO SWTG line goes once the crew sets the selector to CAPT 3 or F/O 3
  it('DC ESS BUS FAULT: -AUDIO SWTG SELECT until the AUDIO SWITCHING selector leaves NORM', () => {
    expect(dcEssBusFaultLines(false, false, false, true)).toContain(2);
    expect(dcEssBusFaultLines(false, false, false, false)).toEqual([0, 1, 3, 4, 6]);
  });

  it('DC ESS BUS SHED and ESS BUSES ON BAT', () => {
    expect(dcEssBusShedLines(true)).toEqual([0, 1, 2]);
    expect(essBusesOnBatLines(true, false)).toEqual([0, 1, 2]);
    expect(essBusesOnBatLines(false, true)).toEqual([0]);
  });
});

describe('ELEC STATUS pages', () => {
  const allStatuses: [string, ElecAlertStatus][] = [
    ['AC BUS 1', acBus1FaultStatus()],
    ['AC BUS 2', acBus2FaultStatus()],
    ['AC ESS', acEssBusFaultStatus()],
    ['AC ESS SHED', acEssBusShedStatus()],
    ['DC BAT', dcBatBusFaultStatus()],
    ['DC 1', dcBus1FaultStatus()],
    ['DC 2', dcBus2FaultStatus(true)],
    ['DC 1+2', dcBus1And2FaultStatus()],
    ['DC EMER', dcEmerConfigStatus()],
    ['DC ESS', dcEssBusFaultStatus(true)],
    ['DC ESS SHED', dcEssBusShedStatus()],
    ['TR 1', trFaultStatus(1)],
    ['GEN 2', engineGeneratorLostStatus(2, false)],
    ['APU GEN', apuGenFaultStatus(true)],
  ];

  it('every STATUS code has a text', () => {
    for (const [name, status] of allStatuses) {
      const page = formatStatusPage(status.left, status.inopSys);
      const leftLines = page.left === '' ? [] : page.left.split('\r');
      const rightLines = page.right === '' ? [] : page.right.split('\r').slice(1);
      expect(leftLines.length, name).toBe(new Set(status.left).size);
      expect(rightLines.length, name).toBe(new Set(status.inopSys).size);
    }
  });

  it('GEN 1(2) FAULT / OFF / IDG DISC: CAT 3 SINGLE ONLY; MAIN GALLEY only without the APU GEN', () => {
    const withoutApu = formatStatusPage(
      engineGeneratorLostStatus(1, false).left,
      engineGeneratorLostStatus(1, false).inopSys,
    );
    expect(withoutApu.left).toBe('\x1b<3mCAT 3 SINGLE ONLY');
    expect(withoutApu.right.split('\r').slice(1)).toEqual(['\x1b<4mCAT 3 DUAL', '\x1b<4mMAIN GALLEY', '\x1b<4mGEN 1']);
    expect(formatStatusPage([], engineGeneratorLostStatus(1, true).inopSys).right).not.toContain('MAIN GALLEY');
  });

  it('APU GEN FAULT: MAIN GALLEY when only one GEN operating', () => {
    expect(formatStatusPage([], apuGenFaultStatus(true).inopSys).right).toContain('MAIN GALLEY');
    expect(formatStatusPage([], apuGenFaultStatus(false).inopSys).right).not.toContain('MAIN GALLEY');
    expect(formatStatusPage([], apuGenFaultStatus(false).inopSys).right).toContain('APU GEN');
  });

  it('DC BUS 2 FAULT: IF ABN CAB V/S: MAX FL 100/MEA, then L/G GRVTY EXTN, then LDG DIST PROC', () => {
    const page = formatStatusPage(dcBus2FaultStatus(true).left, []);
    expect(page.left.split('\r').slice(0, 4)).toEqual([
      '\x1b<7mIF ABN CAB V/S:',
      '\x1b<5mMAX FL..........100/MEA',
      '\x1b<5mL/G..........GRVTY EXTN',
      '\x1b<5mLDG DIST PROC....APPLY',
    ]);
    expect(formatStatusPage(dcBus2FaultStatus(false).left, []).left).not.toContain('GRVTY EXTN');
  });

  it('TR 1 FAULT: CAT 3 SINGLE ONLY; TR 1, CAT 3 DUAL', () => {
    const page = formatStatusPage(trFaultStatus(1).left, trFaultStatus(1).inopSys);
    expect(page.left).toBe('\x1b<3mCAT 3 SINGLE ONLY');
    expect(page.right.split('\r').slice(1)).toEqual(['\x1b<4mCAT 3 DUAL', '\x1b<4mTR 1']);
  });
});

describe('the real PseudoFWC ELEC bus alerts', () => {
  const alerts: [string, ElecBusAlert, number][] = [
    ['2400110', 'dcEmerConfig', 2],
    ['2400113', 'essBusesOnBat', 2],
    ['2400101', 'acBus1Fault', 2],
    ['2400102', 'acBus2Fault', 2],
    ['2400103', 'acEssBusAltn', 1],
    ['2400104', 'acEssBusFault', 2],
    ['2400105', 'acEssBusShed', 2],
    ['2400106', 'dcBatBusFault', 2],
    ['2400107', 'dcBus1Fault', 2],
    ['2400108', 'dcBus2Fault', 2],
    ['2400109', 'dcBus1And2Fault', 2],
    ['2400111', 'dcEssBusFault', 2],
    ['2400112', 'dcEssBusShed', 2],
    ['2400114', 'tr1Fault', 2],
    ['2400115', 'tr2Fault', 2],
  ];

  it('has every alert, amber on the ELEC page, driven by the monitor', () => {
    const fwc = startCruiseFwc(simvars, undefined, 1).fwc;
    const monitor = (fwc as any).elecBusAlerts.alerts as Record<ElecBusAlert, { set: (value: boolean) => void }>;
    for (const [key, alert, level] of alerts) {
      const item = fwc.ewdMessageFailures[key];
      expect(item.failure, key).toBe(level);
      expect(item.sysPage, key).toBe(EcamSysPage.ELEC);
      // only the item of this alert follows its subject of the monitor
      monitor[alert].set(true);
      const raised = alerts.filter(([otherKey]) => isAlertTriggered(fwc, otherKey)).map(([otherKey]) => otherKey);
      expect(raised, alert).toEqual([key]);
      monitor[alert].set(false);
    }
  });

  it('raises DC BUS 1 FAULT from the powered state of the bus, after its confirm time', () => {
    const fwc = startCruiseFwc(simvars).fwc;
    expect(isAlertTriggered(fwc, '2400107')).toBe(false);
    simvars.set('L:A32NX_ELEC_DC_1_BUS_IS_POWERED', 0);
    runFwc(fwc, ELEC_BUS_ALERT_CONFIRM_SECONDS.dcBus1Fault + 1);
    expect(isAlertTriggered(fwc, '2400107')).toBe(true);
    expect(isAlertTriggered(fwc, '2400108')).toBe(false);
  });

  it('has an E/WD text for every code of the alerts', () => {
    const fwc = startCruiseFwc(simvars, undefined, 1).fwc;
    for (const [key] of alerts) {
      const codes = fwc.ewdMessageFailures[key].codesToReturn;
      expect(codes.length, key).toBeGreaterThan(0);
      for (const code of codes) {
        expect(EwdMessageCodeOrder.has(code), code).toBe(true);
      }
      expect(
        formatEwdMessages(codes).every((line) => line !== ''),
        key,
      ).toBe(true);
    }
  });

  it('gives the generator alerts their STATUS', () => {
    const fwc = startCruiseFwc(simvars, undefined, 1).fwc;
    const statusOf = (key: string) => {
      const item = fwc.ewdMessageFailures[key];
      return { left: item.statusInfo!(), inopSys: item.inopSys!() };
    };
    for (const apuGenOnline of [false, true]) {
      simvars.set('L:A32NX_ELEC_CONTACTOR_3XS_IS_CLOSED', apuGenOnline ? 1 : 0);
      runFwc(fwc, 1);
      for (const key of ['2400001', '2400060', '2400400']) {
        expect(statusOf(key), key).toEqual(engineGeneratorLostStatus(1, apuGenOnline));
      }
      for (const key of ['2400002', '2400070', '2400405']) {
        expect(statusOf(key), key).toEqual(engineGeneratorLostStatus(2, apuGenOnline));
      }
    }
    // the APU GEN FAULT STATUS depends on how many generators supply the network: GEN 1 and 2 on line, APU GEN off
    expect(statusOf('2400004')).toEqual(apuGenFaultStatus(false));
    simvars.set('L:A32NX_ELEC_CONTACTOR_9XU2_IS_CLOSED', 0);
    simvars.set('L:A32NX_ELEC_CONTACTOR_3XS_IS_CLOSED', 0);
    runFwc(fwc, 1);
    expect(statusOf('2400004')).toEqual(apuGenFaultStatus(true));
  });

  it('calls LAND ASAP (amber) with DC EMER CONFIG and ESS BUSES ON BAT', () => {
    const fwc = startCruiseFwc(simvars, undefined, 1).fwc;
    const landAsap = fwc.ewdMessageMemos['0000360'];
    expect(landAsap.simVarIsActive.get()).toBe(false);
    (fwc as any).elecBusLandAsap.set(true);
    expect(landAsap.simVarIsActive.get()).toBe(true);
  });
});

describe('ELEC bus alert monitor in the sim JS runtime', () => {
  it('builds without Object.fromEntries (absent from Coherent GT; the throw stopped the systems host)', () => {
    const objectWithFromEntries = Object as unknown as { fromEntries?: unknown };
    const fromEntries = objectWithFromEntries.fromEntries;
    delete objectWithFromEntries.fromEntries;
    try {
      const monitor = new ElecBusAlertMonitor();
      expect(Object.keys(monitor.alerts).sort()).toEqual(Object.keys(ELEC_BUS_ALERT_CONFIRM_SECONDS).sort());
      expect(Object.keys(monitor.alerts).every((alert) => monitor.alerts[alert as ElecBusAlert].get() === false)).toBe(
        true,
      );
    } finally {
      objectWithFromEntries.fromEntries = fromEntries;
    }
  });
});

/* ELEC EMER CONFIG: the procedure lists FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE after BLOWER + EXTRACT OVRD; and
 * its STATUS */
describe('ELEC EMER CONFIG', () => {
  // eslint-disable-next-line no-control-regex
  const plain = (text: string) => text.replace(/\x1b<\dm/g, '');

  it('says FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE in flight', () => {
    const lines = elecEmerConfigFuelLines(true);
    expect(lines).toEqual([15, 16]);
    const codes = lines.map((line) => `2400031${(line! + 1).toString().padStart(2, '0')}`);
    expect(formatEwdMessages(codes).map(plain)).toEqual([' FUEL CONSUMPT INCRSD', ' FMS PRED UNRELIABLE']);
  });

  it('not on the ground', () => {
    expect(elecEmerConfigFuelLines(false)).toEqual([null, null]);
  });

  it('the real PseudoFWC gives the two lines (on the ground too) and the STATUS to ELEC EMER CONFIG', () => {
    const fwc = startCruiseFwc(simvars, undefined, 1).fwc;
    const item = fwc.ewdMessageFailures['2400031'];
    const members = fwc as any;
    for (const onGround of [false, true]) {
      members.aircraftOnGround.set(onGround);
      const fuelLines = elecEmerConfigFuelLines(!onGround);
      expect(item.whichCodeToReturn().slice(-fuelLines.length)).toEqual(fuelLines);
    }
    const status = elecEmerConfigStatus();
    expect({ left: item.statusInfo!(), inopSys: item.inopSys!() }).toEqual(status);
  });

  it('STATUS in the aircraft order', () => {
    const status = elecEmerConfigStatus();
    const texts = formatStatusPage(status.left, status.inopSys);
    // eslint-disable-next-line no-control-regex
    const lines = (column: string) => column.split('\r').map((line) => plain(line).replace(/\x1b4m|\x1bm/g, ''));
    expect(lines(texts.left)).toEqual([
      'MIN RAT SPEED....140 KT',
      'MAX SPEED........320 KT',
      'MAX BRK PR.....1000 PSI',
      'FUEL GRVTY FEED',
      'AVOID NEGATIVE G FACTOR',
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'APPR SPD.VREF+10/140 KT',
      'LDG DIST PROC....APPLY',
      'FUEL CONSUMPT INCRSD',
      'FMS PRED UNRELIABLE',
      'ALTN LAW: PROT LOST',
      'WHEN L/G DN: DIRECT LAW',
      'SLATS/FLAPS SLOW',
      'FLS LIMITED TO F-APP + RAW',
    ]);
    expect(lines(texts.right)).toEqual([
      'INOP SYS',
      'F/CTL PROT',
      'REVERSER 1+2',
      'ADR 2+3',
      'IR 2',
      'RA 1+2',
      'SPLR 1+2+5',
      'ELAC 2',
      'SEC 2+3',
      'A/CALL OUT',
      'AP 1+2',
      'A/THR',
      'FUEL PUMPS',
      'ANTI SKID',
      'N/W STRG',
      'CAT 2',
    ]);
  });
});
