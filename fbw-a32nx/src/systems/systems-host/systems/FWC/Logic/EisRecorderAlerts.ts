// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { DmcSwitchingKnob, FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { FwcAlertItem, awarenessItem, cautionItem, inopSysOnly } from './FwcAlertItem';

/*
 * The EIS, FWS and RECORDER alerts of the A320 FWC, from TS only flyPad failures (A320Failure 31009-31016):
 * - EIS DMC 1(2)(3) FAULT: DMC 1 -EIS DMC SWITCH ... CAPT 3, DMC 2 -EIS DMC SWITCH ... F/O 3 (the line goes once the
 *   DMC switching selector is there), DMC 3 crew awareness. STATUS INOP SYS DMC 1(2)(3). Inhibited in phases 3, 4, 7, 8
 *   and in the first 15 s of phase 5.
 * - EIS DMC/FWC COM FAULT: the FWC no longer receives the DMC 1/3 and the DMC 2/3 buses. Crew awareness, shown in
 *   phases 1 and 10 only.
 * - FWS SDAC 1(2) FAULT: crew awareness, STATUS INOP SYS SDAC 1(2), phases 3, 4, 5, 7, 8.
 * - FWS SDAC 1 + 2 FAULT: MONITOR OVERHEAD PANEL, ECAM ENG FUEL F/CTL WHEEL (L/G POS IND) SYS PAGES AVAIL. STATUS INOP
 *   SYS SDAC 1+2, phases 4, 5, 7, 8. It replaces the two single SDAC alerts.
 * - RECORDER DFDR FAULT (the DFDR) and RECORDER SYS FAULT (the FDIU): crew awareness, STATUS INOP SYS DFDR / RECORDER
 *   SYS, phases 3, 4, 5, 7, 8.
 * Not modelled: what the displays lose with a failed DMC or both SDACs (INVALID DATA, amber XX, lost SD pages).
 */

export const EisRecorderAlertKeys = {
  dmcFault: ['3100600', '3100610', '3100620'],
  dmcFwcComFault: '3100630',
  sdacFault: ['3100640', '3100650'],
  sdac1And2Fault: '3100660',
  dfdrFault: '3100670',
  recorderSysFault: '3100680',
} as const;

const EIS_RECORDER_PHASE_INHIBITION = {
  /** Also inhibited during the first 15 s of phase 5 */
  dmcFault: [3, 4, 7, 8],
  dmcFwcComFault: [2, 3, 4, 5, 6, 7, 8, 9],
  sdacFault: [3, 4, 5, 7, 8],
  sdac1And2Fault: [4, 5, 7, 8],
  recorderFault: [3, 4, 5, 7, 8],
};

/** EIS DMC 1(2)(3) FAULT is inhibited during the first seconds of the takeoff phase 5 */
export const DMC_FAULT_PHASE_5_INHIBITION_SECONDS = 15;

const TAKEOFF_PHASE = 5;

/** The failures the alerts read, in the order they are registered */
export const EIS_RECORDER_FAILURES = [
  A320Failure.Dmc1,
  A320Failure.Dmc2,
  A320Failure.Dmc3,
  A320Failure.DmcFwcBuses,
  A320Failure.Sdac1,
  A320Failure.Sdac2,
  A320Failure.Dfdr,
  A320Failure.Fdiu,
];

export interface EisRecorderInputs {
  readonly dmcFailed: readonly [boolean, boolean, boolean];
  readonly dmcFwcBusesFailed: boolean;
  readonly sdacFailed: readonly [boolean, boolean];
  readonly dfdrFailed: boolean;
  readonly fdiuFailed: boolean;
  readonly dmcSwitchingKnob: DmcSwitchingKnob;
}

/**
 * EIS DMC/FWC COM FAULT: the FWC has no DMC data. The DMC 1/3 bus carries DMC 1, or DMC 3 in its place; the same for
 * the DMC 2/3 bus. Design choice: the flyPad failure of the buses, or all three DMCs failed.
 */
function isDmcFwcComFault(inputs: EisRecorderInputs): boolean {
  const [dmc1, dmc2, dmc3] = inputs.dmcFailed;
  return inputs.dmcFwcBusesFailed || (dmc1 && dmc2 && dmc3);
}

/** The lines of EIS DMC 1(2) FAULT: 0 title, 1 -EIS DMC SWITCH to the DMC 3 position of that side */
function dmcFaultLines(dmc: 0 | 1 | 2, knob: DmcSwitchingKnob): (number | null)[] {
  if (dmc === 2) {
    return [0];
  }
  const switchedTo3 = dmc === 0 ? knob === DmcSwitchingKnob.Capt : knob === DmcSwitchingKnob.Fo;
  return [0, switchedTo3 ? null : 1];
}

/** STATUS codes (StatusMessages) */
const STATUS = {
  dmc: ['240300148', '240300149', '240300150'],
  sdac: ['240300146', '240300147'],
  sdac1And2: '310300003',
  dfdr: '310300004',
  recorderSys: '240300151',
} as const;

/** The part of the failures consumer the alerts use */
export type EisRecorderFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

export class EisRecorderAlerts {
  private dmcSwitchingKnob = DmcSwitchingKnob.Norm;

  private secondsInTakeoffPhase = 0;

  private readonly dmcFault = [Subject.create(false), Subject.create(false), Subject.create(false)];

  private readonly dmcFwcComFault = Subject.create(false);

  private readonly sdacFault = [Subject.create(false), Subject.create(false)];

  private readonly sdac1And2Fault = Subject.create(false);

  private readonly dfdrFault = Subject.create(false);

  private readonly recorderSysFault = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: EisRecorderFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    for (const failure of EIS_RECORDER_FAILURES) {
      this.failuresConsumer.register(failure);
    }
  }

  /** Reads the failures, then updates the alerts */
  update(dmcSwitchingKnob: DmcSwitchingKnob, flightPhase: number, deltaSeconds: number): void {
    this.failuresConsumer.update();
    const failed = (failure: number) => this.failuresConsumer.isActive(failure);
    this.updateAlerts(
      {
        dmcFailed: [failed(A320Failure.Dmc1), failed(A320Failure.Dmc2), failed(A320Failure.Dmc3)],
        dmcFwcBusesFailed: failed(A320Failure.DmcFwcBuses),
        sdacFailed: [failed(A320Failure.Sdac1), failed(A320Failure.Sdac2)],
        dfdrFailed: failed(A320Failure.Dfdr),
        fdiuFailed: failed(A320Failure.Fdiu),
        dmcSwitchingKnob,
      },
      flightPhase,
      deltaSeconds,
    );
  }

  /** Updates the alerts from inputs already read */
  updateAlerts(inputs: EisRecorderInputs, flightPhase: number, deltaSeconds: number): void {
    this.dmcSwitchingKnob = inputs.dmcSwitchingKnob;
    this.secondsInTakeoffPhase = flightPhase === TAKEOFF_PHASE ? this.secondsInTakeoffPhase + deltaSeconds : 0;
    const dmcInhibitedAtTakeoff =
      flightPhase === TAKEOFF_PHASE && this.secondsInTakeoffPhase < DMC_FAULT_PHASE_5_INHIBITION_SECONDS;

    inputs.dmcFailed.forEach((dmcFailed, dmc) => this.dmcFault[dmc].set(dmcFailed && !dmcInhibitedAtTakeoff));
    this.dmcFwcComFault.set(isDmcFwcComFault(inputs));

    const bothSdacs = inputs.sdacFailed[0] && inputs.sdacFailed[1];
    inputs.sdacFailed.forEach((sdacFailed, sdac) => this.sdacFault[sdac].set(sdacFailed && !bothSdacs));
    this.sdac1And2Fault.set(bothSdacs);

    this.dfdrFault.set(inputs.dfdrFailed);
    this.recorderSysFault.set(inputs.fdiuFailed);
  }

  private dmcFaultItem(dmc: 0 | 1 | 2): FwcAlertItem {
    const key = EisRecorderAlertKeys.dmcFault[dmc];
    const lines = () => dmcFaultLines(dmc, this.dmcSwitchingKnob);
    const status = inopSysOnly(STATUS.dmc[dmc]);
    const inhibition = EIS_RECORDER_PHASE_INHIBITION.dmcFault;
    // DMC 3 is the standby DMC: crew awareness
    return dmc === 2
      ? awarenessItem(key, 1, this.dmcFault[dmc], inhibition, lines, status)
      : cautionItem(key, 2, this.dmcFault[dmc], inhibition, lines, EcamSysPage.NONE, status);
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [EisRecorderAlertKeys.dmcFault[0]]: this.dmcFaultItem(0),
    [EisRecorderAlertKeys.dmcFault[1]]: this.dmcFaultItem(1),
    [EisRecorderAlertKeys.dmcFault[2]]: this.dmcFaultItem(2),
    [EisRecorderAlertKeys.dmcFwcComFault]: awarenessItem(
      EisRecorderAlertKeys.dmcFwcComFault,
      1,
      this.dmcFwcComFault,
      EIS_RECORDER_PHASE_INHIBITION.dmcFwcComFault,
    ),
    [EisRecorderAlertKeys.sdacFault[0]]: awarenessItem(
      EisRecorderAlertKeys.sdacFault[0],
      1,
      this.sdacFault[0],
      EIS_RECORDER_PHASE_INHIBITION.sdacFault,
      () => [0],
      inopSysOnly(STATUS.sdac[0]),
    ),
    [EisRecorderAlertKeys.sdacFault[1]]: awarenessItem(
      EisRecorderAlertKeys.sdacFault[1],
      1,
      this.sdacFault[1],
      EIS_RECORDER_PHASE_INHIBITION.sdacFault,
      () => [0],
      inopSysOnly(STATUS.sdac[1]),
    ),
    // 0 title, 1 -MONITOR OVERHEAD PANEL, 2-4 ECAM ENG FUEL F/CTL WHEEL (L/G POS IND) SYS PAGES AVAIL
    [EisRecorderAlertKeys.sdac1And2Fault]: cautionItem(
      EisRecorderAlertKeys.sdac1And2Fault,
      5,
      this.sdac1And2Fault,
      EIS_RECORDER_PHASE_INHIBITION.sdac1And2Fault,
      () => [0, 1, 2, 3, 4],
      EcamSysPage.NONE,
      inopSysOnly(STATUS.sdac1And2),
    ),
    [EisRecorderAlertKeys.dfdrFault]: awarenessItem(
      EisRecorderAlertKeys.dfdrFault,
      1,
      this.dfdrFault,
      EIS_RECORDER_PHASE_INHIBITION.recorderFault,
      () => [0],
      inopSysOnly(STATUS.dfdr),
    ),
    [EisRecorderAlertKeys.recorderSysFault]: awarenessItem(
      EisRecorderAlertKeys.recorderSysFault,
      1,
      this.recorderSysFault,
      EIS_RECORDER_PHASE_INHIBITION.recorderFault,
      () => [0],
      inopSysOnly(STATUS.recorderSys),
    ),
  };
}
