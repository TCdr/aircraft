// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import type { EwdAbnormalDict, EwdAbnormalItem } from './FwsAbnormalSensed';

/*
 * The A-ICE probe heat, window heat, ice detector, AICU and drain mast alerts of the A380X FWS. The heat states come
 * from the systems model (a380_systems probe_window_heat.rs, the AICU channels in ice_rain_protection.rs).
 */

/** The ECAM alert ids (texts in EcamMessages/AbnormalSensed/ata29-30.ts) */
export const PROBE_WINDOW_HEAT_ALERT_IDS = {
  allProbesNotDeiced: ['300800026', '300800027', '300800028'],
  controlSystemFault: '300800029',
  engineValveMonitoringFault: ['300800030', '300800031', '300800032', '300800033'],
  iceDetectorFault: '300800034',
  /** Left, right */
  fixedWindowFault: ['300800035', '300800036'],
  slidingWindowFault: ['300800037', '300800038'],
  windshieldFault: ['300800039', '300800040'],
  bothWindshieldsFault: '300800041',
  /** ADR 1, 2, 3 */
  pitotTatAoaProbeFault: ['300800042', '300800043', '300800044'],
  /** ADR 1+2, 1+3, 2+3 */
  pitotTatAoaProbePairFault: ['300800045', '300800046', '300800047'],
  sideslipProbeFault: ['300800048', '300800049', '300800050'],
  staticProbeFault: ['300800051', '300800052', '300800053'],
  stbyPitotProbeFault: '300800054',
  stbyStaticProbeFault: '300800055',
  drainMastsFault: '300800056',
};

/** FOR APPROACH deferred procedure of A-ICE CTL SYS FAULT, with the wing anti-ice failed */
const CONTROL_SYSTEM_FAULT_DEFERRED_PROC = '300700001';

const INOP_SYS = {
  wingAntiIce: '300300001',
  /** L windshield, sliding window, fixed window, then R */
  windowHeating: [
    ['300300002', '300300003', '300300004'],
    ['300300005', '300300006', '300300007'],
  ],
  stbyPitotHeating: '300300008',
  engineAntiIce: ['300300010', '300300011', '300300012', '300300013'],
  adrProbesHeating: ['300300014', '300300015', '300300016'],
  adrPairProbesHeating: ['300300017', '300300018', '300300019'],
  sideslipProbeHeating: ['300300020', '300300021', '300300022'],
  stbyStaticHeating: '300300023',
  iceDetection: '300300024',
  drainMastsHeating: '300300025',
  bothWindshieldsHeating: '300300026',
  engineAntiIceMonitoring: ['300300027', '300300028', '300300029', '300300030'],
  cat2: '220300027',
  cat3Dual: '220300028',
  flightControlProtections: '290100008',
  brakeToVacate: '320300007',
  runwayOverrun: '320300022',
};
const INFO = { cat3SingleOnly: '220200016', altnLawProtLost: '340200002' };
const LIMITATIONS = { avoidIcing: '300400001', maxSpeed310: '270400002', landingFlapLever3: '270400001' };

const PROBE_WINDOW_HEAT_PHASE_INHIBITION = {
  allProbesNotDeiced: [3, 4, 5, 6, 9, 10, 11],
  controlSystemFault: [3, 4, 5, 6, 9, 10],
  engineValveMonitoringFault: [3, 4, 5, 6, 7, 9, 10, 11],
  iceDetectorFault: [4, 5, 6, 7, 9, 10],
  /** L(R) FIXED and SLIDING WINDOW, L(R) WINDSHIELD */
  sideWindowFault: [3, 4, 5, 6, 7, 9, 10, 11],
  /** L+R WINDSHIELDS, the single pitot TAT AOA, sideslip, static and standby probes */
  probeFault: [3, 4, 5, 6, 7, 9, 10],
  pitotTatAoaProbePairFault: [4, 5, 6, 7, 9, 10],
  drainMastsFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const AICU_1 = 0;
const AICU_2 = 1;
const CHANNEL_A = 0;
const CHANNEL_B = 1;
/**
 * The AICU channel that monitors the anti-ice valve of each engine: without it the engine anti-ice is lost (the
 * INOP SYS ENG n A-ICE of A-ICE CTL SYS FAULT)
 */
const ENGINE_MONITORING_CHANNELS: [number, number][] = [
  [AICU_2, CHANNEL_B],
  [AICU_1, CHANNEL_B],
  [AICU_2, CHANNEL_A],
  [AICU_1, CHANNEL_A],
];

/** The time the PROBE & WINDOW HEAT pb must be ON before the probes count as still not deiced */
const PROBES_STILL_NOT_DEICED_SECONDS = 3;
/** AVOID ICING CONDs once an AICU channel is failed for this time */
const AICU_CHANNEL_FAULT_CONFIRM_SECONDS = 5;
/** A-ICE CTL SYS FAULT when the supply of an AICU is interrupted for longer than this */
const AICU_POWER_INTERRUPTION_SECONDS = 2;

export interface AdrProbeHeatInputs {
  /** The ADIRU no longer commands the heating of its probes */
  automaticHeatingLost: boolean;
  /** All probes of the ADR are heated */
  heated: boolean;
  pitotTatAoaFault: boolean;
  /** The left or the right static probe */
  staticFault: boolean;
  sideslipFault: boolean;
}

export interface SideWindowHeatInputs {
  windshieldFault: boolean;
  slidingWindowFault: boolean;
  fixedWindowFault: boolean;
}

export interface ProbeWindowHeatInputs {
  adrProbes: AdrProbeHeatInputs[];
  stbyPitotFault: boolean;
  stbyStaticFault: boolean;
  /** CAPT (left), F/O (right) */
  windows: SideWindowHeatInputs[];
  iceDetectorFault: boolean[];
  drainMastFault: boolean;
  /** [AICU 1, AICU 2][channel A, channel B] */
  aicuChannelFault: boolean[][];
  /** AICU 1 (DC ESS), AICU 2 (DC 2) */
  aicuPowered: boolean[];
  /** ENG 1 to 4 */
  engineValveMonitoringFault: boolean[];
  probeWindowHeatPbOn: boolean;
  /** ENG 1 to 4 A-ICE pb, then WING A-ICE pb */
  antiIcePbsOn: boolean[];
  /** The AIR DATA switching knob: 0 CAPT on 3, 1 NORM, 2 F/O on 3 */
  airDataKnob: number;
  anyEngineRunning: boolean;
  onGround: boolean;
}

/**
 * The pitot TAT AOA probe alerts: a pair alert for two failed probes (1+2 first, then 1+3, 2+3), a single alert for a
 * failed probe that is in no pair alert.
 * Design choice: with the three probes failed, PROBE 1+2 and PROBE 3 (no alert covers the three).
 * @param faults the heating faults of the probes of ADR 1, 2 and 3
 */
export function pitotTatAoaProbeAlerts(faults: readonly boolean[]): { single: boolean[]; pairs: boolean[] } {
  const inPair = [false, false, false];
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ].map(([first, second]) => {
    const pair = faults[first] && faults[second] && !inPair[first] && !inPair[second];
    if (pair) {
      inPair[first] = true;
      inPair[second] = true;
    }
    return pair;
  });
  return { single: faults.map((fault, adr) => fault && !inPair[adr]), pairs };
}

/**
 * The INOP SYS of A-ICE CTL SYS FAULT: the windows of a side and the engine anti-ice monitored by a failed channel B,
 * the engine anti-ice monitored by a failed channel A, the wing anti-ice with both channels A or both channels B failed.
 * @param channelFault [AICU 1, AICU 2][channel A, channel B]
 */
export function controlSystemFaultInopSys(channelFault: readonly (readonly boolean[])[]): string[] {
  const inop: string[] = [];
  [AICU_1, AICU_2].forEach((aicu) => {
    if (channelFault[aicu][CHANNEL_B]) {
      inop.push(...INOP_SYS.windowHeating[aicu]);
    }
  });
  ENGINE_MONITORING_CHANNELS.forEach(([aicu, channel], engine) => {
    if (channelFault[aicu][channel]) {
      inop.push(INOP_SYS.engineAntiIce[engine]);
    }
  });
  if (isWingAntiIceLost(channelFault)) {
    inop.push(INOP_SYS.wingAntiIce);
  }
  return inop;
}

/** The wing anti-ice is lost with both channels A (control) or both channels B (monitoring) failed */
function isWingAntiIceLost(channelFault: readonly (readonly boolean[])[]): boolean {
  return (
    (channelFault[AICU_1][CHANNEL_A] && channelFault[AICU_2][CHANNEL_A]) ||
    (channelFault[AICU_1][CHANNEL_B] && channelFault[AICU_2][CHANNEL_B])
  );
}

/**
 * The lines of A-ICE CTL SYS FAULT, in the order of the procedure items of ata29-30.ts: 0 CHANNEL 1A, 1 CHANNEL 1B,
 * 2 CHANNEL 1 A+B, 3 to 5 the same for AICU 2, 6 to 9 ENG 1 to 4 A-ICE FAULT, 10 IF AICU CHANNEL FAILED > 5 S,
 * 11 AVOID ICING CONDs, 12 IF AICU PWR INTERRUPTED > 2 S, 13 ALL ENGs & WING A-ICE ON THEN OFF, 14 ENG & WING
 * A-ICE AS RQRD.
 */
export function controlSystemFaultLines(
  channelFault: readonly (readonly boolean[])[],
  channelFaultConfirmed: boolean,
  powerInterrupted: boolean,
  antiIceCycledOn: boolean,
): { show: boolean[]; checked: boolean[] } {
  // CHANNEL nA, CHANNEL nB, CHANNEL n A+B of each AICU (no flatMap in the Coherent runtime)
  const channelLines = [AICU_1, AICU_2].reduce<boolean[]>((lines, aicu) => {
    const [a, b] = channelFault[aicu];
    return lines.concat([a && !b, b && !a, a && b]);
  }, []);
  const engineLines = ENGINE_MONITORING_CHANNELS.map(([aicu, channel]) => channelFault[aicu][channel]);
  return {
    show: [
      ...channelLines,
      ...engineLines,
      channelFaultConfirmed,
      channelFaultConfirmed,
      powerInterrupted,
      powerInterrupted,
      powerInterrupted,
    ],
    checked: [...channelLines, ...engineLines, channelFaultConfirmed, false, powerInterrupted, antiIceCycledOn, false],
  };
}

/** A condition that must last a time */
class ConfirmedCondition {
  private seconds = 0;

  public readonly output = Subject.create(false);

  constructor(private readonly confirmSeconds: number) {}

  update(condition: boolean, deltaTimeSeconds: number): void {
    this.seconds = condition ? this.seconds + deltaTimeSeconds : 0;
    this.output.set(condition && this.seconds >= this.confirmSeconds);
  }
}

/**
 * The supply interruption of the AICUs (A-ICE CTL SYS FAULT): an AICU unpowered for more than 2 s. The alert stays
 * until the crew has set all ENG and WING A-ICE pb ON then OFF, which resets the AICUs.
 * Design choice: monitored with an engine running, and forgotten on ground with all engines stopped, so a ground power
 * change before the engine start or after the shutdown does not raise it.
 */
class AicuPowerInterruption {
  private readonly unpowered = [0, 1].map(() => new ConfirmedCondition(AICU_POWER_INTERRUPTION_SECONDS));

  public readonly interrupted = Subject.create(false);

  /** All ENG and WING A-ICE pb were seen ON since the supply came back */
  public readonly antiIceCycledOn = Subject.create(false);

  update(
    aicuPowered: readonly boolean[],
    antiIcePbsOn: readonly boolean[],
    anyEngineRunning: boolean,
    onGround: boolean,
    deltaTimeSeconds: number,
  ): void {
    this.unpowered.forEach((condition, aicu) => condition.update(!aicuPowered[aicu], deltaTimeSeconds));
    if (onGround && !anyEngineRunning) {
      this.reset();
      return;
    }
    if (anyEngineRunning && this.unpowered.some((condition) => condition.output.get())) {
      this.interrupted.set(true);
      this.antiIceCycledOn.set(false);
    } else if (this.interrupted.get() && aicuPowered.every((powered) => powered)) {
      if (antiIcePbsOn.every((on) => on)) {
        this.antiIceCycledOn.set(true);
      } else if (this.antiIceCycledOn.get() && antiIcePbsOn.every((on) => !on)) {
        this.reset();
      }
    }
  }

  private reset(): void {
    this.interrupted.set(false);
    this.antiIceCycledOn.set(false);
  }
}

/** The alert conditions of the probe and window heat, ice detectors, AICUs and drain masts */
export class ProbeWindowHeatAlertMonitor {
  public readonly allProbesNotDeiced = [0, 1, 2].map(() => Subject.create(false));

  /** The probes of the ADR are still not heated 3 s after the PROBE & WINDOW HEAT pb was set ON */
  public readonly probesStillNotDeiced = [0, 1, 2].map(() => new ConfirmedCondition(PROBES_STILL_NOT_DEICED_SECONDS));

  public readonly pitotTatAoaProbeFault = [0, 1, 2].map(() => Subject.create(false));

  public readonly pitotTatAoaProbePairFault = [0, 1, 2].map(() => Subject.create(false));

  public readonly sideslipProbeFault = [0, 1, 2].map(() => Subject.create(false));

  public readonly staticProbeFault = [0, 1, 2].map(() => Subject.create(false));

  public readonly stbyPitotProbeFault = Subject.create(false);

  public readonly stbyStaticProbeFault = Subject.create(false);

  public readonly windshieldFault = [0, 1].map(() => Subject.create(false));

  public readonly bothWindshieldsFault = Subject.create(false);

  public readonly slidingWindowFault = [0, 1].map(() => Subject.create(false));

  public readonly fixedWindowFault = [0, 1].map(() => Subject.create(false));

  public readonly iceDetectorFault = Subject.create(false);

  /** At least one ice detector works: the ICE DETECTED alerts and the ICE NOT DETECTED memo need it */
  public readonly iceDetectionAvailable = Subject.create(true);

  public readonly engineValveMonitoringFault = [0, 1, 2, 3].map(() => Subject.create(false));

  public readonly drainMastsFault = Subject.create(false);

  /** [AICU 1, AICU 2][channel A, channel B] */
  public aicuChannelFault = [
    [false, false],
    [false, false],
  ];

  private readonly channelFaultConfirmed = new ConfirmedCondition(AICU_CHANNEL_FAULT_CONFIRM_SECONDS);

  private readonly powerInterruption = new AicuPowerInterruption();

  public readonly controlSystemFault = Subject.create(false);

  public readonly wingAntiIceLost = Subject.create(false);

  public probeWindowHeatPbOn = false;

  public airDataKnob = 1;

  update(inputs: ProbeWindowHeatInputs, deltaTimeSeconds: number): void {
    this.probeWindowHeatPbOn = inputs.probeWindowHeatPbOn;
    this.airDataKnob = inputs.airDataKnob;

    inputs.adrProbes.forEach((probes, adr) => {
      this.allProbesNotDeiced[adr].set(probes.automaticHeatingLost);
      this.probesStillNotDeiced[adr].update(inputs.probeWindowHeatPbOn && !probes.heated, deltaTimeSeconds);
      this.sideslipProbeFault[adr].set(probes.sideslipFault);
      this.staticProbeFault[adr].set(probes.staticFault);
    });
    const pitotTatAoa = pitotTatAoaProbeAlerts(inputs.adrProbes.map((probes) => probes.pitotTatAoaFault));
    pitotTatAoa.single.forEach((fault, adr) => this.pitotTatAoaProbeFault[adr].set(fault));
    pitotTatAoa.pairs.forEach((fault, pair) => this.pitotTatAoaProbePairFault[pair].set(fault));
    this.stbyPitotProbeFault.set(inputs.stbyPitotFault);
    this.stbyStaticProbeFault.set(inputs.stbyStaticFault);

    const bothWindshields = inputs.windows.every((side) => side.windshieldFault);
    inputs.windows.forEach((side, index) => {
      this.windshieldFault[index].set(side.windshieldFault && !bothWindshields);
      this.slidingWindowFault[index].set(side.slidingWindowFault);
      this.fixedWindowFault[index].set(side.fixedWindowFault);
    });
    this.bothWindshieldsFault.set(bothWindshields);

    const bothIceDetectorsFailed = inputs.iceDetectorFault.every((fault) => fault);
    this.iceDetectorFault.set(bothIceDetectorsFailed);
    this.iceDetectionAvailable.set(!bothIceDetectorsFailed);

    inputs.engineValveMonitoringFault.forEach((fault, engine) => this.engineValveMonitoringFault[engine].set(fault));
    this.drainMastsFault.set(inputs.drainMastFault);

    this.aicuChannelFault = inputs.aicuChannelFault;
    const anyChannelFault = inputs.aicuChannelFault.some((channels) => channels.some((fault) => fault));
    this.channelFaultConfirmed.update(anyChannelFault, deltaTimeSeconds);
    this.powerInterruption.update(
      inputs.aicuPowered,
      inputs.antiIcePbsOn,
      inputs.anyEngineRunning,
      inputs.onGround,
      deltaTimeSeconds,
    );
    this.controlSystemFault.set(anyChannelFault || this.powerInterruption.interrupted.get());
    this.wingAntiIceLost.set(isWingAntiIceLost(inputs.aicuChannelFault));
  }

  /** At least one AICU channel failed for more than 5 s: AVOID ICING CONDs */
  isChannelFaultConfirmed(): boolean {
    return this.channelFaultConfirmed.output.get();
  }

  controlSystemFaultLines(): { show: boolean[]; checked: boolean[] } {
    return controlSystemFaultLines(
      this.aicuChannelFault,
      this.isChannelFaultConfirmed(),
      this.powerInterruption.interrupted.get(),
      this.powerInterruption.antiIceCycledOn.get(),
    );
  }
}

/**
 * Reads the inputs of the alerts from the systems model.
 * @param fws the FwsCore states the alerts need
 */
export function readProbeWindowHeatInputs(fws: {
  aicuPowered: boolean[];
  antiIcePbsOn: boolean[];
  anyEngineRunning: boolean;
  onGround: boolean;
}): ProbeWindowHeatInputs {
  const flag = (name: string) => SimVar.GetSimVarValue(`L:A32NX_${name}`, 'bool') > 0;
  return {
    adrProbes: [1, 2, 3].map((adr) => ({
      automaticHeatingLost: flag(`PROBE_HEAT_ADR_${adr}_AUTO_HEAT_FAULT`),
      heated: flag(`PROBE_HEAT_ADR_${adr}_PROBES_HEATED`),
      pitotTatAoaFault: flag(`PROBE_HEAT_ADR_${adr}_PITOT_TAT_AOA_FAULT`),
      staticFault: flag(`PROBE_HEAT_ADR_${adr}_STATIC_FAULT`),
      sideslipFault: flag(`PROBE_HEAT_ADR_${adr}_SIDESLIP_FAULT`),
    })),
    stbyPitotFault: flag('PROBE_HEAT_STBY_PITOT_FAULT'),
    stbyStaticFault: flag('PROBE_HEAT_STBY_STATIC_FAULT'),
    windows: ['L', 'R'].map((side) => ({
      windshieldFault: flag(`WINDOW_HEAT_${side}_WINDSHIELD_FAULT`),
      slidingWindowFault: flag(`WINDOW_HEAT_${side}_SLIDING_WINDOW_FAULT`),
      fixedWindowFault: flag(`WINDOW_HEAT_${side}_FIXED_WINDOW_FAULT`),
    })),
    iceDetectorFault: [flag('ICE_DETECTOR_1_FAULT'), flag('ICE_DETECTOR_2_FAULT')],
    drainMastFault: flag('DRAIN_MAST_HEAT_FAULT'),
    aicuChannelFault: [1, 2].map((aicu) => ['A', 'B'].map((channel) => flag(`AICU_${aicu}_CHANNEL_${channel}_FAULT`))),
    aicuPowered: fws.aicuPowered,
    engineValveMonitoringFault: [1, 2, 3, 4].map((engine) => flag(`PNEU_ENG_${engine}_ANTI_ICE_MONITORING_FAULT`)),
    probeWindowHeatPbOn: flag('MAN_PITOT_HEAT'),
    antiIcePbsOn: fws.antiIcePbsOn,
    airDataKnob: SimVar.GetSimVarValue('L:A32NX_AIR_DATA_SWITCHING_KNOB', 'enum'),
    anyEngineRunning: fws.anyEngineRunning,
    onGround: fws.onGround,
  };
}

const AIR_DATA_CAPT_ON_3 = 0;
const AIR_DATA_FO_ON_3 = 2;

/**
 * The FWS entries of the alerts.
 * @param monitor the alert conditions
 */
export function probeWindowHeatAlerts(monitor: ProbeWindowHeatAlertMonitor): EwdAbnormalDict {
  const ids = PROBE_WINDOW_HEAT_ALERT_IDS;
  const phases = PROBE_WINDOW_HEAT_PHASE_INHIBITION;
  const alerts: EwdAbnormalDict = {};
  const avoidIcing = () => [LIMITATIONS.avoidIcing];
  const airDataOn3 = (adr: number) => monitor.airDataKnob === (adr === 0 ? AIR_DATA_CAPT_ON_3 : AIR_DATA_FO_ON_3);
  const crewAwareness = (
    simVarIsActive: Subject<boolean>,
    flightPhaseInhib: number[],
    inopSys: string[],
    failure = 2,
  ): EwdAbnormalItem => ({
    flightPhaseInhib,
    simVarIsActive,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [],
    whichItemsChecked: () => [],
    failure,
    sysPage: SdPages.None,
    inopSysAllPhases: () => inopSys,
  });

  [0, 1, 2].forEach((adr) => {
    const stillNotDeiced = () => monitor.probesStillNotDeiced[adr].output.get();
    alerts[ids.allProbesNotDeiced[adr]] = {
      flightPhaseInhib: phases.allProbesNotDeiced,
      simVarIsActive: monitor.allProbesNotDeiced[adr],
      notActiveWhenItemActive: [],
      // The IF PROBES STILL NOT DEICED line and its AIR DATA SWTG are on the procedures of ADR 1 and 2 only
      whichItemsToShow: () => (adr < 2 ? [true, stillNotDeiced(), stillNotDeiced()] : [true]),
      whichItemsChecked: () =>
        adr < 2 ? [monitor.probeWindowHeatPbOn, stillNotDeiced(), airDataOn3(adr)] : [monitor.probeWindowHeatPbOn],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => (stillNotDeiced() ? [INOP_SYS.adrProbesHeating[adr]] : []),
      inopSysApprLdg: () => (stillNotDeiced() ? [INOP_SYS.cat3Dual] : []),
      info: () => (stillNotDeiced() ? [INFO.cat3SingleOnly] : []),
    };

    // ADR 3 has no AIR DATA SWTG line: crew awareness
    const airDataSwitchingItems = {
      whichItemsToShow: () => (adr < 2 ? [true] : []),
      whichItemsChecked: () => (adr < 2 ? [airDataOn3(adr)] : []),
    };
    alerts[ids.pitotTatAoaProbeFault[adr]] = {
      flightPhaseInhib: phases.probeFault,
      simVarIsActive: monitor.pitotTatAoaProbeFault[adr],
      notActiveWhenItemActive: [],
      ...airDataSwitchingItems,
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [INOP_SYS.adrProbesHeating[adr]],
      inopSysApprLdg: () => [INOP_SYS.cat3Dual],
      info: () => [INFO.cat3SingleOnly],
    };
    alerts[ids.staticProbeFault[adr]] = {
      flightPhaseInhib: phases.probeFault,
      simVarIsActive: monitor.staticProbeFault[adr],
      notActiveWhenItemActive: [],
      ...airDataSwitchingItems,
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [INOP_SYS.adrProbesHeating[adr]],
      inopSysApprLdg: () => [INOP_SYS.cat3Dual],
    };
    alerts[ids.sideslipProbeFault[adr]] = {
      ...crewAwareness(monitor.sideslipProbeFault[adr], phases.probeFault, [INOP_SYS.sideslipProbeHeating[adr]]),
      inopSysApprLdg: () => [INOP_SYS.cat3Dual],
      info: () => [INFO.cat3SingleOnly],
    };
  });

  // PITOT TAT AOA PROBE 1+2: AIR DATA SWTG CAPT ON 3, AVOID ICING CONDs; 1+3 and 2+3: AVOID ICING CONDs
  [0, 1, 2].forEach((pair) => {
    alerts[ids.pitotTatAoaProbePairFault[pair]] = {
      flightPhaseInhib: phases.pitotTatAoaProbePairFault,
      simVarIsActive: monitor.pitotTatAoaProbePairFault[pair],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => (pair === 0 ? [true, true] : [true]),
      whichItemsChecked: () => (pair === 0 ? [airDataOn3(0), false] : [false]),
      failure: 2,
      sysPage: SdPages.None,
      limitationsAllPhases: () => [LIMITATIONS.maxSpeed310, LIMITATIONS.avoidIcing],
      limitationsPfd: () => [LIMITATIONS.maxSpeed310, LIMITATIONS.avoidIcing],
      inopSysAllPhases: () => [INOP_SYS.flightControlProtections, INOP_SYS.adrPairProbesHeating[pair]],
      inopSysApprLdg: () => [INOP_SYS.cat2, INOP_SYS.brakeToVacate, INOP_SYS.runwayOverrun],
      info: () => [INFO.altnLawProtLost],
    };
  });

  alerts[ids.stbyPitotProbeFault] = crewAwareness(monitor.stbyPitotProbeFault, phases.probeFault, [
    INOP_SYS.stbyPitotHeating,
  ]);
  alerts[ids.stbyStaticProbeFault] = crewAwareness(monitor.stbyStaticProbeFault, phases.probeFault, [
    INOP_SYS.stbyStaticHeating,
  ]);

  [0, 1].forEach((side) => {
    const [windshield, sliding, fixed] = INOP_SYS.windowHeating[side];
    alerts[ids.windshieldFault[side]] = crewAwareness(monitor.windshieldFault[side], phases.sideWindowFault, [
      windshield,
    ]);
    alerts[ids.slidingWindowFault[side]] = crewAwareness(
      monitor.slidingWindowFault[side],
      phases.sideWindowFault,
      [sliding],
      1,
    );
    alerts[ids.fixedWindowFault[side]] = crewAwareness(
      monitor.fixedWindowFault[side],
      phases.sideWindowFault,
      [fixed],
      1,
    );
  });
  alerts[ids.bothWindshieldsFault] = {
    flightPhaseInhib: phases.probeFault,
    simVarIsActive: monitor.bothWindshieldsFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [true],
    whichItemsChecked: () => [false],
    failure: 2,
    sysPage: SdPages.None,
    limitationsAllPhases: avoidIcing,
    limitationsPfd: avoidIcing,
    inopSysAllPhases: () => [INOP_SYS.bothWindshieldsHeating],
  };

  alerts[ids.iceDetectorFault] = {
    flightPhaseInhib: phases.iceDetectorFault,
    simVarIsActive: monitor.iceDetectorFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [true],
    whichItemsChecked: () => [false],
    failure: 2,
    sysPage: SdPages.None,
    inopSysAllPhases: () => [INOP_SYS.iceDetection],
  };

  [0, 1, 2, 3].forEach((engine) => {
    alerts[ids.engineValveMonitoringFault[engine]] = {
      flightPhaseInhib: phases.engineValveMonitoringFault,
      simVarIsActive: monitor.engineValveMonitoringFault[engine],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
      limitationsAllPhases: avoidIcing,
      limitationsPfd: avoidIcing,
      inopSysAllPhases: () => [INOP_SYS.engineAntiIceMonitoring[engine]],
    };
  });

  const avoidIcingAfterChannelFault = () => (monitor.isChannelFaultConfirmed() ? [LIMITATIONS.avoidIcing] : []);
  alerts[ids.controlSystemFault] = {
    flightPhaseInhib: phases.controlSystemFault,
    simVarIsActive: monitor.controlSystemFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => monitor.controlSystemFaultLines().show,
    whichItemsChecked: () => monitor.controlSystemFaultLines().checked,
    failure: 2,
    sysPage: SdPages.None,
    limitationsAllPhases: avoidIcingAfterChannelFault,
    limitationsPfd: avoidIcingAfterChannelFault,
    limitationsApprLdg: () => (monitor.wingAntiIceLost.get() ? [LIMITATIONS.landingFlapLever3] : []),
    inopSysAllPhases: () => controlSystemFaultInopSys(monitor.aicuChannelFault),
  };

  alerts[ids.drainMastsFault] = crewAwareness(
    monitor.drainMastsFault,
    phases.drainMastsFault,
    [INOP_SYS.drainMastsHeating],
    1,
  );

  return alerts;
}

/**
 * The deferred procedure of A-ICE CTL SYS FAULT (FOR APPROACH, if the wing anti-ice is failed: IF SEVERE ICE
 * ACCRETION, FOR LDG : FLAP LVR 3)
 * @param monitor the alert conditions
 */
export function probeWindowHeatDeferredProcs(monitor: ProbeWindowHeatAlertMonitor): EwdAbnormalDict {
  return {
    [CONTROL_SYSTEM_FAULT_DEFERRED_PROC]: {
      flightPhaseInhib: [],
      simVarIsActive: monitor.wingAntiIceLost,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 0,
      sysPage: SdPages.None,
    },
  };
}
