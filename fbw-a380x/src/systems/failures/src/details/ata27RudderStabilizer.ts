// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'amber caution with master caution and single chime';
const ADVISORY = 'amber advisory with no master caution and no chime';

/** Alerts inhibited in flight phases 4 to 7, 9, 10 and 11 */
const NOT_SHOWN_PHASES_4_TO_7_9_10_11 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach through touch down, the ' +
  'landing roll and the taxi-in until the engines are shut down';

/** Alerts inhibited in flight phases 3 to 7, 9, 10 and 11 */
const NOT_SHOWN_PHASES_3_TO_7_9_10_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach through touch down, the ' +
  'landing roll and the taxi-in until the engines are shut down';

/** Alerts inhibited in flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert shows only on the ground: with the engines off, with an engine running before take-off power is set, ' +
  'or once the engines are shut down';

/** Alerts inhibited in flight phases 4, 5 and 6 */
const NOT_SHOWN_PHASES_4_TO_6 = 'a new alert is not shown from 80 kt on take-off to 400 ft after lift-off';

const CALL_UP = 'The SD F/CTL page is called up when the alert first appears, unless the crew selected another page.';

const KEPT_WHEN_ACTIVE = 'an alert already showing stays when the phase changes';

// ---------------------------------------------------------------------------------------------------------------------
// Rudder EBHAs
// ---------------------------------------------------------------------------------------------------------------------

const RUDDER_ACTUATOR_FAULT_ALERT = '271800048';
const RUDDER_ELEC_ACTUATOR_FAULT_ALERT = '271800049';
const SINGLE_RUDDER_FAULT_ALERT = '271800062';

interface RudderEbha {
  rudder: 'upper' | 'lower';
  system: 'green' | 'yellow';
}

/** The EBHAs in the order of the ids of the failure list: upper yellow, upper green, lower green, lower yellow */
const RUDDER_EBHAS: RudderEbha[] = [
  { rudder: 'upper', system: 'yellow' },
  { rudder: 'upper', system: 'green' },
  { rudder: 'lower', system: 'green' },
  { rudder: 'lower', system: 'yellow' },
];

const otherSystem = (system: 'green' | 'yellow'): string => (system === 'green' ? 'yellow' : 'green');

const EBHA_DESCRIPTION =
  'Each rudder, upper and lower, is moved by two EBHAs, electrically backed up hydraulic actuators. While its ' +
  'hydraulic system is available an EBHA works like a conventional actuator. When that system is lost it becomes an ' +
  'electric actuator with its own pump and reservoir. One EBHA of a rudder is active and the other follows the ' +
  'surface in damping mode, except during take-off, approach and landing, or when a fast deflection is needed: then ' +
  'both move the rudder together.';

const RudderEbhaFamily: FailureDetailFamily = {
  ids: [
    A380Failure.UpperRudderYellowEbha,
    A380Failure.UpperRudderGreenEbha,
    A380Failure.LowerRudderGreenEbha,
    A380Failure.LowerRudderYellowEbha,
  ],
  detail: (number): FailureDetail => {
    const { rudder, system } = RUDDER_EBHAS[number - 1];
    const other = otherSystem(system);
    const inopRudder = rudder === 'upper' ? 'UPPR RUDDER' : 'LWR RUDDER';

    return {
      whatItIs: EBHA_DESCRIPTION,
      impact: [
        `The ${system} EBHA of the ${rudder} rudder is lost. If it was the active one, the ${other} EBHA of the same rudder takes over its orders; the rudder stays controlled.`,
        `With the ${other} EBHA lost too, nothing drives the ${rudder} rudder any more and it is only damped.`,
        'The other rudder keeps working. The flight control laws do not change.',
      ],
      alertIds: [RUDDER_ACTUATOR_FAULT_ALERT, SINGLE_RUDDER_FAULT_ALERT],
      effects: [
        {
          where: 'E/WD',
          text:
            `F/CTL RUDDER ACTUATOR FAULT, ${CAUTION}, while exactly one EBHA of a rudder is failed (this ` +
            `${rudder} rudder, or the other one). It has no procedure lines. ` +
            `${NOT_SHOWN_PHASES_4_TO_7_9_10_11}; ${KEPT_WHEN_ACTIVE}.`,
        },
        {
          where: 'E/WD',
          text:
            `F/CTL SINGLE RUDDER FAULT, ${CAUTION}, once both EBHAs of the ${rudder} rudder are failed. ` +
            `${NOT_SHOWN_PHASES_4_TO_6}; ${KEPT_WHEN_ACTIVE}. The procedure lines are FUEL CONSUMPT INCRSD and ` +
            'FMS PRED UNRELIABLE, and the limitation FUEL CONSUMPT INCRSD shows. The RUDDER ACTUATOR FAULT of this ' +
            'rudder goes out; it stays only if the other rudder has exactly one failed EBHA.',
        },
        {
          where: 'SD STATUS',
          text:
            `With SINGLE RUDDER FAULT: INOP SYS F/CTL PROT and ${inopRudder} (with both rudders lost only ` +
            'LWR RUDDER is listed), and INFO ALTN LAW : PROT LOST and FMS PRED UNRELIABLE.',
        },
        {
          where: 'SD F/CTL',
          text:
            `The box of the ${system} EBHA of the ${rudder} rudder gets a full amber frame. The rudder position ` +
            `index turns amber when no EBHA of the rudder can drive it any more. ${CALL_UP}`,
        },
      ],
      notSimulated: [
        'The flight control laws do not revert to alternate when a rudder is lost, and CAT 2 and GLS AUTOLAND are not listed as inoperative for approach and landing.',
      ],
      logbook: { required: true, reason: 'rudder actuator fault caution' },
      clearing: `${MAINTENANCE_ONLY} The alerts and the SD frame go out at once.`,
    };
  },
};

const RudderEbhaElectricalPartFamily: FailureDetailFamily = {
  ids: [
    A380Failure.UpperRudderYellowEbhaElectricalPart,
    A380Failure.UpperRudderGreenEbhaElectricalPart,
    A380Failure.LowerRudderGreenEbhaElectricalPart,
    A380Failure.LowerRudderYellowEbhaElectricalPart,
  ],
  detail: (number): FailureDetail => {
    const { rudder, system } = RUDDER_EBHAS[number - 1];
    const other = otherSystem(system);

    return {
      whatItIs:
        'The electrical part of a rudder EBHA is its electric pump and the electronics that drive it. It is only a ' +
        'backup: while the hydraulic systems are available the EBHA works as a conventional actuator and does not ' +
        'need it. It is used when the hydraulic system of that EBHA is lost.',
      impact: [
        `The electric backup of the ${system} EBHA of the ${rudder} rudder is lost. As long as the ${system} hydraulic system works, the EBHA moves the rudder as before.`,
        `If the ${system} system is lost too, this EBHA cannot move the rudder and, if it was the active one, the ${other} EBHA takes over its orders.`,
        'The flight control laws do not change.',
      ],
      alertIds: [RUDDER_ELEC_ACTUATOR_FAULT_ALERT],
      effects: [
        {
          where: 'E/WD',
          text:
            `F/CTL RUDDER ELEC ACTUATOR FAULT, ${ADVISORY}, while the electrical part of an EBHA is failed and that ` +
            `EBHA is not failed itself. It has no procedure lines. ${NOT_SHOWN_PHASES_3_TO_11}. Set in flight, it shows ` +
            'only once all engines are shut down after landing.',
        },
        {
          where: 'SD F/CTL',
          text:
            `The box of the ${system} EBHA of the ${rudder} rudder gets an amber frame on its electric half only. ` +
            `The rudder position index turns amber only when no EBHA can drive the rudder. ${CALL_UP}`,
        },
      ],
      logbook: { required: true, reason: 'rudder elec actuator fault advisory' },
      clearing: `${MAINTENANCE_ONLY} The alert and the SD frame go out at once.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Stabilizer
// ---------------------------------------------------------------------------------------------------------------------

const STABILIZER_ACTUATOR_FAULT_ALERT = '271800066';
const STABILIZER_ELEC_ACTUATOR_FAULT_ALERT = '271800067';
const STABILIZER_FAULT_ALERT = '271800068';

const STABILIZER_DESCRIPTION =
  'The trimmable horizontal stabilizer trims the aircraft in pitch. It has two hydraulic motors, green and yellow, ' +
  'and one electric motor, and only one motor is active at a time. On the ground the crew moves it with the pitch ' +
  'trim switch; in flight the flight control computers move it.';

const STABILIZER_LAW_NOT_SIMULATED =
  'With the stabilizer lost, the flight control laws do not revert to alternate, and F/CTL PROT, CAT 2, GLS AUTOLAND ' +
  'and ALTN LAW : PROT LOST are not listed on the SD STATUS.';

/** PITCH TRIM NOT IN TO RANGE: inhibited in phases 5 to 10 and 12, a red warning */
const PITCH_TRIM_NOT_TO_TEXT =
  'trimming cannot clear PITCH TRIM NOT IN TO RANGE (red warning with master warning and continuous chime). It shows ' +
  'with the T.O CONFIG test on the ground, or once take-off power is set, until V1.';

/** The effects of the alert that appears when the stabilizer can no longer be moved at all */
const stabilizerFaultEffects = (cause: string) => [
  {
    where: 'E/WD',
    text:
      `F/CTL STABILIZER FAULT, ${CAUTION}, ${cause}. ${NOT_SHOWN_PHASES_4_TO_6}; ${KEPT_WHEN_ACTIVE}. ` +
      'If an ADR gives an airspeed below 240 kt when the failure is detected (none does below 30 kt, so a failure set ' +
      'at rest on the ground shows no lines), the procedure shows STAB POS NOT AVAIL OR > 3.9° UP, which is checked ' +
      'when the stabilizer sits above 3.9° nose up, and then MAX SPEED : 260 KT.',
  },
  {
    where: 'SD STATUS',
    text: 'With STABILIZER FAULT: INOP SYS STABILIZER, and INFO FUEL CONSUMPT INCRSD : FMS PRED DISREGARD.',
  },
  {
    where: 'PFD',
    text:
      'MAX SPEED : 260 KT limitation, also on the E/WD and the SD STATUS, while STABILIZER FAULT is active and the ' +
      'stabilizer is above 3.9° nose up.',
  },
];

const StabilizerHydraulicMotorFamily: FailureDetailFamily = {
  ids: [A380Failure.StabilizerGreenHydraulicMotor, A380Failure.StabilizerYellowHydraulicMotor],
  detail: (number): FailureDetail => {
    const system = number === 1 ? 'green' : 'yellow';
    const other = number === 1 ? 'yellow' : 'green';

    return {
      whatItIs:
        `${STABILIZER_DESCRIPTION} The ${system} hydraulic motor is one of the two that drive the stabilizer, ` +
        `powered by the ${system} hydraulic system.`,
      impact: [
        `The ${system} hydraulic motor is lost. If it was the active one, the ${other} motor takes over its orders and the stabilizer stays fully usable.`,
        `With the ${other} motor lost too, or a jammed stabilizer, the stabilizer stops where it is and the pitch trim is locked.`,
        'The flight control laws do not change.',
      ],
      alertIds: [STABILIZER_ACTUATOR_FAULT_ALERT, STABILIZER_FAULT_ALERT],
      effects: [
        {
          where: 'E/WD',
          text:
            `F/CTL STABILIZER ACTUATOR FAULT, ${ADVISORY}, while exactly one hydraulic motor is failed and the ` +
            `stabilizer is not jammed. It has no procedure lines. ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ` +
            `${KEPT_WHEN_ACTIVE}.`,
        },
        ...stabilizerFaultEffects(
          `once the ${other} hydraulic motor is failed too; it replaces the STABILIZER ACTUATOR FAULT`,
        ),
        {
          where: 'SD F/CTL',
          text:
            `The box of the ${system} motor next to PITCH TRIM gets an amber frame. The pitch trim value and the ` +
            'stabilizer symbol turn amber, and so does the PITCH TRIM title, when neither motor can work (failed, or ' +
            `its hydraulic system lost). ${CALL_UP}`,
        },
        {
          where: 'E/WD',
          text:
            'With both motors lost on the ground, the stabilizer stops where it is: if that is outside the take-off ' +
            `range, ${PITCH_TRIM_NOT_TO_TEXT}`,
        },
      ],
      notSimulated: [
        STABILIZER_LAW_NOT_SIMULATED,
        'The electric motor is not modelled, so it never drives the stabilizer, not even when both hydraulic motors are lost.',
      ],
      logbook: { required: true, reason: 'stabilizer actuator fault advisory' },
      clearing: `${MAINTENANCE_ONLY} The alerts and the SD frame go out at once; the stabilizer stays at its position.`,
    };
  },
};

const StabilizerJammedEntry: FailureDetail = {
  whatItIs: STABILIZER_DESCRIPTION,
  impact: [
    'The stabilizer is stuck at its position: neither motor moves it, whatever the orders of the computers or the crew.',
    'The pitch trim is locked. Nothing else changes: the flight control laws stay as they are.',
    'On the ground the stabilizer cannot be set for take-off.',
  ],
  alertIds: [STABILIZER_FAULT_ALERT],
  effects: [
    ...stabilizerFaultEffects(
      'as soon as the stabilizer is jammed; it replaces STABILIZER ACTUATOR FAULT and STABILIZER ELEC ACTUATOR FAULT',
    ),
    {
      where: 'SD F/CTL',
      text:
        'Only the PITCH TRIM title turns amber. The motor boxes, the pitch trim value and the stabilizer symbol stay ' +
        `as they were. ${CALL_UP}`,
    },
    {
      where: 'E/WD',
      text: `If the stabilizer is stuck outside the take-off range, ${PITCH_TRIM_NOT_TO_TEXT}`,
    },
  ],
  notSimulated: [STABILIZER_LAW_NOT_SIMULATED],
  logbook: { required: true, reason: 'stabilizer fault caution, pitch trim locked' },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once; the stabilizer stays at its position.`,
};

const StabilizerElectricMotorEntry: FailureDetail = {
  whatItIs: `${STABILIZER_DESCRIPTION} The electric motor is the backup for the loss of both hydraulic systems.`,
  impact: [
    'Only the warning system sees this failure: the electric motor has no model, so nothing in the stabilizer changes.',
    'The hydraulic motors and the pitch trim keep working.',
  ],
  alertIds: [STABILIZER_ELEC_ACTUATOR_FAULT_ALERT],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL STABILIZER ELEC ACTUATOR FAULT, ${ADVISORY}. It has no procedure lines. ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ${KEPT_WHEN_ACTIVE}. It does not show while ` +
        'STABILIZER FAULT is active.',
    },
    {
      where: 'SD F/CTL',
      text: `The page draws no electric motor, so nothing changes on it. ${CALL_UP}`,
    },
  ],
  notSimulated: [
    'The electric motor is not modelled, so it never drives the stabilizer, not even when both hydraulic systems are lost.',
  ],
  logbook: { required: true, reason: 'stabilizer elec actuator fault advisory' },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
};

export const Ata27RudderStabilizerEntries: Record<number, FailureDetail> = {
  [A380Failure.StabilizerJammed]: StabilizerJammedEntry,
  [A380Failure.StabilizerElectricMotor]: StabilizerElectricMotorEntry,
};

export const Ata27RudderStabilizerFamilies: FailureDetailFamily[] = [
  RudderEbhaFamily,
  RudderEbhaElectricalPartFamily,
  StabilizerHydraulicMotorFamily,
];
