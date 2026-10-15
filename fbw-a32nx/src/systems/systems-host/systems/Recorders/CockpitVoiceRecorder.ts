// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';

/**
 * The CVR power logic and the CVR TEST of the A320 (FCOM DSC-23-10-40 COCKPIT VOICE RECORDER).
 *
 * a320_fcom.txt l.35299-35306: "It is energized automatically : - on the ground during the first 5 min after the
 * aircraft electrical network is energized - on the ground with one engine running - in flight. On the ground, it is
 * stopped automatically 5 min after the last engine shutdown provided the CVR jack is not used. On the ground, the crew
 * can energize the CVR manually by pressing the GND CTL pb-sw."
 *
 * a320_fcom.txt l.35338-35342, CVR TEST pb: "When pressed and held: This activates the test, if the CVR is on (the GND
 * CTL pb-sw pressed, or during the first 5 min after energization of the aircraft electrical network), and the parking
 * brake is on." The SOP (l.98935-98943) also asks for the PARK BRK on before the test.
 *
 * The CVR jack is not simulated (its headset button is INOP), so the CVR stops 5 min after the last engine shutdown.
 */

/** How long the CVR keeps running after the electrical network power-up and after the last engine shutdown, in s */
export const CVR_AUTO_RUN_TIME_SECONDS = 5 * 60;

/** The inputs of the CVR power logic */
export interface CvrInputs {
  /** The aircraft electrical network is energized (the bus that supplies the recorder control) */
  networkPowered: boolean;
  onGround: boolean;
  /** At least one engine runs (oil pressure above the low pressure switch threshold) */
  anyEngineRunning: boolean;
  /** RCDR GND CTL pb-sw ON */
  groundControlOn: boolean;
  parkingBrakeOn: boolean;
  /** CVR TEST pb pressed and held */
  testPressed: boolean;
}

/** The outputs of the CVR power logic */
export interface CvrOutputs {
  /** The CVR records */
  energized: boolean;
  /** The CVR test signal is heard through the loudspeakers */
  testTone: boolean;
}

/** The CVR power logic: when the recorder runs, and when the CVR TEST pb gives the test signal */
export class CvrPowerLogic {
  /** Time since the electrical network was energized, in s */
  private secondsSincePowerUp = 0;

  /**
   * Time since the aircraft last had an engine running or was in flight, in s (infinite when that never happened since
   * the power-up)
   */
  private secondsSinceEngineOrFlight = Infinity;

  /**
   * @param deltaSeconds the time since the last update, in s
   * @param inputs the aircraft state
   * @returns whether the CVR runs, and whether the test signal is heard
   */
  public update(deltaSeconds: number, inputs: CvrInputs): CvrOutputs {
    if (!inputs.networkPowered) {
      // No power: the recorder stops; the next power-up starts a new 5 min window
      this.secondsSincePowerUp = 0;
      this.secondsSinceEngineOrFlight = Infinity;
      return { energized: false, testTone: false };
    }

    this.secondsSincePowerUp += deltaSeconds;

    const engineRunningOrFlight = inputs.anyEngineRunning || !inputs.onGround;
    if (engineRunningOrFlight) {
      this.secondsSinceEngineOrFlight = 0;
    } else {
      this.secondsSinceEngineOrFlight += deltaSeconds;
    }

    const energized =
      inputs.groundControlOn ||
      engineRunningOrFlight ||
      this.secondsSincePowerUp < CVR_AUTO_RUN_TIME_SECONDS ||
      this.secondsSinceEngineOrFlight < CVR_AUTO_RUN_TIME_SECONDS;

    return { energized, testTone: inputs.testPressed && energized && inputs.parkingBrakeOn };
  }
}

/** The CVR runs (L:var written by CockpitVoiceRecorder) */
export const CVR_ENERGIZED_VAR = 'L:A32NX_RCDR_CVR_ENERGIZED';
/** The CVR test signal is heard (L:var written by CockpitVoiceRecorder, plays the cvr_test sound of sound.xml) */
export const CVR_TEST_TONE_VAR = 'L:A32NX_RCDR_CVR_TEST_TONE';

/** Below this oil pressure, in psi, an engine is off: the 12KS1/12KS2 relays of the GND CTL logic (A32NX_Interior_Misc.xml) */
const ENGINE_LOW_OIL_PRESSURE_PSI = 18;

/** The A32NX CVR: power logic and CVR TEST signal, from the sim state */
export class CockpitVoiceRecorder implements Instrument {
  private readonly logic = new CvrPowerLogic();

  private lastSimTimeSeconds: number | undefined = undefined;

  private publishedEnergized: boolean | undefined = undefined;

  private publishedTestTone: boolean | undefined = undefined;

  /** @inheritdoc */
  public init(): void {}

  /** @inheritdoc */
  public onUpdate(): void {
    const simTime = SimVar.GetSimVarValue('E:SIMULATION TIME', 'seconds');
    const deltaSeconds = this.lastSimTimeSeconds === undefined ? 0 : Math.max(0, simTime - this.lastSimTimeSeconds);
    this.lastSimTimeSeconds = simTime;

    const outputs = this.logic.update(deltaSeconds, {
      // The supply of the RCDR GND CTL relay (A32NX_Interior_Misc.xml FBW_CVR_Ground_Control_Pushbutton)
      networkPowered: SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_SHED_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
      onGround: SimVar.GetSimVarValue('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED', SimVarValueType.Bool) > 0,
      anyEngineRunning:
        SimVar.GetSimVarValue('A:GENERAL ENG OIL PRESSURE:1', SimVarValueType.PSI) >= ENGINE_LOW_OIL_PRESSURE_PSI ||
        SimVar.GetSimVarValue('A:GENERAL ENG OIL PRESSURE:2', SimVarValueType.PSI) >= ENGINE_LOW_OIL_PRESSURE_PSI,
      groundControlOn: SimVar.GetSimVarValue('L:A32NX_RCDR_GROUND_CONTROL_ON', SimVarValueType.Bool) > 0,
      parkingBrakeOn: SimVar.GetSimVarValue('L:A32NX_PARK_BRAKE_LEVER_POS', SimVarValueType.Bool) > 0,
      testPressed: SimVar.GetSimVarValue('L:A32NX_RCDR_TEST', SimVarValueType.Bool) > 0,
    });

    if (outputs.energized !== this.publishedEnergized) {
      this.publishedEnergized = outputs.energized;
      SimVar.SetSimVarValue(CVR_ENERGIZED_VAR, SimVarValueType.Bool, outputs.energized);
    }
    if (outputs.testTone !== this.publishedTestTone) {
      this.publishedTestTone = outputs.testTone;
      SimVar.SetSimVarValue(CVR_TEST_TONE_VAR, SimVarValueType.Bool, outputs.testTone);
    }
  }
}
