// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { CabPrStatusCodes } from './AirConditioningAlerts';
import { CondStatusCodes, StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem, cautionItem } from './FwcAlertItem';

/*
 * The avionics and AFT cargo ventilation alerts of the A320 FWC:
 * - VENT AVNCS SYS FAULT: the power up test is not satisfactory, or the AEVC is not supplied, or the valve position
 *   disagrees with the commanded position; crew awareness; STATUS INOP SYS AVNCS VENT (VENT BLOWER and VENT EXTRACT
 *   only with the AEVC not supplied).
 * - VENT BLOWER FAULT: the blowing pressure is low or there is a duct overheat; without DC ESS BUS FAULT: BLOWER OVRD;
 *   with DC ESS BUS FAULT: LAND ASAP; STATUS INOP SYS VENT BLOWER.
 * - VENT EXTRACT FAULT: the extract pressure is low; EXTRACT OVRD; STATUS INOP SYS VENT EXTRACT.
 * - VENT SKIN VALVE FAULT (the standard of MSN 05829-09063): the extract valve is fully open in phase 3 or in flight,
 *   or the inlet valve is not fully closed in flight. Inlet valve: crew awareness. Extract valve: BLOWER OVRD, EXTRACT
 *   OVRD, IF UNSUCCESSFUL: MAX FL 100/MEA-MORA, CAB PR MODE SEL MAN, MAN V/S CTL FULL UP. STATUS: MAX FL 100/MEA-MORA,
 *   MAN CAB PR CTL, TGT V/S CLIMB 500 / DESC 300 FT/MIN, the A/C FL - CAB ALT TGT table; INOP SYS AVNCS VALVE.
 * - AIR AFT CRG VENT FAULT: the aft cargo ventilation fan is failed; crew awareness; STATUS INOP SYS AFT CRG VENT (the
 *   AFT CRG HEAT line is left out: the FBW A320 has no cargo heating).
 * - COND AFT CRG ISOL VALVE: the aft cargo isolation valve disagrees with the selected position; crew awareness;
 *   STATUS INOP SYS AFT CRG VENT.
 *
 * The A32NX has no avionics ventilation model and no aft cargo extraction fan: those alerts are fed by flyPad
 * failures (A320Failure 21020-21025) that stand for the conditions the AEVC and the cargo
 * ventilation controller monitor. The aft cargo isolation valves are modelled by systems.wasm (a320_systems
 * cargo_ventilation.rs, with the AFT ISOL VALVE pb-sw and the flyPad failure 21026 valves stuck closed): COND AFT CRG
 * ISOL VALVE reads its valve disagreement, the same signal as the FAULT light of the pb-sw. Not simulated: the AEVC
 * not supplied case (no supply bus is documented) and the valve disagree case of VENT AVNCS SYS FAULT, the duct
 * overheat of VENT BLOWER FAULT, the FAULT lights of the BLOWER and EXTRACT pbs.
 *
 * Design choices:
 * - The isolation valves are commanded open with the AFT ISOL VALVE pb-sw in AUTO and no AFT cargo smoke (the
 *   controller closes the valves and stops the extraction fan with the pb-sw OFF or smoke detected). The extraction
 *   fan runs only with the valves fully open, so a failed fan is only detected then.
 * - A stuck valve does not close on the BLOWER and EXTRACT OVRD closure signals: once both pbs are at OVRD the IF
 *   UNSUCCESSFUL part of VENT SKIN VALVE FAULT is shown. The extract case is a caution with a procedure (level 2), the
 *   inlet only case is crew awareness (level 1): two items with the same title.
 * - Crew awareness alerts without procedure are level 1, the others level 2.
 */

/** The flight phase inhibitions */
const VENTILATION_PHASE_INHIBITION = {
  avncsSysFault: [3, 4, 5, 6, 7, 8, 9],
  blowerFault: [3, 4, 5, 7, 8],
  extractFault: [3, 4, 5, 7, 8],
  /** Phase 3 is not inhibited: the alert covers the extract valve fully open in phase 3 */
  skinValveFault: [4, 5, 7, 8],
  aftCargoVentFault: [3, 4, 5, 7, 8],
  aftCargoIsolValve: [3, 4, 5, 7, 8],
};

/** The alert keys, the first digits of their EwdMessages codes */
export const VENT_AVNCS_SYS_FAULT_KEY = '2140010';
export const VENT_BLOWER_FAULT_KEY = '2140020';
export const VENT_EXTRACT_FAULT_KEY = '2140030';
/** VENT SKIN VALVE FAULT with the extract valve affected (level 2, procedure) */
export const VENT_SKIN_VALVE_FAULT_EXTRACT_KEY = '2140040';
/** VENT SKIN VALVE FAULT with only the inlet valve affected (level 1, crew awareness) */
export const VENT_SKIN_VALVE_FAULT_INLET_KEY = '2140050';
export const AIR_AFT_CRG_VENT_FAULT_KEY = '2150010';
export const COND_AFT_CRG_ISOL_VALVE_KEY = '2150020';

/** STATUS INOP SYS codes (StatusMessages) */
const VentilationStatusCodes = {
  avncsVent: '210300014',
  ventBlower: '210300015',
  ventExtract: '210300016',
  avncsValve: '210300017',
  aftCrgVent: '210300018',
} as const;

const S = VentilationStatusCodes;

/** The data of the alerts */
export interface VentilationAlertInputs {
  /** The flyPad failures */
  aevcFailed: boolean;
  blowerFanFailed: boolean;
  extractFanFailed: boolean;
  skinExtractValveStuckOpen: boolean;
  skinInletValveStuckOpen: boolean;
  aftCargoFanFailed: boolean;
  /** The AFT ISOL VALVE pb-sw is in AUTO (L:A32NX_OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_IS_AUTO) */
  aftIsolValvePbAuto: boolean;
  /** Both AFT cargo isolation valves are open (L:A32NX_CARGO_VENT_AFT_INLET(OUTLET)_ISOL_VALVE_IS_OPEN) */
  aftCargoIsolValvesOpen: boolean;
  /**
   * An AFT cargo isolation valve disagrees with its commanded position: the FAULT light of the AFT ISOL VALVE pb-sw
   * (L:A32NX_OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_HAS_FAULT)
   */
  aftCargoIsolValvesDisagree: boolean;
  /** The BLOWER and EXTRACT pbs are at AUTO (L:A32NX_VENTILATION_BLOWER_TOGGLE, _EXTRACT_TOGGLE) */
  blowerPbAuto: boolean;
  extractPbAuto: boolean;
  /** ELEC DC ESS BUS FAULT is active */
  dcEssBusFault: boolean;
  /** The AFT cargo smoke detection unit detects smoke */
  aftCargoSmoke: boolean;
  /** The FWC flight phase (1 to 10) */
  flightPhase: number;
  onGround: boolean;
}

/** The alerts that are triggered */
export interface VentilationAlertStates {
  avncsSysFault: boolean;
  blowerFault: boolean;
  extractFault: boolean;
  skinValveFaultExtract: boolean;
  skinValveFaultInlet: boolean;
  aftCargoVentFault: boolean;
  aftCargoIsolValve: boolean;
}

/** The AFT cargo isolation valves are commanded open: AFT ISOL VALVE pb-sw in AUTO and no AFT cargo smoke */
export function aftCargoIsolValvesCommandedOpen(inputs: VentilationAlertInputs): boolean {
  return inputs.aftIsolValvePbAuto && !inputs.aftCargoSmoke;
}

/** Which ventilation alerts are triggered */
export function ventilationAlerts(inputs: VentilationAlertInputs): VentilationAlertStates {
  const inFlight = !inputs.onGround;
  // The extract valve is fully open in phase 3 or in flight; the inlet valve is not fully closed in flight
  const extractValveOpenFault = inputs.skinExtractValveStuckOpen && (inputs.flightPhase === 3 || inFlight);
  const inletValveOpenFault = inputs.skinInletValveStuckOpen && inFlight;
  const isolValvesFullyOpen = aftCargoIsolValvesCommandedOpen(inputs) && inputs.aftCargoIsolValvesOpen;
  return {
    avncsSysFault: inputs.aevcFailed,
    blowerFault: inputs.blowerFanFailed,
    extractFault: inputs.extractFanFailed,
    skinValveFaultExtract: extractValveOpenFault,
    skinValveFaultInlet: inletValveOpenFault && !extractValveOpenFault,
    // the extraction fan runs (and its failure is seen) only with the isolation valves fully open
    aftCargoVentFault: inputs.aftCargoFanFailed && isolValvesFullyOpen,
    // the valve disagreement of the systems.wasm model (the FAULT light of the AFT ISOL VALVE pb-sw)
    aftCargoIsolValve: inputs.aftCargoIsolValvesDisagree,
  };
}

/** VENT BLOWER FAULT: 0 title, 1 -BLOWER OVRD (If NO DC ESS BUS FAULT, until the pb is at OVRD) */
export function blowerFaultLines(inputs: VentilationAlertInputs): number[] {
  return [0, ...(!inputs.dcEssBusFault && inputs.blowerPbAuto ? [1] : [])];
}

/** VENT BLOWER FAULT with ELEC DC ESS BUS FAULT: LAND ASAP (the amber memo) */
export function blowerFaultLandAsap(inputs: VentilationAlertInputs): boolean {
  return ventilationAlerts(inputs).blowerFault && inputs.dcEssBusFault;
}

/** VENT EXTRACT FAULT: 0 title, 1 -EXTRACT OVRD (until the pb is at OVRD) */
export function extractFaultLines(inputs: VentilationAlertInputs): number[] {
  return [0, ...(inputs.extractPbAuto ? [1] : [])];
}

/**
 * VENT SKIN VALVE FAULT, extract valve affected: 0 title, 1 -BLOWER OVRD, 2 -EXTRACT OVRD (each until its pb is at
 * OVRD), then with both pbs at OVRD and the valve still open: 3 .IF UNSUCCESSFUL, 4 MAX FL 100/MEA-MORA, 5 -CAB PR MODE
 * SEL MAN (until MAN), 6 -MAN V/S CTL FULL UP.
 */
export function skinValveFaultExtractLines(inputs: VentilationAlertInputs, pressurizationAuto: boolean): number[] {
  const overrideDone = !inputs.blowerPbAuto && !inputs.extractPbAuto;
  return [
    0,
    ...(inputs.blowerPbAuto ? [1] : []),
    ...(inputs.extractPbAuto ? [2] : []),
    ...(overrideDone ? [3, 4, ...(pressurizationAuto ? [5] : []), 6] : []),
  ];
}

/** The STATUS lines */
const ventilationStatus = {
  /** VENT AVNCS SYS FAULT: INOP SYS AVNCS VENT (the AEVC is supplied: no VENT BLOWER and VENT EXTRACT) */
  avncsSysFault: (): StatusLines => ({ left: [], inopSys: [S.avncsVent] }),
  /** VENT BLOWER FAULT: INOP SYS VENT BLOWER */
  blowerFault: (): StatusLines => ({ left: [], inopSys: [S.ventBlower] }),
  /** VENT EXTRACT FAULT: INOP SYS VENT EXTRACT */
  extractFault: (): StatusLines => ({ left: [], inopSys: [S.ventExtract] }),
  /** VENT SKIN VALVE FAULT, extract valve: MAX FL, the manual pressurization schedule, AVNCS VALVE */
  skinValveFaultExtract: (): StatusLines => ({
    left: [
      CondStatusCodes.maxFl100,
      CabPrStatusCodes.manCabPrCtl,
      CabPrStatusCodes.climbTargetVs,
      CabPrStatusCodes.descentTargetVs,
      CabPrStatusCodes.cabAltTargetHeader,
      ...CabPrStatusCodes.cabAltTargetRows,
    ],
    inopSys: [S.avncsValve],
  }),
  /** VENT SKIN VALVE FAULT, inlet valve only: INOP SYS AVNCS VALVE */
  skinValveFaultInlet: (): StatusLines => ({ left: [], inopSys: [S.avncsValve] }),
  /** AIR AFT CRG VENT FAULT and COND AFT CRG ISOL VALVE: INOP SYS AFT CRG VENT */
  aftCargoVent: (): StatusLines => ({ left: [], inopSys: [S.aftCrgVent] }),
};

/** The part of the failures consumer the alerts use */
export type VentilationFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** The failures the alerts read, in the order they are registered */
export const VENTILATION_FAILURES = [
  A320Failure.AvionicsVentilationController,
  A320Failure.AvionicsBlowerFan,
  A320Failure.AvionicsExtractFan,
  A320Failure.AvionicsSkinExtractValveStuckOpen,
  A320Failure.AvionicsSkinInletValveStuckOpen,
  A320Failure.AftCargoExtractionFan,
];

/** The inputs of the alerts that are not flyPad failures */
export type VentilationSystemInputs = Omit<
  VentilationAlertInputs,
  | 'aevcFailed'
  | 'blowerFanFailed'
  | 'extractFanFailed'
  | 'skinExtractValveStuckOpen'
  | 'skinInletValveStuckOpen'
  | 'aftCargoFanFailed'
>;

/** The ventilation alerts: reads the failures, gives the items the PseudoFWC adds */
export class VentilationAlerts {
  private inputs: VentilationAlertInputs | null = null;

  private pressurizationAuto = true;

  private readonly active = {
    avncsSysFault: Subject.create(false),
    blowerFault: Subject.create(false),
    extractFault: Subject.create(false),
    skinValveFaultExtract: Subject.create(false),
    skinValveFaultInlet: Subject.create(false),
    aftCargoVentFault: Subject.create(false),
    aftCargoIsolValve: Subject.create(false),
  };

  /** VENT BLOWER FAULT with DC ESS BUS FAULT: the amber LAND ASAP memo */
  public landAsap = false;

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: VentilationFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    for (const failure of VENTILATION_FAILURES) {
      this.failuresConsumer.register(failure);
    }
  }

  /**
   * @param system the pbs, the DC ESS BUS FAULT, the AFT cargo smoke and the flight phase
   * @param pressurizationAuto the CAB PR MODE SEL pb is at AUTO
   */
  update(system: VentilationSystemInputs, pressurizationAuto: boolean): void {
    this.failuresConsumer.update();
    const failed = (failure: number) => this.failuresConsumer.isActive(failure);
    const inputs: VentilationAlertInputs = {
      ...system,
      aevcFailed: failed(A320Failure.AvionicsVentilationController),
      blowerFanFailed: failed(A320Failure.AvionicsBlowerFan),
      extractFanFailed: failed(A320Failure.AvionicsExtractFan),
      skinExtractValveStuckOpen: failed(A320Failure.AvionicsSkinExtractValveStuckOpen),
      skinInletValveStuckOpen: failed(A320Failure.AvionicsSkinInletValveStuckOpen),
      aftCargoFanFailed: failed(A320Failure.AftCargoExtractionFan),
    };
    this.inputs = inputs;
    this.pressurizationAuto = pressurizationAuto;
    const states = ventilationAlerts(inputs);
    for (const name of Object.keys(this.active) as (keyof VentilationAlertStates)[]) {
      this.active[name].set(states[name]);
    }
    this.landAsap = blowerFaultLandAsap(inputs);
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [VENT_AVNCS_SYS_FAULT_KEY]: awarenessItem(
      VENT_AVNCS_SYS_FAULT_KEY,
      1,
      this.active.avncsSysFault,
      VENTILATION_PHASE_INHIBITION.avncsSysFault,
      () => [0],
      ventilationStatus.avncsSysFault,
    ),
    [VENT_BLOWER_FAULT_KEY]: cautionItem(
      VENT_BLOWER_FAULT_KEY,
      2,
      this.active.blowerFault,
      VENTILATION_PHASE_INHIBITION.blowerFault,
      () => (this.inputs ? blowerFaultLines(this.inputs) : [0]),
      EcamSysPage.NONE,
      ventilationStatus.blowerFault,
    ),
    [VENT_EXTRACT_FAULT_KEY]: cautionItem(
      VENT_EXTRACT_FAULT_KEY,
      2,
      this.active.extractFault,
      VENTILATION_PHASE_INHIBITION.extractFault,
      () => (this.inputs ? extractFaultLines(this.inputs) : [0]),
      EcamSysPage.NONE,
      ventilationStatus.extractFault,
    ),
    [VENT_SKIN_VALVE_FAULT_EXTRACT_KEY]: cautionItem(
      VENT_SKIN_VALVE_FAULT_EXTRACT_KEY,
      7,
      this.active.skinValveFaultExtract,
      VENTILATION_PHASE_INHIBITION.skinValveFault,
      () => (this.inputs ? skinValveFaultExtractLines(this.inputs, this.pressurizationAuto) : [0]),
      EcamSysPage.NONE,
      ventilationStatus.skinValveFaultExtract,
    ),
    [VENT_SKIN_VALVE_FAULT_INLET_KEY]: awarenessItem(
      VENT_SKIN_VALVE_FAULT_INLET_KEY,
      1,
      this.active.skinValveFaultInlet,
      VENTILATION_PHASE_INHIBITION.skinValveFault,
      () => [0],
      ventilationStatus.skinValveFaultInlet,
    ),
    [AIR_AFT_CRG_VENT_FAULT_KEY]: awarenessItem(
      AIR_AFT_CRG_VENT_FAULT_KEY,
      1,
      this.active.aftCargoVentFault,
      VENTILATION_PHASE_INHIBITION.aftCargoVentFault,
      () => [0],
      ventilationStatus.aftCargoVent,
    ),
    [COND_AFT_CRG_ISOL_VALVE_KEY]: awarenessItem(
      COND_AFT_CRG_ISOL_VALVE_KEY,
      1,
      this.active.aftCargoIsolValve,
      VENTILATION_PHASE_INHIBITION.aftCargoIsolValve,
      () => [0],
      ventilationStatus.aftCargoVent,
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

/**
 * The pbs, the AFT cargo smoke and the AFT cargo isolation valves (systems.wasm) read from their L:vars.
 * @param dcEssBusFault ELEC DC ESS BUS FAULT is active
 * @param flightPhase the FWC flight phase
 * @param onGround the aircraft is on the ground
 */
export function readVentilationSystemInputs(
  dcEssBusFault: boolean,
  flightPhase: number,
  onGround: boolean,
): VentilationSystemInputs {
  return {
    blowerPbAuto: SimVar.GetSimVarValue('L:A32NX_VENTILATION_BLOWER_TOGGLE', 'bool') > 0,
    extractPbAuto: SimVar.GetSimVarValue('L:A32NX_VENTILATION_EXTRACT_TOGGLE', 'bool') > 0,
    dcEssBusFault,
    aftCargoSmoke: SimVar.GetSimVarValue('L:A32NX_SMOKE_AFT_CARGO_DETECTED', 'bool') > 0,
    aftIsolValvePbAuto: SimVar.GetSimVarValue('L:A32NX_OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_IS_AUTO', 'bool') > 0,
    aftCargoIsolValvesOpen:
      SimVar.GetSimVarValue('L:A32NX_CARGO_VENT_AFT_INLET_ISOL_VALVE_IS_OPEN', 'bool') > 0 &&
      SimVar.GetSimVarValue('L:A32NX_CARGO_VENT_AFT_OUTLET_ISOL_VALVE_IS_OPEN', 'bool') > 0,
    aftCargoIsolValvesDisagree:
      SimVar.GetSimVarValue('L:A32NX_OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_HAS_FAULT', 'bool') > 0,
    flightPhase,
    onGround,
  };
}
