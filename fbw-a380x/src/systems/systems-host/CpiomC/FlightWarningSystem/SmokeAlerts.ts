// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The SMOKE alerts of the A380X FWS fed by the Smoke Detection Function (SDF) of systems.wasm (fbw-common
 * fire_protection/smoke_detection.rs and cargo_fire_extinguishing.rs, a380_systems fire_and_smoke_protection.rs):
 * L:A32NX_SMOKE_<zone>_DETECTED and L:A32NX_SMOKE_<zone>_DET_FAULT of the cargo compartments and the avionics / IFE
 * bays, L:A32NX_CARGOSMOKE_BOTTLE_<n>_LOW_PRESSURE of the two cargo bottles.
 * SMOKE alerts; the flight phase inhibitions are those of the aircraft procedures. Not fed (no detector modelled): the crew rests, lavatories, CWS / RCC, showers, facilities,
 * SMOKE DET FAULT, SAFETY TEST REQUIRED, and FWD (AFT) / FWD+AFT CARGO BOTTLES FAULT (diverter valve, bottle control).
 */

/** The "crew awareness" DET FAULT cautions */
export const SMOKE_DET_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];

export const SMOKE_WARNING_PHASE_INHIBITION = [4, 5, 6, 9, 10];

/** FWD+AFT CARGOS BTL 1(2) FAULT */
export const CARGO_BOTTLE_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10];

/** A compartment of the SDF: its L:var zone name and its alerts */
export interface SmokeZoneAlerts {
  /** The zone in L:A32NX_SMOKE_<zone>_DETECTED */
  readonly zone: string;
  /** ata26.ts id */
  readonly smokeAlert: string;
  /** ata26.ts id */
  readonly detFaultAlert: string;
  /** EcamInopSys id */
  readonly detFaultInopSys: string;
}

/**
 * The compartments and their alerts. The main and upper avionics bays share the logic of avionicsBaySmokeAlerts().
 * The AFT and BULK cargo compartments share the AFT CARGO SMK DET INOP SYS line (FWD (AFT) CARGO SMK DET).
 */
export const SMOKE_ZONES: SmokeZoneAlerts[] = [
  { zone: 'FWD_CARGO', smokeAlert: '260800045', detFaultAlert: '260800048', detFaultInopSys: '260300043' },
  { zone: 'AFT_CARGO', smokeAlert: '260800046', detFaultAlert: '260800049', detFaultInopSys: '260300044' },
  { zone: 'BULK_CARGO', smokeAlert: '260800047', detFaultAlert: '260800050', detFaultInopSys: '260300044' },
  { zone: 'L_MAIN_AVNCS', smokeAlert: '260800038', detFaultAlert: '260800034', detFaultInopSys: '260300035' },
  { zone: 'R_MAIN_AVNCS', smokeAlert: '260800039', detFaultAlert: '260800035', detFaultInopSys: '260300037' },
  { zone: 'L_UPPER_AVNCS', smokeAlert: '260800040', detFaultAlert: '260800036', detFaultInopSys: '260300036' },
  { zone: 'R_UPPER_AVNCS', smokeAlert: '260800041', detFaultAlert: '260800037', detFaultInopSys: '260300038' },
  { zone: 'AFT_AVNCS', smokeAlert: '260800030', detFaultAlert: '260800029', detFaultInopSys: '260300027' },
  { zone: 'IFE_BAY', smokeAlert: '260800033', detFaultAlert: '260800032', detFaultInopSys: '260300034' },
];

/** STATUS INOP SYS of SMOKE FWD+AFT CARGOS BTL 1(2) FAULT: FWD+AFT CRGs BTL 1(2) */
export const CARGO_BOTTLE_FAULT_INOP_SYS = ['260300045', '260300046'];

/**
 * Main and upper avionics bays: smoke in the upper bay gives SMOKE L(R) UPPER AVNCS SMOKE, whether or not the main bay
 * detects smoke; smoke in the main bay only gives SMOKE L(R) MAIN AVNCS SMOKE.
 * @param mainBaySmoke the SDF detects smoke in the left (right) main avionics bay
 * @param upperBaySmoke the SDF detects smoke in the left (right) upper avionics bay
 * @returns the two warnings of that side
 */
export function avionicsBaySmokeAlerts(
  mainBaySmoke: boolean,
  upperBaySmoke: boolean,
): { mainAvncsSmoke: boolean; upperAvncsSmoke: boolean } {
  return { mainAvncsSmoke: mainBaySmoke && !upperBaySmoke, upperAvncsSmoke: upperBaySmoke };
}

/**
 * The SMOKE warning of each SMOKE_ZONES compartment, from what the SDF detects, with the main / upper avionics bay
 * logic of avionicsBaySmokeAlerts() on each side.
 * @param detected L:A32NX_SMOKE_<zone>_DETECTED of each SMOKE_ZONES compartment
 * @returns the SMOKE warnings, in the SMOKE_ZONES order
 */
export function smokeWarnings(detected: boolean[]): boolean[] {
  const byZone = (zone: string) => detected[SMOKE_ZONES.findIndex((smokeZone) => smokeZone.zone === zone)];
  const left = avionicsBaySmokeAlerts(byZone('L_MAIN_AVNCS'), byZone('L_UPPER_AVNCS'));
  const right = avionicsBaySmokeAlerts(byZone('R_MAIN_AVNCS'), byZone('R_UPPER_AVNCS'));
  return SMOKE_ZONES.map((smokeZone, index) => {
    switch (smokeZone.zone) {
      case 'L_MAIN_AVNCS':
        return left.mainAvncsSmoke;
      case 'L_UPPER_AVNCS':
        return left.upperAvncsSmoke;
      case 'R_MAIN_AVNCS':
        return right.mainAvncsSmoke;
      case 'R_UPPER_AVNCS':
        return right.upperAvncsSmoke;
      default:
        return detected[index];
    }
  });
}

/** The cockpit state that the smoke procedures check */
export interface SmokeProcedureState {
  /** L:A32NX_OVHD_VENT_CAB_FANS_PB_IS_ON */
  readonly cabFansOn: boolean;
  readonly galleyOff: boolean;
  readonly signsOn: boolean;
  readonly oneEngineRunning: boolean;
  /** The FWD (BULK) ISOL VALVES pb is ON, for the compartment of the alert */
  readonly isolValvesPbOn: boolean;
  /** The AGENT TO FWD (AFT) pb was pressed, for the compartment of the alert */
  readonly agentDischarged: boolean;
}

/**
 * SMOKE FWD (AFT/BULK) CARGO SMOKE (ata26.ts 260800045-047): 0 ISOL VALVES OFF, 1 IF CRG CLOSED and 2 AGENT DISCH
 * when all engines are shut down, 3 AGENT DISCH when at least one engine is running, 4 CAB FANS OFF,
 * 5 SIGNS ON, 6 CKPT / CABIN COM ESTABLISH, 7 BEFORE CARGO OPENING : PAX DISEMBARK.
 * @param state the cockpit state
 * @returns which lines are shown
 */
export function cargoSmokeItemsToShow(state: SmokeProcedureState): boolean[] {
  const allEnginesShutDown = !state.oneEngineRunning;
  return [true, allEnginesShutDown, allEnginesShutDown, state.oneEngineRunning, true, true, true, true];
}

/**
 * @param state the cockpit state
 * @returns which lines of SMOKE FWD (AFT/BULK) CARGO SMOKE are done
 */
export function cargoSmokeItemsChecked(state: SmokeProcedureState): boolean[] {
  return [
    !state.isolValvesPbOn,
    false,
    state.agentDischarged,
    state.agentDischarged,
    !state.cabFansOn,
    state.signsOn,
    false,
    false,
  ];
}

/**
 * SMOKE AFT (L(R) MAIN) AVNCS SMOKE: CREW OXY MASKS, CAB FANS OFF, GALLEY OFF, SIGNS ON, CKPT / CABIN COM (and [QRH]
 * SMOKE/FUMES PROC for L(R) MAIN). L(R) UPPER AVNCS SMOKE has NSS MASTER after GALLEY and the IF SMOKE PERSISTS
 * condition before the QRH line.
 * @param state the cockpit state
 * @param upperBay the L(R) UPPER AVNCS SMOKE item list
 * @param qrhLine the list ends with the [QRH] SMOKE/FUMES PROC line (L(R) MAIN)
 * @returns which lines are done
 */
export function avionicsSmokeItemsChecked(state: SmokeProcedureState, upperBay: boolean, qrhLine: boolean): boolean[] {
  if (upperBay) {
    return [false, !state.cabFansOn, state.galleyOff, false, state.signsOn, false, false, false];
  }
  const items = [false, !state.cabFansOn, state.galleyOff, state.signsOn, false];
  return qrhLine ? items.concat(false) : items;
}
