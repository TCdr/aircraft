// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';

/**
 * Trigger logic of the BRAKES and STEER alerts of the FWS that come from the braking control system (BCS), the
 * emergency brake control unit (EBCU) and the steering control system (SCS) of the Rust hydraulic model
 * (a380_systems hydraulic/brake_steer_faults.rs).
 *
 * The model has one NORM brake circuit (GREEN) and one ALTN brake circuit (YELLOW with one accumulator) for all the
 * wheel groups (wing, left body, right body), so a brake fault is on all the wheel groups.
 */

/** What the FWS reads from the BCS, the EBCU, the SCS and the brake pressure transmitters */
export interface BrakeSteerInputs {
  normBrkFault: boolean;
  altnBrkFault: boolean;
  /** The EBCU is failed */
  emerBrkFault: boolean;
  /** Brake accumulator pressure, psi */
  accuPressurePsi: number;
  /** Left alternate (park brake) brake pressure, psi */
  altnLeftPressurePsi: number;
  /** Right alternate (park brake) brake pressure, psi */
  altnRightPressurePsi: number;
  normNwsFault: boolean;
  /** The alternate nose wheel steering (steering LEHGS) is failed */
  altnNwsFault: boolean;
  /** The body wheel steering is failed (centred and locked) */
  bwsFault: boolean;
  scs1Fault: boolean;
  scs2Fault: boolean;
  /** 0 none, 1 normal, 2 alternate, 3 emergency (EBCU) */
  pedalBrakingMode: number;
  antiSkidSwitchOn: boolean;
  autoBrkFault: boolean;
}

/** Pedal braking mode of the emergency braking under EBCU control (no A-SKID) */
const PEDAL_BRAKING_MODE_EMERGENCY = 3;

/**
 * Whether the PARK BRK handle is ON.
 * @param read reads one simvar as a number (SimVar.GetSimVarValue(name, 'number') in the sim)
 * @returns true with the handle ON
 */
export function isParkBrakeHandleOn(read: (name: string) => number): boolean {
  return read('L:A32NX_PARK_BRAKE_LEVER_POS') === 1;
}

/**
 * Reads the inputs of the BRAKES and STEER alerts.
 * @param read reads one simvar as a number (SimVar.GetSimVarValue(name, 'number') in the sim)
 * @returns the inputs
 */
export function readBrakeSteerInputs(read: (name: string) => number): BrakeSteerInputs {
  return {
    normBrkFault: read('L:A32NX_BRAKES_NORM_BRK_FAULT') > 0,
    altnBrkFault: read('L:A32NX_BRAKES_ALTN_BRK_FAULT') > 0,
    emerBrkFault: read('L:A32NX_BRAKES_EMER_BRK_FAULT') > 0,
    accuPressurePsi: read('L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS'),
    altnLeftPressurePsi: read('L:A32NX_HYD_BRAKE_ALTN_LEFT_PRESS'),
    altnRightPressurePsi: read('L:A32NX_HYD_BRAKE_ALTN_RIGHT_PRESS'),
    normNwsFault: read('L:A32NX_STEERING_NORM_NWS_FAULT') > 0,
    altnNwsFault: read('L:A32NX_STEERING_ALTN_NWS_FAULT') > 0,
    bwsFault: read('L:A32NX_STEERING_BWS_FAULT') > 0,
    scs1Fault: read('L:A32NX_STEERING_SCS_1_FAULT') > 0,
    scs2Fault: read('L:A32NX_STEERING_SCS_2_FAULT') > 0,
    pedalBrakingMode: read('L:A32NX_BRAKES_PEDAL_BRAKING_MODE'),
    antiSkidSwitchOn: read('A:ANTISKID BRAKES ACTIVE') > 0,
    autoBrkFault: read('L:A32NX_BRAKES_AUTO_BRK_FAULT') > 0,
  };
}

/**
 * BRAKES ACCU PRESS LO: at least one brake accumulator is below its minimum, i.e. the BODY ACCU indication of the
 * triple pressure indicator is in its amber low pressure arc (0 to 3840 psi), where the crew presses the ACCUS
 * REINFLATE pb (the action of this alert). The model's brake accumulator (5 000 psi, Rust hydraulic/mod.rs) keeps
 * about 4 100 psi after one park brake application at 3 600 psi without hydraulic pressure, and drops into the amber
 * arc at the second one.
 */
export const ACCU_PRESS_LO_PSI = 3840;
/**
 * Design choice: the accumulator pressure stays low for 10 s, so the short dip of a brake application refilled by a
 * running YELLOW pump, and the gauge filter at power-up, do not trigger it.
 */
const ACCU_PRESS_LO_CONFIRM_S = 10;
/**
 * BRAKES PARK BRK PRESS LO: the parking brake pressure is low on at least one body landing gear with the parking
 * brake on. No threshold is published. Design choice: 1 700 psi, the pressure that the EBCU applies with the take-off
 * brake law and to the wing gear brakes in ultimate braking; the park brake applies about 3 600 psi, so the alert
 * means that the accumulator can no longer hold half of it.
 */
export const PARK_BRK_PRESS_LO_PSI = 1700;
/** Design choice: 5 s, longer than the pressure build-up after the PARK BRK handle is set to ON (about 1 s) */
const PARK_BRK_PRESS_LO_CONFIRM_S = 5;

/** The BRAKES alerts that come from the BCS/EBCU faults; at most one of norm/altn/emer/altnEmer/pedal per fault set */
export interface BrakeFaultAlerts {
  normBrk: boolean;
  altnBrk: boolean;
  emerBrk: boolean;
  altnEmerBrk: boolean;
  pedalBraking: boolean;
}

/**
 * Which BRAKES alerts the BCS and EBCU faults raise.
 * - PEDAL BRAKING FAULT: normal, alternate and emergency braking all failed; it replaces the three single-fault alerts.
 * - ALTN + EMER BRK FAULT: alternate and emergency braking failed while normal braking remains; it replaces ALTN BRK
 *   FAULT and EMER BRK FAULT.
 * - NORM BRK FAULT: the model fault is on all the wheel groups, so the in-flight condition (normal braking failed on
 *   all landing gears) is met too.
 * - ALTN BRK FAULT, EMER BRK FAULT: the single faults. Design choice: with the normal braking also failed they still
 *   show next to NORM BRK FAULT (there is no combined alert for these; the emergency braking that follows raises
 *   BRAKES A-SKID FAULT ON ALL L/G too, see aSkidFaultOnAllLg).
 * @param normFault the BCS normal braking is failed
 * @param altnFault the BCS alternate braking is failed
 * @param emerFault the EBCU is failed
 * @returns the alerts
 */
export function brakeFaultAlerts(normFault: boolean, altnFault: boolean, emerFault: boolean): BrakeFaultAlerts {
  const pedalBraking = normFault && altnFault && emerFault;
  return {
    normBrk: normFault && !pedalBraking,
    altnBrk: altnFault && !emerFault,
    emerBrk: emerFault && !altnFault,
    altnEmerBrk: altnFault && emerFault && !normFault,
    pedalBraking,
  };
}

/**
 * BRAKES A-SKID FAULT ON ALL L/G: the antiskid is lost on all the landing gears (BCS 1 and BCS 2 failed, or the LEHGS
 * failed in alternate braking), and the braking system changes to emergency braking. With the A-SKID sw OFF the
 * BRAKES A-SKID OFF alert shows instead.
 * The model has no BCS 1/2 split and no per-wheel-group antiskid: the emergency braking with the A-SKID sw ON is the
 * loss of the antiskid on all the landing gears (normal braking lost and alternate braking failed).
 * @param inputs the pedal braking mode and the A-SKID sw
 * @returns whether BRAKES A-SKID FAULT ON ALL L/G triggers
 */
export function aSkidFaultOnAllLg(inputs: BrakeSteerInputs): boolean {
  return inputs.antiSkidSwitchOn && inputs.pedalBrakingMode === PEDAL_BRAKING_MODE_EMERGENCY;
}

/** The STEER alerts that come from the SCS and steering faults */
export interface SteerFaultAlerts {
  normNw: boolean;
  altnNw: boolean;
  nw: boolean;
  bw: boolean;
  ctl1: boolean;
  ctl2: boolean;
  /** STEER N/W + B/W STEER FAULT */
  nwBw: boolean;
}

/**
 * Which STEER alerts the steering faults raise.
 * - N/W + B/W STEER FAULT: SCS 1 and SCS 2 failed, or both the NWS and the BWS failed; it replaces the other STEER
 *   alerts.
 * - N/W STEER FAULT: normal and alternate nose wheel steering failed; it replaces NORM and ALTN N/W STEER FAULT.
 * Design choice: NORM N/W STEER FAULT comes from the normal NWS equipment fault only. The loss of the GREEN system
 * also stops the normal NWS, but HYD G SYS PRESS LO already shows "FOR TAXI : STEER ENDURANCE LIMITED" and INOP NORM
 * N/W STEER.
 * @param inputs the SCS faults
 * @returns the alerts
 */
export function steerFaultAlerts(inputs: BrakeSteerInputs): SteerFaultAlerts {
  const nwFailed = inputs.normNwsFault && inputs.altnNwsFault;
  const nwBw = (inputs.scs1Fault && inputs.scs2Fault) || (nwFailed && inputs.bwsFault);
  return {
    normNw: inputs.normNwsFault && !inputs.altnNwsFault && !nwBw,
    altnNw: inputs.altnNwsFault && !inputs.normNwsFault && !nwBw,
    nw: nwFailed && !nwBw,
    bw: inputs.bwsFault && !nwBw,
    ctl1: inputs.scs1Fault && !inputs.scs2Fault,
    ctl2: inputs.scs2Fault && !inputs.scs1Fault,
    nwBw,
  };
}

/**
 * Lines of BRAKES ACCU PRESS LO and BRAKES PARK BRK PRESS LO (ata31-32-33.ts 320800009 and 320800023: ACCUS REINFLATE,
 * CHOCKS, BEFORE ENGINE SHUTDOWN:, CHOCKS). The first two apply when the alert triggers before engine start or after
 * the last engine shutdown, the last two after landing and before the last engine shutdown. Design choice: an engine
 * running stands for "after landing and before the last engine shutdown".
 * @param engineRunning at least one engine is running
 * @returns which lines show
 */
export function accuPressLoItems(engineRunning: boolean): boolean[] {
  return engineRunning ? [false, false, true, true] : [true, true, false, false];
}

/**
 * BRAKES BTV FAULT trigger: the BTV auto-brake mode is failed (single chime, MASTER CAUT). The FCDC BTV LOST bit is
 * also set when engine 2 or 3 is not running (Fcdc.cpp ldgDistAffectedBtvLost), but an inner engine out makes BTV
 * inoperative through the ENG 1(2)(3)(4) SHUT DOWN STATUS, not through this caution: without the inner engines
 * running the caution stays off (otherwise an inner engine not yet started on the ground showed it with a single
 * chime). The BTV inoperative status keeps the FCDC BTV LOST (FwsInopSys 320300007).
 * @param btvLost the FCDC BTV LOST bit (FwsCore btvLost)
 * @param engine2Running engine 2 is running
 * @param engine3Running engine 3 is running
 * @returns whether BRAKES BTV FAULT triggers
 */
export function btvFaultCautionTriggered(btvLost: boolean, engine2Running: boolean, engine3Running: boolean): boolean {
  const innerEnginesRunning = engine2Running && engine3Running;
  return btvLost && innerEnginesRunning;
}

/** BRAKES and STEER alerts from the BCS, EBCU and SCS */
export class FwsBrakeAlerts {
  /** BRAKES NORM BRK FAULT (320800020) */
  public readonly normBrkFault = Subject.create(false);
  /** BRAKES ALTN BRK FAULT (320800011) */
  public readonly altnBrkFault = Subject.create(false);
  /** BRAKES EMER BRK FAULT (320800017) */
  public readonly emerBrkFault = Subject.create(false);
  /** BRAKES ALTN + EMER BRK FAULT (320800010) */
  public readonly altnEmerBrkFault = Subject.create(false);
  /** BRAKES PEDAL BRAKING FAULT (320800024) */
  public readonly pedalBrakingFault = Subject.create(false);
  /** BRAKES ACCU PRESS LO (320800009) */
  public readonly accuPressLo = Subject.create(false);
  /** BRAKES PARK BRK PRESS LO (320800023) */
  public readonly parkBrkPressLo = Subject.create(false);
  /** BRAKES A-SKID FAULT ON ALL L/G (320800001) */
  public readonly aSkidFaultOnAllLg = Subject.create(false);
  /** BRAKES AUTO BRK FAULT (320800013) */
  public readonly autoBrkFault = Subject.create(false);

  /** STEER NORM N/W STEER FAULT (320800060) */
  public readonly normNwSteerFault = Subject.create(false);
  /** STEER ALTN N/W STEER FAULT (320800047) */
  public readonly altnNwSteerFault = Subject.create(false);
  /** STEER N/W STEER FAULT (320800058) */
  public readonly nwSteerFault = Subject.create(false);
  /** STEER B/W STEER FAULT (320800049) */
  public readonly bwSteerFault = Subject.create(false);
  /** STEER CTL 1 FAULT (320800053) */
  public readonly steerCtl1Fault = Subject.create(false);
  /** STEER CTL 2 FAULT (320800054) */
  public readonly steerCtl2Fault = Subject.create(false);
  /** STEER N/W + B/W STEER FAULT (320800055) */
  public readonly nwBwSteerFault = Subject.create(false);

  private readonly accuPressLoConfirm = new NXLogicConfirmNode(ACCU_PRESS_LO_CONFIRM_S);
  private readonly parkBrkPressLoConfirm = new NXLogicConfirmNode(PARK_BRK_PRESS_LO_CONFIRM_S);

  /**
   * Updates the alerts from the simvars: the inputs and the PARK BRK handle.
   * @param deltaTime time since the last update, ms
   * @param read reads one simvar as a number (SimVar.GetSimVarValue(name, 'number') in the sim)
   * @returns the inputs read, so the brake control alerts use the same sample without reading the simvars again
   */
  public updateFromSimVars(deltaTime: number, read: (name: string) => number): BrakeSteerInputs {
    const inputs = readBrakeSteerInputs(read);
    this.update(deltaTime, inputs, isParkBrakeHandleOn(read));
    return inputs;
  }

  /**
   * @param deltaTime time since the last update, ms
   * @param inputs the BCS, EBCU, SCS and pressure inputs
   * @param parkBrakeOn the PARK BRK handle is ON
   */
  public update(deltaTime: number, inputs: BrakeSteerInputs, parkBrakeOn: boolean): void {
    const brakes = brakeFaultAlerts(inputs.normBrkFault, inputs.altnBrkFault, inputs.emerBrkFault);
    this.normBrkFault.set(brakes.normBrk);
    this.altnBrkFault.set(brakes.altnBrk);
    this.emerBrkFault.set(brakes.emerBrk);
    this.altnEmerBrkFault.set(brakes.altnEmerBrk);
    this.pedalBrakingFault.set(brakes.pedalBraking);

    this.accuPressLo.set(this.accuPressLoConfirm.write(inputs.accuPressurePsi < ACCU_PRESS_LO_PSI, deltaTime));
    const parkBrakePressureLow =
      parkBrakeOn && Math.min(inputs.altnLeftPressurePsi, inputs.altnRightPressurePsi) < PARK_BRK_PRESS_LO_PSI;
    this.parkBrkPressLo.set(this.parkBrkPressLoConfirm.write(parkBrakePressureLow, deltaTime));
    this.aSkidFaultOnAllLg.set(aSkidFaultOnAllLg(inputs));
    this.autoBrkFault.set(inputs.autoBrkFault);

    const steer = steerFaultAlerts(inputs);
    this.normNwSteerFault.set(steer.normNw);
    this.altnNwSteerFault.set(steer.altnNw);
    this.nwSteerFault.set(steer.nw);
    this.bwSteerFault.set(steer.bw);
    this.steerCtl1Fault.set(steer.ctl1);
    this.steerCtl2Fault.set(steer.ctl2);
    this.nwBwSteerFault.set(steer.nwBw);
  }
}
