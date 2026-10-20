// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument, Subject } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';

/*
 * Side 1 / side 2 discrepancy messages of the EFIS:
 * - both PFDs show CHECK ATT when the pitch or the roll of the two sides differ by 5 degrees or more
 * - both PFDs and NDs show CHECK HDG when the headings of the two sides differ by 5 degrees or more
 * The ECAM cautions NAV ATT DISCREPANCY / NAV HDG DISCREPANCY are FWC alerts, not part of this file.
 * CHECK ALT is already sent by the FWC (FWC discrete word 124 bits 24/25, AltitudeIndicatorOfftape).
 */

const CHECK_ATT_THRESHOLD_DEGREES = 5;
const CHECK_HDG_THRESHOLD_DEGREES = 5;

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
 * CHECK ATT (amber) on both PFDs. A value that is not valid on one side is not compared: that side
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
 * CHECK HDG (amber) on both PFDs and NDs. A heading that is not valid on one side is not compared.
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
 * The ADIRU whose data an EFIS side displays, by the ATT HDG or AIR DATA switching selector (0 CAPT 3, 1 NORM, 2 F/O 3):
 * 1 for the CAPT side, 2 for the F/O side, 3 when it is switched to that side. The same as getSupplier of
 * AdirsValueProvider, in a .ts file so that the systems host (built without JSX) can use it too.
 * @param side the EFIS side
 * @param switchingSelector the position of the switching selector
 * @returns the ADIRU number
 */
export function efisSideAdiru(side: 'L' | 'R', switchingSelector: number): 1 | 2 | 3 {
  const adiru3ToCaptain = 0;
  const adiru3ToFo = 2;
  if (side === 'L') {
    return switchingSelector === adiru3ToCaptain ? 3 : 1;
  }
  return switchingSelector === adiru3ToFo ? 3 : 2;
}

/**
 * Reads one ARINC value: its value when normal operation, null otherwise (the display shows its flag instead).
 * @param name the L:var of the word
 * @returns the value or null
 */
export function readNormalOperationValue(name: string): number | null {
  const word = Arinc429Word.fromSimVarValue(name);
  return word.isNormalOperation() ? word.value : null;
}

/**
 * Reads the attitude and heading an EFIS side displays: the IR selected for that side by the ATT HDG switching
 * selector (IR 1 for the CAPT side, IR 2 for the F/O side, IR 3 when it is switched to that side).
 * @param side the EFIS side
 * @returns the displayed values
 */
export function readEfisSideAttitudeHeading(side: 'L' | 'R'): EfisSideAttitudeHeading {
  const ir = efisSideAdiru(side, SimVar.GetSimVarValue('L:A32NX_ATT_HDG_SWITCHING_KNOB', 'Enum'));
  return {
    pitchDegrees: readNormalOperationValue(`L:A32NX_ADIRS_IR_${ir}_PITCH`),
    rollDegrees: readNormalOperationValue(`L:A32NX_ADIRS_IR_${ir}_ROLL`),
    headingDegrees: readNormalOperationValue(`L:A32NX_ADIRS_IR_${ir}_HEADING`),
  };
}

export interface EfisSideDiscrepancyEvents {
  /** CHECK ATT is displayed on this side */
  efis_check_attitude: boolean;
  /** CHECK HDG is displayed on this side */
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
