// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  Arinc429Register,
  Arinc429SignStatusMatrix,
  Arinc429WordData,
  FailuresConsumer,
  RegisteredSimVar,
} from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

/*
 * The Weight and Balance Backup Computer (WBBC):
 * - Two WBBCs compute the GW and CG from aerodynamic data and the flight control surface positions.
 * - They start computing after the slats and flaps retract.
 * - Their GW and CG are used when both FQMS are failed, for the excessive aft CG warning (FUEL EXCESS AFT CG), and to
 *   detect a disagreement with the FQMS GW and CG (FUEL WEIGHT DATA DISAGREE, FUEL CG DATA DISAGREE).
 * - Without the inputs for the aerodynamic GW, or after slats/flaps extension, the GW comes from the fuel used and the
 *   takeoff GW (the WBBC GW at slats/flaps retraction); the CG is unavailable after slats/flaps extension.
 *
 * Design choices:
 * - The aerodynamic computation (altitude, Mach, angle of attack, elevator and THS positions) is the
 *   simulator's own weight and CG (A:TOTAL WEIGHT, L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC): the values that the
 *   aerodynamic data of the simulated aircraft reflect. They do not depend on the ZFW and ZFWCG entered in the FMS,
 *   unlike the FQMS values, so a wrong FMS entry shows as a WBBC disagreement.
 * - "No necessary input" is the SFCC slat/flap position not valid: then the GW comes from the fuel used.
 * - The WBBC stops computing on ground, and starts again at the next slats and flaps retraction in flight.
 * - Both WBBCs give the same values: one model, one output.
 */

/** What the WBBC reads on one update */
export interface WbbcInputs {
  onGround: boolean;
  /** The slats and flaps are retracted, null when the SFCC position is not valid */
  slatsAndFlapsRetracted: boolean | null;
  /** The gross weight from the aerodynamic data, in kg */
  aerodynamicGrossWeightKg: number;
  /** The CG from the aerodynamic data, in % MAC */
  aerodynamicCgPercentMac: number;
  /** The fuel used by the engines, in kg */
  fuelUsedKg: number;
}

/** What the WBBC computes: null when not computed */
export interface WbbcOutputs {
  grossWeightKg: number | null;
  cgPercentMac: number | null;
}

/** The WBBC gross weight and CG computation */
export class WeightBalanceBackupComputer {
  /** The GW at the first slats/flaps retraction in flight (the takeoff GW), and the fuel used then */
  private takeoffGrossWeightKg: number | null = null;

  private fuelUsedAtTakeoffKg = 0;

  /** @param inputs what the WBBC reads */
  public update(inputs: WbbcInputs): WbbcOutputs {
    if (inputs.onGround) {
      this.takeoffGrossWeightKg = null;
      return { grossWeightKg: null, cgPercentMac: null };
    }
    if (inputs.slatsAndFlapsRetracted === true) {
      if (this.takeoffGrossWeightKg === null) {
        this.takeoffGrossWeightKg = inputs.aerodynamicGrossWeightKg;
        this.fuelUsedAtTakeoffKg = inputs.fuelUsedKg;
      }
      return { grossWeightKg: inputs.aerodynamicGrossWeightKg, cgPercentMac: inputs.aerodynamicCgPercentMac };
    }
    if (this.takeoffGrossWeightKg === null) {
      return { grossWeightKg: null, cgPercentMac: null };
    }
    return {
      grossWeightKg: this.takeoffGrossWeightKg - (inputs.fuelUsedKg - this.fuelUsedAtTakeoffKg),
      cgPercentMac: null,
    };
  }
}

/** The WBBC outputs: ARINC 429 words, no computed data while not computed */
const WBBC_GROSS_WEIGHT_VAR = 'L:A380X_WBBC_GROSS_WEIGHT';
const WBBC_CG_VAR = 'L:A380X_WBBC_CENTER_OF_GRAVITY_MAC';

/**
 * Whether the slats and flaps are retracted, from an SFCC slat/flap actual position word (docs/a380-simvars.md
 * A32NX_SFCC_{number}_SLAT_FLAP_ACTUAL_POSITION_WORD: bit 11 slat data valid, 12 slats retracted, 18 flap data valid,
 * 19 flaps retracted); null when the word or its slat or flap data is not valid.
 */
export function slatsAndFlapsRetractedFromSfcc(word: Arinc429WordData): boolean | null {
  if (!word.isNormalOperation() || !word.bitValueOr(11, false) || !word.bitValueOr(18, false)) {
    return null;
  }
  return word.bitValueOr(12, false) && word.bitValueOr(19, false);
}

/**
 * The SSM of the WBBC outputs: failure warning when both WBBCs are failed (FUEL WEIGHT & BALANCE BKUP FAULT), no
 * computed data while not computing
 * @param wbbc1Failed WBBC 1 is failed
 * @param wbbc2Failed WBBC 2 is failed
 * @param value the computed value, null when not computed
 */
export function wbbcOutputSsm(
  wbbc1Failed: boolean,
  wbbc2Failed: boolean,
  value: number | null,
): Arinc429SignStatusMatrix {
  if (wbbc1Failed && wbbc2Failed) {
    return Arinc429SignStatusMatrix.FailureWarning;
  }
  return value === null ? Arinc429SignStatusMatrix.NoComputedData : Arinc429SignStatusMatrix.NormalOperation;
}

/** Writes the WBBC gross weight and CG */
export class WeightBalanceBackup implements Instrument {
  private readonly computer = new WeightBalanceBackupComputer();

  private readonly output = Arinc429Register.empty();

  private readonly sfcc1Word = RegisteredSimVar.create(
    'L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD',
    SimVarValueType.Number,
  );

  private readonly sfcc2Word = RegisteredSimVar.create(
    'L:A32NX_SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD',
    SimVarValueType.Number,
  );

  private readonly sfccWord = Arinc429Register.empty();

  private readonly fuelUsedKg = [1, 2, 3, 4].map((engine) =>
    RegisteredSimVar.create(`L:A32NX_FUEL_USED:${engine}`, SimVarValueType.Number),
  );

  private readonly onGround = RegisteredSimVar.createBoolean('SIM ON GROUND');

  private readonly aerodynamicGrossWeightKg = RegisteredSimVar.create('TOTAL WEIGHT', SimVarValueType.Kilograms);

  private readonly aerodynamicCgPercentMac = RegisteredSimVar.create(
    'L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC',
    SimVarValueType.Number,
  );

  private lastGrossWeightWord: number | null = null;

  private lastCgWord: number | null = null;

  private readonly grossWeightOutput = RegisteredSimVar.create(WBBC_GROSS_WEIGHT_VAR, SimVarValueType.String);

  private readonly cgOutput = RegisteredSimVar.create(WBBC_CG_VAR, SimVarValueType.String);

  constructor(private readonly failures: Pick<FailuresConsumer, 'isActive'>) {}

  public init(): void {
    // nothing to initialise: the WBBC starts at the slats and flaps retraction
  }

  public onUpdate(): void {
    const slatsAndFlapsRetracted =
      slatsAndFlapsRetractedFromSfcc(this.sfccWord.set(this.sfcc1Word.get())) ??
      slatsAndFlapsRetractedFromSfcc(this.sfccWord.set(this.sfcc2Word.get()));
    let fuelUsedKg = 0;
    for (const engineFuelUsedKg of this.fuelUsedKg) {
      fuelUsedKg += engineFuelUsedKg.get();
    }
    const outputs = this.computer.update({
      onGround: this.onGround.get(),
      slatsAndFlapsRetracted,
      aerodynamicGrossWeightKg: this.aerodynamicGrossWeightKg.get(),
      aerodynamicCgPercentMac: this.aerodynamicCgPercentMac.get(),
      fuelUsedKg,
    });
    this.lastGrossWeightWord = this.write(this.grossWeightOutput, this.lastGrossWeightWord, outputs.grossWeightKg);
    this.lastCgWord = this.write(this.cgOutput, this.lastCgWord, outputs.cgPercentMac);
  }

  /**
   * Writes the output as an ARINC 429 word in a string L:var (a number cannot hold the SSM bits), only when it changed
   * @returns the raw word written, to compare with at the next update
   */
  private write(output: RegisteredSimVar<string>, lastRawWord: number | null, value: number | null): number {
    const ssm = wbbcOutputSsm(
      this.failures.isActive(A380Failure.Wbbc1),
      this.failures.isActive(A380Failure.Wbbc2),
      value,
    );
    this.output.setValue(ssm === Arinc429SignStatusMatrix.NormalOperation ? value ?? 0 : 0);
    this.output.setSsm(ssm);
    if (this.output.rawWord !== lastRawWord) {
      output.set(this.output.rawWord.toString());
    }
    return this.output.rawWord;
  }
}
