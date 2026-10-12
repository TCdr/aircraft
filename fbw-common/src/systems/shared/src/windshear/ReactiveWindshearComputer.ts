// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '../arinc429';
import { ReactiveWindshearDetection } from './ReactiveWindshearDetection';

/**
 * Runs the reactive windshear detection (ReactiveWindshearDetection) of an aircraft in its systems host, on the
 * ADIRS, radio altimeter, landing gear and flaps lever data both aircraft share, and writes the warning to
 * L:A32NX_REACTIVE_WINDSHEAR_WARNING (red WINDSHEAR on the PFDs, AttitudeIndicatorWarnings).
 *
 * Simplification: the computers (A320 FAC 1 and 2, A380 PRIM 1 to 3) are one detection, available while one of them
 * is healthy; each data word is taken from the first ADIRU (1, 2, 3) or radio altimeter that has it valid.
 */
export class ReactiveWindshearComputer {
  private static readonly ADIRU_NUMBERS = [1, 2, 3];

  private static readonly RADIO_ALTIMETER_NUMBERS = [1, 2, 3];

  private readonly detection: ReactiveWindshearDetection;

  private lastSimulationTimeS: number | null = null;

  private lastWarning: boolean | null = null;

  /**
   * @param computerHealthyVars the L:vars of the computers that run the detection (true when healthy)
   * @param minimumWarningDurationS how long the warning stays at least (A320 15 s, A380 0 s)
   */
  constructor(
    private readonly computerHealthyVars: readonly string[],
    minimumWarningDurationS: number,
  ) {
    this.detection = new ReactiveWindshearDetection(minimumWarningDurationS);
  }

  update(): void {
    const simulationTimeS: number = SimVar.GetSimVarValue('E:SIMULATION TIME', 'seconds');
    const deltaTime = this.lastSimulationTimeS === null ? 0 : simulationTimeS - this.lastSimulationTimeS;
    this.lastSimulationTimeS = simulationTimeS;
    // Paused or reloaded: nothing to compute
    if (!(deltaTime > 0) || deltaTime > 1) {
      return;
    }

    this.detection.update({
      deltaTime,
      onGround:
        SimVar.GetSimVarValue('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED', 'bool') > 0 ||
        SimVar.GetSimVarValue('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED', 'bool') > 0,
      computerAvailable: this.computerHealthyVars.some((v) => SimVar.GetSimVarValue(v, 'bool') > 0),
      flapsLeverOutOfZero: SimVar.GetSimVarValue('L:A32NX_FLAPS_HANDLE_INDEX', 'number') >= 1,
      radioAltitudeFt: ReactiveWindshearComputer.radioAltitude(),
      trueAirspeedKt: ReactiveWindshearComputer.adiruValue('L:A32NX_ADIRS_ADR_#_TRUE_AIRSPEED'),
      groundSpeedKt: ReactiveWindshearComputer.adiruValue('L:A32NX_ADIRS_IR_#_GROUND_SPEED'),
      inertialVerticalSpeedFtMin: ReactiveWindshearComputer.adiruValue('L:A32NX_ADIRS_IR_#_VERTICAL_SPEED'),
      pitchDeg: ReactiveWindshearComputer.adiruValue('L:A32NX_ADIRS_IR_#_PITCH'),
      rollDeg: ReactiveWindshearComputer.adiruValue('L:A32NX_ADIRS_IR_#_ROLL'),
      angleOfAttackDeg: ReactiveWindshearComputer.adiruValue('L:A32NX_ADIRS_ADR_#_ANGLE_OF_ATTACK'),
    });

    const warning = this.detection.warning;
    if (warning !== this.lastWarning) {
      SimVar.SetSimVarValue('L:A32NX_REACTIVE_WINDSHEAR_WARNING', 'bool', warning);
      this.lastWarning = warning;
    }
  }

  /** The first valid value of the word over the ADIRUs, # standing for the ADIRU number; null when none is valid */
  private static adiruValue(name: string): number | null {
    for (const adiru of ReactiveWindshearComputer.ADIRU_NUMBERS) {
      const word = Arinc429Word.fromSimVarValue(name.replace('#', adiru.toString()));
      if (word.isNormalOperation()) {
        return word.value;
      }
    }
    return null;
  }

  /**
   * The radio altitude of the first valid radio altimeter. A radio altimeter out of range (no computed data, above
   * 2 500 ft) gives an infinite altitude: the aircraft is above the 1 300 ft detection limit.
   */
  private static radioAltitude(): number | null {
    let outOfRange = false;
    for (const ra of ReactiveWindshearComputer.RADIO_ALTIMETER_NUMBERS) {
      const word = Arinc429Word.fromSimVarValue(`L:A32NX_RA_${ra}_RADIO_ALTITUDE`);
      if (word.isNormalOperation()) {
        return word.value;
      }
      outOfRange = outOfRange || word.isNoComputedData();
    }
    return outOfRange ? Number.POSITIVE_INFINITY : null;
  }
}
