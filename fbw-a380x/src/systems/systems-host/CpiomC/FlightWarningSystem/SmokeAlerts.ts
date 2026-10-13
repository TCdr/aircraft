// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The SMOKE alerts of the A380X FWS fed by the Smoke Detection Function (SDF) of systems.wasm (fbw-common
 * fire_protection/smoke_detection.rs and cargo_fire_extinguishing.rs, a380_systems fire_and_smoke_protection.rs):
 * L:A32NX_SMOKE_<zone>_DETECTED and L:A32NX_SMOKE_<zone>_DET_FAULT of the cargo compartments and the avionics / IFE
 * bays, L:A32NX_CARGOSMOKE_BOTTLE_<n>_LOW_PRESSURE of the two cargo bottles.
 * A380 FCOM PRO-ABN-ECAM-10-26 SMOKE alerts (airbus-a380-fcom PDF p.4982-5007); the flight phase inhibitions are the
 * figures of these pages. SMOKE DET FAULT from L:A32NX_SMOKE_DETECTION_FUNCTION_FAULT (the SDF failure), the cargo
 * smoke TEST pb from L:A32NX_FIRE_TEST_CARGO. Not fed (no detector modelled): the crew rests, lavatories, CWS / RCC,
 * showers, facilities, SAFETY TEST REQUIRED (no 50 h test history), and FWD (AFT) / FWD+AFT CARGO BOTTLES FAULT
 * (diverter valve, bottle control).
 */

/** "Crew awareness" DET FAULT cautions: phases 3 to 7 and 9 to 11 (PDF p.4982, 4990, 4992, 5004) */
export const SMOKE_DET_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];

/** The SMOKE warnings: phases 4 to 6, 9 and 10 (PDF p.4983, 4991, 4993, 4995, 5001) */
export const SMOKE_WARNING_PHASE_INHIBITION = [4, 5, 6, 9, 10];

/** FWD+AFT CARGOS BTL 1(2) FAULT: phases 4 to 7, 9 and 10 (PDF p.5007) */
export const CARGO_BOTTLE_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10];

/** A compartment of the SDF: its L:var zone name and its alerts */
export interface SmokeZoneAlerts {
  /** The zone in L:A32NX_SMOKE_<zone>_DETECTED */
  readonly zone: string;
  /** The SMOKE warning (ata26.ts) */
  readonly smokeAlert: string;
  /** The SMOKE ... DET FAULT caution (ata26.ts) */
  readonly detFaultAlert: string;
  /** STATUS INOP SYS ALL PHASES of the DET FAULT (EcamInopSys) */
  readonly detFaultInopSys: string;
}

/**
 * The compartments and their alerts. The main and upper avionics bays share the logic of avionicsBaySmokeAlerts().
 * The AFT and BULK cargo compartments share the AFT CARGO SMK DET INOP SYS ("FWD (AFT) CARGO SMK DET", PDF p.5005).
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

/** STATUS INOP SYS of SMOKE FWD+AFT CARGOS BTL 1(2) FAULT: FWD+AFT CRGs BTL 1(2) (PDF p.5007) */
export const CARGO_BOTTLE_FAULT_INOP_SYS = ['260300045', '260300046'];

/**
 * MAIN AND UPPER AVIONICS (A380 FCOM DSC-26-50-10, a380_fcom.txt l.53632-53641, PDF p.1792): smoke in the upper bay
 * gives SMOKE L(R) UPPER AVNCS SMOKE, whether or not the main bay detects smoke; smoke in the main bay only gives SMOKE
 * L(R) MAIN AVNCS SMOKE.
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
 * SMOKE FWD (AFT/BULK) CARGO SMOKE (PDF p.5002-5003, ata26.ts 260800045-047): 0 ISOL VALVES OFF, 1 IF CRG CLOSED and
 * 2 AGENT DISCH "When all engines are shut down", 3 AGENT DISCH "When at least one engine running", 4 CAB FANS OFF,
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
 * SMOKE AFT (L(R) MAIN) AVNCS SMOKE (PDF p.4983-4984, 4993-4994): CREW OXY MASKS, CAB FANS OFF, GALLEY OFF, SIGNS ON,
 * CKPT / CABIN COM (and [QRH] SMOKE/FUMES PROC for L(R) MAIN). L(R) UPPER AVNCS SMOKE (PDF p.4995-4996) has NSS MASTER
 * after GALLEY and the IF SMOKE PERSISTS condition before the QRH line.
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

/*
 * SMOKE DET FAULT (A380 FCOM PRO-ABN-ECAM-10-26, a380_fcom.txt l.143733-143783, airbus-a380-fcom PDF p.4988-4989):
 * "The Smoke Detection Function (SDF) is failed." (l.143741), SC and MASTER CAUT. "Smoke detection is lost in: The
 * avionics compartments (including IFE Center and NSS), The cargo compartments, The cabin areas." (l.143758-143761): the
 * SDF of systems.wasm then reports no smoke and no detector fault in any compartment.
 */

/** SMOKE DET FAULT: flight phases 3 to 7, 9 and 10 (PDF p.4988) */
export const SDF_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** The SMOKE DET FAULT alert (ata26.ts) */
export const SDF_FAULT_ALERT = '260800031';

/**
 * STATUS INOP SYS ALL PHASES of SMOKE DET FAULT (l.143773-143779): ALL SMOKE DET, FWD CRG VENT, FWD CGR TEMP REGUL, BULK
 * CRG VENT, BULK CRG HEATER
 */
export const SDF_FAULT_INOP_SYS = ['260300029', '260300030', '260300031', '260300032', '260300033'];

/** The cockpit state that SMOKE DET FAULT checks */
export interface SdfFaultProcedureState {
  /** L:A32NX_ENTERTAINMENT_IFEC_OFF */
  readonly ifecOff: boolean;
  readonly fwdIsolValvesPbOn: boolean;
  readonly bulkIsolValvesPbOn: boolean;
}

/**
 * The lines of SMOKE DET FAULT (ata26.ts 260800031): 0 IFEC OFF, 1 CWS OFF, 2 IF NO LIVESTOCK, 3 FWD ISOL VALVES OFF,
 * 4 BULK ISOL VALVES OFF, 5 BULK CARGO HEAT OFF. The FCOM procedure (l.143763-143768) has no CWS line: it is not shown.
 */
export const SDF_FAULT_ITEMS_TO_SHOW = [true, false, true, true, true, true];

/**
 * @param state the cockpit state
 * @returns which lines of SMOKE DET FAULT are done (the BULK CARGO HEATER pb is not read)
 */
export function sdfFaultItemsChecked(state: SdfFaultProcedureState): boolean[] {
  return [state.ifecOff, false, false, !state.fwdIsolValvesPbOn, !state.bulkIsolValvesPbOn, false];
}

/*
 * The cargo smoke TEST pb (A380 FCOM DSC-26-60-20 Test pb, a380_fcom.txt l.53960-53973): "When pressed for at least
 * three seconds, and until released, tests the operation of the cargo compartments fire detection and extinguishing
 * system: The continuous repetitive chime sounds, The MASTER WARN lights flash, The ECAM displays the cargo compartments
 * SMOKE and AVNCS SMOKE warnings".
 */

/** The compartments that the cargo smoke TEST shows smoke in: the cargo compartments and the avionics bays (not IFE) */
export const CARGO_SMOKE_TEST_ZONES = [
  'FWD_CARGO',
  'AFT_CARGO',
  'BULK_CARGO',
  'L_MAIN_AVNCS',
  'R_MAIN_AVNCS',
  'L_UPPER_AVNCS',
  'R_UPPER_AVNCS',
  'AFT_AVNCS',
];

/** The 3 s hold of the cargo smoke TEST pb */
export class CargoSmokeTest {
  /** "When pressed for at least three seconds" (l.53962) */
  public static readonly HOLD_S = 3;

  private heldS = 0;

  /**
   * @param testPbPressed the TEST pb is pressed (L:A32NX_FIRE_TEST_CARGO)
   * @param deltaTimeMs the time since the last update, in milliseconds
   * @returns whether the test runs: pressed for at least 3 s, until released
   */
  public update(testPbPressed: boolean, deltaTimeMs: number): boolean {
    this.heldS = testPbPressed ? this.heldS + deltaTimeMs / 1000 : 0;
    return testPbPressed && this.heldS >= CargoSmokeTest.HOLD_S;
  }
}

/**
 * The SMOKE warnings with the cargo smoke TEST: the test shows smoke in every CARGO_SMOKE_TEST_ZONES compartment, through
 * the main / upper avionics bay logic of smokeWarnings() (so L(R) UPPER AVNCS SMOKE, not MAIN). Design choice: a failed
 * SDF (SMOKE DET FAULT) cannot run the test.
 * @param detected L:A32NX_SMOKE_<zone>_DETECTED of each SMOKE_ZONES compartment
 * @param testActive the cargo smoke TEST runs (CargoSmokeTest)
 * @param sdfFailed the SDF is failed
 * @returns the SMOKE warnings, in the SMOKE_ZONES order
 */
export function smokeWarningsWithTest(detected: boolean[], testActive: boolean, sdfFailed: boolean): boolean[] {
  const testing = testActive && !sdfFailed;
  return smokeWarnings(
    detected.map((smoke, index) => smoke || (testing && CARGO_SMOKE_TEST_ZONES.includes(SMOKE_ZONES[index].zone))),
  );
}
