// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';
import { A380Failure } from '@failures';

/*
 * The NAV alerts of the landing system receivers and of the air data probes:
 *
 * - NAV LS 1(2)(1+2) FAULT: the ILS, GLS and FLS functions of the MMR are all lost, which is the case when the MMR is
 *   failed. The sim has no GLS or FLS function, so they are lost only with their MMR: the alert is the MMR failure.
 *   STATUS APPR & LDG: CAT 2, GLS AUTOLAND, LS 1(2) (LS 1+2).
 * - NAV ILS 1(2)(1+2) FAULT: the ILS receiver of the MMR is failed, the MMR still working. STATUS APPR & LDG: CAT 2,
 *   ILS 1(2) (ILS 1+2).
 *   Design choice: with one MMR failed and the ILS receiver of the other MMR failed, the alerts are LS 1(2) FAULT and
 *   ILS 2(1) FAULT, each receiver reported by one alert only.
 * - NAV STATIC PROBE FAULT: a static pressure probe is obstructed; the procedure and the STATUS name each ADR with its
 *   left, right or both probes, INFO IAS/ALT MAYBE NOT RELIABLE.
 * - NAV ADR 1+2+3 DATA DEGRADED: the three left or the three right static probes are damaged (e.g. bird strike). It
 *   replaces NAV STATIC PROBE FAULT.
 * - NAV SIDESLIP PROBE 1(2)(3) FAULT: one sideslip probe is failed; no aural, no master light; INOP SYS SIDESLIP PROBE.
 * - NAV RESIDUAL AIR SPEED ON ADR 1(2)(3): on ground with all engines shut down, the ADR gives more than 80 kt.
 */

/** Flight phase inhibition of NAV LS and NAV ILS FAULT */
export const LS_ILS_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7];

export const STATIC_PROBE_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

export const ADR_DATA_DEGRADED_PHASE_INHIBITION = [4, 5, 6, 7, 10];

export const SIDESLIP_PROBE_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export const RESIDUAL_AIR_SPEED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9];

/** The residual airspeed an ADR may give on ground with the engines shut down, in knots */
const RESIDUAL_AIR_SPEED_LIMIT_KT = 80;

/** STATUS APPR & LDG (EcamInopSys) */
export const LS_FAULT_INOP_SYS_APPR_LDG = {
  ls1: ['220300027', '220300010', '340300054'],
  ls2: ['220300027', '220300010', '340300063'],
  ls1And2: ['340300064'],
};

export const ILS_FAULT_INOP_SYS_APPR_LDG = {
  ils1: ['220300027', '340300060'],
  ils2: ['220300027', '340300061'],
  ils1And2: ['340300062'],
};

/** INOP SYS SIDESLIP PROBE 1, 2, 3 */
export const SIDESLIP_PROBE_INOP_SYS = ['340300065', '340300066', '340300067'];

/** INOP SYS L ADR n STAT PROBE, R ADR n STAT PROBE, L+R ADR n STAT PROBE, for ADR 1, 2, 3 (the procedure lines) */
const STATIC_PROBE_INOP_SYS = [
  '340300068',
  '340300069',
  '340300070',
  '340300071',
  '340300072',
  '340300073',
  '340300074',
  '340300075',
  '340300076',
];

/** INFO IAS/ALT MAYBE NOT RELIABLE (EcamInfos) */
export const STATIC_PROBE_FAULT_INFO = '340200022';

/** The obstructed static probes of one ADR */
export interface StaticProbes {
  left: boolean;
  right: boolean;
}

/** What the alerts read */
export interface NavSensorAlertInputs {
  /** MMR 1, 2 failed as a whole */
  mmrFailed: readonly [boolean, boolean];
  /** The ILS receiver of MMR 1, 2 failed */
  ilsReceiverFailed: readonly [boolean, boolean];
  /** The obstructed static probes of ADR 1, 2, 3 */
  staticProbes: readonly [StaticProbes, StaticProbes, StaticProbes];
  /** Sideslip probe 1, 2, 3 failed */
  sideslipProbeFailed: readonly [boolean, boolean, boolean];
  /** The computed airspeed of ADR 1, 2, 3 in knots, null when not valid */
  adrComputedAirspeedKt: readonly [number | null, number | null, number | null];
  onGround: boolean;
  /** All four engines are shut down */
  allEnginesShutDown: boolean;
}

/** The 1, 2 and 1+2 alerts made from the conditions of both receivers, which never show together */
export interface ReceiverPairAlerts {
  one: boolean;
  two: boolean;
  oneAndTwo: boolean;
}

function splitPair(first: boolean, second: boolean): ReceiverPairAlerts {
  return { one: first && !second, two: second && !first, oneAndTwo: first && second };
}

/**
 * NAV LS FAULT from the MMR failures, NAV ILS FAULT from the ILS receiver failures of the working MMRs.
 * @param mmrFailed MMR 1, 2 failed
 * @param ilsReceiverFailed the ILS receiver of MMR 1, 2 failed
 * @returns the LS and ILS alerts
 */
export function landingSystemAlerts(
  mmrFailed: readonly [boolean, boolean],
  ilsReceiverFailed: readonly [boolean, boolean],
): { ls: ReceiverPairAlerts; ils: ReceiverPairAlerts } {
  return {
    ls: splitPair(mmrFailed[0], mmrFailed[1]),
    ils: splitPair(ilsReceiverFailed[0] && !mmrFailed[0], ilsReceiverFailed[1] && !mmrFailed[1]),
  };
}

/**
 * The lines of NAV STATIC PROBE FAULT, 3 per ADR: L ADR n STAT PROBE, R ADR n STAT PROBE, L+R ADR n STAT PROBE.
 * @param probes the obstructed static probes of ADR 1, 2, 3
 * @returns the 9 lines, true where shown
 */
export function staticProbeLines(probes: readonly StaticProbes[]): boolean[] {
  const lines: boolean[] = [];
  for (const { left, right } of probes) {
    lines.push(left && !right, right && !left, left && right);
  }
  return lines;
}

/**
 * The STATUS INOP SYS of NAV STATIC PROBE FAULT: the probes of each ADR, as in the procedure.
 * @param probes the obstructed static probes of ADR 1, 2, 3
 * @returns the INOP SYS codes
 */
export function staticProbeInopSys(probes: readonly StaticProbes[]): string[] {
  const lines = staticProbeLines(probes);
  return STATIC_PROBE_INOP_SYS.filter((_, index) => lines[index]);
}

/**
 * The three left or the three right static probes are obstructed.
 * @param probes the obstructed static probes of ADR 1, 2, 3
 * @returns whether the air data of the three ADRs is degraded
 */
export function isAdrDataDegraded(probes: readonly StaticProbes[]): boolean {
  return probes.every((p) => p.left) || probes.every((p) => p.right);
}

/**
 * Reads the inputs from the failures and the sim.
 * @param read reads a simvar (SimVar.GetSimVarValue in the sim)
 * @param isFailureActive whether a flyPad failure is active
 * @param onGround whether the aircraft is on ground
 * @returns the inputs
 */
export function readNavSensorAlertInputs(
  read: (name: string, unit: string) => number,
  isFailureActive: (failure: number) => boolean,
  onGround: boolean,
): NavSensorAlertInputs {
  const casKt = (adr: number) => {
    const word = new Arinc429Word(read(`L:A32NX_ADIRS_ADR_${adr}_COMPUTED_AIRSPEED`, 'number'));
    return word.isNormalOperation() ? word.value : null;
  };
  let allEnginesShutDown = true;
  for (let engine = 1; engine <= 4; engine++) {
    // L:A32NX_ENGINE_STATE: 0 = off
    allEnginesShutDown &&= read(`L:A32NX_ENGINE_STATE:${engine}`, 'enum') === 0;
  }
  return {
    mmrFailed: [isFailureActive(A380Failure.Mmr1), isFailureActive(A380Failure.Mmr2)],
    ilsReceiverFailed: [isFailureActive(A380Failure.Ils1Receiver), isFailureActive(A380Failure.Ils2Receiver)],
    staticProbes: [
      {
        left: isFailureActive(A380Failure.Adr1LeftStaticProbe),
        right: isFailureActive(A380Failure.Adr1RightStaticProbe),
      },
      {
        left: isFailureActive(A380Failure.Adr2LeftStaticProbe),
        right: isFailureActive(A380Failure.Adr2RightStaticProbe),
      },
      {
        left: isFailureActive(A380Failure.Adr3LeftStaticProbe),
        right: isFailureActive(A380Failure.Adr3RightStaticProbe),
      },
    ],
    sideslipProbeFailed: [
      isFailureActive(A380Failure.SideslipProbe1),
      isFailureActive(A380Failure.SideslipProbe2),
      isFailureActive(A380Failure.SideslipProbe3),
    ],
    adrComputedAirspeedKt: [casKt(1), casKt(2), casKt(3)],
    onGround,
    allEnginesShutDown,
  };
}

/** The NAV landing system and air data probe alerts. One instance in FwsCore. */
export class FwsNavSensorAlerts {
  public readonly ls1Fault = Subject.create(false);
  public readonly ls2Fault = Subject.create(false);
  public readonly ls1And2Fault = Subject.create(false);

  public readonly ils1Fault = Subject.create(false);
  public readonly ils2Fault = Subject.create(false);
  public readonly ils1And2Fault = Subject.create(false);

  public readonly staticProbeFault = Subject.create(false);
  public readonly adrDataDegraded = Subject.create(false);
  /** The obstructed static probes of ADR 1, 2, 3, for the procedure lines and the STATUS */
  public staticProbes: readonly StaticProbes[] = [];

  public readonly sideslipProbeFault = [Subject.create(false), Subject.create(false), Subject.create(false)];

  /** NAV RESIDUAL AIR SPEED ON ADR 1, 2, 3 */
  public readonly residualAirSpeed = [Subject.create(false), Subject.create(false), Subject.create(false)];

  /** @param inputs the receiver, probe and air data state */
  public update(inputs: NavSensorAlertInputs): void {
    const { ls, ils } = landingSystemAlerts(inputs.mmrFailed, inputs.ilsReceiverFailed);
    this.ls1Fault.set(ls.one);
    this.ls2Fault.set(ls.two);
    this.ls1And2Fault.set(ls.oneAndTwo);
    this.ils1Fault.set(ils.one);
    this.ils2Fault.set(ils.two);
    this.ils1And2Fault.set(ils.oneAndTwo);

    this.staticProbes = inputs.staticProbes;
    const degraded = isAdrDataDegraded(inputs.staticProbes);
    this.adrDataDegraded.set(degraded);
    this.staticProbeFault.set(!degraded && inputs.staticProbes.some((p) => p.left || p.right));

    inputs.sideslipProbeFailed.forEach((failed, index) => this.sideslipProbeFault[index].set(failed));

    const engineOffOnGround = inputs.onGround && inputs.allEnginesShutDown;
    inputs.adrComputedAirspeedKt.forEach((cas, index) =>
      this.residualAirSpeed[index].set(engineOffOnGround && cas !== null && cas > RESIDUAL_AIR_SPEED_LIMIT_KT),
    );
  }
}
