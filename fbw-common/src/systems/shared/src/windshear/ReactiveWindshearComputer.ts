// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register } from '../arinc429';
import { RegisteredSimVar } from '../SimVarUtils';
import { ReactiveWindshearDetection } from './ReactiveWindshearDetection';

/**
 * Whether the reactive windshear detection can run: at least one of its computers healthy and the function not failed.
 * @param computersHealthy whether each computer that runs the detection is healthy
 * @param detectionFailed whether the detection function itself is failed (A380 flyPad failure)
 * @returns whether the detection is available
 */
export function isReactiveWindshearDetectionAvailable(
  computersHealthy: readonly boolean[],
  detectionFailed: boolean,
): boolean {
  return !detectionFailed && computersHealthy.some((healthy) => healthy);
}

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

  private readonly simulationTime = RegisteredSimVar.create('E:SIMULATION TIME', SimVarValueType.Seconds);

  private readonly leftGearCompressed = RegisteredSimVar.createBoolean('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED');

  private readonly rightGearCompressed = RegisteredSimVar.createBoolean('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED');

  private readonly flapsHandleIndex = RegisteredSimVar.create('L:A32NX_FLAPS_HANDLE_INDEX', SimVarValueType.Number);

  private readonly computerHealthyHandles: RegisteredSimVar<boolean>[];

  /** Filled in place every update, to avoid an array per update */
  private readonly computersHealthy: boolean[];

  private readonly trueAirspeedWords = ReactiveWindshearComputer.adiruHandles('L:A32NX_ADIRS_ADR_#_TRUE_AIRSPEED');

  private readonly groundSpeedWords = ReactiveWindshearComputer.adiruHandles('L:A32NX_ADIRS_IR_#_GROUND_SPEED');

  private readonly verticalSpeedWords = ReactiveWindshearComputer.adiruHandles('L:A32NX_ADIRS_IR_#_VERTICAL_SPEED');

  private readonly pitchWords = ReactiveWindshearComputer.adiruHandles('L:A32NX_ADIRS_IR_#_PITCH');

  private readonly rollWords = ReactiveWindshearComputer.adiruHandles('L:A32NX_ADIRS_IR_#_ROLL');

  private readonly angleOfAttackWords = ReactiveWindshearComputer.adiruHandles('L:A32NX_ADIRS_ADR_#_ANGLE_OF_ATTACK');

  private readonly radioAltitudeWords = ReactiveWindshearComputer.RADIO_ALTIMETER_NUMBERS.map((ra) =>
    RegisteredSimVar.create(`L:A32NX_RA_${ra}_RADIO_ALTITUDE`, SimVarValueType.Number),
  );

  private readonly word = Arinc429Register.empty();

  /**
   * @param computerHealthyVars the L:vars of the computers that run the detection (true when healthy)
   * @param minimumWarningDurationS how long the warning stays at least (A320 15 s, A380 0 s)
   * @param isDetectionFailed whether the detection function itself is failed
   */
  constructor(
    computerHealthyVars: readonly string[],
    minimumWarningDurationS: number,
    private readonly isDetectionFailed: () => boolean = () => false,
  ) {
    this.detection = new ReactiveWindshearDetection(minimumWarningDurationS);
    this.computerHealthyHandles = computerHealthyVars.map((name) => RegisteredSimVar.createBoolean(name));
    this.computersHealthy = computerHealthyVars.map(() => false);
  }

  update(): void {
    const simulationTimeS = this.simulationTime.get();
    const deltaTime = this.lastSimulationTimeS === null ? 0 : simulationTimeS - this.lastSimulationTimeS;
    this.lastSimulationTimeS = simulationTimeS;
    // Paused or reloaded: nothing to compute
    if (!(deltaTime > 0) || deltaTime > 1) {
      return;
    }

    this.detection.update({
      deltaTime,
      onGround: this.leftGearCompressed.get() || this.rightGearCompressed.get(),
      computerAvailable: isReactiveWindshearDetectionAvailable(this.readComputersHealthy(), this.isDetectionFailed()),
      flapsLeverOutOfZero: this.flapsHandleIndex.get() >= 1,
      radioAltitudeFt: this.radioAltitude(),
      trueAirspeedKt: this.adiruValue(this.trueAirspeedWords),
      groundSpeedKt: this.adiruValue(this.groundSpeedWords),
      inertialVerticalSpeedFtMin: this.adiruValue(this.verticalSpeedWords),
      pitchDeg: this.adiruValue(this.pitchWords),
      rollDeg: this.adiruValue(this.rollWords),
      angleOfAttackDeg: this.adiruValue(this.angleOfAttackWords),
    });

    const warning = this.detection.warning;
    if (warning !== this.lastWarning) {
      SimVar.SetSimVarValue('L:A32NX_REACTIVE_WINDSHEAR_WARNING', 'bool', warning);
      this.lastWarning = warning;
    }
  }

  /** The registered simvar of a word for each ADIRU, # standing for the ADIRU number in the name */
  private static adiruHandles(name: string): RegisteredSimVar<number>[] {
    return ReactiveWindshearComputer.ADIRU_NUMBERS.map((adiru) =>
      RegisteredSimVar.create(name.replace('#', adiru.toString()), SimVarValueType.Number),
    );
  }

  private readComputersHealthy(): readonly boolean[] {
    for (let index = 0; index < this.computerHealthyHandles.length; index++) {
      this.computersHealthy[index] = this.computerHealthyHandles[index].get();
    }
    return this.computersHealthy;
  }

  /** The value of the first ADIRU word that is valid; null when none is */
  private adiruValue(adiruWords: readonly RegisteredSimVar<number>[]): number | null {
    for (const adiruWord of adiruWords) {
      const word = this.word.set(adiruWord.get());
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
  private radioAltitude(): number | null {
    let outOfRange = false;
    for (const radioAltitudeWord of this.radioAltitudeWords) {
      const word = this.word.set(radioAltitudeWord.get());
      if (word.isNormalOperation()) {
        return word.value;
      }
      outOfRange = outOfRange || word.isNoComputedData();
    }
    return outOfRange ? Number.POSITIVE_INFINITY : null;
  }
}
