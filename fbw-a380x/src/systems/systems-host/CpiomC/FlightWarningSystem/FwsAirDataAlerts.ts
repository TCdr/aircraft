// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';

/**
 * Trigger and display logic of NAV AIR DATA DISAGREE, NAV ALL AIR DATA DISAGREE and NAV AOA DISAGREE.
 *
 * The PRIMs compare the air data of the ADRs and of the standby instruments and reject a diverging source. The comparison
 * runs in systems.wasm (a380_systems air_data_monitoring.rs), which writes the L:vars read here:
 * - A32NX_PRIM_ADR_1(2)(3)_REJECTED and A32NX_PRIM_STBY_AIR_DATA_REJECTED: one source rejected;
 * - A32NX_PRIM_ALL_AIR_DATA_REJECTED: the PRIMs could not tell which source is wrong, all are rejected;
 * - A32NX_PRIM_AOA_1(2)(3)_REJECTED: one angle of attack rejected.
 */

/** Below FL 250 the ALL AIR DATA DISAGREE procedure switches the ADRs off and flies the green */
const ALL_AIR_DATA_FL250_FT = 25_000;
/** The pitch targets change at 10 000 ft and 25 000 ft */
const ALL_AIR_DATA_10000_FT = 10_000;
/** Thrust lever angle of the CL detent: a lever above it means the thrust is not yet reduced (A380 detents CL 25 deg) */
const CLIMB_DETENT_TLA_DEG = 25;
/** Indexes of the sensed action lines of NAV ALL AIR DATA DISAGREE (ata34.ts 340800010) */
export const ALL_AIR_DATA_ITEM_SPEED_BRAKES = 8;
export const ALL_AIR_DATA_ITEM_ADR_PBS_OFF = 16;

export interface AirDataAlertInputs {
  adrRejected: [boolean, boolean, boolean];
  stbyRejected: boolean;
  allRejected: boolean;
  aoaRejected: [boolean, boolean, boolean];
  /**
   * The altitude for the conditions of the ALL AIR DATA DISAGREE procedure, in feet, null if none. Design choice: the GPS
   * altitude (the alternate altitude source of the procedure), else the first valid ADR pressure altitude.
   */
  altitudeFt: number | null;
  /** Before thrust reduction: one thrust lever above the CL detent */
  thrustLeverAboveClimb: boolean;
  adrPbOn: [boolean, boolean, boolean];
}

/** Reads the inputs from the simulator variables (`read(name, unit)` is SimVar.GetSimVarValue) */
export function readAirDataAlertInputs(read: (name: string, unit: string) => number): AirDataAlertInputs {
  const bool = (name: string) => read(name, 'number') > 0;
  let altitudeFt: number | null = null;
  for (const name of [
    'L:A32NX_GPS_1_ALTITUDE',
    'L:A32NX_GPS_2_ALTITUDE',
    'L:A32NX_ADIRS_ADR_1_ALTITUDE',
    'L:A32NX_ADIRS_ADR_2_ALTITUDE',
    'L:A32NX_ADIRS_ADR_3_ALTITUDE',
  ]) {
    const word = new Arinc429Word(read(name, 'number'));
    if (word.isNormalOperation()) {
      altitudeFt = word.value;
      break;
    }
  }
  let thrustLeverAboveClimb = false;
  for (let engine = 1; engine <= 4; engine++) {
    thrustLeverAboveClimb ||= read(`L:A32NX_AUTOTHRUST_TLA:${engine}`, 'number') > CLIMB_DETENT_TLA_DEG;
  }
  return {
    adrRejected: [
      bool('L:A32NX_PRIM_ADR_1_REJECTED'),
      bool('L:A32NX_PRIM_ADR_2_REJECTED'),
      bool('L:A32NX_PRIM_ADR_3_REJECTED'),
    ],
    stbyRejected: bool('L:A32NX_PRIM_STBY_AIR_DATA_REJECTED'),
    allRejected: bool('L:A32NX_PRIM_ALL_AIR_DATA_REJECTED'),
    aoaRejected: [
      bool('L:A32NX_PRIM_AOA_1_REJECTED'),
      bool('L:A32NX_PRIM_AOA_2_REJECTED'),
      bool('L:A32NX_PRIM_AOA_3_REJECTED'),
    ],
    altitudeFt,
    thrustLeverAboveClimb,
    adrPbOn: [
      bool('L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON'),
      bool('L:A32NX_OVHD_ADIRS_ADR_2_PB_IS_ON'),
      bool('L:A32NX_OVHD_ADIRS_ADR_3_PB_IS_ON'),
    ],
  };
}

export class FwsAirDataAlerts {
  /** NAV AIR DATA DISAGREE: one or two sources rejected */
  public readonly airDataDisagree = Subject.create(false);

  /** NAV ALL AIR DATA DISAGREE: all air data rejected by the PRIMs */
  public readonly allAirDataDisagree = Subject.create(false);

  /** NAV AOA DISAGREE: two or more AOAs rejected by the PRIMs. One rejected AOA alone gives no NAV alert. */
  public readonly aoaDisagree = Subject.create(false);

  private inputs: AirDataAlertInputs = {
    adrRejected: [false, false, false],
    stbyRejected: false,
    allRejected: false,
    aoaRejected: [false, false, false],
    altitudeFt: null,
    thrustLeverAboveClimb: false,
    adrPbOn: [true, true, true],
  };

  public update(inputs: AirDataAlertInputs): void {
    this.inputs = inputs;
    this.allAirDataDisagree.set(inputs.allRejected);
    this.airDataDisagree.set(!inputs.allRejected && this.rejectedSourceCount() > 0);
    this.aoaDisagree.set(inputs.aoaRejected.filter((rejected) => rejected).length >= 2);
  }

  private rejectedSourceCount(): number {
    return this.inputs.adrRejected.filter((rejected) => rejected).length + (this.inputs.stbyRejected ? 1 : 0);
  }

  /** Two rejected air data sources add RISK OF UNDUE OVERSPEED WARNING (STATUS INFO) */
  public twoSourcesRejected(): boolean {
    return this.rejectedSourceCount() >= 2;
  }

  private belowFl250(): boolean {
    // Without any altitude, the procedure for below FL 250 (design choice: the safer one, with the backup speed scale)
    return this.inputs.altitudeFt === null || this.inputs.altitudeFt < ALL_AIR_DATA_FL250_FT;
  }

  public allAdrsOff(): boolean {
    return this.inputs.adrPbOn.every((on) => !on);
  }

  /**
   * NAV AIR DATA DISAGREE lines (ata34.ts 340800009): ADR 1, ADR 2, ADR 3, STBY INSTRUMENTS REJECTED BY PRIMs, RISK OF
   * UNDUE OVERSPEED WARNING, AIR DATA XCHECK, AIR DATA SWTG AS RQRD.
   */
  public airDataDisagreeItemsToShow(): boolean[] {
    const [adr1, adr2, adr3] = this.inputs.adrRejected;
    return [adr1, adr2, adr3, this.inputs.stbyRejected, this.twoSourcesRejected(), true, adr1 || adr2 || adr3];
  }

  /**
   * NAV ALL AIR DATA DISAGREE lines (ata34.ts 340800010); the ECAM shows only the pitch target of the current altitude
   * and thrust state.
   */
  public allAirDataDisagreeItemsToShow(): boolean[] {
    const altitude = this.inputs.altitudeFt ?? 0;
    const beforeThrustReduction = this.inputs.thrustLeverAboveClimb;
    const below10000 = altitude < ALL_AIR_DATA_10000_FT;
    const above25000 = altitude >= ALL_AIR_DATA_FL250_FT;
    const belowFl250 = this.belowFl250();
    return [
      true, // ALL AIR DATA REJECTED BY PRIMs
      true, // IF SAFE CONDUCT OF FLIGHT IMPACTED
      beforeThrustReduction, // ALL THR LEVERS TOGA
      !beforeThrustReduction, // ALL THR LEVERS CLB
      below10000, // PITCH ATT TRGT 12.5°
      !below10000 && (beforeThrustReduction || !above25000), // PITCH ATT TRGT 10°
      !beforeThrustReduction && above25000, // PITCH ATT TRGT 5°
      belowFl250, // FLAPS & L/G : MAINTAIN CURRENT CONF
      true, // SPEED BRAKES CHECK RETRACTED
      true, // RISK OF UNDUE OVERSPEED WARNING
      true, // HUD : DO NOT USE
      true, // FMS POSITION / GPS PAGE SELECT
      true, // AIR DATA (ADRs/STBY INSTR) XCHECK
      true, // IF AT LEAST ONE AIR DATA RELIABLE
      true, // RELIABLE AIR DATA USE
      true, // IF NO AIR DATA RELIABLE
      belowFl250, // ADR 1+2+3 P/Bs OFF
      belowFl250, // SPEED FLY THE GREEN
      belowFl250, // SPD BRK : DO NOT USE
      !belowFl250, // FLY PITCH AND THRUST
    ];
  }

  public allAirDataDisagreeItemsChecked(speedBrakeExtended: boolean): boolean[] {
    const checked = this.allAirDataDisagreeItemsToShow().map(() => false);
    checked[ALL_AIR_DATA_ITEM_SPEED_BRAKES] = !speedBrakeExtended;
    checked[ALL_AIR_DATA_ITEM_ADR_PBS_OFF] = this.allAdrsOff();
    return checked;
  }

  /** STATUS of NAV ALL AIR DATA DISAGREE; CAB PRESS AUTO CTL and TAWS 1+2 are not listed (no key) */
  public allAirDataDisagreeInopSysAllPhases(): string[] {
    const allOff = this.allAdrsOff();
    return [
      '290100008', // F/CTL PROT
      '340300014', // LOAD ALLEVIATION
      '220300007', // AP 1+2
      '220300001', // A/THR
      '220300024', // FD 1+2
      allOff ? '340300010' : '', // ADR 1+2+3
      allOff ? '340300029' : '', // TCAS 1+2
    ];
  }

  public allAirDataDisagreeInfo(): string[] {
    return [
      '340200004', // DIRECT LAW : PROT LOST
      '220200015', // RISK OF UNDUE OVERSPEED WARNING
      this.belowFl250() ? '340200007' : '', // CABIN ALT TRGT: SEE FCOM
    ];
  }

  /** LIMITATIONS of NAV ALL AIR DATA DISAGREE, on the ECAM and the PFD, ALL PHASES; AVOID ICING CONDs (MFP heating
   * failed) is not modelled */
  public allAirDataDisagreeLimitations(): string[] {
    const allOff = this.allAdrsOff();
    return [
      '240400002', // MAX SPEED: 310/.86
      allOff ? '240400003' : '', // SPD BRK: DO NOT USE
      allOff ? '240400004' : '', // MANEUVER WITH CARE
    ];
  }
}
