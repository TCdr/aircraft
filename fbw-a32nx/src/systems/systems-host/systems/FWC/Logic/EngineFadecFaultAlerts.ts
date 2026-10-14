// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, NO_STATUS, alertCodes, cautionItem } from './FwcAlertItem';

/*
 * FADEC fault alerts of the A320 FWC (A320 FCOM PRO-ABN-ENG, a320_fcom.txt) that the FCOM gap audit found missing. The
 * FADEC reports the faults; their flyPad failures (systems engine/engine_monitoring_fault.rs) have no effect on the
 * engine model, except REV INHIBITED (the reverser does not deploy, a320_systems lib.rs):
 * - ENG 1(2) FUEL CTL FAULT (l.80112-80165): "The Fuel Metering Valve (FMV) position is failed, or The FMV command is
 *   failed, or The FMV position feedback is failed" (l.80122-80126).
 * - ENG 1(2) FUEL RETURN VALVE (l.80197-80232): "the fuel return valve is failed in closed, or in open position"
 *   (l.80207); VALVE NOT OPEN / VALVE NOT CLOSED, crew awareness (l.80213-80221).
 * - ENG 1(2) CTL VALVE FAULT (l.79445-79486): BSV, HPTC or RACC failed (l.79455-79459); "MAX N2 ... 96 %" (l.79464),
 *   STATUS "MAX ENG (AFFECTED) N2 ... 96 %" (l.79485).
 * - ENG 1(2) COMPRESSOR VANE (l.79396-79444): "either Variable Bleed Valve (VBV) or Variable Stator Vane (VSV) is
 *   failed" (l.79406-79407).
 * - ENG 1+2 COMPRESSOR VANE (l.79366-79395): "loss of the redundancy (i.e. one channel is detected faulty) of the
 *   compressor vane (i.e. VBV, VSV) control system on both engines" (l.79376-79378), crew awareness (l.79384).
 * - ENG 1(2) BLEED STATUS FAULT, in flight (l.79241-79297) and on ground (l.79298-79365): "the status of one of the
 *   following valves is not received by the FADEC active channel" (l.79252); STATUS ENG 1(2) HI GND IDLE (l.79286,
 *   l.79354).
 * - ENG 1(2) REV INHIBITED (l.80690-80726): "the reverser is inhibited by maintenance action" (l.80700), crew
 *   awareness (l.80707), STATUS INOP SYS REVERSER 1(2) (l.80711-80715).
 * - ENG 1(2) REV ISOL FAULT (l.80727-80754): "the thrust reverser shut off valve is failed in open position"
 *   (l.80737), crew awareness (l.80743).
 * - ENG VIB SYS FAULT (l.82015-82029): "the vibration detection system is failed" (l.82025), crew awareness. Its
 *   failure is the TS only flyPad failure "Engine vibration monitoring unit (EVMU)" (77010).
 *
 * Alert level (FCOM DSC-31 l.45551-45556): "Level 1 ... Amber caution : Requires crew monitoring: Failures leading to a
 * loss of redundancy or system degradation", "Caution message (amber) on E/WD generally without procedure", no aural,
 * no SD page call. The crew awareness alerts without procedure are level 1; the alerts with a procedure (FUEL CTL FAULT,
 * CTL VALVE FAULT, COMPRESSOR VANE, BLEED STATUS FAULT) are level 2 cautions with the ENGINE SD page, as the other ENG
 * cautions.
 *
 * Design choices:
 * - FUEL CTL FAULT and COMPRESSOR VANE: "Depending on the type of failure, one of the above two messages is displayed"
 *   (l.80142, l.79417): AVOID RAPID THR CHANGES or ENG (AFFECTED) SLOW RESPONSE. The engine model keeps its normal
 *   response with these failures, so the message is AVOID RAPID THR CHANGES (STATUS the same, l.79441, l.80162).
 * - The FCOM conditions ("On ground:", "If ENG ANTI ICE on:", "BEFORE T.O.:") are evaluated by the FWC and not shown,
 *   as for ENG 1(2) SENSOR FAULT (Logic/EngineMonitoringAlerts). BEFORE T.O. is the flight phases 1 and 2 (the alert is
 *   inhibited from phase 3).
 * - BLEED STATUS FAULT HI GND IDLE ("FADEC increases minimum idle as if valves were opened", l.79336-79337): the line
 *   and the STATUS information are shown, the idle of the engine model does not change.
 */

/** The flight phase inhibitions, from the figures of the 2019 FCOM PDF (page given at each one) */
export const FADEC_FAULT_PHASE_INHIBITION = {
  /** ENG 1(2) FUEL CTL FAULT, page 2271 */
  fuelCtlFault: [4, 5, 7, 8],
  /** ENG 1(2) FUEL RETURN VALVE, page 2273 */
  fuelReturnValve: [3, 4, 5, 7, 8],
  /** ENG 1(2) CTL VALVE FAULT, page 2253 */
  ctlValveFault: [4, 5, 7, 8],
  /** ENG 1(2) COMPRESSOR VANE, page 2252 */
  compressorVane: [4, 5, 7, 8],
  /** ENG 1+2 COMPRESSOR VANE, page 2251 */
  bothCompressorVanes: [3, 4, 5, 7, 8],
  /** ENG 1(2) BLEED STATUS FAULT, page 2247 (in flight) and page 2249 (on ground) */
  bleedStatusFault: [3, 4, 5, 7, 8],
  /** ENG 1(2) REV INHIBITED, page 2287 */
  revInhibited: [3, 4, 5, 6, 7, 8, 9],
  /** ENG 1(2) REV ISOL FAULT, page 2288 */
  revIsolFault: [3, 4, 5, 6, 7],
  /** ENG VIB SYS FAULT, page 2319 */
  vibSysFault: [3, 4, 5, 6, 7, 8, 9],
};

/** The alert keys, the first digits of their EwdMessages codes, per engine 1 and 2 */
export const FADEC_FAULT_KEYS = {
  fuelCtlFault: ['7707371', '7707372'],
  fuelReturnValve: ['7707381', '7707382'],
  ctlValveFault: ['7707391', '7707392'],
  compressorVane: ['7707401', '7707402'],
  bleedStatusFault: ['7707411', '7707412'],
  revInhibited: ['7707821', '7707822'],
  revIsolFault: ['7707831', '7707832'],
};

/** The key of ENG 1+2 COMPRESSOR VANE */
export const BOTH_COMPRESSOR_VANES_KEY = '7707400';

/** The key of ENG VIB SYS FAULT */
export const VIB_SYS_FAULT_KEY = '7707700';

/** STATUS codes (StatusMessages) */
const AVOID_RAPID_THR_CHANGES = '700400063';
const MAX_ENG_N2_96 = ['700400090', '700400091'];
const ENG_HI_GND_IDLE = ['700200080', '700200081'];
const INOP_SYS_REVERSER = ['780300001', '780300002'];

/** The faults one FADEC reports: L:A32NX_ENGINE_n_<variable> of systems engine/engine_monitoring_fault.rs */
export interface EngineFadecFaults {
  /** FUEL_CTL_FAULT */
  fuelMeteringValve: boolean;
  /** FUEL_RETURN_VALVE_FAILED_CLOSED */
  fuelReturnValveFailedClosed: boolean;
  /** FUEL_RETURN_VALVE_FAILED_OPEN */
  fuelReturnValveFailedOpen: boolean;
  /** CTL_VALVE_FAULT */
  clearanceControlValves: boolean;
  /** COMPRESSOR_VANE_FAULT */
  compressorVanes: boolean;
  /** COMPRESSOR_VANE_CHANNEL_FAULT */
  compressorVaneChannel: boolean;
  /** BLEED_STATUS_FAULT */
  bleedValveStatus: boolean;
  /** REVERSER_INHIBITED */
  reverserInhibited: boolean;
  /** REVERSER_SHUTOFF_VALVE_FAULT */
  reverserShutoffValve: boolean;
}

/** The variable names after L:A32NX_ENGINE_n_, as engine_monitoring_fault.rs variable_name() writes them */
export const FADEC_FAULT_VARIABLES: Record<keyof EngineFadecFaults, string> = {
  fuelMeteringValve: 'FUEL_CTL_FAULT',
  fuelReturnValveFailedClosed: 'FUEL_RETURN_VALVE_FAILED_CLOSED',
  fuelReturnValveFailedOpen: 'FUEL_RETURN_VALVE_FAILED_OPEN',
  clearanceControlValves: 'CTL_VALVE_FAULT',
  compressorVanes: 'COMPRESSOR_VANE_FAULT',
  compressorVaneChannel: 'COMPRESSOR_VANE_CHANNEL_FAULT',
  bleedValveStatus: 'BLEED_STATUS_FAULT',
  reverserInhibited: 'REVERSER_INHIBITED',
  reverserShutoffValve: 'REVERSER_SHUTOFF_VALVE_FAULT',
};

/** No fault */
export const NO_FADEC_FAULT: EngineFadecFaults = {
  fuelMeteringValve: false,
  fuelReturnValveFailedClosed: false,
  fuelReturnValveFailedOpen: false,
  clearanceControlValves: false,
  compressorVanes: false,
  compressorVaneChannel: false,
  bleedValveStatus: false,
  reverserInhibited: false,
  reverserShutoffValve: false,
};

/**
 * Reads the faults the FADEC of an engine reports.
 * @param engine the engine number
 */
export function readEngineFadecFaults(engine: 1 | 2): EngineFadecFaults {
  const faults = { ...NO_FADEC_FAULT };
  for (const name of Object.keys(FADEC_FAULT_VARIABLES) as (keyof EngineFadecFaults)[]) {
    faults[name] = SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engine}_${FADEC_FAULT_VARIABLES[name]}`, 'bool') > 0;
  }
  return faults;
}

/** The data of the alerts */
export interface EngineFadecFaultInputs {
  /** The faults of engine 1 and 2 */
  faults: [EngineFadecFaults, EngineFadecFaults];
  onGround: boolean;
  /** The FWC flight phase (1 to 10) */
  flightPhase: number;
  /** The ENG 1 and ENG 2 ANTI ICE pbs are ON */
  engineAntiIceOn: [boolean, boolean];
}

/**
 * The lines of ENG 1(2) FUEL CTL FAULT (l.80132-80140) and ENG 1(2) COMPRESSOR VANE (l.79413-79421), by index in their
 * codes: 0 title, 1 -THR LEVER n IDLE, 2 -ENG MASTER n OFF (both "On ground:"), 3 AVOID RAPID THR CHANGES.
 */
export function throttleIdleFaultLines(onGround: boolean): number[] {
  return onGround ? [0, 1, 2, 3] : [0, 3];
}

/**
 * The lines of ENG 1(2) FUEL RETURN VALVE (l.80213-80221): 0 title, 1 VALVE NOT OPEN ("The valve is failed closed"),
 * 2 VALVE NOT CLOSED ("The valve is failed open").
 */
export function fuelReturnValveLines(failedClosed: boolean, failedOpen: boolean): number[] {
  const lines = [0];
  if (failedClosed) {
    lines.push(1);
  }
  if (failedOpen) {
    lines.push(2);
  }
  return lines;
}

/**
 * The lines of ENG 1(2) BLEED STATUS FAULT, by index in its codes: 0 title, 1 HI GND IDLE (on ground, l.79336), 2 -ENG
 * MODE SEL IGN ("If ENG ANTI ICE on", in flight and on ground, l.79339-79340), 3 -PACK n OFF ("BEFORE T.O.", on ground,
 * l.79345-79346).
 * @param onGround the aircraft is on ground
 * @param flightPhase the FWC flight phase
 * @param engineAntiIceOn the ENG ANTI ICE pb of the affected engine is ON
 */
export function bleedStatusFaultLines(onGround: boolean, flightPhase: number, engineAntiIceOn: boolean): number[] {
  const lines = [0];
  if (onGround) {
    lines.push(1);
  }
  if (engineAntiIceOn) {
    lines.push(2);
  }
  if (onGround && flightPhase <= 2) {
    lines.push(3);
  }
  return lines;
}

/** ENG 1+2 COMPRESSOR VANE: one channel of the vane control is lost on both engines (l.79376-79378) */
export function bothCompressorVanesAlert(faults: [EngineFadecFaults, EngineFadecFaults]): boolean {
  return faults[0].compressorVaneChannel && faults[1].compressorVaneChannel;
}

/** The STATUS lines of the alerts of one engine (index 0 or 1) */
export const fadecFaultStatus = {
  /** FUEL CTL FAULT and COMPRESSOR VANE: AVOID RAPID THR CHANGES (l.80162, l.79441) */
  avoidRapidThrustChanges: (): StatusLines => ({ left: [AVOID_RAPID_THR_CHANGES], inopSys: [] }),
  /** CTL VALVE FAULT: MAX ENG n N2 96 % (l.79485) */
  ctlValveFault: (index: number): StatusLines => ({ left: [MAX_ENG_N2_96[index]], inopSys: [] }),
  /** BLEED STATUS FAULT: ENG n HI GND IDLE (l.79286, l.79354) */
  bleedStatusFault: (index: number): StatusLines => ({ left: [ENG_HI_GND_IDLE[index]], inopSys: [] }),
  /** REV INHIBITED: INOP SYS REVERSER n (l.80711-80715) */
  revInhibited: (index: number): StatusLines => ({ left: [], inopSys: [INOP_SYS_REVERSER[index]] }),
};

/** A level 1 caution (crew awareness without procedure): amber, no aural, no SD page (FCOM l.45551-45556) */
function awarenessItem(
  key: string,
  lineCount: number,
  active: Subject<boolean>,
  flightPhaseInhib: number[],
  lines: () => number[] = () => [0],
  status: () => StatusLines = NO_STATUS,
): FwcAlertItem {
  return {
    flightPhaseInhib,
    simVarIsActive: active,
    whichCodeToReturn: lines,
    codesToReturn: alertCodes(key, lineCount),
    memoInhibit: () => false,
    failure: 1,
    sysPage: EcamSysPage.NONE,
    side: 'LEFT',
    inopSys: () => status().inopSys,
    statusInfo: () => status().left,
  };
}

/** The part of the failures consumer the alerts use */
export type EngineFadecFaultFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

const perEngine = () => [Subject.create(false), Subject.create(false)];

/** The FADEC fault alerts: keeps their states and gives the items the PseudoFWC adds to its alerts */
export class EngineFadecFaultAlerts {
  private inputs: EngineFadecFaultInputs = {
    faults: [NO_FADEC_FAULT, NO_FADEC_FAULT],
    onGround: true,
    flightPhase: 1,
    engineAntiIceOn: [false, false],
  };

  private readonly fuelCtlFault = perEngine();

  private readonly fuelReturnValve = perEngine();

  private readonly ctlValveFault = perEngine();

  private readonly compressorVane = perEngine();

  private readonly bothCompressorVanes = Subject.create(false);

  private readonly bleedStatusFault = perEngine();

  private readonly revInhibited = perEngine();

  private readonly revIsolFault = perEngine();

  private readonly vibSysFault = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: EngineFadecFaultFailuresSource = new FailuresConsumer()) {}

  /** Registers the failure of the vibration monitoring unit, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.EngineVibrationMonitoringUnit);
  }

  update(inputs: EngineFadecFaultInputs): void {
    this.inputs = inputs;
    this.failuresConsumer.update();
    for (const index of [0, 1]) {
      const faults = inputs.faults[index];
      this.fuelCtlFault[index].set(faults.fuelMeteringValve);
      this.fuelReturnValve[index].set(faults.fuelReturnValveFailedClosed || faults.fuelReturnValveFailedOpen);
      this.ctlValveFault[index].set(faults.clearanceControlValves);
      this.compressorVane[index].set(faults.compressorVanes);
      this.bleedStatusFault[index].set(faults.bleedValveStatus);
      this.revInhibited[index].set(faults.reverserInhibited);
      this.revIsolFault[index].set(faults.reverserShutoffValve);
    }
    this.bothCompressorVanes.set(bothCompressorVanesAlert(inputs.faults));
    this.vibSysFault.set(this.failuresConsumer.isActive(A320Failure.EngineVibrationMonitoringUnit));
  }

  private engineItems(index: number): Record<string, FwcAlertItem> {
    const phases = FADEC_FAULT_PHASE_INHIBITION;
    const keys = FADEC_FAULT_KEYS;
    return {
      [keys.fuelCtlFault[index]]: cautionItem(
        keys.fuelCtlFault[index],
        4,
        this.fuelCtlFault[index],
        phases.fuelCtlFault,
        () => throttleIdleFaultLines(this.inputs.onGround),
        EcamSysPage.ENG,
        fadecFaultStatus.avoidRapidThrustChanges,
      ),
      [keys.fuelReturnValve[index]]: awarenessItem(
        keys.fuelReturnValve[index],
        3,
        this.fuelReturnValve[index],
        phases.fuelReturnValve,
        () =>
          fuelReturnValveLines(
            this.inputs.faults[index].fuelReturnValveFailedClosed,
            this.inputs.faults[index].fuelReturnValveFailedOpen,
          ),
      ),
      [keys.ctlValveFault[index]]: cautionItem(
        keys.ctlValveFault[index],
        2,
        this.ctlValveFault[index],
        phases.ctlValveFault,
        () => [0, 1],
        EcamSysPage.ENG,
        () => fadecFaultStatus.ctlValveFault(index),
      ),
      [keys.compressorVane[index]]: cautionItem(
        keys.compressorVane[index],
        4,
        this.compressorVane[index],
        phases.compressorVane,
        () => throttleIdleFaultLines(this.inputs.onGround),
        EcamSysPage.ENG,
        fadecFaultStatus.avoidRapidThrustChanges,
      ),
      [keys.bleedStatusFault[index]]: cautionItem(
        keys.bleedStatusFault[index],
        4,
        this.bleedStatusFault[index],
        phases.bleedStatusFault,
        () => bleedStatusFaultLines(this.inputs.onGround, this.inputs.flightPhase, this.inputs.engineAntiIceOn[index]),
        EcamSysPage.ENG,
        () => fadecFaultStatus.bleedStatusFault(index),
      ),
      [keys.revInhibited[index]]: awarenessItem(
        keys.revInhibited[index],
        1,
        this.revInhibited[index],
        phases.revInhibited,
        () => [0],
        () => fadecFaultStatus.revInhibited(index),
      ),
      [keys.revIsolFault[index]]: awarenessItem(
        keys.revIsolFault[index],
        1,
        this.revIsolFault[index],
        phases.revIsolFault,
      ),
    };
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    ...this.engineItems(0),
    ...this.engineItems(1),
    [BOTH_COMPRESSOR_VANES_KEY]: awarenessItem(
      BOTH_COMPRESSOR_VANES_KEY,
      1,
      this.bothCompressorVanes,
      FADEC_FAULT_PHASE_INHIBITION.bothCompressorVanes,
    ),
    [VIB_SYS_FAULT_KEY]: awarenessItem(
      VIB_SYS_FAULT_KEY,
      1,
      this.vibSysFault,
      FADEC_FAULT_PHASE_INHIBITION.vibSysFault,
    ),
  };
}
