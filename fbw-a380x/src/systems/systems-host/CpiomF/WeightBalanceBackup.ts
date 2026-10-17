// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';

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
export function slatsAndFlapsRetractedFromSfcc(word: Arinc429Word): boolean | null {
  if (!word.isNormalOperation() || !word.bitValueOr(11, false) || !word.bitValueOr(18, false)) {
    return null;
  }
  return word.bitValueOr(12, false) && word.bitValueOr(19, false);
}

/** Writes the WBBC gross weight and CG */
export class WeightBalanceBackup implements Instrument {
  private readonly computer = new WeightBalanceBackupComputer();

  private readonly output = Arinc429Register.empty();

  public init(): void {
    // nothing to initialise: the WBBC starts at the slats and flaps retraction
  }

  public onUpdate(): void {
    const sfcc1 = Arinc429Word.fromSimVarValue('L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD');
    const sfcc2 = Arinc429Word.fromSimVarValue('L:A32NX_SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD');
    let fuelUsedKg = 0;
    for (let engine = 1; engine <= 4; engine++) {
      fuelUsedKg += SimVar.GetSimVarValue(`L:A32NX_FUEL_USED:${engine}`, SimVarValueType.Number);
    }
    const outputs = this.computer.update({
      onGround: SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0,
      slatsAndFlapsRetracted: slatsAndFlapsRetractedFromSfcc(sfcc1) ?? slatsAndFlapsRetractedFromSfcc(sfcc2),
      aerodynamicGrossWeightKg: SimVar.GetSimVarValue('TOTAL WEIGHT', 'kilogram'),
      aerodynamicCgPercentMac: SimVar.GetSimVarValue('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', SimVarValueType.Number),
      fuelUsedKg,
    });
    this.write(WBBC_GROSS_WEIGHT_VAR, outputs.grossWeightKg);
    this.write(WBBC_CG_VAR, outputs.cgPercentMac);
  }

  private write(name: string, value: number | null): void {
    this.output.setValue(value ?? 0);
    this.output.setSsm(
      value === null ? Arinc429SignStatusMatrix.NoComputedData : Arinc429SignStatusMatrix.NormalOperation,
    );
    this.output.writeToSimVar(name);
  }
}
