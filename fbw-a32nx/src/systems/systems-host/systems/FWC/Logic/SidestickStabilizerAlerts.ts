// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FlightControlStatusCodes as FctlCodes } from './FlightControlStatus';
import { FcdcBits, FcdcDiscreteWord } from './FlightControlSurfaceAlerts';
import { FwcAlertItem, awarenessItem, cautionItem } from './FwcAlertItem';

/*
 * The A320 sidestick and stabilizer cautions, from the flyPad failures the fbw_a320 module applies to the ELAC and SEC
 * inputs (failures/FlightControlFailureInputs.h):
 * - F/CTL L(R) SIDESTICK FAULT: the pitch and roll transducers of one sidestick failed;
 * - F/CTL SIDESTICK PRIORITY: the sidestick priority logic circuit failed;
 * - F/CTL STABILIZER JAM: the electrical control of the stabilizer is lost (the ELACs and SECs see a THS motor fault:
 *   the ELACs lose the pitch axis, the pitch law reverts to alternate law, the manual pitch trim stays available).
 * The flight control computers detect them: an alert needs an ELAC or SEC that an FCDC reports valid.
 */

/** F/CTL L(R) SIDESTICK FAULT: no flight phase inhibition */
export const SIDESTICK_FAULT_PHASE_INHIBITION: number[] = [];

/** F/CTL SIDESTICK PRIORITY: the published inhibition, shown in flight phases 1, 2 and 10 only */
export const SIDESTICK_PRIORITY_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9];

/** F/CTL STABILIZER JAM: the published inhibition, from 80 kt at takeoff to 1500 ft only */
export const STABILIZER_JAM_PHASE_INHIBITION = [4, 5];

/** The 7-digit E/WD keys (EwdMessages) */
export const SidestickStabilizerKeys = {
  leftSidestickFault: '2701180',
  rightSidestickFault: '2701190',
  sidestickPriority: '2701200',
  stabilizerJam: '2701210',
} as const;

/**
 * Whether one of the given computers is reported valid by an FCDC.
 * @param fcdcWords the discrete word 1 of FCDC 1 and FCDC 2 (L:A32NX_FCDC_n_DISCRETE_WORD_1)
 * @param invalidBits the word 1 bits of the computers that are not valid (failed or OFF)
 */
function anyComputerValid(fcdcWords: readonly FcdcDiscreteWord[], invalidBits: readonly number[]): boolean {
  return fcdcWords.some((word) => word.isNormalOperation() && invalidBits.some((bit) => !word.bitValueOr(bit, true)));
}

/** The ELACs and SECs that read the sidesticks and the take over pbs */
const SIDESTICK_COMPUTERS = [
  FcdcBits.word1.elac1Invalid,
  FcdcBits.word1.elac2Invalid,
  FcdcBits.word1.sec1Invalid,
  FcdcBits.word1.sec2Invalid,
  FcdcBits.word1.sec3Invalid,
];

/** The ELACs and SECs that control the THS */
const THS_COMPUTERS = [
  FcdcBits.word1.elac1Invalid,
  FcdcBits.word1.elac2Invalid,
  FcdcBits.word1.sec1Invalid,
  FcdcBits.word1.sec2Invalid,
];

/** The STATUS codes of these cautions (StatusMessages) */
const SidestickStabilizerStatusCodes = {
  ifManTrimNotAvail: '270500002',
  whenConf3AndVapp: '270500003',
  landingGearDown: '270400013',
  inopStabilizer: '270300029',
  inopLeftSidestick: '270300032',
  inopRightSidestick: '270300033',
};

/** F/CTL L(R) SIDESTICK FAULT STATUS: INOP SYS L(R) SIDESTICK */
function sidestickFaultStatus(side: 'L' | 'R'): StatusLines {
  return {
    left: [],
    inopSys: [
      side === 'L'
        ? SidestickStabilizerStatusCodes.inopLeftSidestick
        : SidestickStabilizerStatusCodes.inopRightSidestick,
    ],
  };
}

/**
 * F/CTL STABILIZER JAM STATUS. The FWC does not know whether the manual pitch trim is still available: the landing
 * gear line keeps its condition.
 */
function stabilizerJamStatus(): StatusLines {
  return {
    left: [
      FctlCodes.maxSpeed320,
      FctlCodes.apprProc,
      FctlCodes.forLandingUseFlap3,
      FctlCodes.gpwsLandingFlap3On,
      SidestickStabilizerStatusCodes.ifManTrimNotAvail,
      SidestickStabilizerStatusCodes.whenConf3AndVapp,
      SidestickStabilizerStatusCodes.landingGearDown,
      FctlCodes.apprSpdVref10,
      FctlCodes.ldgDistProcApply,
      FctlCodes.altnLawProtLost,
      FctlCodes.whenLgDownDirectLaw,
    ],
    inopSys: [
      FctlCodes.fctlProt,
      SidestickStabilizerStatusCodes.inopStabilizer,
      FctlCodes.elacPitch,
      FctlCodes.ap12,
      FctlCodes.cat2,
    ],
  };
}

export interface SidestickStabilizerInputs {
  fcdc1Word1: FcdcDiscreteWord;
  fcdc2Word1: FcdcDiscreteWord;
}

/** The part of the failures consumer the alerts use */
export type SidestickStabilizerFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** The sidestick and stabilizer cautions: keeps their states and gives the items the PseudoFWC adds to its alerts */
export class SidestickStabilizerAlerts {
  private readonly leftSidestickFault = Subject.create(false);

  private readonly rightSidestickFault = Subject.create(false);

  private readonly sidestickPriority = Subject.create(false);

  private readonly stabilizerJam = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: SidestickStabilizerFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.CaptSidestick);
    this.failuresConsumer.register(A320Failure.FoSidestick);
    this.failuresConsumer.register(A320Failure.SidestickPriorityLogic);
    this.failuresConsumer.register(A320Failure.StabilizerElecControl);
  }

  update(inputs: SidestickStabilizerInputs): void {
    this.failuresConsumer.update();
    const fcdcWords = [inputs.fcdc1Word1, inputs.fcdc2Word1];
    const sidestickComputerValid = anyComputerValid(fcdcWords, SIDESTICK_COMPUTERS);
    const thsComputerValid = anyComputerValid(fcdcWords, THS_COMPUTERS);
    const failed = (failure: number) => this.failuresConsumer.isActive(failure);

    this.leftSidestickFault.set(sidestickComputerValid && failed(A320Failure.CaptSidestick));
    this.rightSidestickFault.set(sidestickComputerValid && failed(A320Failure.FoSidestick));
    this.sidestickPriority.set(sidestickComputerValid && failed(A320Failure.SidestickPriorityLogic));
    this.stabilizerJam.set(thsComputerValid && failed(A320Failure.StabilizerElecControl));
  }

  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [SidestickStabilizerKeys.leftSidestickFault]: awarenessItem(
      SidestickStabilizerKeys.leftSidestickFault,
      1,
      this.leftSidestickFault,
      SIDESTICK_FAULT_PHASE_INHIBITION,
      () => [0],
      () => sidestickFaultStatus('L'),
    ),
    [SidestickStabilizerKeys.rightSidestickFault]: awarenessItem(
      SidestickStabilizerKeys.rightSidestickFault,
      1,
      this.rightSidestickFault,
      SIDESTICK_FAULT_PHASE_INHIBITION,
      () => [0],
      () => sidestickFaultStatus('R'),
    ),
    [SidestickStabilizerKeys.sidestickPriority]: cautionItem(
      SidestickStabilizerKeys.sidestickPriority,
      2,
      this.sidestickPriority,
      SIDESTICK_PRIORITY_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.NONE,
    ),
    [SidestickStabilizerKeys.stabilizerJam]: cautionItem(
      SidestickStabilizerKeys.stabilizerJam,
      4,
      this.stabilizerJam,
      STABILIZER_JAM_PHASE_INHIBITION,
      () => [0, 1, 2, 3],
      EcamSysPage.FCTL,
      stabilizerJamStatus,
    ),
  };
}
