// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument, Subject } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';

import { getSupplier } from './AdirsValueProvider';

/*
 * Side 1 / side 2 discrepancy messages of the EFIS (A320 FCOM DSC-31-05-60 SIDE1/SIDE2 DISCREPANCY MESSAGES,
 * a320_fcom.txt l.45405-45422):
 * - l.45410-45411: both PFDs display "CHECK ATT" if there is a discrepancy of at least 5 degrees between the attitude
 *   values, pitch and/or roll
 * - l.45417-45418: both PFDs and NDs display "CHECK HDG" if there is a discrepancy of at least 5 degrees between the
 *   heading values
 * The ECAM cautions NAV ATT DISCREPANCY / NAV HDG DISCREPANCY (l.92881, l.93215) are FWC alerts, not part of this file.
 * CHECK ALT is already sent by the FWC (FWC discrete word 124 bits 24/25, AltitudeIndicatorOfftape).
 */

/** l.45410: "a discrepancy of at least 5 degrees between the attitude values, pitch and/or roll" */
export const CHECK_ATT_THRESHOLD_DEGREES = 5;
/** l.45417: "a discrepancy of at least 5 degrees between the heading values" */
export const CHECK_HDG_THRESHOLD_DEGREES = 5;

/** The attitude and heading one EFIS side displays, null when the value is not valid (its flag is shown instead) */
export interface EfisSideAttitudeHeading {
  pitchDegrees: number | null;
  rollDegrees: number | null;
  headingDegrees: number | null;
}

/**
 * The smallest angle between two headings, so 359 and 1 degrees are 2 degrees apart.
 * @param a a heading in degrees
 * @param b a heading in degrees
 * @returns the difference, 0 to 180 degrees
 */
export function headingDifferenceDegrees(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/**
 * CHECK ATT (amber) on both PFDs, l.45410-45411. A value that is not valid on one side is not compared: that side
 * shows its ATT flag instead.
 * @param own the attitude displayed on this side
 * @param opposite the attitude displayed on the other side
 * @returns whether CHECK ATT is displayed
 */
export function isCheckAttitudeShown(own: EfisSideAttitudeHeading, opposite: EfisSideAttitudeHeading): boolean {
  const pitchDisagrees =
    own.pitchDegrees !== null &&
    opposite.pitchDegrees !== null &&
    Math.abs(own.pitchDegrees - opposite.pitchDegrees) >= CHECK_ATT_THRESHOLD_DEGREES;
  const rollDisagrees =
    own.rollDegrees !== null &&
    opposite.rollDegrees !== null &&
    Math.abs(own.rollDegrees - opposite.rollDegrees) >= CHECK_ATT_THRESHOLD_DEGREES;
  return pitchDisagrees || rollDisagrees;
}

/**
 * CHECK HDG (amber) on both PFDs and NDs, l.45417-45418. A heading that is not valid on one side is not compared.
 * @param own the heading displayed on this side
 * @param opposite the heading displayed on the other side
 * @returns whether CHECK HDG is displayed
 */
export function isCheckHeadingShown(own: EfisSideAttitudeHeading, opposite: EfisSideAttitudeHeading): boolean {
  return (
    own.headingDegrees !== null &&
    opposite.headingDegrees !== null &&
    headingDifferenceDegrees(own.headingDegrees, opposite.headingDegrees) >= CHECK_HDG_THRESHOLD_DEGREES
  );
}

/**
 * Reads one ARINC IR value: its value when normal operation, null otherwise.
 * @param name the L:var of the IR word
 * @returns the value or null
 */
function readIrValue(name: string): number | null {
  const word = Arinc429Word.fromSimVarValue(name);
  return word.isNormalOperation() ? word.value : null;
}

/**
 * Reads the attitude and heading an EFIS side displays: the IR selected for that side by the ATT HDG switching
 * selector (IR 1 for the CAPT side, IR 2 for the F/O side, IR 3 when it is switched to that side).
 * @param side the EFIS side
 * @returns the displayed values
 */
function readEfisSideAttitudeHeading(side: 'L' | 'R'): EfisSideAttitudeHeading {
  const ir = getSupplier(side, SimVar.GetSimVarValue('L:A32NX_ATT_HDG_SWITCHING_KNOB', 'Enum'));
  return {
    pitchDegrees: readIrValue(`L:A32NX_ADIRS_IR_${ir}_PITCH`),
    rollDegrees: readIrValue(`L:A32NX_ADIRS_IR_${ir}_ROLL`),
    headingDegrees: readIrValue(`L:A32NX_ADIRS_IR_${ir}_HEADING`),
  };
}

/** The bus events of the EfisSideDiscrepancyMonitor */
export interface EfisSideDiscrepancyEvents {
  /** CHECK ATT is displayed on this side (l.45410) */
  efis_check_attitude: boolean;
  /** CHECK HDG is displayed on this side (l.45417) */
  efis_check_heading: boolean;
}

/**
 * Compares the attitude and heading of this EFIS side with the other side, like the DMCs do with their cross-talk,
 * and publishes the CHECK ATT and CHECK HDG messages. Used by the A32NX PFD and ND.
 */
export class EfisSideDiscrepancyMonitor implements Instrument {
  private readonly publisher = this.bus.getPublisher<EfisSideDiscrepancyEvents>();

  private readonly checkAttitude = Subject.create(false);

  private readonly checkHeading = Subject.create(false);

  /**
   * @param bus the instrument event bus
   * @param side the EFIS side of the instrument
   */
  constructor(
    private readonly bus: EventBus,
    private readonly side: 'L' | 'R',
  ) {}

  /** @inheritdoc */
  public init(): void {
    this.checkAttitude.sub((shown) => this.publisher.pub('efis_check_attitude', shown, false, true), true);
    this.checkHeading.sub((shown) => this.publisher.pub('efis_check_heading', shown, false, true), true);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const own = readEfisSideAttitudeHeading(this.side);
    const opposite = readEfisSideAttitudeHeading(this.side === 'L' ? 'R' : 'L');

    this.checkAttitude.set(isCheckAttitudeShown(own, opposite));
    this.checkHeading.set(isCheckHeadingShown(own, opposite));
  }
}
