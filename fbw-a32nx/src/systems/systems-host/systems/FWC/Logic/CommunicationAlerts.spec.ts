// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import { A320Failure } from '@failures';
import {
  AUDIO_3_XFRD_MEMO_CODE,
  COM_CIDS_FAULT_KEY,
  COM_FAILURES,
  COM_PHASE_INHIBITION,
  COM_SINGLE_PTT_STUCK_KEY,
  COM_VHF3_DATA_FAULT_KEY,
  COM_VHF_EMITTING_KEYS,
  ComFailuresSource,
  ComSystemInputs,
  ComTransmissionMonitor,
  CommunicationAlerts,
  CommunicationInputs,
  PttStuckLines,
  acpTransmitVhf,
  audio3XfrdMemo,
  cidsFaultAlert,
  singlePttStuckLines,
  vhf3DataFaultAlert,
  vhfTransmitting,
} from './CommunicationAlerts';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements ComFailuresSource {
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

// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '');

/** ACP 1 transmits on VHF 1, ACP 2 on VHF 2, all VHFs supplied, VHF 3 in DATA mode */
const normal: CommunicationInputs = {
  pttStuck: [false, false],
  acpTransmitVhf: [1, 2],
  vhfStuckEmitting: [false, false, false],
  vhfFailed: [false, false, false],
  vhfSupplied: [true, true, true],
  vhf3DataMode: true,
  cidsFailed: [false, false],
  audioSwitchingNorm: true,
};

const system: ComSystemInputs = {
  acpTransmitVhf: [1, 2],
  vhfSupplied: [true, true, true],
  vhf3DataMode: true,
  audioSwitchingNorm: true,
};

/** Runs the monitor for the given time (s) in 0.5 s steps */
function run(monitor: ComTransmissionMonitor, inputs: CommunicationInputs, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.5) {
    monitor.update(inputs, 0.5);
  }
}

/** The visible E/WD lines of an alert item */
const shownText = (alerts: CommunicationAlerts, key: string) => {
  const item = alerts.ewdFailures[key];
  const codes = item.whichCodeToReturn().map((line) => item.codesToReturn[line!]);
  return formatEwdMessages(codes).map((line) => visible(line).trim());
};

/* The COMMUNICATIONS alerts and the AUDIO 3 XFRD memo */
describe('COM alerts and AUDIO 3 XFRD memo', () => {
  it('COM CIDS 1 + 2 FAULT on a total loss of the CIDS', () => {
    expect(cidsFaultAlert(normal)).toBe(false);
    expect(cidsFaultAlert({ ...normal, cidsFailed: [true, false] })).toBe(false);
    expect(cidsFaultAlert({ ...normal, cidsFailed: [true, true] })).toBe(true);
  });

  it('COM VHF 3 DATA FAULT: VHF 3 failed in DATA mode', () => {
    expect(vhf3DataFaultAlert(normal)).toBe(false);
    expect(vhf3DataFaultAlert({ ...normal, vhfFailed: [false, false, true] })).toBe(true);
    expect(vhf3DataFaultAlert({ ...normal, vhfFailed: [false, false, true], vhf3DataMode: false })).toBe(false);
  });

  it('AUDIO 3 XFRD: the AUDIO SWITCHING selector is not on NORM', () => {
    expect(audio3XfrdMemo(normal)).toBe(false);
    expect(audio3XfrdMemo({ ...normal, audioSwitchingNorm: false })).toBe(true);
  });

  it('a VHF transmits with a stuck PTT on its TX key, or a stuck transmitter, when it works', () => {
    expect(vhfTransmitting(normal)).toEqual([false, false, false]);
    expect(vhfTransmitting({ ...normal, pttStuck: [true, false] })).toEqual([true, false, false]);
    expect(vhfTransmitting({ ...normal, pttStuck: [false, true] })).toEqual([false, true, false]);
    expect(vhfTransmitting({ ...normal, pttStuck: [true, false], vhfFailed: [true, false, false] })).toEqual([
      false,
      false,
      false,
    ]);
    expect(vhfTransmitting({ ...normal, pttStuck: [true, false], vhfSupplied: [false, true, true] })).toEqual([
      false,
      false,
      false,
    ]);
    // VHF 3 in DATA mode takes no voice, a stuck transmitter emits anyway
    expect(vhfTransmitting({ ...normal, pttStuck: [true, false], acpTransmitVhf: [3, 2] })).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      vhfTransmitting({ ...normal, pttStuck: [true, false], acpTransmitVhf: [3, 2], vhf3DataMode: false }),
    ).toEqual([false, false, true]);
    expect(vhfTransmitting({ ...normal, vhfStuckEmitting: [false, false, true] })).toEqual([false, false, true]);
  });

  it('SINGLE PTT STUCK after 40 s with a VHF TX key, VHF EMITTING after 60 s', () => {
    const monitor = new ComTransmissionMonitor();
    const stuck = { ...normal, pttStuck: [true, false] as [boolean, boolean] };
    run(monitor, stuck, 39.5);
    expect(monitor.pttStuck).toBeNull();
    run(monitor, stuck, 1);
    expect(monitor.pttStuck).toEqual({ station: 0, vhf: 1 });
    expect(monitor.vhfEmitting).toEqual([false, false, false]);
    run(monitor, stuck, 20);
    expect(monitor.vhfEmitting).toEqual([true, false, false]);
    // the crew deselects the ACP 1 TX key: VHF 1 stops emitting, SINGLE PTT STUCK stays (affected ACP detected)
    const deselected = { ...stuck, acpTransmitVhf: [0, 2] as [0, 2] };
    run(monitor, deselected, 1);
    expect(monitor.vhfEmitting).toEqual([false, false, false]);
    expect(monitor.pttStuck).toEqual({ station: 0, vhf: 1 });
    // the PTT is released
    run(monitor, { ...deselected, pttStuck: [false, false] }, 0.5);
    expect(monitor.pttStuck).toBeNull();
  });

  it('a stuck PTT without a VHF TX key transmits nothing', () => {
    const monitor = new ComTransmissionMonitor();
    run(monitor, { ...normal, pttStuck: [true, false], acpTransmitVhf: [0, 2] }, 100);
    expect(monitor.pttStuck).toBeNull();
    expect(monitor.vhfEmitting).toEqual([false, false, false]);
  });

  it('a VHF transmitter stuck emitting gives VHF EMITTING only', () => {
    const monitor = new ComTransmissionMonitor();
    run(monitor, { ...normal, vhfStuckEmitting: [false, true, false] }, 61);
    expect(monitor.vhfEmitting).toEqual([false, true, false]);
    expect(monitor.pttStuck).toBeNull();
  });

  it('SINGLE PTT STUCK lines: ACP1, IF UNSUCCESSFUL ACP2, ACP3, then the actions once the ACP is detected', () => {
    const L = PttStuckLines;
    // F/O PTT stuck on VHF 1, both ACPs on VHF 1: ACP1 first
    const foOnVhf1 = { station: 1 as const, vhf: 1 as const };
    expect(singlePttStuckLines(foOnVhf1, [1, 1])).toEqual([L.title, L.acp1Deselect]);
    // ACP1 deselected, VHF 1 still emitting (F/O): IF UNSUCCESSFUL ACP2
    expect(singlePttStuckLines(foOnVhf1, [0, 1])).toEqual([L.title, L.ifUnsuccessfulAcp2, L.acp2Deselect]);
    // ACP2 deselected: affected ACP detected; ACP1 must take VHF 1 again
    expect(singlePttStuckLines(foOnVhf1, [0, 0])).toEqual([
      L.title,
      L.audioSwitchingDoNotUse,
      L.onAffectedAcp,
      L.allTxKeysDoNotUse,
      L.onAllOtherAcp,
      L.vhfReselect,
    ]);
    expect(singlePttStuckLines(foOnVhf1, [1, 0])).toEqual([
      L.title,
      L.audioSwitchingDoNotUse,
      L.onAffectedAcp,
      L.allTxKeysDoNotUse,
      L.onAllOtherAcp,
    ]);
    // CAPT PTT stuck on VHF 2, ACP1 on VHF 2: its line names VHF 2
    expect(singlePttStuckLines({ station: 0, vhf: 2 }, [2, 1])).toEqual([L.title, L.acp1Deselect + 1]);
    // CAPT moved its key to VHF 3: not detected (still transmitting), neither ACP1 nor ACP2 on VHF 2: ACP3
    expect(singlePttStuckLines({ station: 0, vhf: 2 }, [3, 1])).toEqual([
      L.title,
      L.ifUnsuccessfulAcp3,
      L.acp3Deselect + 1,
    ]);
  });

  it('follows the flyPad failures and shows the SINGLE PTT STUCK procedure', () => {
    const failures = new TestFailures();
    const alerts = new CommunicationAlerts(failures);
    alerts.init();
    expect(failures.registered).toEqual(COM_FAILURES);
    expect(COM_FAILURES).toEqual([23005, 23006, 23007, 23008, 23009, 23017, 23018, 23020, 23021, 23022]);
    const active = (key: string) => alerts.ewdFailures[key].simVarIsActive.get();
    const activeKeys = () => Object.keys(alerts.ewdFailures).filter(active);

    alerts.update(system, 1);
    expect(activeKeys()).toEqual([]);
    expect(alerts.audio3Xfrd.get()).toBe(false);

    failures.active.add(A320Failure.CidsDirector1);
    failures.active.add(A320Failure.CidsDirector2);
    failures.active.add(A320Failure.Vhf3);
    alerts.update(system, 1);
    expect(activeKeys()).toEqual([COM_CIDS_FAULT_KEY, COM_VHF3_DATA_FAULT_KEY]);

    failures.active.clear();
    failures.active.add(A320Failure.CaptPttStuck);
    for (let t = 0; t < 41; t++) {
      alerts.update(system, 1);
    }
    expect(activeKeys()).toEqual([COM_SINGLE_PTT_STUCK_KEY]);
    expect(shownText(alerts, COM_SINGLE_PTT_STUCK_KEY)).toEqual(['COM SINGLE PTT STUCK', '-ACP1 VHF 1 TX.DESELECT']);
    for (let t = 0; t < 20; t++) {
      alerts.update(system, 1);
    }
    expect(activeKeys()).toEqual([COM_SINGLE_PTT_STUCK_KEY, COM_VHF_EMITTING_KEYS[0]]);

    alerts.update({ ...system, acpTransmitVhf: [0, 2] }, 1);
    expect(activeKeys()).toEqual([COM_SINGLE_PTT_STUCK_KEY]);
    expect(shownText(alerts, COM_SINGLE_PTT_STUCK_KEY)).toEqual([
      'COM SINGLE PTT STUCK',
      '-AUDIO SWTG..DO NOT USE',
      '.ON AFFECTED ACP:',
      '-ALL TX KEYS.DO NOT USE',
      '.ON ALL OTHER ACP:',
      '-VHF 1 TX......RESELECT',
    ]);

    failures.active.clear();
    alerts.update({ ...system, acpTransmitVhf: [0, 2], audioSwitchingNorm: false }, 1);
    expect(activeKeys()).toEqual([]);
    expect(alerts.audio3Xfrd.get()).toBe(true);
    expect(alerts.audioSwitchingNorm).toBe(false);
  });

  it('the E/WD texts, levels and flight phase inhibitions', () => {
    const alerts = new CommunicationAlerts(new TestFailures());
    const expected: [string, number, string][] = [
      [COM_CIDS_FAULT_KEY, 1, 'COM CIDS 1+2 FAULT'],
      [COM_SINGLE_PTT_STUCK_KEY, 2, 'COM SINGLE PTT STUCK'],
      [COM_VHF_EMITTING_KEYS[0], 2, 'COM VHF 1 EMITTING'],
      [COM_VHF_EMITTING_KEYS[1], 2, 'COM VHF 2 EMITTING'],
      [COM_VHF_EMITTING_KEYS[2], 2, 'COM VHF 3 EMITTING'],
      [COM_VHF3_DATA_FAULT_KEY, 1, 'COM VHF 3 DATA FAULT'],
    ];
    for (const [key, level, title] of expected) {
      const item = alerts.ewdFailures[key];
      expect(item.failure, key).toBe(level);
      expect(item.sysPage, key).toBe(-1); // SdPages.NONE
      expect(item.flightPhaseInhib, key).toEqual([3, 4, 5, 7, 8]);
      expect(visible(formatEwdMessages([item.codesToReturn[0]])[0]).trim(), key).toBe(title);
      const lines = formatEwdMessages(item.codesToReturn);
      expect(
        lines.every((line) => line !== ''),
        key,
      ).toBe(true);
      for (const line of lines) {
        expect(visible(line).length, line).toBeLessThanOrEqual(25);
      }
    }
    expect(alerts.ewdFailures[COM_SINGLE_PTT_STUCK_KEY].codesToReturn).toHaveLength(PttStuckLines.count);
  });

  it('the STATUS: CIDS, AUDIO SWTG DO NOT USE and SINGLE PTT, VHF 3 DATA', () => {
    const alerts = new CommunicationAlerts(new TestFailures());
    const page = (key: string) => {
      const item = alerts.ewdFailures[key];
      const status = formatStatusPage(item.statusInfo(), item.inopSys());
      return [visible(status.left).split('\r'), visible(status.right).split('\r')];
    };
    expect(page(COM_CIDS_FAULT_KEY)[1]).toEqual(['INOP SYS', 'CIDS']);
    expect(page(COM_SINGLE_PTT_STUCK_KEY)).toEqual([['AUDIO SWTG...DO NOT USE'], ['INOP SYS', 'SINGLE PTT']]);
    expect(page(COM_VHF3_DATA_FAULT_KEY)[1]).toEqual(['INOP SYS', 'VHF 3 DATA']);
  });

  it('the AUDIO 3 XFRD memo is green and the ACP TX keys are read from the transmit channel', () => {
    const memo = formatEwdMessages([AUDIO_3_XFRD_MEMO_CODE])[0];
    expect(memo.startsWith('\x1b<3m')).toBe(true);
    expect(visible(memo)).toBe('AUDIO 3 XFRD');
    expect(COM_PHASE_INHIBITION.audio3XfrdMemo).toEqual([3, 4, 5, 7, 8]);
    expect([0, 1, 2, 4, 3].map(acpTransmitVhf)).toEqual([1, 2, 3, 0, 0]);
  });

  it('the PseudoFWC wiring, the DC ESS BUS FAULT AUDIO SWTG line and the AUDIO SWITCHING selector L:var', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.communicationAlerts.init();');
    expect(fwc).toContain('this.communicationAlerts.update(readComSystemInputs(), deltaTime / 1000);');
    expect(fwc).toContain('...this.communicationAlerts.ewdFailures,');
    expect(fwc).toContain('simVarIsActive: this.communicationAlerts.audio3Xfrd,');
    expect(fwc).toContain('this.communicationAlerts.audioSwitchingNorm,');
    const interior = readFileSync(
      resolve(
        __dirname,
        '../../../../../base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/model/A320_NEO_INTERIOR.xml',
      ),
      'utf-8',
    );
    expect(interior).toMatch(
      /<SWITCH_POSITION_TYPE>L<\/SWITCH_POSITION_TYPE>\s*<SWITCH_POSITION_VAR>KNOB_OVHD_AUDIOSWITCH_Position</,
    );
  });
});
