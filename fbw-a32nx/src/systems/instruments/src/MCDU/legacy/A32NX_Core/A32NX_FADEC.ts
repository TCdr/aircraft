// @ts-strict-ignore
// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/** The FADEC engine states (L:A32NX_ENGINE_STATE) */
const ENGINE_STATE_STARTING = 2;
const ENGINE_STATE_RESTARTING = 3;

/**
 * The igniters the FADEC supplies during a start.
 * - On the ground (automatic start), one igniter at a time, alternated between start attempts, with the ENG MODE selector
 *   at IGN/START, between 25 % and 55 % N2.
 * - In flight, A320 FCOM DSC-70-80-30 IGNITION FOR STARTING (a320_fcom.txt l.63481-63482): "In case of start attempt in
 *   flight, when the ENG MASTER sw is ON, both igniters are supplied", and DSC-70-80-40 (l.63704-63706) "The ignition
 *   starts: ... In flight: Immediately". Both igniters from the start of the relight until the engine runs.
 * @param ignitionSelected the ENG MODE selector is at IGN/START
 * @param engineState the FADEC engine state
 * @param n2Percent the engine N2
 * @param onGround the aircraft is on the ground
 * @param groundIgniter the igniter of the next automatic start on the ground: 0 = A, 1 = B
 * @returns whether igniter A and igniter B are supplied
 */
export function startIgniters(
  ignitionSelected: boolean,
  engineState: number,
  n2Percent: number,
  onGround: boolean,
  groundIgniter: number,
): { a: boolean; b: boolean } {
  const starting = engineState === ENGINE_STATE_STARTING || engineState === ENGINE_STATE_RESTARTING;
  if (starting && !onGround) {
    return { a: true, b: true };
  }
  const igniting = ignitionSelected && starting && n2Percent > 25 && n2Percent < 55;
  return { a: igniting && groundIgniter === 0, b: igniting && groundIgniter === 1 };
}

/** What decides whether the FADEC of an engine is powered and sends its engine data (L:A32NX_FADEC_POWERED_ENGn) */
export interface FadecPowerInputs {
  /** Both FADEC channels lost (L:A32NX_ENGINE_n_FADEC_FAULT, flyPad FADEC channel A + B failures) */
  bothChannelsLost: boolean;
  firePbPushed: boolean;
  n2Percent: number;
  engModeSelNorm: boolean;
  fadecGroundPowerOn: boolean;
  fadecTimerRunning: boolean;
}

/**
 * Whether the FADEC is powered and sends its engine data to the displays (E/WD and SD XX when not).
 * A FADEC with both channels lost sends nothing: A320 FCOM ENG 1(2) FADEC FAULT (a320_fcom.txt l.79652-79653), "Due to
 * the fact that engine indications are lost, other system pages ... must be used to check engine status".
 */
export function isFadecPowered(inputs: FadecPowerInputs): boolean {
  if (inputs.bothChannelsLost || inputs.firePbPushed) {
    return false;
  }
  return inputs.n2Percent > 15 || !inputs.engModeSelNorm || inputs.fadecGroundPowerOn || inputs.fadecTimerRunning;
}

// FIXME move to systems host
export class A32NX_FADEC {
  private fadecTimer = -1;
  private dcEssPoweredInPreviousUpdate = false;
  private lastActiveIgniterAutostart = 0; // 0 = A, 1 = B
  private lastEngineState;
  private lastIgnitionState;
  private igniters = { a: false, b: false };

  constructor(private readonly engine: number) {}

  init() {
    this.updateSimVars();
  }

  update(deltaTime) {
    const dcEssIsPowered = this.isDcEssPowered();
    const ignitionState = SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 2;
    const engineState = SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${this.engine}`, 'Number');
    const n2Percent = SimVar.GetSimVarValue(`L:A32NX_ENGINE_N2:${this.engine}`, 'Number');

    if (
      (this.dcEssPoweredInPreviousUpdate !== dcEssIsPowered && dcEssIsPowered === 1) ||
      (this.lastEngineState !== engineState && engineState === 4)
    ) {
      this.fadecTimer = 5 * 60;
    }
    if ((this.lastEngineState === 2 || this.lastEngineState === 3) && engineState !== 2 && engineState !== 3) {
      this.lastActiveIgniterAutostart ^= 1; // toggles Igniter
    }

    this.igniters = startIgniters(
      ignitionState,
      engineState,
      n2Percent,
      SimVar.GetSimVarValue('SIM ON GROUND', 'Bool') > 0,
      this.lastActiveIgniterAutostart,
    );

    if (this.lastIgnitionState !== ignitionState && !ignitionState) {
      this.fadecTimer = Math.max(30, this.fadecTimer);
    }
    this.fadecTimer -= deltaTime / 1000;
    this.updateSimVars();
    this.dcEssPoweredInPreviousUpdate = dcEssIsPowered;
  }

  updateSimVars() {
    this.lastIgnitionState = SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 2;
    this.lastEngineState = SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${this.engine}`, 'Number');
    SimVar.SetSimVarValue(`L:A32NX_FADEC_POWERED_ENG${this.engine}`, 'Bool', this.isPowered() ? 1 : 0);
    SimVar.SetSimVarValue(`L:A32NX_FADEC_IGNITER_A_ACTIVE_ENG${this.engine}`, 'Bool', this.igniters.a ? 1 : 0);
    SimVar.SetSimVarValue(`L:A32NX_FADEC_IGNITER_B_ACTIVE_ENG${this.engine}`, 'Bool', this.igniters.b ? 1 : 0);
  }

  isPowered() {
    return isFadecPowered({
      bothChannelsLost: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${this.engine}_FADEC_FAULT`, 'Bool') > 0,
      firePbPushed: SimVar.GetSimVarValue(`L:A32NX_FIRE_BUTTON_ENG${this.engine}`, 'Bool') === 1,
      n2Percent: SimVar.GetSimVarValue(`TURB ENG N2:${this.engine}`, 'Percent'),
      engModeSelNorm: SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 1,
      fadecGroundPowerOn: !!SimVar.GetSimVarValue(`L:A32NX_OVHD_FADEC_${this.engine}`, 'Bool'),
      fadecTimerRunning: this.fadecTimer > 0,
    });
  }

  isDcEssPowered() {
    // This will have to be revisited when implementing the FADEC. One shouldn't consider this reference
    // to DC ESS valuable: it might be powered by multiple buses or related to other things altogether.
    return SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 'Bool');
  }
}
