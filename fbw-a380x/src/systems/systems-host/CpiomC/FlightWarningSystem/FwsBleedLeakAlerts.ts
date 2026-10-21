// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { AVOID_ICING_LIMITATION, WING_ANTI_ICE_INOP_SYS } from './AntiIceValveAlerts';
import {
  APU_BLEED_INOP_SYS,
  ENG_BLEED_INOP_SYS,
  ENG_STARTER_INOP_SYS,
  LEFT_ENGINES,
  PACK_INOP_SYS,
  RIGHT_ENGINES,
} from './BleedMonitoringAlerts';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';

/*
 * A380X AIR (ATA 36) alerts of the bleed leak detection and of the bleed valves, on the systems WASM (a380_systems
 * pneumatic.rs):
 * - AIR APU BLEED LEAK, AIR PACK 1(2) LEAK, AIR HOT AIR 1(2) LEAK, AIR FWD CARGO DUCT LEAK: the leak of the zone,
 *   isolated by the leak detection (APU bleed valve, pack valves, hot-air valve);
 * - AIR BLEED LEAK: an engine or wing duct leak with the XBLEED selector at OPEN (the crossbleed valves no longer
 *   close for the leak);
 * - AIR LEAK DET FAULT: the dual loop of one or more ducts lost, or both leak detection systems;
 * - AIR ENG 1(2)(3)(4) BLEED NOT CLOSED: the engine bleed valve open while it is commanded closed for the APU bleed
 *   or the engine start (bleed valve stuck open);
 * - AIR ENG 1(2)(3)(4) HP VLV NOT OPEN: the HP valve stays closed against its command (HP valve stuck closed);
 * - AIR ENG BLEED TEMP LO ON BLEED 1(2)(3)(4): in flight with the WING A-ICE pb ON, a bleed supplies air below 150 °C
 *   for more than 60 s (fan air valve stuck open, low thrust in cold air). Not simulated: the second trigger (every
 *   60 s for at least 9 min, the wing anti-ice air below 150 °C);
 * - AIR XBLEED FAULT: a crossbleed valve in an abnormal position (stuck valve), or no longer controlled automatically
 *   (both CPIOM-A of its pair) or manually (no DC ESS).
 * Not simulated: the XBLEED AUTO CTL INOP SYS lines of the leak and TEMP LO alerts (no automatic crossbleed opening
 * failure).
 */

/** Engines 1 to 4 at index 0 to 3; wing zones 1 left outer, 2 left inner, 3 right inner, 4 right outer */
export interface BleedLeakAlertInputs {
  /** L:A32NX_PNEU_ENG_n_BLEED_LEAK */
  readonly pylonLeak: readonly boolean[];
  /** L:A32NX_PNEU_L_OUTR/L_INR/R_INR/R_OUTR_WING_LEAK */
  readonly wingLeak: readonly boolean[];
  /** L:A32NX_PNEU_APU_BLEED_LEAK */
  readonly apuLeak: boolean;
  /** L:A32NX_PNEU_PACK_n_LEAK */
  readonly packLeak: readonly boolean[];
  /** L:A32NX_PNEU_HOT_AIR_n_LEAK */
  readonly hotAirLeak: readonly boolean[];
  /** L:A32NX_PNEU_FWD_CARGO_DUCT_LEAK */
  readonly fwdCargoDuctLeak: boolean;
  /** L:A32NX_PNEU_<zone>_LEAK_DET_FAULT, in the order of LEAK_DETECTION_ZONES */
  readonly leakDetectionLost: readonly boolean[];
  /** L:A32NX_PNEU_ENG_n_PR_VALVE_OPEN */
  readonly bleedValveOpen: readonly boolean[];
  /** The bleed valve is not where the CPIOM-A commands it (L:A32NX_PNEU_ENG_n_PR_VALVE_DISAGREE) */
  readonly bleedValveDisagree: readonly boolean[];
  readonly bleedPbAuto: readonly boolean[];
  /** L:A32NX_PNEU_ENG_n_STARTER_VALVE_OPEN */
  readonly starterValveOpen: readonly boolean[];
  /** L:A32NX_PNEU_ENG_n_HP_VALVE_NOT_OPEN */
  readonly hpValveNotOpen: readonly boolean[];
  /** The bleed air temperature, °C (L:A32NX_PNEU_ENG_n_PRECOOLER_OUTLET_TEMPERATURE) */
  readonly bleedTemperature: readonly number[];
  /** Left, center, right crossbleed valve (L:A32NX_PNEU_XBLEED_VALVE_L/C/R_ABNORMAL_POSITION) */
  readonly xbleedAbnormalPosition: readonly boolean[];
  /** L:A32NX_PNEU_XBLEED_VALVE_L/C/R_AUTO_CONTROL_LOST */
  readonly xbleedAutoControlLost: readonly boolean[];
  /** L:A32NX_PNEU_XBLEED_VALVE_L/C/R_MANUAL_CONTROL_LOST */
  readonly xbleedManualControlLost: readonly boolean[];
  readonly xbleedSelectorOpen: boolean;
  readonly xbleedSelectorAuto: boolean;
  /** L:A32NX_APU_BLEED_AIR_VALVE_OPEN (the APU bleed and isolation valves) */
  readonly apuBleedValveOpen: boolean;
  readonly apuBleedPbOn: boolean;
  /** The pack valves 1 to 4 (pack 1: 1 and 2, pack 2: 3 and 4) are open (L:A32NX_COND_PACK_n_FLOW_VALVE_m_IS_OPEN) */
  readonly packValveOpen: readonly boolean[];
  readonly packPbOn: readonly boolean[];
  readonly hotAirValveOpen: readonly boolean[];
  readonly hotAirPbOn: readonly boolean[];
  readonly engineRunning: readonly boolean[];
  /** The WING A-ICE pb is ON */
  readonly wingAntiIceOn: boolean;
  readonly onGround: boolean;
}

/** The duct zones of the leak detection, as the L:A32NX_PNEU_<zone>_LEAK_DET_FAULT names give them */
export const LEAK_DETECTION_ZONES = [
  'ENG_1',
  'ENG_2',
  'ENG_3',
  'ENG_4',
  'L_OUTR_WING',
  'L_INR_WING',
  'R_INR_WING',
  'R_OUTR_WING',
  'APU',
  'PACK_1',
  'PACK_2',
  'HOT_AIR_1',
  'HOT_AIR_2',
  'FWD_CARGO',
  'AFT_CARGO',
];

/**
 * Reads the inputs with `read` (SimVar.GetSimVarValue(name, Number) in the sim).
 * @param read the simvar reader
 * @param state the FWS state these alerts share with others
 * @returns the inputs
 */
export function readBleedLeakAlertInputs(
  read: (name: string) => number,
  state: Pick<
    BleedLeakAlertInputs,
    | 'bleedPbAuto'
    | 'xbleedSelectorOpen'
    | 'xbleedSelectorAuto'
    | 'apuBleedPbOn'
    | 'packPbOn'
    | 'hotAirValveOpen'
    | 'hotAirPbOn'
    | 'engineRunning'
    | 'wingAntiIceOn'
    | 'onGround'
  >,
): BleedLeakAlertInputs {
  const isOn = (name: string): boolean => read(name) > 0;
  const engines = [1, 2, 3, 4];
  const crossbleedValves = ['L', 'C', 'R'];
  return {
    ...state,
    pylonLeak: engines.map((engine) => isOn(`L:A32NX_PNEU_ENG_${engine}_BLEED_LEAK`)),
    wingLeak: ['L_OUTR', 'L_INR', 'R_INR', 'R_OUTR'].map((zone) => isOn(`L:A32NX_PNEU_${zone}_WING_LEAK`)),
    apuLeak: isOn('L:A32NX_PNEU_APU_BLEED_LEAK'),
    packLeak: [1, 2].map((pack) => isOn(`L:A32NX_PNEU_PACK_${pack}_LEAK`)),
    hotAirLeak: [1, 2].map((hotAir) => isOn(`L:A32NX_PNEU_HOT_AIR_${hotAir}_LEAK`)),
    fwdCargoDuctLeak: isOn('L:A32NX_PNEU_FWD_CARGO_DUCT_LEAK'),
    leakDetectionLost: LEAK_DETECTION_ZONES.map((zone) => isOn(`L:A32NX_PNEU_${zone}_LEAK_DET_FAULT`)),
    bleedValveOpen: engines.map((engine) => isOn(`L:A32NX_PNEU_ENG_${engine}_PR_VALVE_OPEN`)),
    bleedValveDisagree: engines.map((engine) => isOn(`L:A32NX_PNEU_ENG_${engine}_PR_VALVE_DISAGREE`)),
    starterValveOpen: engines.map((engine) => isOn(`L:A32NX_PNEU_ENG_${engine}_STARTER_VALVE_OPEN`)),
    hpValveNotOpen: engines.map((engine) => isOn(`L:A32NX_PNEU_ENG_${engine}_HP_VALVE_NOT_OPEN`)),
    bleedTemperature: engines.map((engine) => read(`L:A32NX_PNEU_ENG_${engine}_PRECOOLER_OUTLET_TEMPERATURE`)),
    xbleedAbnormalPosition: crossbleedValves.map((valve) =>
      isOn(`L:A32NX_PNEU_XBLEED_VALVE_${valve}_ABNORMAL_POSITION`),
    ),
    xbleedAutoControlLost: crossbleedValves.map((valve) =>
      isOn(`L:A32NX_PNEU_XBLEED_VALVE_${valve}_AUTO_CONTROL_LOST`),
    ),
    xbleedManualControlLost: crossbleedValves.map((valve) =>
      isOn(`L:A32NX_PNEU_XBLEED_VALVE_${valve}_MANUAL_CONTROL_LOST`),
    ),
    apuBleedValveOpen: isOn('L:A32NX_APU_BLEED_AIR_VALVE_OPEN'),
    packValveOpen: [
      isOn('L:A32NX_COND_PACK_1_FLOW_VALVE_1_IS_OPEN'),
      isOn('L:A32NX_COND_PACK_1_FLOW_VALVE_2_IS_OPEN'),
      isOn('L:A32NX_COND_PACK_2_FLOW_VALVE_1_IS_OPEN'),
      isOn('L:A32NX_COND_PACK_2_FLOW_VALVE_2_IS_OPEN'),
    ],
  };
}

/** The temperature under which a bleed is LO TEMP, °C */
const BLEED_TEMP_LO_THRESHOLD_C = 150;
/** How long a bleed must stay LO TEMP, s */
export const BLEED_TEMP_LO_CONFIRMATION_S = 60;

const NO_INPUTS: BleedLeakAlertInputs = {
  pylonLeak: [false, false, false, false],
  wingLeak: [false, false, false, false],
  apuLeak: false,
  packLeak: [false, false],
  hotAirLeak: [false, false],
  fwdCargoDuctLeak: false,
  leakDetectionLost: LEAK_DETECTION_ZONES.map(() => false),
  bleedValveOpen: [false, false, false, false],
  bleedValveDisagree: [false, false, false, false],
  bleedPbAuto: [true, true, true, true],
  starterValveOpen: [false, false, false, false],
  hpValveNotOpen: [false, false, false, false],
  bleedTemperature: [0, 0, 0, 0],
  xbleedAbnormalPosition: [false, false, false],
  xbleedAutoControlLost: [false, false, false],
  xbleedManualControlLost: [false, false, false],
  xbleedSelectorOpen: false,
  xbleedSelectorAuto: true,
  apuBleedValveOpen: false,
  apuBleedPbOn: false,
  packValveOpen: [false, false, false, false],
  packPbOn: [true, true],
  hotAirValveOpen: [false, false],
  hotAirPbOn: [true, true],
  engineRunning: [false, false, false, false],
  wingAntiIceOn: false,
  onGround: true,
};

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class BleedLeakAlerts {
  public readonly apuBleedLeak = Subject.create(false);

  /** AIR BLEED LEAK */
  public readonly bleedLeakWithXbleedOpen = Subject.create(false);

  public readonly engineBleedNotClosed = [0, 1, 2, 3].map(() => Subject.create(false));

  public readonly hpValveNotOpen = [0, 1, 2, 3].map(() => Subject.create(false));

  public readonly bleedTempLo = [0, 1, 2, 3].map(() => Subject.create(false));

  public readonly fwdCargoDuctLeak = Subject.create(false);

  public readonly hotAirLeak = [0, 1].map(() => Subject.create(false));

  public readonly leakDetFault = Subject.create(false);

  public readonly packLeak = [0, 1].map(() => Subject.create(false));

  public readonly xbleedFault = Subject.create(false);

  public inputs: BleedLeakAlertInputs = NO_INPUTS;

  private readonly bleedTempLoConfirmNodes = [0, 1, 2, 3].map(
    () => new NXLogicConfirmNode(BLEED_TEMP_LO_CONFIRMATION_S),
  );

  /**
   * @param inputs the aircraft state of this FWS cycle
   * @param deltaTimeMs the cycle time, ms
   */
  public update(inputs: BleedLeakAlertInputs, deltaTimeMs: number): void {
    this.inputs = inputs;
    this.apuBleedLeak.set(inputs.apuLeak);
    this.bleedLeakWithXbleedOpen.set(
      inputs.xbleedSelectorOpen && (inputs.pylonLeak.some((leak) => leak) || inputs.wingLeak.some((leak) => leak)),
    );
    for (let engine = 0; engine < 4; engine++) {
      this.engineBleedNotClosed[engine].set(
        isBleedValveNotClosed(inputs, engine) ||
          (this.engineBleedNotClosed[engine].get() && !inputs.bleedPbAuto[engine]),
      );
      this.hpValveNotOpen[engine].set(inputs.hpValveNotOpen[engine]);
      const tempLoConfirmed = this.bleedTempLoConfirmNodes[engine].write(
        isBleedTemperatureLow(inputs, engine),
        deltaTimeMs,
      );
      this.bleedTempLo[engine].set(
        tempLoConfirmed || (this.bleedTempLo[engine].get() && isBleedTempLoProcedureApplied(inputs, engine)),
      );
    }
    this.fwdCargoDuctLeak.set(inputs.fwdCargoDuctLeak);
    for (let index = 0; index < 2; index++) {
      this.hotAirLeak[index].set(inputs.hotAirLeak[index]);
      this.packLeak[index].set(inputs.packLeak[index]);
    }
    this.leakDetFault.set(inputs.leakDetectionLost.some((lost) => lost));
    this.xbleedFault.set(
      [0, 1, 2].some(
        (valve) =>
          inputs.xbleedAbnormalPosition[valve] ||
          inputs.xbleedAutoControlLost[valve] ||
          inputs.xbleedManualControlLost[valve],
      ),
    );
  }

  /** The number of bleeds LO TEMP */
  public bleedsTempLo(): number {
    return this.bleedTempLo.filter((tempLo) => tempLo.get()).length;
  }
}

/**
 * The engine bleed valve is open while the CPIOM-A commands it closed for the engine start (its start valve open) or
 * the APU bleed supply (APU BLEED pb ON with the APU bleed valve open).
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether AIR ENG n BLEED NOT CLOSED is triggered by this cycle (the alert also holds while the pb-sw is OFF)
 */
function isBleedValveNotClosed(inputs: BleedLeakAlertInputs, engine: number): boolean {
  const commandedClosedForApuBleedOrStart =
    inputs.starterValveOpen[engine] || (inputs.apuBleedPbOn && inputs.apuBleedValveOpen);
  return inputs.bleedValveDisagree[engine] && inputs.bleedValveOpen[engine] && commandedClosedForApuBleedOrStart;
}

/**
 * In flight with the WING A-ICE pb ON, the bleed supplies air below 150 °C (before the 60 s confirmation).
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether the bleed is LO TEMP
 */
function isBleedTemperatureLow(inputs: BleedLeakAlertInputs, engine: number): boolean {
  return (
    !inputs.onGround &&
    inputs.wingAntiIceOn &&
    inputs.bleedValveOpen[engine] &&
    inputs.bleedTemperature[engine] < BLEED_TEMP_LO_THRESHOLD_C
  );
}

/**
 * The crew applied the procedure of AIR ENG BLEED TEMP LO (ENG n BLEED OFF, or WING A-ICE OFF): that ends the trigger,
 * but the alert stays with its STATUS. Design choice: until the bleed and the WING A-ICE are back ON, or the landing.
 * @param inputs the aircraft state
 * @param engine the engine index (0 to 3)
 * @returns whether a confirmed TEMP LO alert stays
 */
function isBleedTempLoProcedureApplied(inputs: BleedLeakAlertInputs, engine: number): boolean {
  return !inputs.onGround && (!inputs.bleedPbAuto[engine] || !inputs.wingAntiIceOn);
}

function tempLoAvoidIcingLimitation(bleedsTempLo: number): string[] {
  return bleedsTempLo > 1 ? [AVOID_ICING_LIMITATION] : [];
}

function isBleedLost(inputs: BleedLeakAlertInputs, engine: number): boolean {
  return !inputs.bleedValveOpen[engine];
}

function lostBleedCount(inputs: BleedLeakAlertInputs): number {
  return [0, 1, 2, 3].filter((engine) => isBleedLost(inputs, engine)).length;
}

/** In flight, two bleeds of the same side are inoperative: the WING A-ICE lines, AVOID ICING CONDs */
function twoBleedsOfASideLostInFlight(inputs: BleedLeakAlertInputs): boolean {
  const sideLost = (side: number[]) => side.every((engine) => isBleedLost(inputs, engine));
  return !inputs.onGround && (sideLost(LEFT_ENGINES) || sideLost(RIGHT_ENGINES));
}

/**
 * The pack of the PACK 1(2) OFF line with two or more bleeds inoperative. Design choice, as AIR ABNORM BLEED CONFIG:
 * the pack of the side with more lost bleeds (PACK 1 on a tie).
 */
function packOfTheSideWithMoreLostBleeds(inputs: BleedLeakAlertInputs): number {
  const lost = (side: number[]) => side.filter((engine) => isBleedLost(inputs, engine)).length;
  return lost(LEFT_ENGINES) >= lost(RIGHT_ENGINES) ? 0 : 1;
}

function beforeAnyEngineStart(inputs: BleedLeakAlertInputs): boolean {
  return inputs.onGround && !inputs.engineRunning.some((running) => running);
}

/**
 * The lines of AIR APU BLEED LEAK (ata35-36-42.ts): 0-3 ENG 1-4 MASTER LEVER KEEP OFF, 4 APU BLEED OFF, 5 PACK 1 OFF,
 * 6 PACK 2 OFF, 7 WING A-ICE OFF, 8 ENGs A-ICE, 9 AVOID ICING CONDs, 10 AIR LEAK ISOLATED.
 * APU BLEED OFF while the APU bleed valve did not close automatically (kept, ticked, once the pb is OFF); PACK OFF with
 * an engine running and two or more bleeds inoperative.
 */
export function apuBleedLeakItems(inputs: BleedLeakAlertInputs): { show: boolean[]; checked: boolean[] } {
  const beforeStart = beforeAnyEngineStart(inputs);
  const packLine = inputs.engineRunning.some((running) => running) && lostBleedCount(inputs) >= 2;
  const pack = packOfTheSideWithMoreLostBleeds(inputs);
  const wingAntiIce = twoBleedsOfASideLostInFlight(inputs);
  return {
    show: [
      beforeStart,
      beforeStart,
      beforeStart,
      beforeStart,
      inputs.apuBleedValveOpen || !inputs.apuBleedPbOn,
      packLine && pack === 0,
      packLine && pack === 1,
      wingAntiIce,
      wingAntiIce,
      wingAntiIce,
      !inputs.apuBleedValveOpen,
    ],
    checked: [
      false,
      false,
      false,
      false,
      !inputs.apuBleedPbOn,
      !inputs.packPbOn[0],
      !inputs.packPbOn[1],
      !inputs.wingAntiIceOn,
      false,
      false,
      false,
    ],
  };
}

/**
 * STATUS INOP SYS of AIR APU BLEED LEAK: APU BLEED; ENG 1 BLEED, ENG 1 STARTER and WING A-ICE (in flight) when the APU
 * bleed valve is abnormally open; PACK 1(2) when set OFF. None on ground before any engine start.
 */
export function apuBleedLeakInopSys(inputs: BleedLeakAlertInputs): string[] {
  if (beforeAnyEngineStart(inputs)) {
    return [];
  }
  const codes: string[] = [];
  if (inputs.apuBleedValveOpen) {
    codes.push(ENG_BLEED_INOP_SYS[0]);
  }
  codes.push(APU_BLEED_INOP_SYS);
  [0, 1].forEach((pack) => {
    if (!inputs.packPbOn[pack]) {
      codes.push(PACK_INOP_SYS[pack]);
    }
  });
  if (inputs.apuBleedValveOpen) {
    codes.push(ENG_STARTER_INOP_SYS[0]);
    if (!inputs.onGround) {
      codes.push(WING_ANTI_ICE_INOP_SYS);
    }
  }
  return codes;
}

/** AVOID ICING CONDs (all phases and PFD) of the leak alerts: in flight with two bleeds of the same side lost */
function leakAvoidIcingLimitation(inputs: BleedLeakAlertInputs): string[] {
  return twoBleedsOfASideLostInFlight(inputs) ? [AVOID_ICING_LIMITATION] : [];
}

/**
 * The lines of AIR PACK 1(2) LEAK: 0 PACK 1(2) OFF while a valve of the pack did not close automatically (kept,
 * ticked, once the pb is OFF), 1-3 WING A-ICE OFF / ENGs A-ICE / AVOID ICING CONDs in flight with two bleeds of a side
 * inoperative, 4 AIR LEAK ISOLATED once both pack valves are closed.
 */
export function packLeakItems(inputs: BleedLeakAlertInputs, pack: number): { show: boolean[]; checked: boolean[] } {
  const packValvesOpen = inputs.packValveOpen[2 * pack] || inputs.packValveOpen[2 * pack + 1];
  const wingAntiIce = twoBleedsOfASideLostInFlight(inputs);
  return {
    show: [packValvesOpen || !inputs.packPbOn[pack], wingAntiIce, wingAntiIce, wingAntiIce, !packValvesOpen],
    checked: [!inputs.packPbOn[pack], !inputs.wingAntiIceOn, false, false, false],
  };
}

/**
 * STATUS INOP SYS of AIR PACK 1(2) LEAK: PACK 1(2); for pack 1 with the pack valve 1 failed open ENG 1 BLEED, ENG 1
 * STARTER, APU BLEED; for pack 2 with the pack valve 4 failed open ENG 4 BLEED, ENG 4 STARTER; WING A-ICE in flight
 * with two bleeds of a side lost.
 */
export function packLeakInopSys(inputs: BleedLeakAlertInputs, pack: number): string[] {
  const codes: string[] = [];
  const outerValveFailedOpen = pack === 0 ? inputs.packValveOpen[0] : inputs.packValveOpen[3];
  const outerEngine = pack === 0 ? 0 : 3;
  if (outerValveFailedOpen) {
    codes.push(ENG_BLEED_INOP_SYS[outerEngine], ENG_STARTER_INOP_SYS[outerEngine]);
    if (pack === 0) {
      codes.push(APU_BLEED_INOP_SYS);
    }
  }
  codes.push(PACK_INOP_SYS[pack]);
  if (twoBleedsOfASideLostInFlight(inputs)) {
    codes.push(WING_ANTI_ICE_INOP_SYS);
  }
  return codes;
}

/**
 * The lines of AIR HOT AIR 1(2) LEAK and AIR FWD CARGO DUCT LEAK: 0 HOT AIR 1(2) OFF while the hot-air valve did not
 * close automatically (kept, ticked, once the pb is OFF), 1 AIR LEAK ISOLATED once it is closed.
 * @param hotAir the hot-air valve of the leaking ducts (0 or 1; the forward cargo duct is on the hot-air valve 1)
 */
export function hotAirLeakItems(inputs: BleedLeakAlertInputs, hotAir: number): { show: boolean[]; checked: boolean[] } {
  const valveOpen = inputs.hotAirValveOpen[hotAir];
  return { show: [valveOpen || !inputs.hotAirPbOn[hotAir], !valveOpen], checked: [!inputs.hotAirPbOn[hotAir], false] };
}

/** INOP SYS of the temperature regulation (EcamInopSys) */
const ALL_ZONES_TEMP_REGUL_INOP_SYS = '210300023';
const CKPT_TEMP_REGUL_INOP_SYS = '210300019';
const CAB_PART_TEMP_REGUL_INOP_SYS = '210300020';
const FWD_CRG_TEMP_REGUL_INOP_SYS = '210300018';
/** INFO (EcamInfos) */
const CABIN_TEMP_REGUL_DEGRADED_INFO = '210200001';
const FWD_CRG_TEMP_REGUL_DEGRADED_INFO = '210200003';

/**
 * STATUS INOP SYS of AIR HOT AIR 1(2) LEAK and AIR FWD CARGO DUCT LEAK: ALL ZONES TEMP REGUL with both hot-air valves
 * closed, else CAB PART TEMP REGUL with one closed, with CKPT TEMP REGUL (valve 2 only) or FWD CRG TEMP REGUL (valve 1
 * only); PACK 1(2) while the hot-air valve of the leak stays open.
 */
export function hotAirLeakInopSys(inputs: BleedLeakAlertInputs, hotAir: number): string[] {
  const closed = inputs.hotAirValveOpen.map((open) => !open);
  const codes: string[] = [];
  if (closed[0] && closed[1]) {
    codes.push(ALL_ZONES_TEMP_REGUL_INOP_SYS);
  } else if (closed[0] || closed[1]) {
    codes.push(CAB_PART_TEMP_REGUL_INOP_SYS, closed[1] ? CKPT_TEMP_REGUL_INOP_SYS : FWD_CRG_TEMP_REGUL_INOP_SYS);
  }
  if (!closed[hotAir]) {
    codes.push(PACK_INOP_SYS[hotAir]);
  }
  return codes;
}

/** STATUS INFO of the hot-air leaks: CABIN TEMP REGUL DEGRADED, FWD CRG TEMP REGUL DEGRADED (hot-air valve 1 only closed) */
export function hotAirLeakInfo(inputs: BleedLeakAlertInputs): string[] {
  const valve1OnlyClosed = !inputs.hotAirValveOpen[0] && inputs.hotAirValveOpen[1];
  return valve1OnlyClosed
    ? [CABIN_TEMP_REGUL_DEGRADED_INFO, FWD_CRG_TEMP_REGUL_DEGRADED_INFO]
    : [CABIN_TEMP_REGUL_DEGRADED_INFO];
}

/**
 * The lines of AIR ENG 1(2)(3)(4) BLEED NOT CLOSED: 0 ENG n BLEED OFF, 1 WHEN ENG n STARTED :, 2 ENG n BLEED ON. Once
 * the pb-sw is OFF the alert stays as a reminder to set the bleed back ON.
 */
export function engineBleedNotClosedItems(
  inputs: BleedLeakAlertInputs,
  engine: number,
): { show: boolean[]; checked: boolean[] } {
  const pbOff = !inputs.bleedPbAuto[engine];
  return { show: [true, pbOff, pbOff], checked: [pbOff, false, false] };
}

/** INFO NO BLEED 1(2)(3)(4) AT LO ENG PWR (EcamInfos) */
const NO_BLEED_AT_LO_ENG_PWR_INFO = ['360200001', '360200002', '360200003', '360200004'];

/**
 * The lines of AIR ENG BLEED TEMP LO ON BLEED n: 0 ENG THRUST INCREASE, 1 IF NOT SUCCESSFUL, 2 ENG n BLEED OFF with this
 * bleed only LO TEMP, 3-5 WING A-ICE OFF / ENGs A-ICE / AVOID ICING CONDs with more than one bleed LO TEMP.
 */
export function bleedTempLoItems(
  inputs: BleedLeakAlertInputs,
  engine: number,
  bleedsTempLo: number,
): { show: boolean[]; checked: boolean[] } {
  const severalBleeds = bleedsTempLo > 1;
  return {
    show: [true, true, !severalBleeds, severalBleeds, severalBleeds, severalBleeds],
    checked: [false, false, !inputs.bleedPbAuto[engine], !inputs.wingAntiIceOn, false, false],
  };
}

/**
 * STATUS INOP SYS of AIR ENG BLEED TEMP LO: ENG n BLEED with its pb OFF, PACK 1(2) of the side of the engine set OFF,
 * WING A-ICE set OFF.
 */
function bleedTempLoInopSys(inputs: BleedLeakAlertInputs, engine: number): string[] {
  const pack = engine < 2 ? 0 : 1;
  const codes: string[] = [];
  if (!inputs.bleedPbAuto[engine]) {
    codes.push(ENG_BLEED_INOP_SYS[engine]);
  }
  if (!inputs.packPbOn[pack]) {
    codes.push(PACK_INOP_SYS[pack]);
  }
  if (!inputs.wingAntiIceOn) {
    codes.push(WING_ANTI_ICE_INOP_SYS);
  }
  return codes;
}

/** INOP SYS <duct> LEAK DET (EcamInopSys), in the order of LEAK_DETECTION_ZONES, and AIR LEAK DET (all ducts) */
const LEAK_DET_INOP_SYS = [
  '360300001',
  '360300002',
  '360300003',
  '360300004',
  '360300005',
  '360300006',
  '360300007',
  '360300008',
  '360300009',
  '360300010',
  '360300011',
  '360300012',
  '360300013',
  '360300014',
  '360300015',
];
const ALL_LEAK_DET_INOP_SYS = '360300016';

function allLeakDetectionLost(inputs: BleedLeakAlertInputs): boolean {
  return inputs.leakDetectionLost.every((lost) => lost);
}

/**
 * The lines of AIR LEAK DET FAULT: ON <duct> for each duct whose leak detection is lost. Design choice: no duct line
 * when the leak detection is lost on all the ducts (both systems failed), whose STATUS line is AIR LEAK DET.
 */
export function leakDetFaultItems(inputs: BleedLeakAlertInputs): { show: boolean[]; checked: boolean[] } {
  const allLost = allLeakDetectionLost(inputs);
  return {
    show: inputs.leakDetectionLost.map((lost) => lost && !allLost),
    checked: inputs.leakDetectionLost.map(() => false),
  };
}

/** STATUS INOP SYS of AIR LEAK DET FAULT: <duct> LEAK DET of each affected duct, or AIR LEAK DET for all of them */
export function leakDetFaultInopSys(inputs: BleedLeakAlertInputs): string[] {
  if (allLeakDetectionLost(inputs)) {
    return [ALL_LEAK_DET_INOP_SYS];
  }
  return LEAK_DET_INOP_SYS.filter((_, zone) => inputs.leakDetectionLost[zone]);
}

/** INOP SYS of the crossbleed valves (EcamInopSys), left, center, right */
const XBLEED_INOP_SYS = ['360300017', '360300018', '360300019'];
const ALL_XBLEED_INOP_SYS = '360300020';
const XBLEED_AUTO_CTL_INOP_SYS = ['260300007', '260300009', '260300008'];
const XBLEED_MAN_CTL_ONLY_INFO = '360200005';
const XBLEED_AUTO_CTL_ONLY_INFO = '360200006';

/**
 * The lines of AIR XBLEED FAULT: 0 XBLEED MAN CTL ONLY with the automatic control of a valve lost, 1 XBLEED AUTO with
 * the manual control of a valve lost.
 */
export function xbleedFaultItems(inputs: BleedLeakAlertInputs): { show: boolean[]; checked: boolean[] } {
  return {
    show: [inputs.xbleedAutoControlLost.some((lost) => lost), inputs.xbleedManualControlLost.some((lost) => lost)],
    checked: [false, inputs.xbleedSelectorAuto],
  };
}

/** STATUS INOP SYS of AIR XBLEED FAULT: the failed valves, and the valves without automatic control */
export function xbleedFaultInopSys(inputs: BleedLeakAlertInputs): string[] {
  const failedValves = XBLEED_INOP_SYS.filter((_, valve) => inputs.xbleedAbnormalPosition[valve]);
  return [
    ...(failedValves.length === 3 ? [ALL_XBLEED_INOP_SYS] : failedValves),
    ...XBLEED_AUTO_CTL_INOP_SYS.filter((_, valve) => inputs.xbleedAutoControlLost[valve]),
  ];
}

/** STATUS INFO of AIR XBLEED FAULT: XBLEED MAN CTL ONLY, XBLEED AUTO CTL ONLY */
export function xbleedFaultInfo(inputs: BleedLeakAlertInputs): string[] {
  return [
    ...(inputs.xbleedAutoControlLost.some((lost) => lost) ? [XBLEED_MAN_CTL_ONLY_INFO] : []),
    ...(inputs.xbleedManualControlLost.some((lost) => lost) ? [XBLEED_AUTO_CTL_ONLY_INFO] : []),
  ];
}

/** The alert keys (EcamAbnormalProcedures, ata35-36-42.ts) */
export const BLEED_LEAK_ALERT_KEYS = {
  apuBleedLeak: 361800013,
  bleedLeak: 361800014,
  engineBleedNotClosed: [361800015, 361800016, 361800017, 361800018],
  hpValveNotOpen: [361800019, 361800020, 361800021, 361800022],
  bleedTempLo: [361800023, 361800024, 361800025, 361800026],
  fwdCargoDuctLeak: 361800027,
  hotAirLeak: [361800028, 361800029],
  leakDetFault: 361800030,
  packLeak: [361800031, 361800032],
  xbleedFault: 361800033,
};

/** The flight phases that inhibit each alert */
export const BLEED_LEAK_ALERT_PHASE_INHIBITION = {
  /** APU BLEED LEAK, BLEED NOT CLOSED, FWD CARGO DUCT LEAK, HOT AIR LEAK, PACK LEAK, XBLEED FAULT */
  caution: [3, 4, 5, 6, 7, 9, 10],
  bleedLeak: [5, 6, 10],
  /** HP VLV NOT OPEN, LEAK DET FAULT */
  crewAwareness: [3, 4, 5, 6, 7, 9, 10, 11],
  bleedTempLo: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
};

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param alerts the alert state (FwsCore.bleedLeakAlerts)
 * @returns the entries, by alert key
 */
export function bleedLeakAbnormalItems(alerts: BleedLeakAlerts): { [key: number]: EwdAbnormalItem } {
  const items: { [key: number]: EwdAbnormalItem } = {};
  const keys = BLEED_LEAK_ALERT_KEYS;
  const phases = BLEED_LEAK_ALERT_PHASE_INHIBITION;
  const caution = (
    simVarIsActive: Subject<boolean>,
    lines: () => { show: boolean[]; checked: boolean[] },
  ): Pick<
    EwdAbnormalItem,
    | 'flightPhaseInhib'
    | 'simVarIsActive'
    | 'notActiveWhenItemActive'
    | 'whichItemsToShow'
    | 'whichItemsChecked'
    | 'failure'
    | 'sysPage'
  > => ({
    flightPhaseInhib: phases.caution,
    simVarIsActive,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => lines().show,
    whichItemsChecked: () => lines().checked,
    failure: 2,
    sysPage: SdPages.Bleed,
  });

  items[keys.apuBleedLeak] = {
    ...caution(alerts.apuBleedLeak, () => apuBleedLeakItems(alerts.inputs)),
    inopSysAllPhases: () => apuBleedLeakInopSys(alerts.inputs),
    limitationsAllPhases: () => leakAvoidIcingLimitation(alerts.inputs),
    limitationsPfd: () => leakAvoidIcingLimitation(alerts.inputs),
  };
  items[keys.bleedLeak] = {
    flightPhaseInhib: phases.bleedLeak,
    simVarIsActive: alerts.bleedLeakWithXbleedOpen,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [true],
    whichItemsChecked: () => [!alerts.inputs.xbleedSelectorOpen],
    failure: 3,
    sysPage: SdPages.Bleed,
  };
  keys.engineBleedNotClosed.forEach((key, engine) => {
    items[key] = {
      ...caution(alerts.engineBleedNotClosed[engine], () => engineBleedNotClosedItems(alerts.inputs, engine)),
      inopSysAllPhases: () => [ENG_BLEED_INOP_SYS[engine]],
    };
  });
  keys.hpValveNotOpen.forEach((key, engine) => {
    items[key] = {
      flightPhaseInhib: phases.crewAwareness,
      simVarIsActive: alerts.hpValveNotOpen[engine],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      info: () => [NO_BLEED_AT_LO_ENG_PWR_INFO[engine]],
    };
  });
  keys.bleedTempLo.forEach((key, engine) => {
    items[key] = {
      ...caution(alerts.bleedTempLo[engine], () => bleedTempLoItems(alerts.inputs, engine, alerts.bleedsTempLo())),
      flightPhaseInhib: phases.bleedTempLo,
      inopSysAllPhases: () => bleedTempLoInopSys(alerts.inputs, engine),
      limitationsAllPhases: () => tempLoAvoidIcingLimitation(alerts.bleedsTempLo()),
      limitationsPfd: () => tempLoAvoidIcingLimitation(alerts.bleedsTempLo()),
    };
  });
  items[keys.fwdCargoDuctLeak] = {
    ...caution(alerts.fwdCargoDuctLeak, () => hotAirLeakItems(alerts.inputs, 0)),
    inopSysAllPhases: () => hotAirLeakInopSys(alerts.inputs, 0),
    info: () => hotAirLeakInfo(alerts.inputs),
  };
  keys.hotAirLeak.forEach((key, hotAir) => {
    items[key] = {
      ...caution(alerts.hotAirLeak[hotAir], () => hotAirLeakItems(alerts.inputs, hotAir)),
      inopSysAllPhases: () => hotAirLeakInopSys(alerts.inputs, hotAir),
      info: () => hotAirLeakInfo(alerts.inputs),
    };
  });
  items[keys.leakDetFault] = {
    flightPhaseInhib: phases.crewAwareness,
    simVarIsActive: alerts.leakDetFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => leakDetFaultItems(alerts.inputs).show,
    whichItemsChecked: () => leakDetFaultItems(alerts.inputs).checked,
    failure: 1,
    sysPage: SdPages.Bleed,
    inopSysAllPhases: () => leakDetFaultInopSys(alerts.inputs),
  };
  keys.packLeak.forEach((key, pack) => {
    items[key] = {
      ...caution(alerts.packLeak[pack], () => packLeakItems(alerts.inputs, pack)),
      inopSysAllPhases: () => packLeakInopSys(alerts.inputs, pack),
      limitationsAllPhases: () => leakAvoidIcingLimitation(alerts.inputs),
      limitationsPfd: () => leakAvoidIcingLimitation(alerts.inputs),
    };
  });
  items[keys.xbleedFault] = {
    ...caution(alerts.xbleedFault, () => xbleedFaultItems(alerts.inputs)),
    inopSysAllPhases: () => xbleedFaultInopSys(alerts.inputs),
    info: () => xbleedFaultInfo(alerts.inputs),
  };
  return items;
}
