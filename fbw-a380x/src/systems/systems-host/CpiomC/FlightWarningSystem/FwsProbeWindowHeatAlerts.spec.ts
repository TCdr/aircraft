// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  controlSystemFaultInopSys,
  controlSystemFaultLines,
  pitotTatAoaProbeAlerts,
  PROBE_WINDOW_HEAT_ALERT_IDS,
  ProbeWindowHeatAlertMonitor,
  ProbeWindowHeatInputs,
  probeWindowHeatAlerts,
} from './FwsProbeWindowHeatAlerts';

/*
 * The EcamMessages tables are read from the source text (importing EcamMessages in a test fails on a circular import).
 */
const ecamMessagesDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ata30 = readFileSync(resolve(ecamMessagesDir, 'AbnormalSensed/ata29-30.ts'), 'utf-8');
const messages = readFileSync(resolve(ecamMessagesDir, 'index.ts'), 'utf-8');

/** The number of items of a procedure of ata29-30.ts */
function procedureItemCount(id: string): number {
  const start = ata30.indexOf(`  ${id}: {`);
  expect(start, `procedure ${id}`).toBeGreaterThan(0);
  const block = ata30.slice(start, ata30.indexOf('\n  },', start));
  return (block.match(/\{ name: /g) ?? []).length;
}

function noFault(): ProbeWindowHeatInputs {
  return {
    adrProbes: [1, 2, 3].map(() => ({
      automaticHeatingLost: false,
      heated: true,
      pitotTatAoaFault: false,
      staticFault: false,
      sideslipFault: false,
    })),
    stbyPitotFault: false,
    stbyStaticFault: false,
    windows: [1, 2].map(() => ({ windshieldFault: false, slidingWindowFault: false, fixedWindowFault: false })),
    iceDetectorFault: [false, false],
    drainMastFault: false,
    aicuChannelFault: [
      [false, false],
      [false, false],
    ],
    aicuPowered: [true, true],
    engineValveMonitoringFault: [false, false, false, false],
    probeWindowHeatPbOn: false,
    antiIcePbsOn: [false, false, false, false, false],
    airDataKnob: 1,
    anyEngineRunning: true,
    onGround: false,
  };
}

function run(monitor: ProbeWindowHeatAlertMonitor, inputs: ProbeWindowHeatInputs, seconds: number): void {
  for (let t = 0; t < seconds * 10; t += 1) {
    monitor.update(inputs, 0.1);
  }
}

describe('A-ICE PITOT TAT AOA PROBE alerts', () => {
  it('give a single alert per failed probe', () => {
    expect(pitotTatAoaProbeAlerts([false, true, false])).toEqual({
      single: [false, true, false],
      pairs: [false, false, false],
    });
  });

  it('give the pair alert for two failed probes', () => {
    expect(pitotTatAoaProbeAlerts([true, false, true])).toEqual({
      single: [false, false, false],
      pairs: [false, true, false],
    });
  });

  it('give PROBE 1+2 and PROBE 3 with the three probes failed', () => {
    expect(pitotTatAoaProbeAlerts([true, true, true])).toEqual({
      single: [false, false, true],
      pairs: [true, false, false],
    });
  });
});

describe('A-ICE ALL PROBES 1(2)(3) NOT DEICED', () => {
  it('follows the loss of the automatic heating, and the probes are still not deiced 3 s after the pb ON', () => {
    const monitor = new ProbeWindowHeatAlertMonitor();
    const inputs = noFault();
    inputs.adrProbes[1] = { ...inputs.adrProbes[1], automaticHeatingLost: true, heated: false };
    run(monitor, inputs, 1);
    expect(monitor.allProbesNotDeiced.map((alert) => alert.get())).toEqual([false, true, false]);

    inputs.probeWindowHeatPbOn = true;
    run(monitor, inputs, 2);
    expect(monitor.probesStillNotDeiced[1].output.get()).toBe(false);
    run(monitor, inputs, 1.5);
    expect(monitor.probesStillNotDeiced[1].output.get()).toBe(true);

    // Heated by the pb ON: deiced, the alert stays (not automatically deiced)
    inputs.adrProbes[1] = { ...inputs.adrProbes[1], heated: true };
    run(monitor, inputs, 1);
    expect(monitor.probesStillNotDeiced[1].output.get()).toBe(false);
    expect(monitor.allProbesNotDeiced[1].get()).toBe(true);
  });
});

describe('A-ICE windshield alerts', () => {
  it('give L+R WINDSHIELDS HEATG FAULT instead of the single alerts with both windshields failed', () => {
    const monitor = new ProbeWindowHeatAlertMonitor();
    const inputs = noFault();
    inputs.windows[0] = { ...inputs.windows[0], windshieldFault: true };
    run(monitor, inputs, 1);
    expect(monitor.windshieldFault.map((alert) => alert.get())).toEqual([true, false]);
    expect(monitor.bothWindshieldsFault.get()).toBe(false);

    inputs.windows[1] = { ...inputs.windows[1], windshieldFault: true };
    run(monitor, inputs, 1);
    expect(monitor.windshieldFault.map((alert) => alert.get())).toEqual([false, false]);
    expect(monitor.bothWindshieldsFault.get()).toBe(true);
  });
});

describe('A-ICE ICE DET FAULT', () => {
  it('needs both ice detectors failed, which also stops the ice detection', () => {
    const monitor = new ProbeWindowHeatAlertMonitor();
    const inputs = noFault();
    inputs.iceDetectorFault = [true, false];
    run(monitor, inputs, 1);
    expect(monitor.iceDetectorFault.get()).toBe(false);
    expect(monitor.iceDetectionAvailable.get()).toBe(true);

    inputs.iceDetectorFault = [true, true];
    run(monitor, inputs, 1);
    expect(monitor.iceDetectorFault.get()).toBe(true);
    expect(monitor.iceDetectionAvailable.get()).toBe(false);
  });
});

describe('A-ICE CTL SYS FAULT', () => {
  it('triggers on a failed AICU channel and asks to avoid icing conditions after 5 s', () => {
    const monitor = new ProbeWindowHeatAlertMonitor();
    const inputs = noFault();
    inputs.aicuChannelFault = [
      [false, true],
      [false, false],
    ];
    run(monitor, inputs, 1);
    expect(monitor.controlSystemFault.get()).toBe(true);
    expect(monitor.isChannelFaultConfirmed()).toBe(false);

    run(monitor, inputs, 5);
    expect(monitor.isChannelFaultConfirmed()).toBe(true);
    const lines = monitor.controlSystemFaultLines();
    // CHANNEL 1B, ENG 2 A-ICE FAULT, IF AICU CHANNEL FAILED > 5 S, AVOID ICING CONDs
    expect(lines.show).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('lists the window heating and engine anti-ice of the failed channels in the INOP SYS', () => {
    // AICU 1 B: the CAPT side windows and the ENG 2 anti-ice
    expect(
      controlSystemFaultInopSys([
        [false, true],
        [false, false],
      ]),
    ).toEqual(['300300002', '300300003', '300300004', '300300011']);
    // Both channels A: ENG 3 and ENG 4 anti-ice, then the wing anti-ice
    expect(
      controlSystemFaultInopSys([
        [true, false],
        [true, false],
      ]),
    ).toEqual(['300300012', '300300013', '300300001']);
  });

  it('shows CHANNEL 1 A+B when both channels of AICU 1 are failed', () => {
    const lines = controlSystemFaultLines(
      [
        [true, true],
        [false, false],
      ],
      false,
      false,
      false,
    );
    expect(lines.show.slice(0, 6)).toEqual([false, false, true, false, false, false]);
  });

  it('triggers on an AICU supply interruption of more than 2 s, until all A-ICE pb are set ON then OFF', () => {
    const monitor = new ProbeWindowHeatAlertMonitor();
    const inputs = noFault();
    inputs.aicuPowered = [true, false];
    run(monitor, inputs, 1.5);
    expect(monitor.controlSystemFault.get()).toBe(false);
    run(monitor, inputs, 1);
    expect(monitor.controlSystemFault.get()).toBe(true);

    inputs.aicuPowered = [true, true];
    run(monitor, inputs, 1);
    expect(monitor.controlSystemFault.get()).toBe(true);
    expect(monitor.controlSystemFaultLines().show.slice(12)).toEqual([true, true, true]);

    inputs.antiIcePbsOn = [true, true, true, true, true];
    run(monitor, inputs, 1);
    expect(monitor.controlSystemFault.get()).toBe(true);
    expect(monitor.controlSystemFaultLines().checked[13]).toBe(true);

    inputs.antiIcePbsOn = [false, false, false, false, false];
    run(monitor, inputs, 1);
    expect(monitor.controlSystemFault.get()).toBe(false);
  });

  it('does not take a ground power change with the engines stopped as an interruption', () => {
    const monitor = new ProbeWindowHeatAlertMonitor();
    const inputs = { ...noFault(), anyEngineRunning: false, onGround: true, aicuPowered: [true, false] };
    run(monitor, inputs, 10);
    inputs.aicuPowered = [true, true];
    run(monitor, inputs, 1);
    expect(monitor.controlSystemFault.get()).toBe(false);
  });
});

describe('the FWS entries of the probe and window heat alerts', () => {
  const monitor = new ProbeWindowHeatAlertMonitor();
  const alerts = probeWindowHeatAlerts(monitor);
  const allIds = Object.values(PROBE_WINDOW_HEAT_ALERT_IDS).reduce<string[]>((ids, id) => ids.concat(id), []);

  it('cover the 31 alert ids', () => {
    expect(allIds.length).toBe(31);
    expect(Object.keys(alerts).sort()).toEqual([...allIds].sort());
  });

  it.each(allIds)('%s shows as many lines as its procedure has items', (id) => {
    const alert = alerts[id];
    expect(alert.whichItemsToShow().length).toBe(procedureItemCount(id));
    expect(alert.whichItemsChecked().length).toBe(procedureItemCount(id));
  });

  it('use STATUS texts that exist', () => {
    const keys = allIds.reduce<string[]>((all, id) => {
      const alert = alerts[id];
      const lists = [
        alert.inopSysAllPhases,
        alert.inopSysApprLdg,
        alert.info,
        alert.limitationsAllPhases,
        alert.limitationsApprLdg,
        alert.limitationsPfd,
      ];
      return all.concat(...lists.map((list) => (list ? (list([]).filter((key) => key !== null) as string[]) : [])));
    }, []);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !messages.includes(`  ${key}: '`))).toEqual([]);
  });

  it('give the side window and drain mast alerts no master caution (crew awareness)', () => {
    const levelOne = allIds.filter((id) => alerts[id].failure === 1);
    expect(levelOne.sort()).toEqual(
      [
        ...PROBE_WINDOW_HEAT_ALERT_IDS.fixedWindowFault,
        ...PROBE_WINDOW_HEAT_ALERT_IDS.slidingWindowFault,
        PROBE_WINDOW_HEAT_ALERT_IDS.drainMastsFault,
      ].sort(),
    );
  });
});
