// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/*
 * The ELEC bus, ESS bus and TR alerts of the A320 FWC, and the STATUS of the generator alerts (A320 FCOM PRO-ABN-ELEC,
 * a320_fcom.txt l.75410-78248). The triggers come from the electrical network of the Rust systems
 * (L:A32NX_ELEC_{bus}_BUS_IS_POWERED, the contactor states, the TR potentials), read by
 * Acquisition/ElecNetworkAcquisition.
 *
 * Where the FCOM text has two variants of a procedure, the one of the larger fleet group is used: it has no CTR TK PUMP
 * (the A320neo centre tank feeds through transfer valves), like the A32NX.
 *
 * The flight phase inhibition figures, the alert levels and the title colours are images that the FCOM text dump drops:
 * the values below are general Airbus knowledge [GK] and marked as design choices.
 *
 * Not modelled (design choice): the "FUEL CONSUMPT INCRSD / FMS PRED UNRELIABLE" lines, which the FCOM shows "when the
 * failure (or combination of failures) affects the nominal aerodynamic characteristics of the aircraft" (l.75542-75543):
 * that condition is not computed. ELEC EMER CONFIG gives them, its procedure lists them with no condition (see
 * elecEmerConfigFuelLines). The option lines
 * (CRG HEAT/VENT, STEEP APPR, ROW/ROP, GLS AUTOLAND), the A321 ACT PUMP and the "Other INOP SYS" lists, which the ECAM
 * does not display, are left out too.
 */

/** The state of the electrical network that the ELEC alerts use */
export interface ElecNetworkState {
  acBus1Powered: boolean;
  acBus2Powered: boolean;
  acEssBusPowered: boolean;
  acEssShedBusPowered: boolean;
  dcBus1Powered: boolean;
  dcBus2Powered: boolean;
  dcEssBusPowered: boolean;
  dcEssShedBusPowered: boolean;
  dcBatBusPowered: boolean;
  /** 3XC2 closed: the AC ESS BUS is supplied by the AC BUS 2 */
  acEssFedByAcBus2: boolean;
  /** The AC ESS FEED pb-sw is at NORMAL (not ALTN) */
  acEssFeedPbNormal: boolean;
  /** 15XE2 closed: the static inverter supplies the AC ESS BUS */
  staticInverterSuppliesAcEss: boolean;
  /** 2XB2 closed: the battery 2 supplies the DC ESS BUS */
  battery2SuppliesDcEss: boolean;
  /** The TR 1 output potential is in its normal range */
  tr1PotentialNormal: boolean;
  /** The TR 2 output potential is in its normal range */
  tr2PotentialNormal: boolean;
}

/** The ELEC alerts of this module, before their confirmation time */
export interface ElecBusAlertConditions {
  acBus1Fault: boolean;
  acBus2Fault: boolean;
  acEssBusAltn: boolean;
  acEssBusFault: boolean;
  acEssBusShed: boolean;
  dcBatBusFault: boolean;
  dcBus1Fault: boolean;
  dcBus2Fault: boolean;
  dcBus1And2Fault: boolean;
  dcEmerConfig: boolean;
  dcEssBusFault: boolean;
  dcEssBusShed: boolean;
  essBusesOnBat: boolean;
  tr1Fault: boolean;
  tr2Fault: boolean;
}

export type ElecBusAlert = keyof ElecBusAlertConditions;

/**
 * The triggers (FCOM "Triggering Conditions"), with the priorities between the alerts.
 *
 * Design choices (the FCOM does not give the FWC inhibition logic):
 * - In ELEC EMER CONFIG the loss of AC BUS 1+2, DC BUS 1+2, DC BAT BUS and the TRs is the configuration itself, which the
 *   EMER CONFIG procedure and STATUS cover: their own alerts are not shown. AC/DC ESS BUS FAULT, DC EMER CONFIG and ESS
 *   BUSES ON BAT stay: they are a further failure.
 * - DC EMER CONFIG covers DC BUS 1, DC BUS 2, DC BUS 1+2 FAULT and DC ESS BUS FAULT and SHED (its procedure includes the
 *   DC BUS 1+2 FAULT one as associated procedure, l.77173-77191). DC BUS 1+2 FAULT covers DC BUS 1 and DC BUS 2 FAULT.
 * - AC (DC) ESS BUS FAULT covers AC (DC) ESS BUS SHED: the SHED bus is supplied through the ESS bus.
 * - With the ESS buses on the batteries the SHED buses are shed on purpose: "the system automatically sheds the AC SHED
 *   ESS and DC SHED ESS buses" (DSC-24, l.36790-36791), no SHED alert then.
 * @param state the electrical network
 * @param elecEmerConfig ELEC EMER CONFIG is active (PseudoFWC elecEmergency)
 * @returns the alert triggers
 */
export function elecBusAlertConditions(state: ElecNetworkState, elecEmerConfig: boolean): ElecBusAlertConditions {
  // l.77143: "This alert triggers when the DC 1, DC 2 and DC ESS busbars are not supplied."
  const dcEmerConfig = !state.dcBus1Powered && !state.dcBus2Powered && !state.dcEssBusPowered;
  // l.76810: "This alert triggers when the DC 1 and DC 2 busbars are not supplied."
  const dcBus1And2Lost = !state.dcBus1Powered && !state.dcBus2Powered;
  // l.77268: "This alert triggers when the DC ESS busbar is not supplied."
  const dcEssBusFault = !state.dcEssBusPowered && !dcEmerConfig;
  // l.75954: "This alert triggers when the AC ESS busbar is not supplied."
  const acEssBusFault = !state.acEssBusPowered;
  // l.77939: "This alert triggers when the DC ESS and AC ESS busbars are supplied by the batteries."
  const essBusesOnBat =
    state.staticInverterSuppliesAcEss && state.battery2SuppliesDcEss && state.acEssBusPowered && state.dcEssBusPowered;
  const mainNetworkAlertsShown = !elecEmerConfig;

  return {
    // l.75420: "This alert triggers when the AC 1 busbar is not supplied."
    acBus1Fault: !state.acBus1Powered && mainNetworkAlertsShown,
    // l.75701: "This alert triggers when the AC 2 busbar is not supplied."
    acBus2Fault: !state.acBus2Powered && mainNetworkAlertsShown,
    // l.75925-75926: "This alert triggers when the AC ESS busbar is supplied from the AC 2 busbar although the AC ESS
    // FEED pb-sw is set to normal."
    acEssBusAltn: state.acEssBusPowered && state.acEssFedByAcBus2 && state.acEssFeedPbNormal && mainNetworkAlertsShown,
    acEssBusFault,
    // l.76029: "This alert triggers when the AC SHED ESS busbar is not supplied."
    acEssBusShed: !state.acEssShedBusPowered && !acEssBusFault && !essBusesOnBat,
    // l.76264: "This alert triggers when the DC BAT busbar is not supplied."
    dcBatBusFault: !state.dcBatBusPowered && mainNetworkAlertsShown,
    // l.76428: "This alert triggers when the DC 1 busbar is not supplied."
    dcBus1Fault: !state.dcBus1Powered && !dcBus1And2Lost && !dcEmerConfig && mainNetworkAlertsShown,
    // l.76511: "This alert triggers when the DC 2 busbar is not supplied."
    dcBus2Fault: !state.dcBus2Powered && !dcBus1And2Lost && !dcEmerConfig && mainNetworkAlertsShown,
    dcBus1And2Fault: dcBus1And2Lost && !dcEmerConfig && mainNetworkAlertsShown,
    dcEmerConfig,
    dcEssBusFault,
    // l.77426: "This alert triggers when the DC SHED ESS busbar is not supplied."
    dcEssBusShed: !state.dcEssShedBusPowered && state.dcEssBusPowered && !essBusesOnBat,
    essBusesOnBat,
    // l.78238: "This alert triggers when the TR 1(2) is failed." The TR output is lost while its AC bus supplies it.
    tr1Fault: state.acBus1Powered && !state.tr1PotentialNormal && mainNetworkAlertsShown,
    tr2Fault: state.acBus2Powered && !state.tr2PotentialNormal && mainNetworkAlertsShown,
  };
}

/** The AC ESS FEED automatic transfer to the AC BUS 2 takes 3 s (alternating_current.rs, AC_ESS_FEED_TO_AC_BUS_2_DELAY) */
const AC_ESS_FEED_AUTO_TRANSFER_SECONDS = 3;

/**
 * How long each condition must last before its alert is shown, in seconds. Design choices:
 * - 1 s for the main network, so that the no-break power transfers (APU or external power to the engine generators)
 *   never show an alert.
 * - The ESS and SHED buses wait for the AC ESS FEED automatic transfer: "for aircraft equipped with AC ESS FEED Auto
 *   Switching, the AC ESS BUS and the DC ESS BUS will automatically recover" after the loss of the AC BUS 1
 *   (l.75584-75586), 2 s after it.
 * - ESS BUSES ON BAT waits 10 s: the emergency generator takes the ESS buses over some seconds after the loss of the main
 *   generators (RAT extension, then "coupling occurs 3 s after", DSC-24 l.37307-37312); the batteries are the expected
 *   supply in between, which the ELEC EMER CONFIG alert already shows.
 */
export const ELEC_BUS_ALERT_CONFIRM_SECONDS: Record<ElecBusAlert, number> = {
  acBus1Fault: 1,
  acBus2Fault: 1,
  acEssBusAltn: AC_ESS_FEED_AUTO_TRANSFER_SECONDS + 2,
  acEssBusFault: AC_ESS_FEED_AUTO_TRANSFER_SECONDS + 2,
  acEssBusShed: AC_ESS_FEED_AUTO_TRANSFER_SECONDS + 2,
  dcBatBusFault: 1,
  dcBus1Fault: 1,
  dcBus2Fault: 1,
  dcBus1And2Fault: 1,
  dcEmerConfig: AC_ESS_FEED_AUTO_TRANSFER_SECONDS + 2,
  dcEssBusFault: AC_ESS_FEED_AUTO_TRANSFER_SECONDS + 2,
  dcEssBusShed: AC_ESS_FEED_AUTO_TRANSFER_SECONDS + 2,
  essBusesOnBat: 10,
  tr1Fault: 1,
  tr2Fault: 1,
};

const ELEC_BUS_ALERTS = Object.keys(ELEC_BUS_ALERT_CONFIRM_SECONDS) as ElecBusAlert[];

/** The ELEC bus alerts after their confirmation time, as the subjects of the PseudoFWC alert table */
export class ElecBusAlertMonitor {
  private readonly conditionSeconds = new Map<ElecBusAlert, number>(ELEC_BUS_ALERTS.map((alert) => [alert, 0]));

  /**
   * The confirmed alerts, by name. Built with reduce: the sim's Coherent GT runtime has no Object.fromEntries (ES2019),
   * which threw here and stopped the whole systems host (no FWC, all DUs black).
   */
  public readonly alerts = ELEC_BUS_ALERTS.reduce(
    (subjects, alert) => {
      subjects[alert] = Subject.create(false);
      return subjects;
    },
    {} as Record<ElecBusAlert, Subject<boolean>>,
  );

  /** The last network state, for the procedure and STATUS lines (all normal before the first update) */
  public state: ElecNetworkState = {
    acBus1Powered: true,
    acBus2Powered: true,
    acEssBusPowered: true,
    acEssShedBusPowered: true,
    dcBus1Powered: true,
    dcBus2Powered: true,
    dcEssBusPowered: true,
    dcEssShedBusPowered: true,
    dcBatBusPowered: true,
    acEssFedByAcBus2: false,
    acEssFeedPbNormal: true,
    staticInverterSuppliesAcEss: false,
    battery2SuppliesDcEss: false,
    tr1PotentialNormal: true,
    tr2PotentialNormal: true,
  };

  /**
   * @param state the electrical network
   * @param elecEmerConfig ELEC EMER CONFIG is active
   * @param deltaTimeSeconds the time since the last update
   */
  public update(state: ElecNetworkState, elecEmerConfig: boolean, deltaTimeSeconds: number): void {
    this.state = state;
    const conditions = elecBusAlertConditions(state, elecEmerConfig);
    for (const alert of ELEC_BUS_ALERTS) {
      const seconds = conditions[alert] ? this.conditionSeconds.get(alert)! + deltaTimeSeconds : 0;
      this.conditionSeconds.set(alert, seconds);
      this.alerts[alert].set(conditions[alert] && seconds >= ELEC_BUS_ALERT_CONFIRM_SECONDS[alert]);
    }
  }

  /**
   * LAND ASAP (amber) with DC EMER CONFIG (l.77163) and ESS BUSES ON BAT (l.77947). Design choice: amber, as both are
   * cautions [GK]; with ELEC EMER CONFIG the red LAND ASAP takes over.
   */
  public get landAsap(): boolean {
    return this.alerts.dcEmerConfig.get() || this.alerts.essBusesOnBat.get();
  }
}

/*
 * The procedure lines, by index in the codes of each alert (EwdMessages 2400101-2400115). The action lines of actions
 * done go; the uppercase conditions are shown, the lowercase ones ("If DC ESS BUS is failed:") are computed and not shown.
 */

/** AC BUS 1 FAULT, l.75590: 0 title, 1 -BLOWER OVRD */
export function acBus1FaultLines(blowerPbAuto: boolean): number[] {
  return [0, ...(blowerPbAuto ? [1] : [])];
}

/**
 * AC BUS 2 FAULT, l.75720-75724: 0 title, 1 -EXTRACT OVRD, 2 -ATC/XPDR SYS 1 (the transponder 2 is lost with the AC BUS
 * 2, INOP SYS ATC 2 or ATC/XPDR 2, l.75774).
 */
export function acBus2FaultLines(extractPbAuto: boolean, xpdr2Selected: boolean): number[] {
  return [0, ...(extractPbAuto ? [1] : []), ...(xpdr2Selected ? [2] : [])];
}

/** AC ESS BUS FAULT, l.75960-75962: 0 title, 1 -AC ESS FEED ALTN, 2 -ATC/XPDR SYS 2 */
export function acEssBusFaultLines(acEssFeedPbNormal: boolean, xpdr1Selected: boolean): number[] {
  return [0, ...(acEssFeedPbNormal ? [1] : []), ...(xpdr1Selected ? [2] : [])];
}

/** AC ESS BUS SHED, l.76035: 0 title, 1 -ATC/XPDR SYS 2 */
export function acEssBusShedLines(xpdr1Selected: boolean): number[] {
  return [0, ...(xpdr1Selected ? [1] : [])];
}

/** DC BUS 1 FAULT, l.76433-76434: 0 title, 1 -BLOWER OVRD, 2 -EXTRACT OVRD */
export function dcBus1FaultLines(blowerPbAuto: boolean, extractPbAuto: boolean): number[] {
  return [0, ...(blowerPbAuto ? [1] : []), ...(extractPbAuto ? [2] : [])];
}

/**
 * DC BUS 2 FAULT, l.76675-76681: 0 title, 1 -AIR DATA SWTG F/O 3, 2 -BARO REF CHECK, (If DC ESS BUS is failed:) 3 -L/G
 * GRVTY EXTN. Design choice: the L/G line goes once the gear is down and locked.
 */
export function dcBus2FaultLines(airDataSwtgFo3: boolean, dcEssBusLost: boolean, gearDownLocked: boolean): number[] {
  return [0, ...(airDataSwtgFo3 ? [] : [1]), 2, ...(dcEssBusLost && !gearDownLocked ? [3] : [])];
}

/** DC BUS 1+2 FAULT, l.76997-77003: 0 title, 1 -BLOWER OVRD, 2 -EXTRACT OVRD, 3 -BARO REF CHECK, 4 MAX BRK PR 1000 PSI */
export function dcBus1And2FaultLines(blowerPbAuto: boolean, extractPbAuto: boolean): number[] {
  return [0, ...(blowerPbAuto ? [1] : []), ...(extractPbAuto ? [2] : []), 3, 4];
}

/**
 * DC EMER CONFIG, l.77163-77184: LAND ASAP (the amber memo), 0 title, 1 -EMER ELEC PWR MAN ON (until the emergency
 * generator is connected, as in ELEC EMER CONFIG), then the lines of its associated procedure ELEC DC BUS 1+2 FAULT:
 * 2 -BLOWER OVRD, 3 -EXTRACT OVRD, 4 -BARO REF CHECK, 5 MAX BRK PR 1000 PSI.
 */
export function dcEmerConfigLines(emerGenConnected: boolean, blowerPbAuto: boolean, extractPbAuto: boolean): number[] {
  return [0, ...(emerGenConnected ? [] : [1]), ...(blowerPbAuto ? [2] : []), ...(extractPbAuto ? [3] : []), 4, 5];
}

/**
 * DC ESS BUS FAULT, l.77288-77303: 0 title, 1 -VHF 2 OR 3 USE, 2 -AUDIO SWTG SELECT, 3 -BARO REF CHECK, 4 -GPWS SYS OFF,
 * (If DC BUS 2 is failed:) 5 -L/G GRVTY EXTN, 6 AVOID ICING CONDITIONS. The AUDIO SWTG line is gone once the AUDIO
 * SWITCHING selector left NORM ("set the AUDIO SWTG rotary selector to CAPT 3 or F/O 3", l.77290-77291).
 */
export function dcEssBusFaultLines(
  gpwsSysOff: boolean,
  dcBus2Lost: boolean,
  gearDownLocked: boolean,
  audioSwitchingNorm: boolean,
): number[] {
  return [
    0,
    1,
    ...(audioSwitchingNorm ? [2] : []),
    3,
    ...(gpwsSysOff ? [] : [4]),
    ...(dcBus2Lost && !gearDownLocked ? [5] : []),
    6,
  ];
}

/** DC ESS BUS SHED, l.77432-77434: 0 title, 1 -EXTRACT OVRD, 2 AVOID ICING CONDITIONS */
export function dcEssBusShedLines(extractPbAuto: boolean): number[] {
  return [0, ...(extractPbAuto ? [1] : []), 2];
}

/**
 * ESS BUSES ON BAT, l.77947-77951: LAND ASAP (the amber memo), 0 title, 1 MIN RAT SPEED 140 KT ("Displayed, if the RAT is
 * extended"), 2 -EMER ELEC PWR MAN ON (until the emergency generator is connected).
 */
export function essBusesOnBatLines(ratExtended: boolean, emerGenConnected: boolean): number[] {
  return [0, ...(ratExtended ? [1] : []), ...(emerGenConnected ? [] : [2])];
}

/** The STATUS page codes of an alert (StatusMessages) */
export interface ElecAlertStatus {
  left: string[];
  inopSys: string[];
}

/** StatusMessages codes used by these alerts */
const S = {
  // Limitations, procedures and conditions (left column)
  ifAbnCabVs: '240500101',
  maxFl100Mea: '240400106',
  minRatSpeed: '240400103',
  procGrvtyFuelFeeding: '240400104',
  maxBrkPr: '240400101',
  fuelGrvtyFeed: '240400105',
  lgGrvtyExtn: '240400102',
  avoidIcing: '700400001',
  ifSevereIce: '700500001',
  minSpdVls10: '700400002',
  maneuverWithCare: '700400003',
  ldgDistProc: '700400004',
  // Information (left column)
  eng1ApprIdleOnly: '240200103',
  eng2ApprIdleOnly: '240200104',
  bothPfdOnSameFac: '240200105',
  lgControlNotAvail: '240200106',
  apuBatStartNotAvail: '240200108',
  slatsSlow: '240200101',
  slatsFlapsSlow: '240200107',
  cat2Only: '240200102',
  cat3SingleOnly: '220200001',
  flsLimited: '340200001',
  ctrTkUsableByGravity: '280200001',
  ctrTk2tUnusable: '280200002',
  // INOP SYS (right column)
  cat3Dual: '220300001',
  mainGalley: '240300001',
  gen1: '240300002',
  gen2: '240300003',
  fwc1: '310300001',
  fwc2: '310300002',
  gps1: '340300001',
  gps2: '340300002',
  atcXpdr1: '340300005',
  atcXpdr2: '340300006',
  galleyFan: '210300012',
  lrCabFan: '210300011',
  pack2: '210300002',
  wingAntiIce: '300300001',
  reverser1: '780300001',
  reverser2: '780300002',
  lTkPump1: '280300001',
  lTkPump2: '280300002',
  rTkPump1: '280300003',
  rTkPump2: '280300004',
  eng1LoopA: '260300001',
  eng1LoopB: '260300002',
  eng2LoopA: '260300003',
  eng2LoopB: '260300004',
  apuFireDet: '260300009',
  blueHyd: '240300101',
  bHyd: '240300102',
  splr125: '240300103',
  splr3: '240300104',
  elac2: '240300105',
  sec23: '240300106',
  adr1: '240300107',
  adr2: '240300108',
  adr3: '240300109',
  ra1: '240300110',
  ra2: '240300111',
  captPitot: '240300112',
  captAoa: '240300113',
  captTat: '240300114',
  foPitot: '240300115',
  foAoa: '240300116',
  foTat: '240300117',
  captStatHeat: '240300118',
  foStatHeat: '240300119',
  stbyStatHeat: '240300120',
  wshldHeat: '240300121',
  lWshldHeat: '240300122',
  rWshldHeat: '240300123',
  wndwHeat: '240300124',
  lWndwHeat: '240300125',
  rWndwHeat: '240300126',
  cat2: '240300127',
  cat3: '240300128',
  ap1: '240300129',
  ap2: '240300130',
  athr: '240300131',
  fcu1: '240300132',
  fcu2: '240300133',
  fac1: '240300134',
  fac2: '240300135',
  yawDamper1: '240300136',
  yawDamper2: '240300137',
  rudTrim1: '240300138',
  rudTrim2: '240300139',
  rudTrvLim1: '240300140',
  rudTrvLim2: '240300141',
  fcdc1: '240300142',
  fcdc2: '240300143',
  ls1: '240300144',
  ls2: '240300145',
  sdac1: '240300146',
  sdac2: '240300147',
  dmc1: '240300148',
  dmc2: '240300149',
  dmc3: '240300150',
  recorderSys: '240300151',
  gpws: '240300152',
  gpwsTerr: '240300153',
  vhf1: '240300154',
  vhf2: '240300155',
  acp12: '240300156',
  acp3: '240300157',
  lrTkPump1: '240300158',
  lrTkPump2: '240300159',
  bElecPump: '240300160',
  yElecPump: '240300161',
  eng2Start: '240300162',
  pack2Regul: '240300163',
  cabPr1: '240300164',
  cabPr2: '240300165',
  ventBlower: '240300166',
  ventExtract: '240300167',
  avncsVent: '240300168',
  gndCool: '240300169',
  lgciu1: '240300170',
  lgciu2: '240300171',
  brkSys1: '240300172',
  brkSys2: '240300173',
  brkSys12: '240300174',
  altnBrk: '240300175',
  antiSkid: '240300176',
  nwStrg: '240300177',
  reverser12: '240300178',
  sdcu: '240300179',
  lavDet: '240300180',
  tr1: '240300181',
  tr2: '240300182',
  apuGen: '240300183',
} as const;

/** AC BUS 1 FAULT STATUS, l.75628-75654 */
export function acBus1FaultStatus(): ElecAlertStatus {
  return {
    left: [S.ldgDistProc, S.slatsSlow, S.cat2Only],
    inopSys: [
      S.blueHyd,
      S.splr3,
      S.adr3,
      S.ra1,
      S.captTat,
      S.lWshldHeat,
      S.lWndwHeat,
      S.cat3,
      S.lrTkPump1,
      S.ventBlower,
      S.galleyFan,
      S.gndCool,
      S.bElecPump,
      S.mainGalley,
      S.gpws,
      S.brkSys1,
      S.dmc3,
      S.lavDet,
      S.reverser1,
      S.gpwsTerr,
    ],
  };
}

/** AC BUS 2 FAULT STATUS, l.75872-75892 */
export function acBus2FaultStatus(): ElecAlertStatus {
  return {
    left: [S.eng2ApprIdleOnly, S.flsLimited],
    inopSys: [
      S.adr2,
      S.yElecPump,
      S.sdac2,
      S.fwc2,
      S.dmc2,
      S.recorderSys,
      S.rWshldHeat,
      S.lgciu2,
      S.ra2,
      S.foPitot,
      S.foAoa,
      S.foTat,
      S.rWndwHeat,
      S.lrTkPump2,
      S.rudTrvLim2,
      S.reverser2,
      S.ventExtract,
      S.pack2Regul,
      S.mainGalley,
      S.gndCool,
      S.rudTrim2,
      S.fac2,
      S.brkSys2,
      S.yawDamper2,
      S.cat2,
      S.atcXpdr2,
      S.ls2,
      S.gps2,
    ],
  };
}

/** AC ESS BUS FAULT STATUS, l.75982-75996 */
export function acEssBusFaultStatus(): ElecAlertStatus {
  return {
    left: [],
    inopSys: [
      S.adr1,
      S.ls1,
      S.gps1,
      S.captPitot,
      S.captAoa,
      S.cat2,
      S.sdac1,
      S.fwc1,
      S.dmc1,
      S.gpws,
      S.gpwsTerr,
      S.yawDamper1,
      S.rudTrim1,
      S.rudTrvLim1,
      S.atcXpdr1,
    ],
  };
}

/** AC ESS BUS SHED STATUS, l.76055-76060 */
export function acEssBusShedStatus(): ElecAlertStatus {
  return { left: [], inopSys: [S.captAoa, S.atcXpdr1] };
}

/** DC BAT BUS FAULT STATUS, l.76288-76292 */
export function dcBatBusFaultStatus(): ElecAlertStatus {
  return { left: [S.apuBatStartNotAvail], inopSys: [S.apuFireDet] };
}

/** DC BUS 1 FAULT STATUS, l.76463-76476 */
export function dcBus1FaultStatus(): ElecAlertStatus {
  return {
    left: [S.cat3SingleOnly],
    inopSys: [
      S.acp3,
      S.captStatHeat,
      S.stbyStatHeat,
      S.lWshldHeat,
      S.lWndwHeat,
      S.avncsVent,
      S.galleyFan,
      S.reverser1,
      S.gndCool,
      S.brkSys1,
      S.cat3Dual,
      S.lavDet,
    ],
  };
}

/**
 * DC BUS 2 FAULT STATUS, l.76714-76747. "IF ABN CAB V/S: MAX FL 100/MEA"; with the DC ESS BUS failed too: L/G GRVTY EXTN,
 * L/G CONTROL NOT AVAIL and LGCIU 1. Design choice: the Y ELEC PUMP "(if selected ON)" is always listed.
 */
export function dcBus2FaultStatus(dcEssBusLost: boolean): ElecAlertStatus {
  return {
    left: [
      S.ifAbnCabVs,
      S.maxFl100Mea,
      ...(dcEssBusLost ? [S.lgGrvtyExtn] : []),
      S.ldgDistProc,
      S.eng2ApprIdleOnly,
      S.bothPfdOnSameFac,
      ...(dcEssBusLost ? [S.lgControlNotAvail] : []),
      S.slatsFlapsSlow,
      S.cat3SingleOnly,
    ],
    inopSys: [
      S.splr125,
      S.elac2,
      S.sec23,
      S.foStatHeat,
      S.vhf2,
      S.ap2,
      S.rWshldHeat,
      S.rWndwHeat,
      S.fac2,
      S.fcu2,
      S.cat3Dual,
      S.lgciu2,
      S.lTkPump2,
      S.rTkPump2,
      S.mainGalley,
      S.reverser2,
      S.cabPr2,
      S.eng1LoopB,
      S.yElecPump,
      S.brkSys2,
      ...(dcEssBusLost ? [S.lgciu1] : []),
      S.eng2LoopA,
      S.fcdc2,
    ],
  };
}

/** DC BUS 1+2 FAULT STATUS, l.77039-77075 */
export function dcBus1And2FaultStatus(): ElecAlertStatus {
  return {
    left: [
      S.maxBrkPr,
      S.ldgDistProc,
      S.eng2ApprIdleOnly,
      S.bothPfdOnSameFac,
      S.ctrTkUsableByGravity,
      S.ctrTk2tUnusable,
      S.apuBatStartNotAvail,
      S.slatsFlapsSlow,
      S.cat3SingleOnly,
      S.flsLimited,
    ],
    inopSys: [
      S.splr125,
      S.elac2,
      S.sec23,
      S.acp3,
      S.vhf2,
      S.stbyStatHeat,
      S.captStatHeat,
      S.foStatHeat,
      S.ap2,
      S.wshldHeat,
      S.wndwHeat,
      S.fac2,
      S.fcu2,
      S.cat3Dual,
      S.nwStrg,
      S.sdcu,
      S.antiSkid,
      S.cabPr2,
      S.lgciu2,
      S.reverser12,
      S.galleyFan,
      S.avncsVent,
      S.lrCabFan,
      S.mainGalley,
      S.gndCool,
      S.apuFireDet,
      S.yElecPump,
      S.brkSys12,
      S.eng2LoopA,
      S.eng1LoopB,
      S.lTkPump2,
      S.lavDet,
      S.fcdc2,
      S.pack2,
      S.rTkPump2,
    ],
  };
}

/**
 * DC EMER CONFIG STATUS, l.77221-77246: MIN RAT SPEED 140 KT, PROC: GRVTY FUEL FEEDING, MAX BRK PR 1000 PSI, FUEL GRVTY
 * FEED, LDG DIST PROC APPLY, and "Refer to the list of STATUS INFO" and "INOP SYS" of the ELEC DC BUS 1+2 FAULT.
 */
export function dcEmerConfigStatus(): ElecAlertStatus {
  const dcBus1And2 = dcBus1And2FaultStatus();
  return {
    left: [S.minRatSpeed, S.procGrvtyFuelFeeding, S.maxBrkPr, S.fuelGrvtyFeed, S.ldgDistProc, ...dcBus1And2.left],
    inopSys: dcBus1And2.inopSys,
  };
}

/** DC ESS BUS FAULT STATUS, l.77337-77369; with the DC BUS 2 failed too: L/G GRVTY EXTN, L/G CONTROL NOT AVAIL, LGCIU 2 */
export function dcEssBusFaultStatus(dcBus2Lost: boolean): ElecAlertStatus {
  return {
    left: [
      ...(dcBus2Lost ? [S.lgGrvtyExtn] : []),
      S.ldgDistProc,
      S.eng1ApprIdleOnly,
      S.eng2ApprIdleOnly,
      S.bothPfdOnSameFac,
      ...(dcBus2Lost ? [S.lgControlNotAvail] : []),
      S.slatsFlapsSlow,
      S.cat3SingleOnly,
    ],
    inopSys: [
      S.bHyd,
      S.splr3,
      S.vhf1,
      S.acp12,
      S.wingAntiIce,
      S.ap1,
      S.athr,
      S.fcu1,
      S.fac1,
      S.lTkPump1,
      S.rTkPump1,
      S.reverser2,
      S.eng2Start,
      S.cabPr1,
      S.ventExtract,
      S.bElecPump,
      S.eng1LoopA,
      S.eng2LoopB,
      S.gpws,
      S.lgciu1,
      ...(dcBus2Lost ? [S.lgciu2] : []),
      S.fcdc1,
      S.altnBrk,
    ],
  };
}

/** DC ESS BUS SHED STATUS, l.77456-77473 */
export function dcEssBusShedStatus(): ElecAlertStatus {
  return {
    left: [
      S.avoidIcing,
      S.ifSevereIce,
      S.minSpdVls10,
      S.maneuverWithCare,
      S.ldgDistProc,
      S.bothPfdOnSameFac,
      S.cat3SingleOnly,
    ],
    inopSys: [S.wingAntiIce, S.ap1, S.cat3Dual, S.fac1, S.ventExtract, S.fcdc1],
  };
}

/** TR 1(2) FAULT STATUS, l.78242-78248: CAT 3 SINGLE ONLY; INOP SYS TR 1(2), CAT 3 DUAL */
export function trFaultStatus(trNumber: 1 | 2): ElecAlertStatus {
  return { left: [S.cat3SingleOnly], inopSys: [trNumber === 1 ? S.tr1 : S.tr2, S.cat3Dual] };
}

/**
 * GEN 1(2) FAULT (l.78041-78049), GEN 1(2) OFF (l.78085-78093) and IDG 1(2) DISCONNECTED (l.78127-78135) STATUS:
 * CAT 3 SINGLE ONLY; INOP SYS MAIN GALLEY "(only if APU GEN is not online)", GEN 1(2), CAT 3 DUAL.
 */
export function engineGeneratorLostStatus(genNumber: 1 | 2, apuGenOnline: boolean): ElecAlertStatus {
  return {
    left: [S.cat3SingleOnly],
    inopSys: [...(apuGenOnline ? [] : [S.mainGalley]), genNumber === 1 ? S.gen1 : S.gen2, S.cat3Dual],
  };
}

/** APU GEN FAULT STATUS, l.76127-76134: INOP SYS MAIN GALLEY "(When only one GEN operating)", APU GEN */
export function apuGenFaultStatus(onlyOneGenOperating: boolean): ElecAlertStatus {
  return { left: [], inopSys: [...(onlyOneGenOperating ? [S.mainGalley] : []), S.apuGen] };
}

/**
 * ELEC EMER CONFIG lines 15 FUEL CONSUMPT INCRSD and 16 FMS PRED UNRELIABLE (codes 240003116, 240003117): the procedure
 * lists them after BLOWER + EXTRACT OVRD with no condition (l.77606-77608). Shown in flight, as the other in-flight
 * lines of the procedure (PseudoFWC 2400031).
 * @param inFlight the aircraft is in flight
 * @returns the line indexes 15 and 16, or null
 */
export function elecEmerConfigFuelLines(inFlight: boolean): (number | null)[] {
  return [inFlight ? 15 : null, inFlight ? 16 : null];
}

/**
 * ELEC EMER CONFIG STATUS, l.77641-77675, in the FCOM order: MIN RAT SPEED 140 KT, MAX SPEED 320 KT, MAX BRK PR 1000
 * PSI, FUEL GRVTY FEED, AVOID NEGATIVE G FACTOR, APPR PROC: FOR LDG USE FLAP 3, APPR SPD VREF +10/140 KT, LDG DIST PROC
 * APPLY, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE, ALTN LAW: PROT LOST, WHEN L/G DN: DIRECT LAW, SLATS/FLAPS SLOW, FLS
 * LIMITED TO F-APP + RAW; INOP SYS F/CTL PROT, REVERSER 1+2, ADR 2+3, IR 2, RA 1+2, SPLR 1+2+5, ELAC 2, SEC 2+3, A/CALL
 * OUT, AP 1+2, A/THR, FUEL PUMPS, ANTI SKID, N/W STRG, CAT 2. Not shown: the STEEP APPR option, the "Note" about the
 * STBY airspeed (a crew note) and the "FOR LDG : USE FLAP 3" reminder in CONF 3.
 */
export function elecEmerConfigStatus(): ElecAlertStatus {
  return {
    left: [
      '240400301',
      '240400302',
      '240400303',
      '240400304',
      '240400305',
      '240500301',
      '240400306',
      '240400307',
      '240400308',
      '240400309',
      '240400310',
      '240200301',
      '240200302',
      '240200303',
      '240200304',
    ],
    inopSys: [
      '240300301',
      '240300302',
      '240300303',
      '240300304',
      '240300305',
      '240300306',
      '240300307',
      '240300308',
      '240300309',
      '240300310',
      '240300311',
      '240300312',
      '240300313',
      '240300314',
      '240300315',
    ],
  };
}
