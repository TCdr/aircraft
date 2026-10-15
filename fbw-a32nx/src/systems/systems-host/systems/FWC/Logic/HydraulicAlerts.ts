// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/*
 * The HYD cautions and warnings of the A320 FWC with their procedure and STATUS lines (A320 FCOM PRO-ABN-HYD,
 * a320_fcom.txt l.86976-88880), except RAT FAULT (PseudoFWC). The triggers come from the Rust hydraulic system
 * (a320_systems hydraulic/mod.rs and the common hydraulic/mod.rs):
 * - the system section pressure switches L:A32NX_HYD_{GREEN,BLUE,YELLOW}_SYSTEM_1_SECTION_PRESSURE_SWITCH (1450 PSI,
 *   1750 PSI to reset, factories.rs MIN_PRESS_PRESSURISED_*: the FCOM SYS LO PR thresholds, l.88257-88258), read by
 *   PseudoFWC into its *SysAbnormalLowPressure subjects (which also give twoHydraulicsOut);
 * - the pump low pressure discretes L:A32NX_HYD_{GREEN,YELLOW}_EDPUMP_LOW_PRESS (pump section below 1740 PSI, 2200 PSI
 *   to reset, the FCOM 1750/2200 PSI of l.87320-87321) and L:A32NX_HYD_{BLUE,YELLOW}_EPUMP_LOW_PRESS (1450/1750 PSI,
 *   l.86986-86987, l.87693-87694); they are only set while the pump is commanded (pb AUTO/ON);
 * - the reservoir switches L:A32NX_HYD_{color}_RESERVOIR_LEVEL_IS_LOW, _AIR_PRESSURE_IS_LOW (22/25 PSI, l.87074) and
 *   _OVHT, and the electric pump overheat L:A32NX_HYD_{BLUE,YELLOW}_EPUMP_OVHT;
 * - the PTU: L:A32NX_HYD_PTU_SHAFT_RPM and the G and Y system pressures.
 *
 * The flight phase inhibition figures, the alert levels and the title colours are images that the FCOM text dump drops:
 * the values in PseudoFWC are general Airbus knowledge [GK], marked there as design choices, except the two notes that
 * the text keeps (phase 3 only for the ELEC PUMP OVHT, l.86992 and l.87703; G(Y) RSVR LO LVL inhibited for the first
 * 15 s of phase 5, l.87528 and l.88044).
 *
 * Not modelled (design choices): the SECONDARY FAILURES lines (*F/CTL, *WHEEL), the option lines of the STATUS (STEEP
 * APPR, GLS AUTOLAND), the A321 lines and the "If sys lost by RSVR LO AIR PR / RSVR OVHT" recovery lines of the dual
 * failures STATUS. The ALTN LAW lines of the dual failures (G+B, G+Y) are the F/CTL ALTN LAW alert's (PseudoFWC,
 * FlightControlLawAlerts altnLawLines).
 */

/** The state of one hydraulic system */
export interface HydSystemInputs {
  /**
   * The system pressure is abnormally low: system pressure switch below 1450 PSI while the system should be pressurised
   * (PseudoFWC *SysAbnormalLowPressure: an engine running, or in flight). These are the inputs of twoHydraulicsOut too.
   */
  readonly lowPressure: boolean;
  /** L:A32NX_HYD_{color}_RESERVOIR_LEVEL_IS_LOW */
  readonly reservoirLowLevel: boolean;
  /** L:A32NX_HYD_{color}_RESERVOIR_AIR_PRESSURE_IS_LOW */
  readonly reservoirLowAirPressure: boolean;
  /** L:A32NX_HYD_{color}_RESERVOIR_OVHT */
  readonly reservoirOverheat: boolean;
}

/** The inputs of the HYD alerts */
export interface HydraulicInputs {
  readonly green: HydSystemInputs;
  readonly blue: HydSystemInputs;
  readonly yellow: HydSystemInputs;
  /** L:A32NX_HYD_GREEN_EDPUMP_LOW_PRESS: ENG 1 pump commanded and its section below 1750 PSI */
  readonly greenEnginePumpLowPressure: boolean;
  /** L:A32NX_HYD_YELLOW_EDPUMP_LOW_PRESS: ENG 2 pump commanded and its section below 1750 PSI */
  readonly yellowEnginePumpLowPressure: boolean;
  /** L:A32NX_HYD_BLUE_EPUMP_LOW_PRESS: blue electric pump commanded and its outlet below 1450 PSI */
  readonly blueElecPumpLowPressure: boolean;
  /** L:A32NX_HYD_YELLOW_EPUMP_LOW_PRESS: yellow electric pump commanded and the yellow system below 1450 PSI */
  readonly yellowElecPumpLowPressure: boolean;
  /** L:A32NX_HYD_BLUE_EPUMP_OVHT */
  readonly blueElecPumpOverheat: boolean;
  /** L:A32NX_HYD_YELLOW_EPUMP_OVHT */
  readonly yellowElecPumpOverheat: boolean;
  /** L:A32NX_HYD_GREEN_PUMP_1_SECTION_PRESSURE_SWITCH is false: the ENG 1 pump delivers no pressure */
  readonly greenEnginePumpSectionLow: boolean;
  /** L:A32NX_HYD_YELLOW_PUMP_1_SECTION_PRESSURE_SWITCH is false: the ENG 2 pump delivers no pressure */
  readonly yellowEnginePumpSectionLow: boolean;
  /** The GREEN ENG 1 PUMP pb is at AUTO */
  readonly greenEnginePumpPbAuto: boolean;
  /** The YELLOW ENG 2 PUMP pb is at AUTO */
  readonly yellowEnginePumpPbAuto: boolean;
  /** The BLUE ELEC PUMP pb is at AUTO */
  readonly blueElecPumpPbAuto: boolean;
  /** The YELLOW ELEC PUMP pb is ON */
  readonly yellowElecPumpPbOn: boolean;
  /** The PTU pb is at AUTO */
  readonly ptuPbAuto: boolean;
  /** L:A32NX_HYD_PTU_SHAFT_RPM (absolute value) */
  readonly ptuShaftRpm: number;
  /** L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE, PSI */
  readonly greenPressurePsi: number;
  /** L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE, PSI */
  readonly yellowPressurePsi: number;
  /** Engine 1 core at or above minimum idle */
  readonly engine1Running: boolean;
  /** Engine 2 core at or above minimum idle */
  readonly engine2Running: boolean;
  /** ENG MASTER 1 is ON */
  readonly engine1MasterOn: boolean;
  /** ENG MASTER 2 is ON */
  readonly engine2MasterOn: boolean;
  readonly onGround: boolean;
  /** The RAT is stowed */
  readonly ratStowed: boolean;
}

/** The HYD alerts of this module */
export interface HydraulicAlertConditions {
  blueElecPumpLoPr: boolean;
  blueElecPumpOvht: boolean;
  yellowElecPumpLoPr: boolean;
  yellowElecPumpOvht: boolean;
  greenEngPumpLoPr: boolean;
  yellowEngPumpLoPr: boolean;
  blueRsvrLoAirPr: boolean;
  greenRsvrLoAirPr: boolean;
  yellowRsvrLoAirPr: boolean;
  blueRsvrLoLvl: boolean;
  greenRsvrLoLvl: boolean;
  yellowRsvrLoLvl: boolean;
  blueRsvrOvht: boolean;
  greenRsvrOvht: boolean;
  yellowRsvrOvht: boolean;
  blueSysLoPr: boolean;
  greenSysLoPr: boolean;
  yellowSysLoPr: boolean;
  blueYellowSysLoPr: boolean;
  greenBlueSysLoPr: boolean;
  greenYellowSysLoPr: boolean;
  ptuFault: boolean;
}

export type HydraulicAlert = keyof HydraulicAlertConditions;

/** The pump low pressure alerts, which stay on when the crew switches the pump off (see pumpLowPressureTriggers) */
export interface PumpLowPressureState {
  blueElecPumpLoPr: boolean;
  yellowElecPumpLoPr: boolean;
  greenEngPumpLoPr: boolean;
  yellowEngPumpLoPr: boolean;
}

/** l.88800-88801: on ground, the PTU does not run with more than 650 PSI between the G and Y systems */
export const PTU_FAULT_DIFFERENTIAL_PRESSURE_PSI = 650;

/** Design choice: below this shaft speed the PTU is taken as not running (it runs at some thousand RPM) */
export const PTU_STOPPED_RPM = 200;

/**
 * The pump LO PR triggers. Rust sets the low pressure discretes only while the pump is commanded, so they go when the
 * crew does the "pump ... OFF" action: the trigger is kept until the pb is set back to AUTO (ON), as the ECAM keeps the
 * alert and shows "x SYS LO PR" after the action (FCOM DSC-31-25-20 ECAM sequence example, a320_fcom.txt l.46444-46445).
 *
 * - ENG 1(2) PUMP LO PR: "The pump pressure is low (inhibited on the ground, when the engine is stopped)" (DSC-29-20
 *   FAULT light, l.43801-43802). Design choice: also not with the ENG MASTER OFF, the ENG 1(2) SHUT DOWN STATUS lists
 *   G ENG 1 (Y ENG 2) PUMP (FWC/Logic/EngineFailAlerts).
 * - B ELEC PUMP LO PR: the Rust discrete already has the conditions of the pump (AUTO, AC powered, in flight or an
 *   engine running, DSC-29-20 l.43815-43819); the kept trigger ends on ground with both engines stopped.
 * - Y ELEC PUMP LO PR: "the yellow system pressure < 1450 PSI with Y ELEC PUMP pb at ON, Y ENG PUMP and PTU not
 *   available" (l.87693-87697): the Rust discrete (pump commanded, yellow system below 1450 PSI). The kept trigger ends
 *   when the yellow system is pressurised again.
 * @param inputs the hydraulic state
 * @param previous the triggers of the last update
 * @returns the triggers
 */
export function pumpLowPressureTriggers(inputs: HydraulicInputs, previous: PumpLowPressureState): PumpLowPressureState {
  const engine1PumpMonitored = inputs.engine1MasterOn && (inputs.engine1Running || !inputs.onGround);
  const engine2PumpMonitored = inputs.engine2MasterOn && (inputs.engine2Running || !inputs.onGround);
  const blueElecPumpMonitored = !inputs.onGround || inputs.engine1Running || inputs.engine2Running;
  return {
    blueElecPumpLoPr:
      inputs.blueElecPumpLowPressure ||
      (previous.blueElecPumpLoPr && !inputs.blueElecPumpPbAuto && blueElecPumpMonitored),
    yellowElecPumpLoPr:
      inputs.yellowElecPumpLowPressure ||
      (previous.yellowElecPumpLoPr && !inputs.yellowElecPumpPbOn && inputs.yellow.lowPressure),
    greenEngPumpLoPr:
      engine1PumpMonitored &&
      (inputs.greenEnginePumpLowPressure || (previous.greenEngPumpLoPr && !inputs.greenEnginePumpPbAuto)),
    yellowEngPumpLoPr:
      engine2PumpMonitored &&
      (inputs.yellowEnginePumpLowPressure || (previous.yellowEngPumpLoPr && !inputs.yellowEnginePumpPbAuto)),
  };
}

/**
 * HYD PTU FAULT (l.88798-88804): "On ground, PTU does not run if the differential pressure is higher than 650 PSI
 * between G and Y system, or in flight, PTU at AUTO position does not run when G or Y reservoir level is low, and G or Y
 * system pressure is low."
 * Design choice: on ground the PTU is expected to run with the PTU pb at AUTO and both ENG MASTERs ON (with one master
 * ON and the parking brake set it is inhibited on purpose for the first engine start, DSC-29-20 l.43857 and
 * a320_systems hydraulic/mod.rs A320PowerTransferUnitController). The note l.88810-88812 (last engine started within
 * 40 s of a cargo door operation) is this case. The in-flight part is taken as written.
 * @param inputs the hydraulic state
 * @returns the PTU FAULT trigger
 */
export function ptuFaultTrigger(inputs: HydraulicInputs): boolean {
  if (!inputs.ptuPbAuto) {
    return false;
  }
  if (inputs.onGround) {
    return (
      inputs.engine1MasterOn &&
      inputs.engine2MasterOn &&
      Math.abs(inputs.greenPressurePsi - inputs.yellowPressurePsi) > PTU_FAULT_DIFFERENTIAL_PRESSURE_PSI &&
      inputs.ptuShaftRpm < PTU_STOPPED_RPM
    );
  }
  return (
    (inputs.green.reservoirLowLevel || inputs.yellow.reservoirLowLevel) &&
    (inputs.green.lowPressure || inputs.yellow.lowPressure)
  );
}

/**
 * The triggers of all the HYD alerts, before their confirmation time and before the priorities between them.
 * @param inputs the hydraulic state
 * @param pumps the pump LO PR triggers (pumpLowPressureTriggers)
 * @returns the triggers
 */
export function hydraulicAlertTriggers(inputs: HydraulicInputs, pumps: PumpLowPressureState): HydraulicAlertConditions {
  const { green, blue, yellow } = inputs;
  return {
    ...pumps,
    // l.86988, l.87699: "This alert triggers when the blue (yellow) electric pump overheats."
    blueElecPumpOvht: inputs.blueElecPumpOverheat,
    yellowElecPumpOvht: inputs.yellowElecPumpOverheat,
    // l.87074-87075, l.87427-87428, l.87927-87928: reservoir air pressure below 22 PSI (25 PSI to reset)
    blueRsvrLoAirPr: blue.reservoirLowAirPressure,
    greenRsvrLoAirPr: green.reservoirLowAirPressure,
    yellowRsvrLoAirPr: yellow.reservoirLowAirPressure,
    // l.87164, l.87524, l.88040: fluid quantity below 2.4 l (blue), 3.5 l (green, yellow)
    blueRsvrLoLvl: blue.reservoirLowLevel,
    greenRsvrLoLvl: green.reservoirLowLevel,
    yellowRsvrLoLvl: yellow.reservoirLowLevel,
    // l.87237, l.87605, l.88150: fluid temperature above 93 degC (88 degC to reset)
    blueRsvrOvht: blue.reservoirOverheat,
    greenRsvrOvht: green.reservoirOverheat,
    yellowRsvrOvht: yellow.reservoirOverheat,
    // FCOM DSC-31-15 HYD G(Y)(B) SYS LO PR (A), l.46044: the system pressure below 1450 PSI (1750 PSI to reset)
    blueSysLoPr: blue.lowPressure,
    greenSysLoPr: green.lowPressure,
    yellowSysLoPr: yellow.lowPressure,
    // l.88257-88258, l.88438-88439, l.88625-88626: both systems below 1450 PSI
    blueYellowSysLoPr: blue.lowPressure && yellow.lowPressure,
    greenBlueSysLoPr: green.lowPressure && blue.lowPressure,
    greenYellowSysLoPr: green.lowPressure && yellow.lowPressure,
    ptuFault: ptuFaultTrigger(inputs),
  };
}

/**
 * The alerts shown, from the confirmed triggers: the priorities between the HYD alerts.
 *
 * - A dual SYS LO PR warning replaces the alerts of its two systems: its procedure covers the causes ("If blue sys lost
 *   by ELEC PUMP LO PR", "If sys lost by RSVR LO AIR PR", "If sys lost by RSVR OVHT", l.88286, l.88344, l.88353) and
 *   sends back to the single failure procedure when a system recovers (l.88304-88306, l.88483-88485, l.88666-88668).
 *   Design choice: with the three systems low, one dual warning only, G+Y first, then G+B (the FCOM has no triple
 *   failure); the third system keeps its single alerts.
 * - x SYS LO PR is the associated procedure of the reservoir and pump alerts of its system ("ASSOCIATED PROCEDURES: B
 *   SYS LO PR", l.87000-87002; "The second part of the message on the E/WD changes to B SYS LO PR", l.46445): it is shown
 *   as a line of these alerts, and alone only without them.
 * - The G(Y) reservoir procedures include the ENG 1(2) PUMP LO PR line (l.87438, l.87534, l.87613, l.87961, l.88073,
 *   l.88181): the pump LO PR alert is not shown with a reservoir alert of its system. Design choice: the same for the
 *   B ELEC PUMP LO PR (the blue reservoir procedures turn the pump off).
 * - ELEC PUMP LO PR and ELEC PUMP OVHT are one procedure ("LO PR or OVHT", l.86976, l.87683): OVHT is shown.
 * @param confirmed the confirmed triggers
 * @returns the alerts to show
 */
export function shownHydraulicAlerts(confirmed: HydraulicAlertConditions): HydraulicAlertConditions {
  const greenYellowSysLoPr = confirmed.greenYellowSysLoPr;
  const greenBlueSysLoPr = confirmed.greenBlueSysLoPr && !greenYellowSysLoPr;
  const blueYellowSysLoPr = confirmed.blueYellowSysLoPr && !greenYellowSysLoPr && !greenBlueSysLoPr;
  const greenInDual = greenYellowSysLoPr || greenBlueSysLoPr;
  const blueInDual = greenBlueSysLoPr || blueYellowSysLoPr;
  const yellowInDual = greenYellowSysLoPr || blueYellowSysLoPr;

  const blueRsvrLoAirPr = confirmed.blueRsvrLoAirPr && !blueInDual;
  const greenRsvrLoAirPr = confirmed.greenRsvrLoAirPr && !greenInDual;
  const yellowRsvrLoAirPr = confirmed.yellowRsvrLoAirPr && !yellowInDual;
  const blueRsvrLoLvl = confirmed.blueRsvrLoLvl && !blueInDual;
  const greenRsvrLoLvl = confirmed.greenRsvrLoLvl && !greenInDual;
  const yellowRsvrLoLvl = confirmed.yellowRsvrLoLvl && !yellowInDual;
  const blueRsvrOvht = confirmed.blueRsvrOvht && !blueInDual;
  const greenRsvrOvht = confirmed.greenRsvrOvht && !greenInDual;
  const yellowRsvrOvht = confirmed.yellowRsvrOvht && !yellowInDual;
  const blueReservoirAlert = blueRsvrLoAirPr || blueRsvrLoLvl || blueRsvrOvht;
  const greenReservoirAlert = greenRsvrLoAirPr || greenRsvrLoLvl || greenRsvrOvht;
  const yellowReservoirAlert = yellowRsvrLoAirPr || yellowRsvrLoLvl || yellowRsvrOvht;

  const blueElecPumpOvht = confirmed.blueElecPumpOvht && !blueInDual;
  const blueElecPumpLoPr = confirmed.blueElecPumpLoPr && !blueElecPumpOvht && !blueReservoirAlert && !blueInDual;
  const yellowElecPumpOvht = confirmed.yellowElecPumpOvht && !yellowInDual;
  const yellowElecPumpLoPr = confirmed.yellowElecPumpLoPr && !yellowElecPumpOvht && !yellowInDual;
  const greenEngPumpLoPr = confirmed.greenEngPumpLoPr && !greenReservoirAlert && !greenInDual;
  const yellowEngPumpLoPr = confirmed.yellowEngPumpLoPr && !yellowReservoirAlert && !yellowInDual;

  return {
    blueElecPumpLoPr,
    blueElecPumpOvht,
    yellowElecPumpLoPr,
    yellowElecPumpOvht,
    greenEngPumpLoPr,
    yellowEngPumpLoPr,
    blueRsvrLoAirPr,
    greenRsvrLoAirPr,
    yellowRsvrLoAirPr,
    blueRsvrLoLvl,
    greenRsvrLoLvl,
    yellowRsvrLoLvl,
    blueRsvrOvht,
    greenRsvrOvht,
    yellowRsvrOvht,
    blueSysLoPr: confirmed.blueSysLoPr && !blueInDual && !blueReservoirAlert && !blueElecPumpLoPr && !blueElecPumpOvht,
    greenSysLoPr: confirmed.greenSysLoPr && !greenInDual && !greenReservoirAlert && !greenEngPumpLoPr,
    yellowSysLoPr:
      confirmed.yellowSysLoPr &&
      !yellowInDual &&
      !yellowReservoirAlert &&
      !yellowEngPumpLoPr &&
      !yellowElecPumpLoPr &&
      !yellowElecPumpOvht,
    blueYellowSysLoPr,
    greenBlueSysLoPr,
    greenYellowSysLoPr,
    ptuFault: confirmed.ptuFault,
  };
}

/**
 * The confirmation times, s. Design choices (the FCOM gives none): 5 s for the pressure alerts, so that the pressure
 * build-up of a pump started with its engine (the blue electric pump starts when an engine reaches idle) gives no alert,
 * and for the PTU FAULT on ground, which must not come while the PTU starts to run in the second engine start; none for
 * the reservoir and overheat switches, which have their own hysteresis.
 */
export const HYDRAULIC_ALERT_CONFIRM_SECONDS: Record<HydraulicAlert, number> = {
  blueElecPumpLoPr: 5,
  blueElecPumpOvht: 0,
  yellowElecPumpLoPr: 5,
  yellowElecPumpOvht: 0,
  greenEngPumpLoPr: 5,
  yellowEngPumpLoPr: 5,
  blueRsvrLoAirPr: 0,
  greenRsvrLoAirPr: 0,
  yellowRsvrLoAirPr: 0,
  blueRsvrLoLvl: 0,
  greenRsvrLoLvl: 0,
  yellowRsvrLoLvl: 0,
  blueRsvrOvht: 0,
  greenRsvrOvht: 0,
  yellowRsvrOvht: 0,
  blueSysLoPr: 5,
  greenSysLoPr: 5,
  yellowSysLoPr: 5,
  blueYellowSysLoPr: 5,
  greenBlueSysLoPr: 5,
  greenYellowSysLoPr: 5,
  ptuFault: 5,
};

const HYDRAULIC_ALERTS = Object.keys(HYDRAULIC_ALERT_CONFIRM_SECONDS) as HydraulicAlert[];

/** l.87528, l.88044: "The HYD G (Y) RSVR LO LVL alert is inhibited for the first 15 s of flight phase 5." */
export const RSVR_LO_LVL_PHASE_5_INHIBITION_SECONDS = 15;

/** The hydraulic state with all systems normal, before the first update */
const NORMAL_SYSTEM: HydSystemInputs = {
  lowPressure: false,
  reservoirLowLevel: false,
  reservoirLowAirPressure: false,
  reservoirOverheat: false,
};

export const NORMAL_HYDRAULIC_INPUTS: HydraulicInputs = {
  green: NORMAL_SYSTEM,
  blue: NORMAL_SYSTEM,
  yellow: NORMAL_SYSTEM,
  greenEnginePumpLowPressure: false,
  yellowEnginePumpLowPressure: false,
  blueElecPumpLowPressure: false,
  yellowElecPumpLowPressure: false,
  blueElecPumpOverheat: false,
  yellowElecPumpOverheat: false,
  greenEnginePumpSectionLow: false,
  yellowEnginePumpSectionLow: false,
  greenEnginePumpPbAuto: true,
  yellowEnginePumpPbAuto: true,
  blueElecPumpPbAuto: true,
  yellowElecPumpPbOn: false,
  ptuPbAuto: true,
  ptuShaftRpm: 0,
  greenPressurePsi: 3000,
  yellowPressurePsi: 3000,
  engine1Running: true,
  engine2Running: true,
  engine1MasterOn: true,
  engine2MasterOn: true,
  onGround: false,
  ratStowed: true,
};

/** The HYD alerts after their confirmation time and their priorities, as the subjects of the PseudoFWC alert table */
export class HydraulicAlertMonitor {
  private readonly conditionSeconds = new Map<HydraulicAlert, number>(HYDRAULIC_ALERTS.map((alert) => [alert, 0]));

  private pumpTriggers: PumpLowPressureState = {
    blueElecPumpLoPr: false,
    yellowElecPumpLoPr: false,
    greenEngPumpLoPr: false,
    yellowEngPumpLoPr: false,
  };

  private flightPhase5Seconds = 0;

  /**
   * The alerts shown, by name. Built with reduce: the sim's Coherent GT runtime has no Object.fromEntries (ES2019),
   * which threw here and stopped the whole systems host (no FWC, all DUs black).
   */
  public readonly alerts = HYDRAULIC_ALERTS.reduce(
    (subjects, alert) => {
      subjects[alert] = Subject.create(false);
      return subjects;
    },
    {} as Record<HydraulicAlert, Subject<boolean>>,
  );

  /** The last hydraulic state, for the procedure and STATUS lines */
  public inputs: HydraulicInputs = NORMAL_HYDRAULIC_INPUTS;

  /**
   * @param inputs the hydraulic state
   * @param flightPhase the FWC flight phase
   * @param deltaTimeSeconds the time since the last update
   */
  public update(inputs: HydraulicInputs, flightPhase: number, deltaTimeSeconds: number): void {
    this.inputs = inputs;
    this.flightPhase5Seconds = flightPhase === 5 ? this.flightPhase5Seconds + deltaTimeSeconds : 0;
    this.pumpTriggers = pumpLowPressureTriggers(inputs, this.pumpTriggers);

    const triggers = hydraulicAlertTriggers(inputs, this.pumpTriggers);
    const confirmed = { ...triggers };
    for (const alert of HYDRAULIC_ALERTS) {
      const seconds = triggers[alert] ? this.conditionSeconds.get(alert)! + deltaTimeSeconds : 0;
      this.conditionSeconds.set(alert, seconds);
      confirmed[alert] = triggers[alert] && seconds >= HYDRAULIC_ALERT_CONFIRM_SECONDS[alert];
    }

    const shown = shownHydraulicAlerts(confirmed);
    const lowLevelPhase5Inhibited =
      flightPhase === 5 && this.flightPhase5Seconds < RSVR_LO_LVL_PHASE_5_INHIBITION_SECONDS;
    shown.greenRsvrLoLvl = shown.greenRsvrLoLvl && !lowLevelPhase5Inhibited;
    shown.yellowRsvrLoLvl = shown.yellowRsvrLoLvl && !lowLevelPhase5Inhibited;
    for (const alert of HYDRAULIC_ALERTS) {
      this.alerts[alert].set(shown[alert]);
    }
  }

  /** The pump LO PR triggers, for the "If ... sys lost by ... PUMP LO PR" lines of the dual failures */
  public get pumpLowPressure(): PumpLowPressureState {
    return this.pumpTriggers;
  }

  /** LAND ASAP (red) of the dual SYS LO PR warnings (l.88281, l.88462, l.88646) */
  public get landAsapRed(): boolean {
    return (
      this.alerts.blueYellowSysLoPr.get() || this.alerts.greenBlueSysLoPr.get() || this.alerts.greenYellowSysLoPr.get()
    );
  }
}

/*
 * The procedure lines, by index in the codes of each alert (EwdMessages 29001xxxx). The action lines of actions done
 * go; "x SYS LO PR" with FUEL CONSUMPT INCRSD / FMS PRED UNRELIABLE (the associated procedure) shows once the system
 * pressure is low; "x ENG n PUMP LO PR" once the pump delivers no pressure.
 */

/** The line index when shown, else null */
const lineIf = (shown: boolean, index: number): number | null => (shown ? index : null);

/** HYD B ELEC PUMP LO PR / OVHT, l.86996-87004: 0 title, 1 -BLUE ELEC PUMP OFF, 2 B SYS LO PR, 3 FUEL, 4 FMS */
export function blueElecPumpLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.blue.lowPressure;
  return [0, lineIf(inputs.blueElecPumpPbAuto, 1), lineIf(sysLoPr, 2), lineIf(sysLoPr, 3), lineIf(sysLoPr, 4)];
}

/**
 * HYD Y ELEC PUMP LO PR / OVHT, l.87721-87737: 0 title, 1 -YELLOW ELEC PUMP OFF, 2 Y SYS LO PR, 3 BRK Y ACCU PR
 * MONITOR, 4 FUEL, 5 FMS
 */
export function yellowElecPumpLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.yellow.lowPressure;
  return [
    0,
    lineIf(inputs.yellowElecPumpPbOn, 1),
    lineIf(sysLoPr, 2),
    lineIf(sysLoPr, 3),
    lineIf(sysLoPr, 4),
    lineIf(sysLoPr, 5),
  ];
}

/**
 * HYD G ENG 1 PUMP LO PR (l.87327, PTU operative; l.87365-87368, PTU inoperative): 0 title, 1 -GREEN ENG 1 PUMP OFF,
 * 2 G SYS LO PR. The PTU inoperative variant is the one with the green system lost.
 */
export function greenEnginePumpLines(inputs: HydraulicInputs): (number | null)[] {
  return [0, lineIf(inputs.greenEnginePumpPbAuto, 1), lineIf(inputs.green.lowPressure, 2)];
}

/** HYD Y ENG 2 PUMP LO PR (l.87818; l.87856-87859): 0 title, 1 -YELLOW ENG 2 PUMP OFF, 2 Y SYS LO PR */
export function yellowEnginePumpLines(inputs: HydraulicInputs): (number | null)[] {
  return [0, lineIf(inputs.yellowEnginePumpPbAuto, 1), lineIf(inputs.yellow.lowPressure, 2)];
}

/**
 * HYD B RSVR LO AIR PR, l.87083-87090: 0 title, 1 .IF PRESS FLUCTUATES:, 2 -BLUE ELEC PUMP OFF, 3 B SYS LO PR, 4 FUEL,
 * 5 FMS
 */
export function blueReservoirLowAirPressureLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.blue.lowPressure;
  return [
    0,
    lineIf(inputs.blueElecPumpPbAuto, 1),
    lineIf(inputs.blueElecPumpPbAuto, 2),
    lineIf(sysLoPr, 3),
    lineIf(sysLoPr, 4),
    lineIf(sysLoPr, 5),
  ];
}

/**
 * HYD G RSVR LO AIR PR, l.87434-87444: 0 title, 1 .IF PRESS FLUCTUATES:, 2 -PTU OFF, 3 -GREEN ENG 1 PUMP OFF,
 * 4 G ENG 1 PUMP LO PR, 5 G SYS LO PR, 6 FUEL, 7 FMS
 */
export function greenReservoirLowAirPressureLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.green.lowPressure;
  return [
    0,
    lineIf(inputs.ptuPbAuto || inputs.greenEnginePumpPbAuto, 1),
    lineIf(inputs.ptuPbAuto, 2),
    lineIf(inputs.greenEnginePumpPbAuto, 3),
    lineIf(inputs.greenEnginePumpSectionLow, 4),
    lineIf(sysLoPr, 5),
    lineIf(sysLoPr, 6),
    lineIf(sysLoPr, 7),
  ];
}

/**
 * HYD Y RSVR LO AIR PR, l.87948-87967: 0 title, 1 .IF PRESS FLUCTUATES:, 2 -PTU OFF, 3 -YELLOW ENG 2 PUMP OFF,
 * 4 -YELLOW ELEC PUMP OFF, 5 BRK Y ACCU PR MONITOR, 6 Y ENG 2 PUMP LO PR, 7 Y SYS LO PR, 8 FUEL, 9 FMS.
 * Design choice: BRK Y ACCU PR MONITOR (a check for the loss of the system and of the accumulator by a pipe rupture,
 * l.87955-87959) once the yellow system pressure is low.
 */
export function yellowReservoirLowAirPressureLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.yellow.lowPressure;
  return [
    0,
    lineIf(inputs.ptuPbAuto || inputs.yellowEnginePumpPbAuto || inputs.yellowElecPumpPbOn, 1),
    lineIf(inputs.ptuPbAuto, 2),
    lineIf(inputs.yellowEnginePumpPbAuto, 3),
    lineIf(inputs.yellowElecPumpPbOn, 4),
    lineIf(sysLoPr, 5),
    lineIf(inputs.yellowEnginePumpSectionLow, 6),
    lineIf(sysLoPr, 7),
    lineIf(sysLoPr, 8),
    lineIf(sysLoPr, 9),
  ];
}

/** HYD B RSVR LO LVL, l.87170-87175: 0 title, 1 -BLUE ELEC PUMP OFF, 2 B SYS LO PR, 3 FUEL, 4 FMS */
export function blueReservoirLowLevelLines(inputs: HydraulicInputs): (number | null)[] {
  return blueElecPumpLines(inputs);
}

/**
 * HYD G RSVR LO LVL (l.87532-87540) and HYD G RSVR OVHT (l.87611-87619): 0 title, 1 -PTU OFF, 2 -GREEN ENG 1 PUMP OFF,
 * 3 G ENG 1 PUMP LO PR, 4 G SYS LO PR, 5 FUEL, 6 FMS
 */
export function greenReservoirLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.green.lowPressure;
  return [
    0,
    lineIf(inputs.ptuPbAuto, 1),
    lineIf(inputs.greenEnginePumpPbAuto, 2),
    lineIf(inputs.greenEnginePumpSectionLow, 3),
    lineIf(sysLoPr, 4),
    lineIf(sysLoPr, 5),
    lineIf(sysLoPr, 6),
  ];
}

/**
 * HYD Y RSVR LO LVL (l.88062-88079) and HYD Y RSVR OVHT (l.88170-88187): 0 title, 1 -PTU OFF, 2 -YELLOW ENG 2 PUMP
 * OFF, 3 -YELLOW ELEC PUMP OFF, 4 BRK Y ACCU PR MONITOR, 5 Y ENG 2 PUMP LO PR, 6 Y SYS LO PR, 7 FUEL, 8 FMS
 */
export function yellowReservoirLines(inputs: HydraulicInputs): (number | null)[] {
  const sysLoPr = inputs.yellow.lowPressure;
  return [
    0,
    lineIf(inputs.ptuPbAuto, 1),
    lineIf(inputs.yellowEnginePumpPbAuto, 2),
    lineIf(inputs.yellowElecPumpPbOn, 3),
    lineIf(sysLoPr, 4),
    lineIf(inputs.yellowEnginePumpSectionLow, 5),
    lineIf(sysLoPr, 6),
    lineIf(sysLoPr, 7),
    lineIf(sysLoPr, 8),
  ];
}

/** HYD B RSVR OVHT, l.87243-87248: 0 title, 1 -BLUE ELEC PUMP OFF, 2 B SYS LO PR, 3 FUEL, 4 FMS */
export function blueReservoirOverheatLines(inputs: HydraulicInputs): (number | null)[] {
  return blueElecPumpLines(inputs);
}

/**
 * HYD PTU FAULT, l.88814-88815: 0 title, 1 -PTU OFF ("If green or yellow reservoir low level and system low press").
 * The condition is the in-flight trigger.
 */
export function ptuFaultLines(inputs: HydraulicInputs): (number | null)[] {
  const lowLevelAndLowPressure =
    (inputs.green.reservoirLowLevel && inputs.green.lowPressure) ||
    (inputs.yellow.reservoirLowLevel && inputs.yellow.lowPressure);
  return [0, lineIf(inputs.ptuPbAuto && lowLevelAndLowPressure, 1)];
}

/** The yellow system is lost by the ENG 2 pump: no yellow reservoir fault, the ENG 2 pump delivers no pressure */
const yellowLostByEnginePump = (inputs: HydraulicInputs, pumps: PumpLowPressureState): boolean =>
  !inputs.yellow.reservoirLowLevel &&
  !inputs.yellow.reservoirLowAirPressure &&
  !inputs.yellow.reservoirOverheat &&
  (pumps.yellowEngPumpLoPr || inputs.yellowEnginePumpSectionLow);

/** The blue system is lost by the electric pump: no blue reservoir fault, B ELEC PUMP LO PR */
const blueLostByElecPump = (inputs: HydraulicInputs, pumps: PumpLowPressureState): boolean =>
  !inputs.blue.reservoirLowLevel &&
  !inputs.blue.reservoirLowAirPressure &&
  !inputs.blue.reservoirOverheat &&
  pumps.blueElecPumpLoPr;

/**
 * HYD B+Y SYS LO PR, l.88281-88302 (LAND ASAP is the special line): 0 title, 1 -YELLOW ELEC PUMP ON ("If yellow sys lost
 * by ENG 2 PUMP LO PR"), 2 -RAT MAN ON, 3 MIN RAT SPD 140 KT ("If blue sys lost by ELEC PUMP LO PR"), 4 -AFFECTED PUMPS
 * OFF, 5 MAX SPEED 320/.77, 6 MANEUVER WITH CARE, 7 FOR GA: MAX PITCH 15 DEG, 8 FUEL, 9 FMS.
 * Design choice: AFFECTED PUMPS OFF until the BLUE ELEC PUMP and the YELLOW ENG 2 PUMP pbs are off.
 */
export function blueYellowSysLoPrLines(inputs: HydraulicInputs, pumps: PumpLowPressureState): (number | null)[] {
  const blueByElecPump = blueLostByElecPump(inputs, pumps);
  return [
    0,
    lineIf(yellowLostByEnginePump(inputs, pumps) && !inputs.yellowElecPumpPbOn, 1),
    lineIf(blueByElecPump && inputs.ratStowed, 2),
    lineIf(blueByElecPump, 3),
    lineIf(inputs.blueElecPumpPbAuto || inputs.yellowEnginePumpPbAuto, 4),
    5,
    6,
    7,
    8,
    9,
  ];
}

/**
 * HYD G+B SYS LO PR, l.88462-88472: 0 title, 1 -RAT MAN ON, 2 MIN RAT SPD 140 KT ("If blue sys lost by ELEC PUMP LO
 * PR"), 3 -AFFECTED PUMPS OFF, 4 MANEUVER WITH CARE, 5 FOR GA: MAX PITCH 15 DEG, 6 FUEL, 7 FMS
 */
export function greenBlueSysLoPrLines(inputs: HydraulicInputs, pumps: PumpLowPressureState): (number | null)[] {
  const blueByElecPump = blueLostByElecPump(inputs, pumps);
  return [
    0,
    lineIf(blueByElecPump && inputs.ratStowed, 1),
    lineIf(blueByElecPump, 2),
    lineIf(inputs.greenEnginePumpPbAuto || inputs.blueElecPumpPbAuto, 3),
    4,
    5,
    6,
    7,
  ];
}

/**
 * HYD G+Y SYS LO PR, l.88646-88656: 0 title, 1 -PTU OFF, 2 -AFFECTED PUMPS OFF, 3 -YELLOW ELEC PUMP ON ("If yellow sys
 * lost by ENG 2 PUMP LO PR"), 4 MANEUVER WITH CARE, 5 FUEL, 6 FMS
 */
export function greenYellowSysLoPrLines(inputs: HydraulicInputs, pumps: PumpLowPressureState): (number | null)[] {
  return [
    0,
    lineIf(inputs.ptuPbAuto, 1),
    lineIf(inputs.greenEnginePumpPbAuto || inputs.yellowEnginePumpPbAuto, 2),
    lineIf(yellowLostByEnginePump(inputs, pumps) && !inputs.yellowElecPumpPbOn, 3),
    4,
    5,
    6,
  ];
}

/** StatusMessages codes of the HYD alerts */
export const HYD_STATUS = {
  // Limitations, procedures and conditions (left column)
  minRatSpd: '290400001',
  maxSpeed320: '290400002',
  maxBrkPr1000: '290400003',
  maneuverWithCare: '290400004',
  spdBrkDoNotUse: '290400005',
  forGaMaxPitch15: '290400006',
  apprProcHydLoPr: '290500001',
  apprProcDualHydLoPr: '290500002',
  ifBlueOvhtOut: '290500003',
  blueElecPumpAuto: '290400007',
  ifGreenOvhtOut: '290500004',
  greenEngPumpOn: '290400008',
  ifYellowOvhtOut: '290500005',
  yellowEngPumpOn: '290400009',
  ptuAuto: '290400010',
  ifSysNotRecovered: '290500006',
  ifHydNotRecovered: '290500007',
  athrOff: '290400011',
  forLdgUseFlap3: '290400012',
  gpwsLdgFlap3On: '290400013',
  gpwsFlapModeOff: '290400014',
  whenSpd200: '290500008',
  whenConf3AndVapp: '290500009',
  lgGrvtyExtn: '290400015',
  apprSpdVref25: '290400016',
  ldgDistProc: '290400017',
  fuelConsumptIncrsd: '290400018',
  fmsPredUnreliable: '290400019',
  // Information (left column)
  brkYAccuPrOnly: '290200001',
  altnYBrkWithASkid: '290200002',
  slatsFlapsSlow: '290200003',
  slatsSlow: '290200004',
  flapsSlow: '290200005',
  cat3SingleOnly: '220200001',
  // INOP SYS (right column)
  greenHyd: '290300010',
  blueHyd: '290300011',
  yellowHyd: '290300012',
  blueYellowHyd: '290300013',
  greenBlueHyd: '290300014',
  greenYellowHyd: '290300015',
  fctlProt: '290300016',
  stabilizer: '290300017',
  lElev: '290300018',
  rElev: '290300019',
  lrAil: '290300020',
  splr15: '290300021',
  splr3: '290300022',
  splr24: '290300023',
  splr234: '290300024',
  splr135: '290300025',
  splr1245: '290300026',
  spdBrk: '290300027',
  slats: '290300028',
  flaps: '290300029',
  cat3Dual: '290300030',
  ap12: '290300031',
  antiSkid: '290300032',
  autoBrk: '290300033',
  normBrk: '290300034',
  nwStrg: '290300035',
  lgRetract: '290300036',
  cargoDoor: '290300037',
  reverser1: '290300038',
  reverser2: '290300039',
  reverser12: '290300040',
  emerGen: '290300041',
  ptu: '290300042',
  gEng1Pump: '290300001',
  bElecPump: '290300043',
  yEng2Pump: '290300002',
  yElecPump: '290300044',
  yawDamper: '290300045',
  yawDamper1: '290300046',
  yawDamper2: '290300047',
  cat2: '290300048',
  rat: '290300049',
} as const;

const S = HYD_STATUS;

export interface HydAlertStatus {
  left: string[];
  inopSys: string[];
}

/** The STATUS of a lost blue system (l.87201-87208): LDG DIST PROC, FUEL, FMS, SLATS SLOW, CAT 3 SINGLE ONLY */
const BLUE_LOST: HydAlertStatus = {
  left: [S.ldgDistProc, S.fuelConsumptIncrsd, S.fmsPredUnreliable, S.slatsSlow, S.cat3SingleOnly],
  inopSys: [S.blueHyd, S.splr3, S.cat3Dual, S.bElecPump],
};

/** The STATUS of a lost green system (l.87567-87577) */
const GREEN_LOST: HydAlertStatus = {
  left: [
    S.lgGrvtyExtn,
    S.ldgDistProc,
    S.fuelConsumptIncrsd,
    S.fmsPredUnreliable,
    S.altnYBrkWithASkid,
    S.slatsFlapsSlow,
    S.cat3SingleOnly,
  ],
  inopSys: [S.greenHyd, S.splr15, S.cat3Dual, S.autoBrk, S.normBrk, S.lgRetract, S.reverser1, S.yawDamper1],
};

/** The STATUS of a lost yellow system (l.88105-88113) */
const YELLOW_LOST: HydAlertStatus = {
  left: [S.ldgDistProc, S.fuelConsumptIncrsd, S.fmsPredUnreliable, S.flapsSlow, S.cat3SingleOnly],
  inopSys: [S.yellowHyd, S.splr24, S.cat3Dual, S.nwStrg, S.reverser2, S.yawDamper2],
};

const withLines = (status: HydAlertStatus, left: string[], inopSys: string[] = []): HydAlertStatus => ({
  left: [...left, ...status.left],
  inopSys: [...status.inopSys, ...inopSys],
});

/** The STATUS of the HYD alerts. The line order of the page is the order of the StatusMessages codes. */
export const hydraulicStatus = {
  /** HYD B ELEC PUMP LO PR (l.87030-87046), without the "IF BLUE OVHT OUT" lines of the overheat */
  blueElecPumpLoPr: (): HydAlertStatus => BLUE_LOST,
  /** HYD B ELEC PUMP OVHT (l.87030-87046) */
  blueElecPumpOvht: (): HydAlertStatus =>
    withLines(BLUE_LOST, [S.apprProcHydLoPr, S.ifBlueOvhtOut, S.blueElecPumpAuto]),
  /** HYD B RSVR LO AIR PR (l.87116-87136) */
  blueRsvrLoAirPr: (): HydAlertStatus =>
    withLines(BLUE_LOST, [S.apprProcHydLoPr, S.blueElecPumpAuto, S.ifSysNotRecovered]),
  /** HYD B RSVR LO LVL (l.87201-87209), with EMER GEN */
  blueRsvrLoLvl: (): HydAlertStatus => withLines(BLUE_LOST, [], [S.emerGen]),
  /** HYD B RSVR OVHT (l.87274-87291) */
  blueRsvrOvht: (): HydAlertStatus =>
    withLines(BLUE_LOST, [S.apprProcHydLoPr, S.ifBlueOvhtOut, S.blueElecPumpAuto, S.ifSysNotRecovered]),
  /** HYD G ENG 1 PUMP LO PR: PTU operative l.87333-87335, PTU inoperative (green lost) l.87394-87405 */
  greenEngPumpLoPr: (greenLost: boolean): HydAlertStatus =>
    greenLost
      ? {
          left: [S.lgGrvtyExtn, S.ldgDistProc, S.slatsFlapsSlow, S.cat3SingleOnly],
          inopSys: [...GREEN_LOST.inopSys, S.ptu, S.gEng1Pump],
        }
      : { left: [], inopSys: [S.gEng1Pump] },
  /** HYD G RSVR LO AIR PR (l.87471-87496) */
  greenRsvrLoAirPr: (): HydAlertStatus =>
    withLines(GREEN_LOST, [S.apprProcHydLoPr, S.greenEngPumpOn, S.ifHydNotRecovered]),
  /** HYD G RSVR LO LVL (l.87567-87577) */
  greenRsvrLoLvl: (): HydAlertStatus => GREEN_LOST,
  /** HYD G RSVR OVHT (l.87646-87665) */
  greenRsvrOvht: (): HydAlertStatus =>
    withLines(GREEN_LOST, [S.apprProcHydLoPr, S.ifGreenOvhtOut, S.greenEngPumpOn, S.ifHydNotRecovered]),
  /** HYD Y ELEC PUMP LO PR (l.87763-87782), without the overheat lines (l.87770-87771) */
  yellowElecPumpLoPr: (): HydAlertStatus => withLines(YELLOW_LOST, [], [S.yElecPump]),
  /** HYD Y ELEC PUMP OVHT (l.87763-87782) */
  yellowElecPumpOvht: (): HydAlertStatus =>
    withLines(YELLOW_LOST, [S.apprProcHydLoPr, S.ifYellowOvhtOut, S.yellowEngPumpOn, S.ptuAuto], [S.yElecPump]),
  /** HYD Y ENG 2 PUMP LO PR: PTU operative l.87824-87826, PTU inoperative (yellow lost) l.87889-87898 */
  yellowEngPumpLoPr: (yellowLost: boolean): HydAlertStatus =>
    yellowLost
      ? {
          left: [S.ldgDistProc, S.flapsSlow, S.cat3SingleOnly],
          inopSys: [...YELLOW_LOST.inopSys, S.ptu, S.yEng2Pump],
        }
      : { left: [], inopSys: [S.yEng2Pump] },
  /** HYD Y RSVR LO AIR PR (l.87996-88012) */
  yellowRsvrLoAirPr: (): HydAlertStatus =>
    withLines(YELLOW_LOST, [S.apprProcHydLoPr, S.yellowEngPumpOn, S.ifSysNotRecovered]),
  /** HYD Y RSVR LO LVL (l.88105-88113), with CARGO DOOR */
  yellowRsvrLoLvl: (): HydAlertStatus => withLines(YELLOW_LOST, [], [S.cargoDoor]),
  /** HYD Y RSVR OVHT (l.88213-88229) */
  yellowRsvrOvht: (): HydAlertStatus =>
    withLines(YELLOW_LOST, [S.apprProcHydLoPr, S.ifYellowOvhtOut, S.yellowEngPumpOn, S.ifSysNotRecovered]),
  /** HYD B (G, Y) SYS LO PR alone. Design choice: the STATUS of the lost system (this FCOM has no own procedure) */
  blueSysLoPr: (): HydAlertStatus => BLUE_LOST,
  greenSysLoPr: (): HydAlertStatus => GREEN_LOST,
  yellowSysLoPr: (): HydAlertStatus => YELLOW_LOST,
  /**
   * HYD B+Y SYS LO PR (l.88334-88405): the APPR PROC and IF HYD NOT RECOVERED titles are not shown for a dual LO LVL
   * (l.88343, l.88364-88365); MIN RAT SPD "If B PUMP LO PR" (l.88335).
   */
  blueYellowSysLoPr: (inputs: HydraulicInputs, pumps: PumpLowPressureState): HydAlertStatus => {
    const dualLowLevel = inputs.blue.reservoirLowLevel && inputs.yellow.reservoirLowLevel;
    return {
      left: [
        ...(blueLostByElecPump(inputs, pumps) ? [S.minRatSpd] : []),
        S.maxSpeed320,
        S.maneuverWithCare,
        S.forGaMaxPitch15,
        ...(dualLowLevel ? [] : [S.apprProcDualHydLoPr, S.ifHydNotRecovered]),
        S.lgGrvtyExtn,
        S.ldgDistProc,
        S.slatsFlapsSlow,
        S.fuelConsumptIncrsd,
        S.fmsPredUnreliable,
      ],
      inopSys: [
        S.blueYellowHyd,
        S.rElev,
        S.splr234,
        S.spdBrk,
        S.ap12,
        S.nwStrg,
        ...(inputs.yellow.reservoirLowLevel ? [S.cargoDoor] : []),
        S.reverser2,
        S.bElecPump,
        ...(inputs.blue.reservoirLowLevel ? [S.emerGen] : []),
        S.yawDamper2,
        S.cat2,
      ],
    };
  },
  /** HYD G+B SYS LO PR (l.88516-88593) */
  greenBlueSysLoPr: (inputs: HydraulicInputs, pumps: PumpLowPressureState): HydAlertStatus => {
    const dualLowLevel = inputs.green.reservoirLowLevel && inputs.blue.reservoirLowLevel;
    return {
      left: [
        ...(blueLostByElecPump(inputs, pumps) ? [S.minRatSpd] : []),
        S.maxSpeed320,
        S.maneuverWithCare,
        S.spdBrkDoNotUse,
        S.forGaMaxPitch15,
        S.fuelConsumptIncrsd,
        ...(dualLowLevel ? [] : [S.apprProcDualHydLoPr, S.ifHydNotRecovered]),
        S.athrOff,
        S.forLdgUseFlap3,
        S.gpwsLdgFlap3On,
        S.whenSpd200,
        S.lgGrvtyExtn,
        S.apprSpdVref25,
        S.ldgDistProc,
        S.fmsPredUnreliable,
        S.flapsSlow,
      ],
      inopSys: [
        S.greenBlueHyd,
        S.fctlProt,
        S.lElev,
        S.lrAil,
        S.splr135,
        S.slats,
        S.ap12,
        S.autoBrk,
        S.normBrk,
        S.lgRetract,
        S.reverser1,
        ...(inputs.blue.reservoirLowLevel ? [S.emerGen] : []),
        S.gEng1Pump,
        S.bElecPump,
        S.yawDamper1,
        S.cat2,
      ],
    };
  },
  /** HYD G+Y SYS LO PR (l.88699-88759) */
  greenYellowSysLoPr: (inputs: HydraulicInputs): HydAlertStatus => {
    const dualLowLevel = inputs.green.reservoirLowLevel && inputs.yellow.reservoirLowLevel;
    return {
      left: [
        S.maxSpeed320,
        S.maxBrkPr1000,
        S.maneuverWithCare,
        ...(dualLowLevel ? [] : [S.apprProcDualHydLoPr, S.ifHydNotRecovered]),
        S.forLdgUseFlap3,
        S.gpwsFlapModeOff,
        S.whenConf3AndVapp,
        S.lgGrvtyExtn,
        S.apprSpdVref25,
        S.ldgDistProc,
        S.brkYAccuPrOnly,
        S.fuelConsumptIncrsd,
        S.fmsPredUnreliable,
        S.slatsSlow,
      ],
      inopSys: [
        S.greenYellowHyd,
        S.fctlProt,
        S.stabilizer,
        S.reverser12,
        S.splr1245,
        S.flaps,
        S.yawDamper,
        S.ap12,
        S.antiSkid,
        S.nwStrg,
        S.normBrk,
        S.autoBrk,
        S.lgRetract,
        ...(inputs.yellow.reservoirLowLevel ? [S.cargoDoor] : []),
        S.cat2,
      ],
    };
  },
  /** HYD PTU FAULT (l.88833-88837): INOP SYS PTU */
  ptuFault: (): HydAlertStatus => ({ left: [], inopSys: [S.ptu] }),
  /** HYD RAT FAULT (l.88876-88880): INOP SYS RAT */
  ratFault: (): HydAlertStatus => ({ left: [], inopSys: [S.rat] }),
};
