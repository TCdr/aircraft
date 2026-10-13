// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';

/**
 * Trigger logic of the BRAKES and STEER alerts of the FWS that come from the braking control system (BCS), the
 * emergency brake control unit (EBCU) and the steering control system (SCS) of the Rust hydraulic model
 * (fbw-a380x/src/wasm/systems/a380_systems/src/hydraulic/brake_steer_faults.rs), A380 FCOM PRO-ABN-ECAM-10-32
 * (a380_fcom.txt l.159700-160808 and l.162553-163160).
 *
 * The model has one NORM brake circuit (GREEN) and one ALTN brake circuit (YELLOW with one accumulator) for all the
 * wheel groups, so a brake fault is on all the wheel groups ("A wheel group is defined as: Wing landing gear wheel
 * group, Left body ..., Right body ...", l.159852-159855).
 */

/** What the FWS reads from the BCS, the EBCU, the SCS and the brake pressure transmitters */
export interface BrakeSteerInputs {
  /** L:A32NX_BRAKES_NORM_BRK_FAULT: the BCS normal braking is failed */
  normBrkFault: boolean;
  /** L:A32NX_BRAKES_ALTN_BRK_FAULT: the BCS alternate braking is failed */
  altnBrkFault: boolean;
  /** L:A32NX_BRAKES_EMER_BRK_FAULT: the EBCU is failed */
  emerBrkFault: boolean;
  /** L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS: brake accumulator pressure, psi */
  accuPressurePsi: number;
  /** L:A32NX_HYD_BRAKE_ALTN_LEFT_PRESS: left alternate (park brake) brake pressure, psi */
  altnLeftPressurePsi: number;
  /** L:A32NX_HYD_BRAKE_ALTN_RIGHT_PRESS: right alternate (park brake) brake pressure, psi */
  altnRightPressurePsi: number;
  /** L:A32NX_STEERING_NORM_NWS_FAULT: the normal nose wheel steering is failed */
  normNwsFault: boolean;
  /** L:A32NX_STEERING_ALTN_NWS_FAULT: the alternate nose wheel steering (steering LEHGS) is failed */
  altnNwsFault: boolean;
  /** L:A32NX_STEERING_BWS_FAULT: the body wheel steering is failed (centred and locked) */
  bwsFault: boolean;
  /** L:A32NX_STEERING_SCS_1_FAULT */
  scs1Fault: boolean;
  /** L:A32NX_STEERING_SCS_2_FAULT */
  scs2Fault: boolean;
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
  };
}

/**
 * BRAKES ACCU PRESS LO: "The pressure of, at least, one brake accumulator is below the minimum value" (l.159708).
 * Design choice: 3 000 psi. The FCOM amber arc of the accumulator pressure ends at 3 840 psi (triple pressure
 * indicator, l.81552) for A380 accumulators that give "at least 6 brake applications" (l.78946). The model has one
 * A320-sized accumulator that loses about 1 600 psi on the first park brake application (5 250 to 3 600 psi, then
 * 2 750 psi: Rust hydraulic test bed), so 3 840 psi would trigger after a single application without hydraulic
 * pressure. 3 000 psi triggers after the second application, when less than one park brake application is left above
 * the park brake pressure of the model (2 103 psi).
 */
export const ACCU_PRESS_LO_PSI = 3000;
/**
 * Design choice: the accumulator pressure stays low for 10 s, so the short dip of a brake application refilled by a
 * running YELLOW pump, and the gauge filter at power-up, do not trigger it.
 */
export const ACCU_PRESS_LO_CONFIRM_S = 10;
/**
 * BRAKES PARK BRK PRESS LO: "Parking brake pressure is low on at least one body landing gear when the parking brake is
 * on" (l.160467). The FCOM gives no value. Design choice: 1 700 psi, the pressure that the EBCU applies with the
 * take-off brake law and to the wing gear brakes in ultimate braking (l.80043-80045, l.80154); the model applies
 * 2 103 psi with the park brake on, so the alert means that the accumulator can no longer hold that pressure.
 */
export const PARK_BRK_PRESS_LO_PSI = 1700;
/** Design choice: 5 s, longer than the pressure build-up after the PARK BRK handle is set to ON (about 1 s) */
export const PARK_BRK_PRESS_LO_CONFIRM_S = 5;

/** The BRAKES alerts that come from the BCS/EBCU faults; at most one of norm/altn/emer/altnEmer/pedal per fault set */
export interface BrakeFaultAlerts {
  /** BRAKES NORM BRK FAULT */
  normBrk: boolean;
  /** BRAKES ALTN BRK FAULT */
  altnBrk: boolean;
  /** BRAKES EMER BRK FAULT */
  emerBrk: boolean;
  /** BRAKES ALTN + EMER BRK FAULT */
  altnEmerBrk: boolean;
  /** BRAKES PEDAL BRAKING FAULT */
  pedalBraking: boolean;
}

/**
 * Which BRAKES alerts the BCS and EBCU faults raise.
 * - PEDAL BRAKING FAULT: "The normal, the alternate and the emergency braking modes are failed" (l.160525); it replaces
 *   the alerts of the three single faults.
 * - ALTN + EMER BRK FAULT: "Alternate braking and emergency braking fail ... and the normal braking remains available"
 *   (l.159767-159768); it replaces ALTN BRK FAULT and EMER BRK FAULT.
 * - NORM BRK FAULT: "Normal braking fails" (l.160331); the model fault is on all the wheel groups, so the in-flight
 *   condition "normal braking is failed on all landing gears" (l.160339) is met too.
 * - ALTN BRK FAULT, EMER BRK FAULT: the single faults (l.159848-159850, l.160184-160185). Design choice: with the
 *   normal braking also failed they still show next to NORM BRK FAULT (the FCOM gives no combined alert for these; the
 *   BRAKES A-SKID FAULT that the FCOM lists for emergency braking, l.80061-80067, is not wired).
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

/** The STEER alerts that come from the SCS and steering faults */
export interface SteerFaultAlerts {
  /** STEER NORM N/W STEER FAULT */
  normNw: boolean;
  /** STEER ALTN N/W STEER FAULT */
  altnNw: boolean;
  /** STEER N/W STEER FAULT */
  nw: boolean;
  /** STEER B/W STEER FAULT */
  bw: boolean;
  /** STEER CTL 1 FAULT */
  ctl1: boolean;
  /** STEER CTL 2 FAULT */
  ctl2: boolean;
  /** STEER N/W + B/W STEER FAULT */
  nwBw: boolean;
}

/**
 * Which STEER alerts the steering faults raise.
 * - N/W + B/W STEER FAULT: "SCS 1 and SCS 2 are failed, or Both the NWS and the BWS are failed" (l.162869-162870); it
 *   replaces the other STEER alerts.
 * - N/W STEER FAULT: "The normal and alternate nose wheel steering modes are failed" (l.163012); it replaces NORM and
 *   ALTN N/W STEER FAULT.
 * - NORM N/W STEER FAULT (l.163100), ALTN N/W STEER FAULT (l.162559), B/W STEER FAULT (l.162636), STEER CTL 1(2)
 *   FAULT (l.162823).
 * Design choice: NORM N/W STEER FAULT comes from the normal NWS equipment fault only. The loss of the GREEN system
 * also stops the normal NWS, but HYD G SYS PRESS LO already shows "FOR TAXI : STEER ENDURANCE LIMITED" and INOP NORM
 * N/W STEER (l.155606-155609, l.155741).
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
 * CHOCKS, BEFORE ENGINE SHUTDOWN:, CHOCKS). The first two "If the alert is triggered before engine start or after the
 * last engine shutdown", the last two "after landing and before the last engine shutdown" (l.159732-159742,
 * l.160492-160500). Design choice: an engine running stands for "after landing and before the last engine shutdown".
 * @param engineRunning at least one engine is running
 * @returns which lines show
 */
export function accuPressLoItems(engineRunning: boolean): boolean[] {
  return engineRunning ? [false, false, true, true] : [true, true, false, false];
}

/**
 * BRAKES BTV FAULT trigger. FCOM: "The BTV auto-brake mode is failed" (A380 FCOM PRO-ABN-ECAM-10-32 P 29/118, single
 * chime and MASTER CAUT). The FCDC BTV LOST bit is also set when engine 2 or 3 is not running (Fcdc.cpp
 * ldgDistAffectedBtvLost), but an inner engine out makes BTV inoperative through the ENG 1(2)(3)(4) SHUT DOWN STATUS,
 * "BTV (If ENG 2(3) affected)" (a380_fcom.txt l.172781), not through this caution: without the inner engines running,
 * the caution stays off (an inner engine not yet started on the ground showed it with a single chime). The BTV
 * inoperative status keeps the FCDC BTV LOST (FwsInopSys 320300007).
 * @param btvLost the FCDC BTV LOST bit (FwsCore btvLost)
 * @param engine2Running engine 2 is running
 * @param engine3Running engine 3 is running
 * @returns whether BRAKES BTV FAULT triggers
 */
export function btvFaultCautionTriggered(btvLost: boolean, engine2Running: boolean, engine3Running: boolean): boolean {
  const innerEnginesRunning = engine2Running && engine3Running;
  return btvLost && innerEnginesRunning;
}

/** BRAKES and STEER alerts from the BCS, EBCU and SCS (A380 FCOM PRO-ABN-ECAM-10-32) */
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
