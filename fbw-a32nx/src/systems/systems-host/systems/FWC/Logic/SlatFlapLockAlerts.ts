// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FlightControlStatusCodes as FctlCodes } from './FlightControlStatus';
import { FwcAlertItem, awarenessItem, cautionItem } from './FwcAlertItem';
import { SfccStatusBits, SfccStatusWord, SlatFlapChannelStatusCodes } from './SlatFlapChannelAlerts';

/*
 * The A320 slat and flap cautions beyond one channel fault (those are in SlatFlapChannelAlerts), from the SFCC
 * slat/flap system status words (label 046, L:A32NX_SFCC_n_SLAT_FLAP_SYSTEM_STATUS_WORD, a320_systems hydraulic/sfcc):
 * - F/CTL SLATS (FLAPS) FAULT: both slat (flap) channels failed (bit 11, bit 12 of both SFCCs), the surfaces no longer
 *   move;
 * - F/CTL SLATS (FLAPS) LOCKED: the slat (flap) wing tip brakes are on (bit 15, bit 16), applied by the SFCCs on a
 *   transmission asymmetry; LOCKED takes the place of FAULT;
 * - F/CTL SLATS AND FLAPS FAULT IN CONF 0: both faults with the slats and the flaps retracted, instead of the two;
 * - F/CTL SLAT (FLAP) TIP BRK FAULT, F/CTL FLAP ATTACH SENSOR: crew awareness cautions of the parts the SFCCs monitor,
 *   from their flyPad failures while an SFCC is powered.
 *
 * Not modelled (no model output): the alternate law after the failure of both slat channels (the ELACs get no SFCC
 * data), with its STATUS lines (ALTN LAW: PROT LOST, WHEN L/G DN: DIRECT LAW, INOP SYS F/CTL PROT), and the loss of the
 * AP, A/THR and CAT 2 when both slat or flap channels fail.
 * The combined title FLAPS/SLATS FAULT/LOCKED is the MAX SPEED and APPR SPD table these procedures refer to, not an
 * alert of its own: the STATUS shows APPR SPD....SEE QRH.
 */

/**
 * Design choice: the procedures give no flight phase inhibition. These are major cautions of surfaces that move in
 * every phase but the takeoff and landing ones, inhibited as the L(R) AIL and ELEV FAULT cautions.
 */
export const SLAT_FLAP_LOCK_PHASE_INHIBITION = [4, 5];

/** F/CTL SLAT(FLAP) TIP BRK FAULT and FLAP ATTACH SENSOR: their published inhibition */
export const SLAT_FLAP_COMPONENT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** The 7-digit E/WD keys (EwdMessages) */
export const SlatFlapLockKeys = {
  slatsAndFlapsFaultInConf0: '2701150',
  slats: '2701160',
  flaps: '2701170',
  slatTipBrakeFault: '2701220',
  flapTipBrakeFault: '2701230',
  flapAttachSensor: '2701240',
} as const;

/**
 * The slat and flap transmission angles (FPPU degrees) of the positions the procedures name. The FWC reads them from
 * L:A32NX_SLATS(FLAPS)_IPPU_ANGLE: the model's IPPU sends the same angle as the FPPUs of the SFCCs.
 * Retracted: as the SFCC position word (slats below 6.2, flaps below 2.5). Design choice: a flap position is reached
 * within 2 degrees of its FPPU angle (CONF 3: 168.35, sfcc/flaps_channel.rs).
 */
const FppuAngles = {
  slatsRetractedBelow: 6.2,
  flapsRetractedBelow: 2.5,
  flaps3Reached: 166.35,
  flapsBeyond3: 170.35,
};

/** The status word with its validity: a powered-off SFCC no longer monitors its parts */
export interface SfccSystemStatusWord extends SfccStatusWord {
  isNormalOperation(): boolean;
}

export interface SlatFlapLockInputs {
  sfcc1: SfccSystemStatusWord;
  sfcc2: SfccSystemStatusWord;
  /** L:A32NX_SLATS_IPPU_ANGLE, degrees */
  slatsFppuAngle: number;
  /** L:A32NX_FLAPS_IPPU_ANGLE, degrees */
  flapsFppuAngle: number;
}

interface SlatFlapLockState {
  slatsFault: boolean;
  slatsLocked: boolean;
  flapsFault: boolean;
  flapsLocked: boolean;
  slatsExtended: boolean;
  flapsExtended: boolean;
  /** The flaps are at 3 or beyond */
  flapsAt3OrBeyond: boolean;
  flapsBeyond3: boolean;
}

/**
 * The slat and flap states the cautions use.
 * @param inputs the SFCC words and the surface positions
 */
function slatFlapLockState(inputs: SlatFlapLockInputs): SlatFlapLockState {
  const bothSfccs = (bit: number) => inputs.sfcc1.bitValueOr(bit, false) && inputs.sfcc2.bitValueOr(bit, false);
  const eitherSfcc = (bit: number) => inputs.sfcc1.bitValueOr(bit, false) || inputs.sfcc2.bitValueOr(bit, false);
  return {
    slatsFault: bothSfccs(SfccStatusBits.slatFault),
    slatsLocked: eitherSfcc(SfccStatusBits.slatWingTipBrakeOn),
    flapsFault: bothSfccs(SfccStatusBits.flapFault),
    flapsLocked: eitherSfcc(SfccStatusBits.flapWingTipBrakeOn),
    slatsExtended: inputs.slatsFppuAngle >= FppuAngles.slatsRetractedBelow,
    flapsExtended: inputs.flapsFppuAngle >= FppuAngles.flapsRetractedBelow,
    flapsAt3OrBeyond: inputs.flapsFppuAngle >= FppuAngles.flaps3Reached,
    flapsBeyond3: inputs.flapsFppuAngle > FppuAngles.flapsBeyond3,
  };
}

/** The STATUS codes of these cautions that FlightControlStatus does not have (StatusMessages) */
const SlatFlapStatusCodes = {
  forLandingUseFlap1: '270400016',
  keepConfFull: '270400015',
  apprSpdSeeQrh: '270400014',
  apprSpdVref60: '270400017',
  at300FtAgl: '270500004',
  targetSpdVref50: '270400018',
  inopSlats: '270300030',
  inopFlaps: '270300031',
};

const aerodynamicPenalty = (extended: boolean) =>
  extended ? [FctlCodes.fuelConsumptIncreased, FctlCodes.fmsPredUnreliable] : [];

/** F/CTL SLATS FAULT/LOCKED STATUS */
function slatsFaultLockedStatus(state: SlatFlapLockState): StatusLines {
  return {
    left: [
      FctlCodes.apprProc,
      FctlCodes.forLandingUseFlap3,
      FctlCodes.gpwsLandingFlap3On,
      SlatFlapStatusCodes.apprSpdSeeQrh,
      FctlCodes.ldgDistProcApply,
      ...aerodynamicPenalty(state.slatsExtended),
    ],
    inopSys: [SlatFlapStatusCodes.inopSlats],
  };
}

/** F/CTL FLAPS FAULT/LOCKED STATUS: the landing flap lines depend on where the flaps stopped */
function flapsFaultLockedStatus(state: SlatFlapLockState): StatusLines {
  return {
    left: [
      FctlCodes.apprProc,
      ...(state.flapsBeyond3 ? [SlatFlapStatusCodes.keepConfFull] : [FctlCodes.forLandingUseFlap3]),
      state.flapsAt3OrBeyond ? FctlCodes.gpwsLandingFlap3On : SlatFlapChannelStatusCodes.gpwsFlapModeOff,
      SlatFlapStatusCodes.apprSpdSeeQrh,
      FctlCodes.ldgDistProcApply,
      ...(state.flapsLocked ? [] : SlatFlapChannelStatusCodes.engApprIdleOnly),
      ...aerodynamicPenalty(state.flapsExtended),
    ],
    inopSys: [SlatFlapStatusCodes.inopFlaps],
  };
}

/** F/CTL SLATS AND FLAPS FAULT IN CONF 0 STATUS: its slat fault is the fault of both slat channels */
function slatsAndFlapsFaultInConf0Status(): StatusLines {
  return {
    left: [
      FctlCodes.maxSpeed320,
      FctlCodes.apprProc,
      SlatFlapStatusCodes.forLandingUseFlap1,
      SlatFlapChannelStatusCodes.gpwsFlapModeOff,
      SlatFlapStatusCodes.apprSpdVref60,
      SlatFlapStatusCodes.at300FtAgl,
      SlatFlapStatusCodes.targetSpdVref50,
      FctlCodes.ldgDistProcApply,
      ...SlatFlapChannelStatusCodes.engApprIdleOnly,
    ],
    inopSys: [SlatFlapStatusCodes.inopSlats, SlatFlapStatusCodes.inopFlaps],
  };
}

/**
 * The E/WD lines of F/CTL SLATS (FLAPS) FAULT/LOCKED, as indexes of their codes: FAULT or LOCKED title, the wing tip
 * brake line(s) when locked, MAX SPEED, FLAPS LEVER RECYCLE when not locked, the aerodynamic penalty when extended.
 * @param locked the wing tip brakes are on
 * @param extended the surfaces are not retracted
 * @param wingTipBrakeLines the number of wing tip brake lines (slats: 1, flaps: 2)
 */
function faultLockedLines(locked: boolean, extended: boolean, wingTipBrakeLines: 1 | 2): number[] {
  const maxSpeed = 2 + wingTipBrakeLines;
  const brakeLines = wingTipBrakeLines === 1 ? [2] : [2, 3];
  const penalty = extended ? [maxSpeed + 2, maxSpeed + 3] : [];
  return locked ? [1, ...brakeLines, maxSpeed, ...penalty] : [0, maxSpeed, maxSpeed + 1, ...penalty];
}

/** The part of the failures consumer the alerts use */
export type SlatFlapFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

const NO_FAULT: SlatFlapLockState = {
  slatsFault: false,
  slatsLocked: false,
  flapsFault: false,
  flapsLocked: false,
  slatsExtended: false,
  flapsExtended: false,
  flapsAt3OrBeyond: false,
  flapsBeyond3: false,
};

/** The slat and flap cautions: keeps their states and gives the items the PseudoFWC adds to its alerts */
export class SlatFlapLockAlerts {
  private state = NO_FAULT;

  private readonly slatsAndFlapsFaultInConf0 = Subject.create(false);

  private readonly slatsFaultOrLocked = Subject.create(false);

  private readonly flapsFaultOrLocked = Subject.create(false);

  private readonly slatTipBrakeFault = Subject.create(false);

  private readonly flapTipBrakeFault = Subject.create(false);

  private readonly flapAttachSensor = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: SlatFlapFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures of the monitored parts, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.SlatWingTipBrake);
    this.failuresConsumer.register(A320Failure.FlapWingTipBrake);
    this.failuresConsumer.register(A320Failure.FlapAttachmentSensor);
  }

  update(inputs: SlatFlapLockInputs): void {
    this.failuresConsumer.update();
    const state = slatFlapLockState(inputs);
    this.state = state;

    const inConf0 = !state.slatsExtended && !state.flapsExtended;
    const bothFaultsInConf0 =
      state.slatsFault && state.flapsFault && !state.slatsLocked && !state.flapsLocked && inConf0;
    this.slatsAndFlapsFaultInConf0.set(bothFaultsInConf0);
    this.slatsFaultOrLocked.set(!bothFaultsInConf0 && (state.slatsFault || state.slatsLocked));
    this.flapsFaultOrLocked.set(!bothFaultsInConf0 && (state.flapsFault || state.flapsLocked));

    const sfccMonitoring = inputs.sfcc1.isNormalOperation() || inputs.sfcc2.isNormalOperation();
    const seenBySfcc = (failure: number) => sfccMonitoring && this.failuresConsumer.isActive(failure);
    this.slatTipBrakeFault.set(seenBySfcc(A320Failure.SlatWingTipBrake));
    this.flapTipBrakeFault.set(seenBySfcc(A320Failure.FlapWingTipBrake));
    this.flapAttachSensor.set(seenBySfcc(A320Failure.FlapAttachmentSensor));
  }

  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [SlatFlapLockKeys.slatsAndFlapsFaultInConf0]: cautionItem(
      SlatFlapLockKeys.slatsAndFlapsFaultInConf0,
      3,
      this.slatsAndFlapsFaultInConf0,
      SLAT_FLAP_LOCK_PHASE_INHIBITION,
      () => [0, 1, 2],
      EcamSysPage.NONE,
      slatsAndFlapsFaultInConf0Status,
    ),
    [SlatFlapLockKeys.slats]: cautionItem(
      SlatFlapLockKeys.slats,
      7,
      this.slatsFaultOrLocked,
      SLAT_FLAP_LOCK_PHASE_INHIBITION,
      () => faultLockedLines(this.state.slatsLocked, this.state.slatsExtended, 1),
      EcamSysPage.NONE,
      () => slatsFaultLockedStatus(this.state),
    ),
    [SlatFlapLockKeys.flaps]: cautionItem(
      SlatFlapLockKeys.flaps,
      8,
      this.flapsFaultOrLocked,
      SLAT_FLAP_LOCK_PHASE_INHIBITION,
      () => faultLockedLines(this.state.flapsLocked, this.state.flapsExtended, 2),
      EcamSysPage.NONE,
      () => flapsFaultLockedStatus(this.state),
    ),
    [SlatFlapLockKeys.slatTipBrakeFault]: awarenessItem(
      SlatFlapLockKeys.slatTipBrakeFault,
      1,
      this.slatTipBrakeFault,
      SLAT_FLAP_COMPONENT_PHASE_INHIBITION,
    ),
    [SlatFlapLockKeys.flapTipBrakeFault]: awarenessItem(
      SlatFlapLockKeys.flapTipBrakeFault,
      1,
      this.flapTipBrakeFault,
      SLAT_FLAP_COMPONENT_PHASE_INHIBITION,
    ),
    [SlatFlapLockKeys.flapAttachSensor]: awarenessItem(
      SlatFlapLockKeys.flapAttachSensor,
      1,
      this.flapAttachSensor,
      SLAT_FLAP_COMPONENT_PHASE_INHIBITION,
    ),
  };
}
