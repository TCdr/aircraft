// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem, cautionItem } from './FwcAlertItem';

/*
 * FADEC fault alerts of the A320 FWC. The FADEC reports the faults; their flyPad failures (systems
 * engine/engine_monitoring_fault.rs) have no effect on the engine model, except REV INHIBITED (the reverser does not
 * deploy, a320_systems lib.rs):
 * - ENG 1(2) FUEL CTL FAULT: the fuel metering valve (FMV) position, its command or its position feedback is failed.
 * - ENG 1(2) FUEL RETURN VALVE: the fuel return valve is failed closed or open; VALVE NOT OPEN / VALVE NOT CLOSED, crew
 *   awareness.
 * - ENG 1(2) CTL VALVE FAULT: BSV, HPTC or RACC failed; MAX N2 ... 96 %, STATUS MAX ENG (AFFECTED) N2 ... 96 %.
 * - ENG 1(2) COMPRESSOR VANE: the variable bleed valve (VBV) or variable stator vane (VSV) is failed.
 * - ENG 1+2 COMPRESSOR VANE: one channel of the compressor vane (VBV, VSV) control is faulty on both engines (loss of
 *   redundancy), crew awareness.
 * - ENG 1(2) BLEED STATUS FAULT, in flight and on ground: the FADEC active channel does not receive the status of one
 *   of its valves; STATUS ENG 1(2) HI GND IDLE.
 * - ENG 1(2) REV INHIBITED: the reverser is inhibited by a maintenance action, crew awareness, STATUS INOP SYS
 *   REVERSER 1(2).
 * - ENG 1(2) REV ISOL FAULT: the thrust reverser shut off valve is failed open, crew awareness.
 * - ENG VIB SYS FAULT: the vibration detection system is failed, crew awareness. Its
 *   failure is the TS only flyPad failure "Engine vibration monitoring unit (EVMU)" (77010).
 * - ENG TYPE DISAGREE: the FADEC detects a rating discrepancy between the two engines, raised by an engine rating plug
 *   failure; crew awareness. Our aircraft has one engine type, so the discrepancy comes from the TS only flyPad
 *   failures "Engine 1 (2) rating plug" (73320, 73321): exactly one failed plug. Design choice: with both plugs failed
 *   there is no rating to compare, so the alert goes.
 *
 * Alert levels: level 1 is an amber caution for crew monitoring (loss of redundancy or system degradation), generally
 * without procedure, no aural, no SD page call. The crew awareness alerts without procedure are level 1; the alerts with
 * a procedure (FUEL CTL FAULT, CTL VALVE FAULT, COMPRESSOR VANE, BLEED STATUS FAULT) are level 2 cautions with the
 * ENGINE SD page, as the other ENG cautions.
 *
 * Design choices:
 * - FUEL CTL FAULT and COMPRESSOR VANE show, depending on the type of failure, AVOID RAPID THR CHANGES or ENG
 *   (AFFECTED) SLOW RESPONSE. The engine model keeps its normal response with these failures, so the message is AVOID
 *   RAPID THR CHANGES (STATUS the same).
 * - The procedure conditions ("On ground:", "If ENG ANTI ICE on:", "BEFORE T.O.:") are evaluated by the FWC and not
 *   shown, as for ENG 1(2) SENSOR FAULT (Logic/EngineMonitoringAlerts). BEFORE T.O. is the flight phases 1 and 2 (the
 *   alert is inhibited from phase 3).
 * - BLEED STATUS FAULT HI GND IDLE (the FADEC raises the minimum idle as if the valves were open): the line
 *   and the STATUS information are shown, the idle of the engine model does not change.
 */

/** The flight phase inhibitions */
export const FADEC_FAULT_PHASE_INHIBITION = {
  /** ENG 1(2) FUEL CTL FAULT */
  fuelCtlFault: [4, 5, 7, 8],
  /** ENG 1(2) FUEL RETURN VALVE */
  fuelReturnValve: [3, 4, 5, 7, 8],
  /** ENG 1(2) CTL VALVE FAULT */
  ctlValveFault: [4, 5, 7, 8],
  /** ENG 1(2) COMPRESSOR VANE */
  compressorVane: [4, 5, 7, 8],
  /** ENG 1+2 COMPRESSOR VANE */
  bothCompressorVanes: [3, 4, 5, 7, 8],
  /** ENG 1(2) BLEED STATUS FAULT, the same in flight and on ground */
  bleedStatusFault: [3, 4, 5, 7, 8],
  /** ENG 1(2) REV INHIBITED */
  revInhibited: [3, 4, 5, 6, 7, 8, 9],
  /** ENG 1(2) REV ISOL FAULT */
  revIsolFault: [3, 4, 5, 6, 7],
  /** ENG VIB SYS FAULT */
  vibSysFault: [3, 4, 5, 6, 7, 8, 9],
  /** ENG TYPE DISAGREE, as the other ENG awareness alerts (none is documented) */
  typeDisagree: [3, 4, 5, 7, 8],
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

/** The key of ENG TYPE DISAGREE */
export const TYPE_DISAGREE_KEY = '7000100';

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
 * The lines of ENG 1(2) FUEL CTL FAULT and ENG 1(2) COMPRESSOR VANE, by index in their
 * codes: 0 title, 1 -THR LEVER n IDLE, 2 -ENG MASTER n OFF (both "On ground:"), 3 AVOID RAPID THR CHANGES.
 */
export function throttleIdleFaultLines(onGround: boolean): number[] {
  return onGround ? [0, 1, 2, 3] : [0, 3];
}

/**
 * The lines of ENG 1(2) FUEL RETURN VALVE: 0 title, 1 VALVE NOT OPEN (the valve is failed closed), 2 VALVE NOT CLOSED
 * (the valve is failed open).
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
 * The lines of ENG 1(2) BLEED STATUS FAULT, by index in its codes: 0 title, 1 HI GND IDLE (on ground), 2 -ENG MODE SEL
 * IGN ("If ENG ANTI ICE on", in flight and on ground), 3 -PACK n OFF ("BEFORE T.O.", on ground).
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

/** ENG 1+2 COMPRESSOR VANE: one channel of the vane control is lost on both engines */
export function bothCompressorVanesAlert(faults: [EngineFadecFaults, EngineFadecFaults]): boolean {
  return faults[0].compressorVaneChannel && faults[1].compressorVaneChannel;
}

/** ENG TYPE DISAGREE: the ratings of the two engines differ, one engine has a failed rating plug */
export function engineTypeDisagreeAlert(ratingPlugFailed: [boolean, boolean]): boolean {
  return ratingPlugFailed[0] !== ratingPlugFailed[1];
}

/** The STATUS lines of the alerts of one engine (index 0 or 1) */
export const fadecFaultStatus = {
  /** FUEL CTL FAULT and COMPRESSOR VANE: AVOID RAPID THR CHANGES */
  avoidRapidThrustChanges: (): StatusLines => ({ left: [AVOID_RAPID_THR_CHANGES], inopSys: [] }),
  /** CTL VALVE FAULT: MAX ENG n N2 96 % */
  ctlValveFault: (index: number): StatusLines => ({ left: [MAX_ENG_N2_96[index]], inopSys: [] }),
  /** BLEED STATUS FAULT: ENG n HI GND IDLE */
  bleedStatusFault: (index: number): StatusLines => ({ left: [ENG_HI_GND_IDLE[index]], inopSys: [] }),
  /** REV INHIBITED: INOP SYS REVERSER n */
  revInhibited: (index: number): StatusLines => ({ left: [], inopSys: [INOP_SYS_REVERSER[index]] }),
};

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

  private readonly typeDisagree = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: EngineFadecFaultFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures the alerts read directly, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.EngineVibrationMonitoringUnit);
    this.failuresConsumer.register(A320Failure.Eng1RatingPlug);
    this.failuresConsumer.register(A320Failure.Eng2RatingPlug);
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
    this.typeDisagree.set(
      engineTypeDisagreeAlert([
        this.failuresConsumer.isActive(A320Failure.Eng1RatingPlug),
        this.failuresConsumer.isActive(A320Failure.Eng2RatingPlug),
      ]),
    );
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
    [TYPE_DISAGREE_KEY]: awarenessItem(
      TYPE_DISAGREE_KEY,
      1,
      this.typeDisagree,
      FADEC_FAULT_PHASE_INHIBITION.typeDisagree,
    ),
  };
}
