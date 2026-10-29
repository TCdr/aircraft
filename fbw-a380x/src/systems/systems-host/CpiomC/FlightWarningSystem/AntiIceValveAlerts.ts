// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/*
 * The anti-ice valve alerts of the A380X FWS:
 * A-ICE ENG 1(2)(3)(4) VLV CLOSED / VLV OPEN and A-ICE L(R) WING VLV CLOSED / VLV OPEN / VLV PRESS HI / VLV PRESS LO.
 *
 * The valves are those of the systems model (a380_systems ice_rain_protection.rs): the engine anti-ice valves
 * (L:A32NX_PNEU_ENG_n_ANTI_ICE_VALVE_OPEN) and the AICU wing anti-ice monitoring of each wing
 * (L:A32NX_PNEU_WING_ANTI_ICE_n_ABNORMALLY_CLOSED / _ABNORMALLY_OPEN / _LOW_PRESSURE / _HIGH_PRESSURE, 1 left 2 right).
 */

/** The ECAM alert ids (texts in EcamMessages/AbnormalSensed/ata29-30.ts) */
export const ANTI_ICE_VALVE_ALERT_IDS = {
  engineValveClosed: ['300800010', '300800011', '300800012', '300800013'],
  engineValveOpen: ['300800014', '300800015', '300800016', '300800017'],
  wingValveClosed: ['300800018', '300800019'],
  wingValveOpen: ['300800020', '300800021'],
  wingPressHi: ['300800022', '300800023'],
  wingPressLo: ['300800024', '300800025'],
};

/** INOP SYS ENG 1(2)(3)(4) A-ICE (STATUS of A-ICE ENG VLV CLOSED) and WING A-ICE */
export const ENGINE_ANTI_ICE_INOP_SYS = ['300300010', '300300011', '300300012', '300300013'];
export const WING_ANTI_ICE_INOP_SYS = '300300001';
/** LIMITATIONS AVOID ICING CONDs (ALL PHASES, on the ECAM and the PFD) */
export const AVOID_ICING_LIMITATION = '300400001';

/**
 * Design choice (no published value): the time a valve disagreement must last before the alert, longer than the 2 s the
 * valves of the systems model take to transit (the FAULT light shows the transit).
 */
export const ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS = 5;

export interface EngineAntiIceValveInputs {
  /** The ENG n ANTI ICE pb is ON */
  pbOn: boolean;
  /** The engine anti-ice valve is not fully closed */
  valveOpen: boolean;
  /** The engine is running */
  engineRunning: boolean;
}

export interface WingAntiIceMonitoringInputs {
  abnormallyClosed: boolean;
  abnormallyOpen: boolean;
  lowPressure: boolean;
  highPressure: boolean;
}

export interface AntiIceValveInputs {
  engines: EngineAntiIceValveInputs[];
  /** Left, right */
  wings: WingAntiIceMonitoringInputs[];
  /** The ENG 1(2)(3)(4) BLEED pb are on (AUTO), for the WING VLV OPEN procedure */
  engineBleedPbAuto: boolean[];
}

/** A condition that must last the confirmation time */
class ConfirmedCondition {
  private seconds = 0;

  public readonly output = Subject.create(false);

  update(condition: boolean, deltaTimeSeconds: number): void {
    this.seconds = condition ? this.seconds + deltaTimeSeconds : 0;
    this.output.set(this.seconds >= ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS);
  }
}

/**
 * The anti-ice valve alerts.
 *
 * Design choice: A-ICE ENG VLV CLOSED (the valve is abnormally closed) needs the engine running: without engine air
 * the valve closes (as the A320 valve), a pb ON before the engine
 * start lights the FAULT light only. The wing conditions come from the AICU monitoring of the systems model.
 */
export class AntiIceValveAlerts {
  private readonly engineClosed = [0, 1, 2, 3].map(() => new ConfirmedCondition());

  private readonly engineOpen = [0, 1, 2, 3].map(() => new ConfirmedCondition());

  private readonly wingClosed = [0, 1].map(() => new ConfirmedCondition());

  private readonly wingOpen = [0, 1].map(() => new ConfirmedCondition());

  private readonly wingPressHi = [0, 1].map(() => new ConfirmedCondition());

  private readonly wingPressLo = [0, 1].map(() => new ConfirmedCondition());

  public readonly engineValveClosed = this.engineClosed.map((condition) => condition.output);

  public readonly engineValveOpen = this.engineOpen.map((condition) => condition.output);

  public readonly wingValveClosed = this.wingClosed.map((condition) => condition.output);

  public readonly wingValveOpen = this.wingOpen.map((condition) => condition.output);

  public readonly wingValvePressHi = this.wingPressHi.map((condition) => condition.output);

  public readonly wingValvePressLo = this.wingPressLo.map((condition) => condition.output);

  /** The ENG 1(2)(3)(4) BLEED pb are on (AUTO) */
  public engineBleedPbAuto = [false, false, false, false];

  update(inputs: AntiIceValveInputs, deltaTimeSeconds: number): void {
    this.engineBleedPbAuto = inputs.engineBleedPbAuto;
    inputs.engines.forEach((engine, index) => {
      this.engineClosed[index].update(engine.pbOn && !engine.valveOpen && engine.engineRunning, deltaTimeSeconds);
      this.engineOpen[index].update(!engine.pbOn && engine.valveOpen, deltaTimeSeconds);
    });
    inputs.wings.forEach((wing, index) => {
      this.wingClosed[index].update(wing.abnormallyClosed, deltaTimeSeconds);
      this.wingOpen[index].update(wing.abnormallyOpen, deltaTimeSeconds);
      this.wingPressHi[index].update(wing.highPressure, deltaTimeSeconds);
      this.wingPressLo[index].update(wing.lowPressure, deltaTimeSeconds);
    });
  }
}

/**
 * Reads the inputs of the anti-ice valve alerts from the systems model.
 * @param engineRunning whether each engine runs (FwsCore engine1Running to engine4Running)
 */
export function readAntiIceValveInputs(engineRunning: boolean[]): AntiIceValveInputs {
  const flag = (name: string) => SimVar.GetSimVarValue(name, 'bool') > 0;
  return {
    engines: [1, 2, 3, 4].map((engine) => ({
      pbOn: flag(`L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_${engine}_POSITION`),
      valveOpen: flag(`L:A32NX_PNEU_ENG_${engine}_ANTI_ICE_VALVE_OPEN`),
      engineRunning: engineRunning[engine - 1],
    })),
    wings: [1, 2].map((wing) => ({
      abnormallyClosed: flag(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_ABNORMALLY_CLOSED`),
      abnormallyOpen: flag(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_ABNORMALLY_OPEN`),
      lowPressure: flag(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_LOW_PRESSURE`),
      highPressure: flag(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_HIGH_PRESSURE`),
    })),
    engineBleedPbAuto: [1, 2, 3, 4].map((engine) => flag(`L:A32NX_OVHD_PNEU_ENG_${engine}_BLEED_PB_IS_AUTO`)),
  };
}

/** The bleed controls of one wing, for the A-ICE L(R) WING VLV OPEN procedure */
export interface WingBleedControls {
  onGround: boolean;
  /** Before the takeoff (flight phases up to 4): BLEEDS/ PACK/ WING A-ICE AVAIL IN FLT */
  beforeTakeoff: boolean;
  crossBleedShut: boolean;
  crossBleedAuto: boolean;
  packOn: boolean;
  /** The ENG 1(3) BLEED pb is on (AUTO) */
  firstEngineBleedOn: boolean;
  /** The ENG 2(4) BLEED pb is on (AUTO) */
  secondEngineBleedOn: boolean;
  /** The APU BLEED pb is ON (left wing only) */
  apuBleedOn: boolean;
}

/**
 * The lines of A-ICE L(R) WING VLV OPEN, in the order of the procedure items of ata29-30.ts.
 * On ground the bleed sources of the affected side are closed so the slats do not overheat: 0 X BLEED CLOSE, 1 PACK
 * 1(2) OFF, 2 ENG 1(3) BLEED OFF, 3 ENG 2(4) BLEED OFF, 4 APU BLEED OFF (left wing only), 5 BLEEDS/ PACK/ WING A-ICE
 * AVAIL IN FLT (before takeoff). In flight all bleed systems can be turned on again: 6 ENG 1(3) BLEED ON, 7 ENG 2(4)
 * BLEED ON, 8 PACK 1(2) ON, 9 X BLEED AUTO.
 * @param controls the bleed controls of the wing
 * @param leftWing the procedure of the left wing
 * @returns the items to show and the items checked
 */
export function wingValveOpenLines(
  controls: WingBleedControls,
  leftWing: boolean,
): { show: boolean[]; checked: boolean[] } {
  const ground = controls.onGround;
  const flight = !ground;
  return {
    show: [ground, ground, ground, ground, ground && leftWing, ground && controls.beforeTakeoff, flight, flight].concat(
      [flight, flight],
    ),
    checked: [
      controls.crossBleedShut,
      !controls.packOn,
      !controls.firstEngineBleedOn,
      !controls.secondEngineBleedOn,
      !controls.apuBleedOn,
      false,
      controls.firstEngineBleedOn,
      controls.secondEngineBleedOn,
      controls.packOn,
      controls.crossBleedAuto,
    ],
  };
}

/**
 * The lines of A-ICE L(R) WING VLV PRESS LO, in the order of the procedure items of ata29-30.ts.
 * On ground: 0 WING A-ICE OFF, 1 AVOID ICING CONDs. In flight: 2 THRUST INCREASE, 3 IF NOT SUCCESSFUL (crew
 * validated), 4 WING A-ICE OFF, 5 AVOID ICING CONDs.
 * @param onGround the aircraft is on ground
 * @param wingAntiIcePbOn the WING ANTI ICE pb is ON
 * @returns the items to show and the sensed items checked
 */
export function wingPressLoLines(onGround: boolean, wingAntiIcePbOn: boolean): { show: boolean[]; checked: boolean[] } {
  const flight = !onGround;
  return {
    show: [onGround, onGround, flight, flight, flight, flight],
    checked: [!wingAntiIcePbOn, false, false, false, !wingAntiIcePbOn, false],
  };
}

/** The IF NOT SUCCESSFUL item of A-ICE L(R) WING VLV PRESS LO (wingPressLoLines) */
const WING_PRESS_LO_NOT_SUCCESSFUL_ITEM = 3;

/**
 * Whether the wing anti-ice is failed for the STATUS and LIMITATIONS of A-ICE L(R) WING VLV PRESS LO, which list WING
 * A-ICE on ground or with the wing anti-ice failed; it is failed once the crew validated IF NOT SUCCESSFUL.
 * @param onGround the aircraft is on ground
 * @param itemsChecked the items of the procedure the crew checked
 */
export function isWingAntiIceFailedAfterPressLo(onGround: boolean, itemsChecked: boolean[]): boolean {
  return onGround || !!itemsChecked[WING_PRESS_LO_NOT_SUCCESSFUL_ITEM];
}
