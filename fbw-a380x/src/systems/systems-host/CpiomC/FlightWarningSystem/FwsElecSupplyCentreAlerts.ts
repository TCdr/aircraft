// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X ELEC (ATA 24) alerts of the supply centres, of the electrical network and load management and of the C/B
 * monitoring: ELEC PRIMARY SUPPLY CENTER 1(2) FAULT, ELEC SECONDARY SUPPLY CENTER 1(2) FAULT, DEGRADED, FAN FAULT,
 * ELEC SECONDARY SUPPLY CTR 1(2) REDUND LOST, ELEC CABIN L(R) SUPPLY CENTER OVHT (DET FAULT), ELEC ELEC NETWORK
 * MANAGEMENT 1(2) FAULT, ELEC LOAD MANAGEMENT FAULT, ELEC (EMER) C/B MONITORING FAULT, ELEC C/B TRIPPED, ELEC REMOTE
 * C/B CTL ACTIVE, ELEC DC ESS BUS PART FAULT, ELEC F/CTL ACTUATOR PWR SUPPLY FAULT and ELEC ABNORMAL FLIGHT OPS SUPPLY.
 *
 * The Rust electrical system (a380_systems/src/electrical/distribution.rs) simulates the primary supply centre, ENMU
 * and ELMU failures: the galleys they supply or control are shed, a failed ENMU no longer connects the APU generator
 * and the external power units of its side, and the ELMU pb-sw shows FAULT. Design choice: the secondary and cabin
 * supply centre, C/B monitoring, C/B trip and DC ESS part failures change nothing in the network model, so the FWS
 * reads them from the flyPad failures directly. The F/CTL actuator power supply and the flight ops supply are sensed on
 * the busbars.
 */

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { A380Failure } from '@failures';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';
import { Two } from './FwsElecAlerts';
import { FwcFlightPhase } from './FwsFlightPhases';

const ALL_FLIGHT_PHASES_BUT_1_AND_12 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Flight phases in which the alerts are inhibited */
export const ELEC_SUPPLY_CENTRE_PHASE_INHIBITION: {
  abnormalFlightOpsSupply: number[];
  cbMonitoringFault: number[];
  cbTripped: number[];
  cabinSupplyCentreOverheat: number[];
  cabinSupplyCentreOverheatDetFault: number[];
  dcEssBusPartFault: number[];
  networkManagementFault: number[];
  emerCbMonitoringFault: number[];
  fctlActuatorPowerSupplyFault: number[];
  loadManagementFault: number[];
  primarySupplyCentreFault: number[];
  remoteCbControlActive: number[];
  secondarySupplyCentre: number[];
} = {
  abnormalFlightOpsSupply: ALL_FLIGHT_PHASES_BUT_1_AND_12,
  cbMonitoringFault: ALL_FLIGHT_PHASES_BUT_1_AND_12,
  cbTripped: [3, 4, 5, 6, 7, 9, 10],
  cabinSupplyCentreOverheat: [4, 5, 6, 7, 9, 10],
  cabinSupplyCentreOverheatDetFault: ALL_FLIGHT_PHASES_BUT_1_AND_12,
  dcEssBusPartFault: [3, 4, 5, 6, 7, 9, 10],
  networkManagementFault: [3, 4, 5, 6, 7, 9, 10],
  emerCbMonitoringFault: ALL_FLIGHT_PHASES_BUT_1_AND_12,
  fctlActuatorPowerSupplyFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  loadManagementFault: [3, 4, 5, 6, 7, 9, 10, 11],
  primarySupplyCentreFault: ALL_FLIGHT_PHASES_BUT_1_AND_12,
  remoteCbControlActive: [1, 3, 4, 5, 6, 7, 9, 10, 12],
  // FAULT, DEGRADED, FAN FAULT and REDUND LOST
  secondarySupplyCentre: ALL_FLIGHT_PHASES_BUT_1_AND_12,
};

/** The flyPad failures read by the FWS, in the order of the centres 1, 2 (cabin: L, R) */
const FAILURES = {
  primarySupplyCentre: [A380Failure.PrimarySupplyCenter1, A380Failure.PrimarySupplyCenter2] as Two<number>,
  networkManagementUnit: [A380Failure.NetworkManagementUnit1, A380Failure.NetworkManagementUnit2] as Two<number>,
  loadManagementUnit: A380Failure.LoadManagementUnit,
  secondarySupplyCentre: [A380Failure.SecondarySupplyCenter1, A380Failure.SecondarySupplyCenter2] as Two<number>,
  secondarySupplyCentreCommunication: [
    A380Failure.SecondarySupplyCenter1Communication,
    A380Failure.SecondarySupplyCenter2Communication,
  ] as Two<number>,
  secondarySupplyCentreRedundancy: [
    A380Failure.SecondarySupplyCenter1Redundancy,
    A380Failure.SecondarySupplyCenter2Redundancy,
  ] as Two<number>,
  secondarySupplyCentreFan: [
    A380Failure.SecondarySupplyCenter1Fan,
    A380Failure.SecondarySupplyCenter2Fan,
  ] as Two<number>,
  cabinSupplyCentreOverheat: [
    A380Failure.CabinSupplyCenterLeftOverheat,
    A380Failure.CabinSupplyCenterRightOverheat,
  ] as Two<number>,
  cabinSupplyCentreOverheatDetection: [
    A380Failure.CabinSupplyCenterLeftOverheatDetection,
    A380Failure.CabinSupplyCenterRightOverheatDetection,
  ] as Two<number>,
  cbMonitoring: A380Failure.CircuitBreakerMonitoring,
  emerCbMonitoring: A380Failure.EmergencyCircuitBreakerMonitoring,
  cbTripped: A380Failure.CircuitBreakerTripped,
  dcEssBusPart: A380Failure.DirectCurrentEssentialPartial,
};

/** What the FWS reads for these alerts, as real booleans */
export interface ElecSupplyCentreInputs {
  primarySupplyCentreFailed: Two<boolean>;
  networkManagementUnitFailed: Two<boolean>;
  loadManagementUnitFailed: boolean;
  elmuPbOff: boolean;
  secondarySupplyCentreFailed: Two<boolean>;
  /** The communication between the secondary supply centre and the CPIOM E or the other systems is degraded */
  secondarySupplyCentreCommunicationDegraded: Two<boolean>;
  /** The redundancy of some system supplies of the secondary supply centre is lost */
  secondarySupplyCentreRedundancyLost: Two<boolean>;
  secondarySupplyCentreFanFailed: Two<boolean>;
  /** Overheat in the left, right cabin supply centres */
  cabinSupplyCentreOverheat: Two<boolean>;
  cabinSupplyCentreOverheatDetectionFailed: Two<boolean>;
  /** COMMERCIAL 1 and COMMERCIAL 2 pb-sw OFF */
  commercialOff: Two<boolean>;
  cbMonitoringFailed: boolean;
  emerCbMonitoringFailed: boolean;
  cbTripped: boolean;
  /** REMOTE C/B CTL pb on the maintenance ELEC panel ON */
  remoteCbControlOn: boolean;
  dcEssBusPartLost: boolean;
  dc1BusPowered: boolean;
  dcEssBusPowered: boolean;
  /** AC EHA busbar (247XP), the electrical supply of the EHAs and EBHAs */
  acEhaBusPowered: boolean;
  anyMainAcBusPowered: boolean;
  onGround: boolean;
  flightPhase: number;
}

/**
 * Reads the inputs with `read` (SimVar.GetSimVarValue(name, Bool) in the sim, which returns the number 1 for true) and
 * `isFailureActive` (FailuresConsumer.isActive).
 */
export function readElecSupplyCentreInputs(
  read: (name: string) => number,
  isFailureActive: (failure: number) => boolean,
  onGround: boolean,
  flightPhase: number,
): ElecSupplyCentreInputs {
  const isOn = (name: string): boolean => read(name) > 0;
  const failed = (failures: Two<number>): Two<boolean> => [isFailureActive(failures[0]), isFailureActive(failures[1])];
  return {
    primarySupplyCentreFailed: failed(FAILURES.primarySupplyCentre),
    networkManagementUnitFailed: failed(FAILURES.networkManagementUnit),
    loadManagementUnitFailed: isFailureActive(FAILURES.loadManagementUnit),
    elmuPbOff: isOn('L:A380X_OVHD_ELEC_ELMU_PB_IS_OFF'),
    secondarySupplyCentreFailed: failed(FAILURES.secondarySupplyCentre),
    secondarySupplyCentreCommunicationDegraded: failed(FAILURES.secondarySupplyCentreCommunication),
    secondarySupplyCentreRedundancyLost: failed(FAILURES.secondarySupplyCentreRedundancy),
    secondarySupplyCentreFanFailed: failed(FAILURES.secondarySupplyCentreFan),
    cabinSupplyCentreOverheat: failed(FAILURES.cabinSupplyCentreOverheat),
    cabinSupplyCentreOverheatDetectionFailed: failed(FAILURES.cabinSupplyCentreOverheatDetection),
    commercialOff: [!isOn('L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON'), isOn('L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF')],
    cbMonitoringFailed: isFailureActive(FAILURES.cbMonitoring),
    emerCbMonitoringFailed: isFailureActive(FAILURES.emerCbMonitoring),
    cbTripped: isFailureActive(FAILURES.cbTripped),
    remoteCbControlOn: isOn('L:A380X_REMOTE_CB_CTRL'),
    dcEssBusPartLost: isFailureActive(FAILURES.dcEssBusPart),
    dc1BusPowered: isOn('L:A32NX_ELEC_DC_1_BUS_IS_POWERED'),
    dcEssBusPowered: isOn('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED'),
    acEhaBusPowered: isOn('L:A32NX_ELEC_247XP_BUS_IS_POWERED'),
    anyMainAcBusPowered: [1, 2, 3, 4].some((n) => isOn(`L:A32NX_ELEC_AC_${n}_BUS_IS_POWERED`)),
    onGround,
    flightPhase,
  };
}

/** One flag per alert, true while its triggering condition is met (except the latched flight ops supply) */
export interface ElecSupplyCentreAlertFlags {
  primarySupplyCentreFault: Two<boolean>;
  networkManagementFault: Two<boolean>;
  loadManagementFault: boolean;
  secondarySupplyCentreFault: Two<boolean>;
  secondarySupplyCentreDegraded: Two<boolean>;
  secondarySupplyCentreRedundancyLost: Two<boolean>;
  secondarySupplyCentreFanFault: Two<boolean>;
  cabinSupplyCentreOverheat: Two<boolean>;
  cabinSupplyCentreOverheatDetFault: Two<boolean>;
  cbMonitoringFault: boolean;
  emerCbMonitoringFault: boolean;
  cbTripped: boolean;
  remoteCbControlActive: boolean;
  dcEssBusPartFault: boolean;
  fctlActuatorPowerSupplyFault: boolean;
  /** The flight ops side of the OIS (ARU, F/O OIT) is supplied by DC ESS instead of DC 1, in flight */
  flightOpsOnDcEss: boolean;
}

/**
 * The triggering conditions.
 * - SECONDARY SUPPLY CENTER ... DEGRADED and REDUND LOST: design choice, not while the same centre has its FAULT,
 *   whose loss of supplies includes them.
 * - CABIN ... SUPPLY CENTER OVHT: only while the overheat detectors of that side work.
 * - C/B TRIPPED: the C/B monitoring function identifies the tripped C/B, so not while it is failed.
 * - DC ESS BUS PART FAULT: the DC ESS busbar is partially lost, not totally (ELEC DC ESS BUS FAULT).
 * - F/CTL ACTUATOR PWR SUPPLY FAULT: the AC EHA busbar is lost while the main AC network is supplied (not with the
 *   whole AC network lost, ELEC EMER CONFIG).
 * - ABNORMAL FLIGHT OPS SUPPLY: the flight ops side of the OIS is supplied by DC 1 or DC ESS; with DC 1 lost in flight
 *   the DC ESS busbar supplies it.
 */
export function elecSupplyCentreAlertFlags(i: ElecSupplyCentreInputs): ElecSupplyCentreAlertFlags {
  const secondaryFailed = i.secondarySupplyCentreFailed;
  return {
    primarySupplyCentreFault: [...i.primarySupplyCentreFailed],
    networkManagementFault: [...i.networkManagementUnitFailed],
    loadManagementFault: i.loadManagementUnitFailed,
    secondarySupplyCentreFault: [...secondaryFailed],
    secondarySupplyCentreDegraded: [0, 1].map(
      (n) => i.secondarySupplyCentreCommunicationDegraded[n] && !secondaryFailed[n],
    ) as Two<boolean>,
    secondarySupplyCentreRedundancyLost: [0, 1].map(
      (n) => i.secondarySupplyCentreRedundancyLost[n] && !secondaryFailed[n],
    ) as Two<boolean>,
    secondarySupplyCentreFanFault: [...i.secondarySupplyCentreFanFailed],
    cabinSupplyCentreOverheat: [0, 1].map(
      (side) => i.cabinSupplyCentreOverheat[side] && !i.cabinSupplyCentreOverheatDetectionFailed[side],
    ) as Two<boolean>,
    cabinSupplyCentreOverheatDetFault: [...i.cabinSupplyCentreOverheatDetectionFailed],
    cbMonitoringFault: i.cbMonitoringFailed,
    emerCbMonitoringFault: i.emerCbMonitoringFailed,
    cbTripped: i.cbTripped && !i.cbMonitoringFailed,
    remoteCbControlActive: i.remoteCbControlOn,
    dcEssBusPartFault: i.dcEssBusPartLost && i.dcEssBusPowered,
    fctlActuatorPowerSupplyFault: !i.acEhaBusPowered && i.anyMainAcBusPowered,
    flightOpsOnDcEss: !i.onGround && !i.dc1BusPowered && i.dcEssBusPowered,
  };
}

/**
 * ELEC ABNORMAL FLIGHT OPS SUPPLY is inhibited from the first engine start to the last engine shutdown: it tells the
 * crew after the flight that the OITs were supplied by DC ESS in flight. Design choice: the FWS remembers it
 * until the first engine start of the next flight.
 */
export class FlightOpsSupplyMemory {
  private suppliedByDcEssInFlight = false;

  /**
   * @param flightOpsOnDcEss whether the flight ops side is supplied by DC ESS in flight now
   * @param flightPhase the FWS flight phase
   * @returns whether the abnormal supply happened during this flight
   */
  public update(flightOpsOnDcEss: boolean, flightPhase: number): boolean {
    if (flightPhase === FwcFlightPhase.FirstEngineStarted) {
      this.suppliedByDcEssInFlight = false;
    } else if (flightOpsOnDcEss) {
      this.suppliedByDcEssInFlight = true;
    }
    return this.suppliedByDcEssInFlight;
  }
}

/** INOP SYS keys (EcamInopSys) */
const INOP = {
  cbMonitoring: '240300009',
  emerCbMonitoring: '240300023',
  enmu: ['240300020', '240300021'] as Two<string>,
  apuGen: ['240300014', '240300015'] as Two<string>,
  /** EXT PWR 1+2 for ENMU 1, EXT PWR 3+4 for ENMU 2 */
  extPwr: [
    ['240300016', '240300017'],
    ['240300018', '240300019'],
  ] as Two<string[]>,
  partGalley: '240300022',
  loadManagement: '240300024',
  primarySupplyCentre: ['240300025', '240300026'] as Two<string>,
  commercial: '240300027',
  partCommercial: '240300028',
  secondarySupplyCentre: ['240300030', '240300031'] as Two<string>,
  partSecondarySupplyCentre: ['240300032', '240300033'] as Two<string>,
  secondarySupplyCentreFan: ['240300104', '240300105'] as Two<string>,
};

/**
 * STATUS of ELEC DC ESS BUS PART FAULT: the systems supplied by the lost part of the DC ESS busbar. Design choice: the
 * network model has one DC ESS busbar, so these systems keep working; the STATUS shows what the aircraft loses.
 */
export const DC_ESS_BUS_PART_FAULT_STATUS = {
  // PART SPLRs, PRIM 1, SEC 1, ADR 1, WXR 1, FEED TK 2 MAIN PMP, AUTO REFUEL, FUEL AUTO GND XFR, LOUDSPEAKERS,
  // CAPT EFIS CTL, RECORDER SYS
  inopSysAllPhases: [
    '290100001',
    '270300010',
    '270300001',
    '340300004',
    '340300037',
    '280300002',
    '280300067',
    '280300068',
    '240300103',
    '310300014',
    '310300024',
  ],
  // SLAT SYS 1, BTV, CAT 2, TAWS 1
  inopSysApprLdg: ['290100005', '320300007', '220300027', '340300055'],
  // LDG DIST COEF < 1.45 ON DRY RUNWAY, CAPT KEYBOARD CURSOR CTL AVAIL
  info: ['240200101', '310200003'],
  // SLATS SLOW, LDG DIST AFFECTED
  limitationsApprLdg: ['290400001', '800400002'],
};

/**
 * INOP SYS of ELEC ELEC NETWORK MANAGEMENT 1(2) FAULT: the ENMU, the APU generator of its side, on ground the external
 * power units of its side, and the galleys it controls.
 * @param enmu 0 for ENMU 1, 1 for ENMU 2
 */
export function networkManagementFaultInopSys(enmu: number, onGround: boolean): string[] {
  return [INOP.enmu[enmu], INOP.apuGen[enmu], ...(onGround ? INOP.extPwr[enmu] : []), INOP.partGalley];
}

/**
 * INOP SYS of ELEC PRIMARY SUPPLY CENTER 1(2) FAULT: the centre, and the commercial loads it supplies (those of its
 * cabin side: PART COMMERCIAL, or COMMERCIAL with both centres failed).
 * @param centre 0 for primary supply centre 1, 1 for 2
 */
export function primarySupplyCentreFaultInopSys(centre: number, bothFailed: boolean): string[] {
  return [INOP.primarySupplyCentre[centre], bothFailed ? INOP.commercial : INOP.partCommercial];
}

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class ElecSupplyCentreAlerts {
  public readonly primarySupplyCentreFault = [Subject.create(false), Subject.create(false)];

  public readonly networkManagementFault = [Subject.create(false), Subject.create(false)];

  public readonly loadManagementFault = Subject.create(false);

  public readonly secondarySupplyCentreFault = [Subject.create(false), Subject.create(false)];

  public readonly secondarySupplyCentreDegraded = [Subject.create(false), Subject.create(false)];

  public readonly secondarySupplyCentreRedundancyLost = [Subject.create(false), Subject.create(false)];

  public readonly secondarySupplyCentreFanFault = [Subject.create(false), Subject.create(false)];

  public readonly cabinSupplyCentreOverheat = [Subject.create(false), Subject.create(false)];

  public readonly cabinSupplyCentreOverheatDetFault = [Subject.create(false), Subject.create(false)];

  public readonly cbMonitoringFault = Subject.create(false);

  public readonly emerCbMonitoringFault = Subject.create(false);

  public readonly cbTripped = Subject.create(false);

  public readonly remoteCbControlActive = Subject.create(false);

  public readonly dcEssBusPartFault = Subject.create(false);

  public readonly fctlActuatorPowerSupplyFault = Subject.create(false);

  public readonly abnormalFlightOpsSupply = Subject.create(false);

  /** COMMERCIAL 1, COMMERCIAL 2 pb-sw OFF */
  public readonly commercialOff = [false, false];

  public elmuPbOff = false;

  public onGround = true;

  public flightPhase: number = FwcFlightPhase.ElecPwr;

  private readonly flightOpsSupplyMemory = new FlightOpsSupplyMemory();

  public update(i: ElecSupplyCentreInputs): void {
    const flags = elecSupplyCentreAlertFlags(i);
    const setPair = (subjects: Subject<boolean>[], values: Two<boolean>) =>
      values.forEach((value, n) => subjects[n].set(value));
    setPair(this.primarySupplyCentreFault, flags.primarySupplyCentreFault);
    setPair(this.networkManagementFault, flags.networkManagementFault);
    this.loadManagementFault.set(flags.loadManagementFault);
    setPair(this.secondarySupplyCentreFault, flags.secondarySupplyCentreFault);
    setPair(this.secondarySupplyCentreDegraded, flags.secondarySupplyCentreDegraded);
    setPair(this.secondarySupplyCentreRedundancyLost, flags.secondarySupplyCentreRedundancyLost);
    setPair(this.secondarySupplyCentreFanFault, flags.secondarySupplyCentreFanFault);
    setPair(this.cabinSupplyCentreOverheat, flags.cabinSupplyCentreOverheat);
    setPair(this.cabinSupplyCentreOverheatDetFault, flags.cabinSupplyCentreOverheatDetFault);
    this.cbMonitoringFault.set(flags.cbMonitoringFault);
    this.emerCbMonitoringFault.set(flags.emerCbMonitoringFault);
    this.cbTripped.set(flags.cbTripped);
    this.remoteCbControlActive.set(flags.remoteCbControlActive);
    this.dcEssBusPartFault.set(flags.dcEssBusPartFault);
    this.fctlActuatorPowerSupplyFault.set(flags.fctlActuatorPowerSupplyFault);
    this.abnormalFlightOpsSupply.set(this.flightOpsSupplyMemory.update(flags.flightOpsOnDcEss, i.flightPhase));

    this.commercialOff[0] = i.commercialOff[0];
    this.commercialOff[1] = i.commercialOff[1];
    this.elmuPbOff = i.elmuPbOff;
    this.onGround = i.onGround;
    this.flightPhase = i.flightPhase;
  }
}

/** The FwsCore state read by the lines of ELEC DC ESS BUS PART FAULT */
export interface DcEssBusPartFaultContext {
  /** AIR DATA switching knob, 0 = CAPT ON 3 */
  readonly airKnob: Subscribable<number>;
  /** WXR & TAWS system selected on the SURV panel */
  readonly tawsWxrSelected: Subscribable<number>;
  readonly fuelEmerOutrTkXfrOn: Subscribable<boolean>;
  readonly feedTanks1And4BelowEmerOutrXfrThreshold: Subscribable<boolean>;
}

/** The alert keys (EcamAbnormalProcedures, ata24.ts) */
export const ELEC_SUPPLY_CENTRE_ALERT_KEYS = {
  abnormalFlightOpsSupply: 240800001,
  cbMonitoringFault: 240800020,
  cbTripped: 240800021,
  cabinSupplyCentreOverheat: [240800022, 240800023] as Two<number>,
  cabinSupplyCentreOverheatDetFault: [240800024, 240800025] as Two<number>,
  dcEssBusPartFault: 240800031,
  networkManagementFault: [240800052, 240800053] as Two<number>,
  emerCbMonitoringFault: 240800054,
  fctlActuatorPowerSupplyFault: 240800060,
  loadManagementFault: 240800069,
  primarySupplyCentreFault: [240800070, 240800071] as Two<number>,
  remoteCbControlActive: 240800073,
  secondarySupplyCentreDegraded: [240800074, 240800075] as Two<number>,
  secondarySupplyCentreFault: [240800076, 240800077] as Two<number>,
  secondarySupplyCentreRedundancyLost: [240800078, 240800079] as Two<number>,
  secondarySupplyCentreFanFault: [240800092, 240800093] as Two<number>,
};

/** The deferred procedure of ELEC DC ESS BUS PART FAULT (EcamDeferredProcedures, ata24.ts) */
export const DC_ESS_BUS_PART_FAULT_DEFERRED_KEY = 240700001;

/** An alert with no line to do and the given STATUS */
function crewAwareness(
  flightPhaseInhib: number[],
  simVarIsActive: Subscribable<boolean>,
  failure: number,
  sysPage: SdPages,
  inopSysAllPhases?: () => string[],
): EwdAbnormalItem {
  return {
    flightPhaseInhib,
    simVarIsActive,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [],
    whichItemsChecked: () => [],
    inopSysAllPhases,
    failure,
    sysPage,
  };
}

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param a the alert state (FwsCore.elecSupplyCentreAlerts)
 * @param fws the FwsCore state read by the lines of ELEC DC ESS BUS PART FAULT
 */
export function elecSupplyCentreAbnormalItems(
  a: ElecSupplyCentreAlerts,
  fws: DcEssBusPartFaultContext,
): { [key: number]: EwdAbnormalItem } {
  const keys = ELEC_SUPPLY_CENTRE_ALERT_KEYS;
  const inhib = ELEC_SUPPLY_CENTRE_PHASE_INHIBITION;
  const items: { [key: number]: EwdAbnormalItem } = {};

  items[keys.abnormalFlightOpsSupply] = crewAwareness(
    inhib.abnormalFlightOpsSupply,
    a.abnormalFlightOpsSupply,
    1,
    SdPages.None,
  );
  items[keys.cbMonitoringFault] = crewAwareness(inhib.cbMonitoringFault, a.cbMonitoringFault, 1, SdPages.None, () => [
    INOP.cbMonitoring,
  ]);
  items[keys.emerCbMonitoringFault] = crewAwareness(
    inhib.emerCbMonitoringFault,
    a.emerCbMonitoringFault,
    1,
    SdPages.None,
    () => [INOP.emerCbMonitoring],
  );
  items[keys.cbTripped] = crewAwareness(inhib.cbTripped, a.cbTripped, 2, SdPages.None);
  items[keys.fctlActuatorPowerSupplyFault] = {
    ...crewAwareness(inhib.fctlActuatorPowerSupplyFault, a.fctlActuatorPowerSupplyFault, 1, SdPages.Fctl),
    // Design choice: 2 s, so that the AC EHA busbar changing its supply (AC 3 or AC ESS) does not flash this alert
    monitorConfirmTime: 2,
  };

  keys.cabinSupplyCentreOverheat.forEach((key, side) => {
    items[key] = {
      flightPhaseInhib: inhib.cabinSupplyCentreOverheat,
      simVarIsActive: a.cabinSupplyCentreOverheat[side],
      notActiveWhenItemActive: [],
      // COMMERCIAL 1 (2) OFF
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [a.commercialOff[side]],
      failure: 2,
      sysPage: SdPages.None,
    };
  });
  keys.cabinSupplyCentreOverheatDetFault.forEach((key, side) => {
    items[key] = crewAwareness(
      inhib.cabinSupplyCentreOverheatDetFault,
      a.cabinSupplyCentreOverheatDetFault[side],
      1,
      SdPages.None,
    );
  });

  keys.networkManagementFault.forEach((key, enmu) => {
    items[key] = {
      flightPhaseInhib: inhib.networkManagementFault,
      simVarIsActive: a.networkManagementFault[enmu],
      notActiveWhenItemActive: [],
      // GEN 1+2 (3+4) : KEEP ON
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      inopSysAllPhases: () => networkManagementFaultInopSys(enmu, a.onGround),
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  });

  items[keys.loadManagementFault] = {
    flightPhaseInhib: inhib.loadManagementFault,
    simVarIsActive: a.loadManagementFault,
    notActiveWhenItemActive: [],
    // ELMU OFF
    whichItemsToShow: () => [true],
    whichItemsChecked: () => [a.elmuPbOff],
    inopSysAllPhases: () => [INOP.loadManagement],
    failure: 2,
    sysPage: SdPages.ElecAc,
  };

  keys.primarySupplyCentreFault.forEach((key, centre) => {
    items[key] = crewAwareness(
      inhib.primarySupplyCentreFault,
      a.primarySupplyCentreFault[centre],
      1,
      SdPages.None,
      () =>
        primarySupplyCentreFaultInopSys(
          centre,
          a.primarySupplyCentreFault[0].get() && a.primarySupplyCentreFault[1].get(),
        ),
    );
  });

  items[keys.remoteCbControlActive] = {
    flightPhaseInhib: inhib.remoteCbControlActive,
    simVarIsActive: a.remoteCbControlActive,
    notActiveWhenItemActive: [],
    // REMOTE C/B CTL OFF
    whichItemsToShow: () => [true],
    whichItemsChecked: () => [!a.remoteCbControlActive.get()],
    failure: 2,
    sysPage: SdPages.None,
  };

  keys.secondarySupplyCentreFault.forEach((key, centre) => {
    items[key] = crewAwareness(
      inhib.secondarySupplyCentre,
      a.secondarySupplyCentreFault[centre],
      1,
      SdPages.None,
      () => [INOP.secondarySupplyCentre[centre]],
    );
  });
  keys.secondarySupplyCentreDegraded.forEach((key, centre) => {
    items[key] = crewAwareness(
      inhib.secondarySupplyCentre,
      a.secondarySupplyCentreDegraded[centre],
      1,
      SdPages.None,
      () => [INOP.secondarySupplyCentre[centre]],
    );
  });
  keys.secondarySupplyCentreFanFault.forEach((key, centre) => {
    items[key] = crewAwareness(
      inhib.secondarySupplyCentre,
      a.secondarySupplyCentreFanFault[centre],
      1,
      SdPages.None,
      () => [INOP.secondarySupplyCentreFan[centre]],
    );
  });
  keys.secondarySupplyCentreRedundancyLost.forEach((key, centre) => {
    items[key] = {
      ...crewAwareness(inhib.secondarySupplyCentre, a.secondarySupplyCentreRedundancyLost[centre], 1, SdPages.None),
      redundLoss: () => [INOP.partSecondarySupplyCentre[centre]],
    };
  });

  items[keys.dcEssBusPartFault] = {
    flightPhaseInhib: inhib.dcEssBusPartFault,
    simVarIsActive: a.dcEssBusPartFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => {
      const lowFeedTanks = fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
      const afterLanding = a.flightPhase === FwcFlightPhase.AtOrBelowEightyKnots;
      return [
        true, // FOR TAXI : FLAPS SELECT CONF 1+F
        true, // AIR DATA SWTG
        true, // HEADSETS
        true, // WXR & TAWS
        true, // DU RECONF P/B AVAIL
        true, // CAPT KEYBOARD CURSOR CTL AVAIL
        true, // ECP KEYS NOT AVAIL :
        true, // SYSTEMS, MORE, TO CONFIG, RCL LAST
        true, // FOR SYS PAGES : "ALL" AVAIL
        true, // SLATS SLOW
        true, // LDG DIST AFFECTED
        lowFeedTanks, // EMER OUTR TK XFR
        lowFeedTanks, // EXPECT FEED TKS IMBALANCE
        lowFeedTanks, // FUEL MAN BALANCING PROC
        afterLanding, // BEFORE LAST ENG SHUTDOWN :
        afterLanding, // IR 1 MODE SEL
      ];
    },
    whichItemsChecked: () => [
      false,
      fws.airKnob.get() === 0,
      false,
      fws.tawsWxrSelected.get() === 2,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      fws.fuelEmerOutrTkXfrOn.get(),
      false,
      false,
      false,
      false,
    ],
    inopSysAllPhases: () => DC_ESS_BUS_PART_FAULT_STATUS.inopSysAllPhases,
    inopSysApprLdg: () => DC_ESS_BUS_PART_FAULT_STATUS.inopSysApprLdg,
    info: () => DC_ESS_BUS_PART_FAULT_STATUS.info,
    limitationsApprLdg: () => DC_ESS_BUS_PART_FAULT_STATUS.limitationsApprLdg,
    failure: 2,
    sysPage: SdPages.ElecDc,
  };

  return items;
}

/** The FwsAbnormalSensed deferred procedure entries of these alerts */
export function elecSupplyCentreDeferredItems(): { [key: number]: EwdAbnormalItem } {
  return {
    // FOR APPROACH : LDG DIST COMPUTATION CONFIRM
    [DC_ESS_BUS_PART_FAULT_DEFERRED_KEY]: {
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 0,
      sysPage: SdPages.None,
    },
  };
}
