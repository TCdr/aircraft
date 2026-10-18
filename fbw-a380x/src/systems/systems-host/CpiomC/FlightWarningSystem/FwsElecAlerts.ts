// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X ELEC (ATA 24) alert conditions, computed from the electrical network state the Rust electrical system
 * (a380_systems/src/electrical) publishes as L:vars.
 *
 * The aircraft has one triggering condition per alert (the AC 1 busbar is lost, TR 1 is failed...). Where the
 * simulation only publishes the result of a failure (a busbar without power, a TR without output), the condition
 * here is that result, gated so that it only fires when the failed part should be working. Every such gate is a
 * design choice and is commented where it is made.
 */

/** Four values, one per engine, AC busbar, or TR (TR 1, TR 2, TR ESS, APU TR) */
export type Four<T> = [T, T, T, T];

/** Two values: DC 1 and DC 2, or APU GEN A and APU GEN B */
export type Two<T> = [T, T];

/** The electrical network state the FWS reads, as real booleans */
export interface ElecNetworkInputs {
  /** AC 1, AC 2, AC 3, AC 4 busbars powered */
  acBusPowered: Four<boolean>;
  acEssBusPowered: boolean;
  /** DC 1 and DC 2 busbars powered */
  dcBusPowered: Two<boolean>;
  dcEssBusPowered: boolean;
  /** AC ESS feed contactor 3XC2 closed: the AC ESS busbar (the emergency network) is supplied by the AC 4 busbar */
  acEssFedByAc4: boolean;
  /** Contactor 991PU6 closed: TR 2 is supplied directly by external power (ground servicing, all AC busbars off) */
  tr2FedByExtPwr: boolean;
  /** Output potential normal of TR 1, TR 2, TR ESS and APU TR (Rust TR_1 to TR_4) */
  trPotentialNormal: Four<boolean>;
  /** GEN 1-4 pb-sw ON */
  engGenPbOn: Four<boolean>;
  /** Engine generator 1-4 output potential normal */
  engGenPotentialNormal: Four<boolean>;
  /** Engine generator drive 1-4 connected (the DRIVE pb-sw releases it) */
  driveConnected: Four<boolean>;
  /** Engine 1-4 running (engine state ON) */
  engineRunning: Four<boolean>;
  /** ENG 1-4 FIRE pb released (it switches the generator off) */
  engineFirePbReleased: Four<boolean>;
  /** APU available */
  apuAvailable: boolean;
  /** APU GEN A and APU GEN B output potential normal */
  apuGenPotentialNormal: Two<boolean>;
  /** BUS TIE pb-sw in AUTO */
  busTiePbAuto: boolean;
}

/** One flag per alert, true while its triggering condition is met */
export interface ElecAlertFlags {
  acBusFault: Four<boolean>;
  acEssBusFault: boolean;
  acEssBusAltn: boolean;
  dcBusFault: Two<boolean>;
  dcEssBusFault: boolean;
  emerConfig: boolean;
  genFault: Four<boolean>;
  genOff: Four<boolean>;
  driveDisconnected: Four<boolean>;
  apuGenFault: Two<boolean>;
  /** ELEC TR 1(2)(ESS) FAULT, in the order TR 1, TR 2, TR ESS */
  trFault: [boolean, boolean, boolean];
  apuTrFault: boolean;
  busTieOff: boolean;
}

const ENGINES = [0, 1, 2, 3] as const;

/**
 * Reads the electrical network L:vars with `read` (SimVar.GetSimVarValue(name, Bool) in the sim) as real booleans.
 * GetSimVarValue returns the number 1 for a Bool, which SubscribableMapFunctions.or()/and() do not count as true.
 */
export function readElecNetworkInputs(read: (name: string) => number): ElecNetworkInputs {
  const isOn = (name: string): boolean => read(name) > 0;
  const perEngine = (name: (n: number) => string): Four<boolean> =>
    ENGINES.map((i) => isOn(name(i + 1))) as Four<boolean>;
  // Engine state ON = 1 (0 off, 2 starting, 3 restarting, 4 shutting down), as FwsCore's engineState enum
  const engineRunning = ENGINES.map((i) => read(`L:A32NX_ENGINE_STATE:${i + 1}`) === 1) as Four<boolean>;

  return {
    acBusPowered: perEngine((n) => `L:A32NX_ELEC_AC_${n}_BUS_IS_POWERED`),
    // The A380X electrical system models the AC ESS busbar (400XP) as the A320's "AC ESS SHED" bus and the AC EMER busbar
    // as its "AC ESS" bus (a380_systems alternating_current.rs, SD AC page BusBar.tsx): AC ESS is the ESS_SHED variable
    acEssBusPowered: isOn('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED'),
    dcBusPowered: [isOn('L:A32NX_ELEC_DC_1_BUS_IS_POWERED'), isOn('L:A32NX_ELEC_DC_2_BUS_IS_POWERED')],
    dcEssBusPowered: isOn('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED'),
    acEssFedByAc4: isOn('L:A32NX_ELEC_CONTACTOR_3XC2_IS_CLOSED'),
    tr2FedByExtPwr: isOn('L:A32NX_ELEC_CONTACTOR_991PU6_IS_CLOSED'),
    trPotentialNormal: perEngine((n) => `L:A32NX_ELEC_TR_${n}_POTENTIAL_NORMAL`),
    // The A380X GEN pb-sw is the sim's engine alternator switch (A32NX_Interior_Elec.xml, a380_systems_wasm lib.rs copies
    // it into the Rust-internal OVHD_ELEC_ENG_GEN_n_PB_IS_ON aspect, which is no L:var)
    engGenPbOn: perEngine((n) => `A:GENERAL ENG MASTER ALTERNATOR:${n}`),
    engGenPotentialNormal: perEngine((n) => `L:A32NX_ELEC_ENG_GEN_${n}_POTENTIAL_NORMAL`),
    driveConnected: perEngine((n) => `L:A32NX_ELEC_ENG_GEN_${n}_IDG_IS_CONNECTED`),
    engineRunning,
    engineFirePbReleased: perEngine((n) => `L:A32NX_FIRE_BUTTON_ENG${n}`),
    apuAvailable: isOn('L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE'),
    apuGenPotentialNormal: [
      isOn('L:A32NX_ELEC_APU_GEN_1_POTENTIAL_NORMAL'),
      isOn('L:A32NX_ELEC_APU_GEN_2_POTENTIAL_NORMAL'),
    ],
    busTiePbAuto: isOn('L:A32NX_OVHD_ELEC_BUS_TIE_PB_IS_AUTO'),
  };
}

/**
 * Computes the ELEC alert conditions. Stateful only for the GEN FAULT memory: once a generator failed, the alert
 * stays (with its GEN OFF line ticked) after the crew switched the generator off, until the generator works again.
 */
export class ElecAlertLogic {
  /** Latched "engine generator failed" per engine, see update() */
  private readonly genFaultMemory: Four<boolean> = [false, false, false, false];

  public update(i: ElecNetworkInputs): ElecAlertFlags {
    const anyAcBusPowered = i.acBusPowered.some((powered) => powered);

    // A busbar counts as lost only while the AC network itself is up, i.e. at least one
    // AC busbar is powered. Design choice: with all four AC busbars off the aircraft is either unpowered on the ground
    // (batteries only, FWS phase 1/12) or in ELEC EMER CONFIG, whose procedure covers the lost busbars.
    const busLost = (powered: boolean): boolean => anyAcBusPowered && !powered;

    for (const e of ENGINES) {
      // GEN FAULT: the engine generator is failed. The simulation gives no generator health word,
      // only its output: the generator counts as failed when it gives no normal output although it should (engine
      // running, GEN pb-sw ON, drive connected, ENG FIRE pb not released: each of these switches it off on purpose).
      const shouldWork = i.engineRunning[e] && i.engGenPbOn[e] && i.driveConnected[e] && !i.engineFirePbReleased[e];
      if (shouldWork && !i.engGenPotentialNormal[e]) {
        this.genFaultMemory[e] = true;
      }
      // Reset when the generator works again, or when its engine or drive no longer runs it (then GEN OFF or
      // DRIVE DISCONNECTED, or no alert at all, describe the situation).
      if (i.engGenPotentialNormal[e] || !i.engineRunning[e] || !i.driveConnected[e]) {
        this.genFaultMemory[e] = false;
      }
    }

    return {
      acBusFault: i.acBusPowered.map(busLost) as Four<boolean>,
      acEssBusFault: busLost(i.acEssBusPowered),
      // AC ESS BUS ALTN: the emergency network is supplied by the AC 4 busbar (contactor 3XC2 closed)
      acEssBusAltn: i.acEssFedByAc4 && i.acEssBusPowered,
      dcBusFault: i.dcBusPowered.map(busLost) as Two<boolean>,
      dcEssBusFault: busLost(i.dcEssBusPowered),
      emerConfig: !anyAcBusPowered,
      genFault: [...this.genFaultMemory] as Four<boolean>,
      // GEN OFF: the GEN pb-sw is abnormally OFF. Abnormal = with its engine running and the
      // drive connected (design choice: with the drive released, DRIVE DISCONNECTED asks for GEN OFF itself), and
      // not because the generator failed (the GEN FAULT procedure asks for GEN OFF).
      genOff: ENGINES.map(
        (e) => !i.engGenPbOn[e] && i.engineRunning[e] && i.driveConnected[e] && !this.genFaultMemory[e],
      ) as Four<boolean>,
      // DRIVE DISCONNECTED: the generator disconnects from its engine while it was operating. Operating = engine
      // running (design choice, no other criterion is given).
      driveDisconnected: ENGINES.map((e) => !i.driveConnected[e] && i.engineRunning[e]) as Four<boolean>,
      // The APU generators give their output whatever their pb-sw (it
      // only drives the line contactor), so a running APU without normal generator output means a failed generator.
      apuGenFault: i.apuGenPotentialNormal.map((normal) => i.apuAvailable && !normal) as Two<boolean>,
      // TR FAULT: no normal output although its AC supply is powered.
      // Supplies as in a380_systems/src/electrical/alternating_current.rs: TR 1 from AC 2, TR 2 from AC 3 (or from
      // external power in ground servicing), TR ESS from AC ESS.
      trFault: [
        i.acBusPowered[1] && !i.trPotentialNormal[0],
        (i.acBusPowered[2] || i.tr2FedByExtPwr) && !i.trPotentialNormal[1],
        i.acEssBusPowered && !i.trPotentialNormal[2],
      ],
      // The APU TR is supplied by AC 4.
      apuTrFault: i.acBusPowered[3] && !i.trPotentialNormal[3],
      busTieOff: !i.busTiePbAuto,
    };
  }
}

/**
 * Senses an "... OFF THEN ON" procedure line: completed once the switches have been seen all OFF and then all ON
 * again since the last reset.
 */
export class OffThenOnSensor {
  private seenOff = false;

  private completed = false;

  public reset(): void {
    this.seenOff = false;
    this.completed = false;
  }

  public update(allOff: boolean, allOn: boolean): boolean {
    if (allOff) {
      this.seenOff = true;
    } else if (this.seenOff && allOn) {
      this.completed = true;
    }
    return this.completed;
  }

  public get isCompleted(): boolean {
    return this.completed;
  }
}

/** FL 230, the altitude that selects the descent branch of the ELEC EMER CONFIG procedure */
const EMER_CONFIG_BRANCH_ALTITUDE_FT = 23_000;

/** The state the ELEC EMER CONFIG procedure lines depend on */
export class ElecEmerConfigProcedureState {
  private wasActive = false;

  /** The alert triggered at or below FL 230; false above FL 230 or without a valid altitude */
  public triggeredAtOrBelowFl230 = false;

  /** First ALL GENs ... OFF THEN ON */
  public readonly firstGensReset = new OffThenOnSensor();

  /** Second ALL GENs ... OFF THEN ON, after BUS TIE OFF */
  public readonly secondGensReset = new OffThenOnSensor();

  /**
   * @param active whether ELEC EMER CONFIG is active
   * @param pressureAltitudeFt the ADR pressure altitude, null if not valid
   * @param allGenPbOff all four GEN pb-sw OFF
   * @param allGenPbOn all four GEN pb-sw ON
   * @param busTieOff BUS TIE pb-sw OFF
   */
  public update(
    active: boolean,
    pressureAltitudeFt: number | null,
    allGenPbOff: boolean,
    allGenPbOn: boolean,
    busTieOff: boolean,
  ): void {
    if (active && !this.wasActive) {
      // Evaluated once, when the alert triggers
      this.triggeredAtOrBelowFl230 =
        pressureAltitudeFt !== null && pressureAltitudeFt <= EMER_CONFIG_BRANCH_ALTITUDE_FT;
      this.firstGensReset.reset();
      this.secondGensReset.reset();
    }
    this.wasActive = active;

    if (!active) {
      return;
    }
    this.firstGensReset.update(allGenPbOff, allGenPbOn);
    // The second reset counts only once the first one is done and the BUS TIE is OFF
    if (this.firstGensReset.isCompleted && busTieOff) {
      this.secondGensReset.update(allGenPbOff, allGenPbOn);
    }
  }
}

/** 42 000 lb, the 19 000 kg of the procedure text */
const FEED_TANK_EMER_OUTR_XFR_THRESHOLD_KG = 19_000;

/**
 * The procedure condition "fuel quantity in feed tank 1 and 4 below 42 000 lb". Design choice: each of feed tanks 1 and
 * 4 holds less than 19 000 kg (the wording does not say whether the sum or each tank is meant; each tank is the literal
 * reading).
 */
export function feedTanks1And4BelowEmerOutrXfrThreshold(feedTank1Kg: number, feedTank4Kg: number): boolean {
  return feedTank1Kg < FEED_TANK_EMER_OUTR_XFR_THRESHOLD_KG && feedTank4Kg < FEED_TANK_EMER_OUTR_XFR_THRESHOLD_KG;
}

/** STATUS content of an alert: keys of EcamLimitations (LIMITATIONS) and EcamInopSys (INOP SYS, REDUND LOSS) */
export interface ElecAlertStatus {
  /** LIMITATIONS ON ECAM, APPR AND LDG column */
  limitationsApprLdg: string[];
  /** INOP SYS, ALL PHASES column */
  inopSysAllPhases: string[];
  /** INOP SYS, APPR & LDG column */
  inopSysApprLdg: string[];
  /** REDUND LOSS (STATUS MORE INFO) */
  redundLoss: string[];
}

/**
 * STATUS of ELEC AC ESS BUS FAULT, in the order of the real STATUS page.
 * Shared, never mutated: FwsAbnormalSensed returns these arrays as they are.
 */
export const ELEC_AC_ESS_BUS_FAULT_STATUS: ElecAlertStatus = {
  // SLATS SLOW
  limitationsApprLdg: ['290400001'],
  inopSysAllPhases: [
    '340300004', // ADR 1
    '340300050', // GPS 1
    '340300037', // WXR 1
    '340300053', // XPDR 1
    '340300011', // TCAS 1
    '230300022', // HF 1
    '280300002', // FEED TK 2 MAIN PMP
    '300300008', // STBY PITOT HEATG
    '300300002', // L WINDSHIELD HEATG
    '310300004', // DFDR
  ],
  inopSysApprLdg: [
    '290100005', // SLAT SYS 1
    '220300027', // CAT 2
    '220300010', // GLS AUTOLAND
    '340300054', // LS 1
    '340300055', // TAWS 1
  ],
  // The STATUS page only shows REDUND LOSS from FwsInopSys (redundancyLoss items); the EwdAbnormalItem.redundLoss
  // field is never read by FwsCore. FwsInopSys holds one entry per key below.
  redundLoss: [
    '340300024', // RA SYS C
    '280300003', // FEED TK 3 STBY PMP
    '280300004', // TRIM TK L PMP
    '740300001', // ENG 1+2+3+4 IGN A
    '210300001', // PACK 1 CTL 1
    '210300003', // PACK 2 CTL 1
  ],
};
