// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';
import { Subject } from '@microsoft/msfs-sdk';
import { BrakeSteerInputs } from './FwsBrakeAlerts';

/*
 * Trigger logic of the BRAKES alerts of the FWS that come from one braking control system (BCS), from one main gear
 * group or one brake pair (a380_systems hydraulic/brake_anti_skid_faults.rs), and of the BCS crew awareness alerts.
 *
 * The anti-skid of each main gear group goes through its own remote data concentrator (RDC): RDC 1 for both wing
 * gears, RDC 2 for the right body gear, RDC 3 for the left body gear, each with a channel A and a channel B.
 */

// The pedal braking modes (L:A32NX_BRAKES_PEDAL_BRAKING_MODE) where the BCS controls the anti-skid
const PEDAL_BRAKING_MODE_NORMAL = 1;
const PEDAL_BRAKING_MODE_ALTERNATE = 2;

/** Brake pairs 1/2 to 15/16, numbered as the brakes of the SD WHEEL page */
const BRAKE_PAIR_COUNT = 8;

/** What the FWS reads from the BCS */
export interface BrakeControlInputs {
  bcs1Fault: boolean;
  bcs2Fault: boolean;
  /** Bit 0 RDC 1 channel A, bit 1 RDC 1 channel B, bit 2 RDC 2 channel A ... bit 5 RDC 3 channel B */
  rdcChannelFaults: number;
  /** Bit n: brake pair n released (bit 0 brakes 1/2) */
  releasedPairs: number;
  /** Bit n: residual pressure on brake pair n without braking command */
  residualPairs: number;
  /** 0 none, 1 normal, 2 alternate, 3 emergency (EBCU) */
  pedalBrakingMode: number;
  antiSkidSwitchOn: boolean;
  normPressureTransmitterFault: boolean;
  altnPressureTransmitterFault: boolean;
  selectorValveJammedOpen: boolean;
  minorFault: boolean;
  safetyTestOverdue: boolean;
}

/**
 * Reads the inputs of the BCS alerts.
 * @param read reads one simvar as a number (SimVar.GetSimVarValue(name, 'number') in the sim)
 * @param failureActive whether a flyPad failure is active (for the BCS faults that only the FWS reads)
 * @param brakeSteer the pedal braking mode and the A-SKID sw, already read for the BRAKES and STEER alerts
 * @returns the inputs
 */
export function readBrakeControlInputs(
  read: (name: string) => number,
  failureActive: (failure: number) => boolean,
  brakeSteer: Pick<BrakeSteerInputs, 'pedalBrakingMode' | 'antiSkidSwitchOn'>,
): BrakeControlInputs {
  return {
    bcs1Fault: read('L:A32NX_BRAKES_CTL_1_FAULT') > 0,
    bcs2Fault: read('L:A32NX_BRAKES_CTL_2_FAULT') > 0,
    rdcChannelFaults: read('L:A32NX_BRAKES_RDC_CHANNEL_FAULTS'),
    releasedPairs: read('L:A32NX_BRAKES_RELEASED_PAIRS'),
    residualPairs: read('L:A32NX_BRAKES_RESIDUAL_PAIRS'),
    pedalBrakingMode: brakeSteer.pedalBrakingMode,
    antiSkidSwitchOn: brakeSteer.antiSkidSwitchOn,
    normPressureTransmitterFault: failureActive(A380Failure.BrakesNormPressureTransmitter),
    altnPressureTransmitterFault: failureActive(A380Failure.BrakesAltnPressureTransmitter),
    selectorValveJammedOpen: failureActive(A380Failure.BrakesSelectorValveJammedOpen),
    minorFault: failureActive(A380Failure.BrakesControlSystemMinorFault),
    safetyTestOverdue: failureActive(A380Failure.BrakesSafetyTestOverdue),
  };
}

function bitSet(mask: number, bit: number): boolean {
  return (Math.round(mask) & (1 << bit)) !== 0;
}

/**
 * Whether one RDC channel is failed.
 * @param rdcChannelFaults the RDC channel fault bits
 * @param rdc 1 (wing gears), 2 (right body gear) or 3 (left body gear)
 * @param channelB channel B, else channel A
 * @returns whether the channel is failed
 */
export function rdcChannelFailed(rdcChannelFaults: number, rdc: number, channelB: boolean): boolean {
  return bitSet(rdcChannelFaults, (rdc - 1) * 2 + (channelB ? 1 : 0));
}

function rdcLost(rdcChannelFaults: number, rdc: number): boolean {
  return rdcChannelFailed(rdcChannelFaults, rdc, false) && rdcChannelFailed(rdcChannelFaults, rdc, true);
}

/** The partial A-SKID alerts; at most one is true */
export interface PartialAntiSkidAlerts {
  leftAndRightBody: boolean;
  leftBody: boolean;
  rightBody: boolean;
  wingAndLeftBody: boolean;
  wingAndRightBody: boolean;
  wing: boolean;
}

/**
 * Which partial BRAKES A-SKID FAULT alert the lost gear groups raise. A gear group loses its anti-skid with both
 * channels of its RDC. Only in normal or alternate braking with the A-SKID sw ON: in emergency braking (anti-skid
 * lost on all the landing gears, A-SKID sw OFF) BRAKES A-SKID FAULT ON ALL L/G or BRAKES A-SKID OFF shows instead,
 * and the BCS changes to emergency braking when all three groups are lost.
 * @param inputs the RDC channel faults, the pedal braking mode and the A-SKID sw
 * @returns the alerts
 */
export function partialAntiSkidAlerts(inputs: BrakeControlInputs): PartialAntiSkidAlerts {
  const antiSkidBraking =
    inputs.antiSkidSwitchOn &&
    (inputs.pedalBrakingMode === PEDAL_BRAKING_MODE_NORMAL || inputs.pedalBrakingMode === PEDAL_BRAKING_MODE_ALTERNATE);
  const wing = antiSkidBraking && rdcLost(inputs.rdcChannelFaults, 1);
  const rightBody = antiSkidBraking && rdcLost(inputs.rdcChannelFaults, 2);
  const leftBody = antiSkidBraking && rdcLost(inputs.rdcChannelFaults, 3);
  return {
    leftAndRightBody: !wing && leftBody && rightBody,
    leftBody: !wing && leftBody && !rightBody,
    rightBody: !wing && !leftBody && rightBody,
    wingAndLeftBody: wing && leftBody && !rightBody,
    wingAndRightBody: wing && !leftBody && rightBody,
    wing: wing && !leftBody && !rightBody,
  };
}

/**
 * The lines of BRAKES SYS REDUNDANCY LOST: SYS B REDUNDANCY LOST, SYS A REDUNDANCY LOST ON L BODY, ON R BODY,
 * ON L + R BODY, ON WING. A channel A lost names its gear group, a channel B lost gives the SYS B line. An RDC with
 * both channels lost is a lost gear group (partial A-SKID alert), not a redundancy loss.
 * @param rdcChannelFaults the RDC channel fault bits
 * @returns which lines show; the alert triggers when one shows
 */
export function sysRedundancyLostItems(rdcChannelFaults: number): boolean[] {
  const onlyChannelLost = (rdc: number, channelB: boolean) =>
    rdcChannelFailed(rdcChannelFaults, rdc, channelB) && !rdcChannelFailed(rdcChannelFaults, rdc, !channelB);
  const leftBodyA = onlyChannelLost(3, false);
  const rightBodyA = onlyChannelLost(2, false);
  return [
    [1, 2, 3].some((rdc) => onlyChannelLost(rdc, true)),
    leftBodyA && !rightBodyA,
    rightBodyA && !leftBodyA,
    leftBodyA && rightBodyA,
    onlyChannelLost(1, false),
  ];
}

/**
 * The lines of BRAKES RELEASED: BRK 1/2 ... 15/16 NORM RELEASED, then BRK 1/2 ... 15/16 ALTN RELEASED, then LDG DIST
 * AFFECTED. A released pair shows NORM in normal braking and ALTN in alternate braking.
 * @param releasedPairs the released brake pair bits
 * @param pedalBrakingMode the pedal braking mode
 * @returns which lines show
 */
export function brakesReleasedItems(releasedPairs: number, pedalBrakingMode: number): boolean[] {
  const pairs = Array.from({ length: BRAKE_PAIR_COUNT }, (_, pair) => bitSet(releasedPairs, pair));
  return [
    ...pairs.map((released) => released && pedalBrakingMode === PEDAL_BRAKING_MODE_NORMAL),
    ...pairs.map((released) => released && pedalBrakingMode === PEDAL_BRAKING_MODE_ALTERNATE),
    true,
  ];
}

/**
 * The lines of BRAKES RESIDUAL BRAKING: ON BRK 1/2 ... ON BRK 15/16.
 * @param residualPairs the residual braking pair bits
 * @returns which lines show
 */
export function residualBrakingItems(residualPairs: number): boolean[] {
  return Array.from({ length: BRAKE_PAIR_COUNT }, (_, pair) => bitSet(residualPairs, pair));
}

/**
 * INFO of a partial A-SKID alert: BRK PRESS AUTO LMTD ON the lost gear groups, DELAY BRAKING UNTIL NLG TOUCHDOWN, and
 * with at least one engine running TAXI WITH CARE, NO BRAKED PIVOT TURN, CAT 2 ONLY. The BRK WITH ACCU ONLY lines
 * depend on the LEHGS, which are not modelled.
 * @param brakePressureLimitedInfo the BRK PRESS AUTO LMTD message of the alert
 * @param oneEngineRunning at least one engine is running
 * @returns the INFO message ids
 */
export function partialAntiSkidInfo(brakePressureLimitedInfo: string, oneEngineRunning: boolean): (string | null)[] {
  return [
    brakePressureLimitedInfo,
    '320200003',
    oneEngineRunning ? '800200003' : null,
    oneEngineRunning ? '800200005' : null,
    oneEngineRunning ? '220200017' : null,
  ];
}

/** BRAKES alerts from one BCS, one gear group or one brake pair, and the BCS crew awareness alerts */
export class FwsBrakeControlAlerts {
  /** BRAKES A-SKID FAULT ON L + R BODY L/G (320800002) */
  public readonly aSkidFaultOnLeftAndRightBodyLg = Subject.create(false);
  /** BRAKES A-SKID FAULT ON LEFT BODY L/G (320800003) */
  public readonly aSkidFaultOnLeftBodyLg = Subject.create(false);
  /** BRAKES A-SKID FAULT ON RIGHT BODY L/G (320800004) */
  public readonly aSkidFaultOnRightBodyLg = Subject.create(false);
  /** BRAKES A-SKID FAULT ON WING+L BODY L/Gs (320800005) */
  public readonly aSkidFaultOnWingAndLeftBodyLg = Subject.create(false);
  /** BRAKES A-SKID FAULT ON WING+R BODY L/Gs (320800006) */
  public readonly aSkidFaultOnWingAndRightBodyLg = Subject.create(false);
  /** BRAKES A-SKID FAULT ON WING L/Gs (320800007) */
  public readonly aSkidFaultOnWingLg = Subject.create(false);
  /** BRAKES CTL 1 FAULT (320800015) */
  public readonly ctl1Fault = Subject.create(false);
  /** BRAKES CTL 2 FAULT (320800016) */
  public readonly ctl2Fault = Subject.create(false);
  /** BRAKES ALTN BRK PRESS MONITORING FAULT (320800012) */
  public readonly altnBrkPressMonitoringFault = Subject.create(false);
  /** BRAKES NORM BRK PRESS MONITORING FAULT (320800021) */
  public readonly normBrkPressMonitoringFault = Subject.create(false);
  /** BRAKES MINOR FAULT (320800019) */
  public readonly minorFault = Subject.create(false);
  /** BRAKES RELEASED (320800025) */
  public readonly released = Subject.create(false);
  /** BRAKES RESIDUAL BRAKING (320800026) */
  public readonly residualBraking = Subject.create(false);
  /** BRAKES SEL VLV JAMMED OPEN (320800027) */
  public readonly selVlvJammedOpen = Subject.create(false);
  /** BRAKES SYS REDUNDANCY LOST (320800028) */
  public readonly sysRedundancyLost = Subject.create(false);
  /** BRAKES SYS SAFETY TEST REQUIRED (320800029) */
  public readonly sysSafetyTestRequired = Subject.create(false);

  public releasedItems: boolean[] = brakesReleasedItems(0, 0);
  public residualItems: boolean[] = residualBrakingItems(0);
  public redundancyItems: boolean[] = sysRedundancyLostItems(0);

  /** @param inputs the BCS inputs */
  public update(inputs: BrakeControlInputs): void {
    const partial = partialAntiSkidAlerts(inputs);
    this.aSkidFaultOnLeftAndRightBodyLg.set(partial.leftAndRightBody);
    this.aSkidFaultOnLeftBodyLg.set(partial.leftBody);
    this.aSkidFaultOnRightBodyLg.set(partial.rightBody);
    this.aSkidFaultOnWingAndLeftBodyLg.set(partial.wingAndLeftBody);
    this.aSkidFaultOnWingAndRightBodyLg.set(partial.wingAndRightBody);
    this.aSkidFaultOnWingLg.set(partial.wing);

    this.ctl1Fault.set(inputs.bcs1Fault);
    this.ctl2Fault.set(inputs.bcs2Fault);
    this.altnBrkPressMonitoringFault.set(inputs.altnPressureTransmitterFault);
    this.normBrkPressMonitoringFault.set(inputs.normPressureTransmitterFault);
    this.minorFault.set(inputs.minorFault);
    this.selVlvJammedOpen.set(inputs.selectorValveJammedOpen);
    this.sysSafetyTestRequired.set(inputs.safetyTestOverdue);

    this.releasedItems = brakesReleasedItems(inputs.releasedPairs, inputs.pedalBrakingMode);
    this.released.set(this.releasedItems.slice(0, 2 * BRAKE_PAIR_COUNT).some((shown) => shown));
    this.residualItems = residualBrakingItems(inputs.residualPairs);
    this.residualBraking.set(this.residualItems.some((shown) => shown));
    this.redundancyItems = sysRedundancyLostItems(inputs.rdcChannelFaults);
    this.sysRedundancyLost.set(this.redundancyItems.some((shown) => shown));
  }
}
