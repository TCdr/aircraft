// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The wording of the flight phase inhibitions of the AUTO FLT alerts, from each alert's own phase list */
const NOT_SHOWN_PHASES_3_4_5_7_8 =
  'not shown from take-off power set to 1,500 ft, nor below 800 ft on approach and in the landing roll above 80 kt';
const NOT_SHOWN_PHASES_4_5_7_8 =
  'not shown from 80 kt in the take-off roll to 1,500 ft, nor below 800 ft on approach and in the landing roll above 80 kt';
const NOT_SHOWN_PHASES_3_4_5_7_8_10 = `${NOT_SHOWN_PHASES_3_4_5_7_8}, nor in the 5 min after engine shutdown`;
const NOT_SHOWN_PHASES_4_5_7_8_10 = `${NOT_SHOWN_PHASES_4_5_7_8}, nor in the 5 min after engine shutdown`;
const NOT_SHOWN_PHASES_4_8_10 =
  'not shown in the take-off roll above 80 kt, in the landing roll above 80 kt and in the 5 min after engine shutdown';

const CAUTION_SOUND = 'amber caution with master caution and a single chime';
const AWARENESS_ONLY = 'amber, crew awareness only (no master caution, no chime)';

const FacFamily: FailureDetailFamily = {
  ids: [A320Failure.Fac1Failure, A320Failure.Fac2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The flight augmentation computers (FAC) control the rudder: the yaw damper, the rudder trim and the rudder ' +
      'travel limit. They also compute the flight envelope data and the characteristic speeds shown on the PFD. ' +
      'FAC 1 normally controls the rudder functions and FAC 2 is in standby; each FAC pushbutton is on the flight ' +
      'control overhead panel.',
    impact: [
      `FAC ${number} stops: its yaw damper, rudder trim, rudder travel limit and flight envelope channels are lost.`,
      `FAC ${number === 1 ? 2 : 1} takes over each rudder function and the speed data of the PFD.`,
      'Both FACs failed: no yaw damper, rudder trim, rudder travel limit or windshear detection.',
      'Both FACs failed: the ELACs lose the yaw control and leave normal lateral law.',
    ],
    alertIds: [number === 1 ? '2200200' : '2200195', '2200205'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FAC ${number} FAULT, ${CAUTION_SOUND}, with FAC ${number} OFF THEN ON and, if unsuccessful, FAC ${number} ` +
          'OFF. Shown while the other FAC works.',
      },
      { where: 'E/WD', text: `FAC ${number} FAULT is ${NOT_SHOWN_PHASES_3_4_5_7_8}.` },
      {
        where: 'E/WD',
        text:
          `Both FACs failed: FAC 1+2 FAULT replaces it, ${CAUTION_SOUND}, with RUD WITH CARE ABV 160 KT and both FAC ` +
          'reset lines.',
      },
      { where: 'E/WD', text: `FAC 1+2 FAULT is ${NOT_SHOWN_PHASES_4_5_7_8}.` },
      {
        where: 'E/WD',
        text:
          number === 1
            ? 'FAC 1 FAULT stays hidden while the AC ESS bus or the DC ESS bus is not powered, or the 8PH contactor is open. FAC 1+2 FAULT stays hidden while DC BUS 2 and the 8PH contactor are both lost.'
            : 'FAC 2 FAULT stays hidden while AC BUS 2 or DC BUS 2 is not powered. FAC 1+2 FAULT stays hidden while DC BUS 2 and the 8PH contactor are both lost.',
      },
      {
        where: 'Overhead FLT CTL panel',
        text: `The FAULT light of the FAC ${number} pushbutton comes on while it is ON.`,
      },
      { where: 'PFD', text: 'Both FACs failed: the SPD LIM flag shows on the speed scale.' },
    ],
    clearing:
      'Use Restore. In flight the FAC then comes back only when its pushbutton is pushed OFF then ON; on the ground ' +
      'it resets by itself.',
    logbook: { required: true, reason: 'ECAM caution, FAULT light and a lost computer' },
  }),
};

const FmgcFamily: FailureDetailFamily = {
  ids: [A320Failure.Fmgc1Failure, A320Failure.Fmgc2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each flight management and guidance computer (FMGC) has two parts. The flight guidance part drives the ' +
      'autopilot, the flight director and the autothrust from the targets of the FCU and the flight plan. The other ' +
      'part manages the flight plan and the navigation. Either FMGC can do all the work if the other fails.',
    impact: [
      `The flight guidance part of FMGC ${number} stops: its autopilot, flight director and autothrust engagement drop.`,
      'The other FMGC keeps its own autopilot and flight director if they are engaged.',
      'Both FMGCs failed: no autopilot, flight director or autothrust.',
    ],
    alertIds: ['2200005', '2200022'],
    effects: [
      {
        where: 'E/WD',
        text:
          'AP OFF in red, with master warning and the cavalry charge, only if an AP was engaged when the FMGC failed ' +
          'and none is left engaged. The master warning pb stops the aural; the text stays until an AP is engaged.',
      },
      { where: 'E/WD', text: 'AP OFF is shown in every flight phase, and clears on entering power-on phase.' },
      {
        where: 'E/WD',
        text:
          `A/THR OFF, ${CAUTION_SOUND}, only if the failed FMGC held the autothrust and the thrust levers are not at ` +
          'idle or in reverse.',
      },
      { where: 'E/WD', text: `A/THR OFF is ${NOT_SHOWN_PHASES_4_8_10}.` },
      { where: 'SD STATUS', text: `INOP SYS lists AP ${number}; both FMGCs failed: AP 1+2 and CAT 2.` },
      { where: 'SD STATUS', text: 'After A/THR OFF: CAT 2 ONLY, INOP SYS A/THR and CAT 3.' },
    ],
    notSimulated: ['The flight management part of the FMGC (flight plan, navigation) is not failed by this id.'],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM warning and a lost guidance computer' },
  }),
};

const FcuFamily: FailureDetailFamily = {
  ids: [A320Failure.Fcu1Failure, A320Failure.Fcu2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The flight control unit (FCU) on the glareshield is the short-term interface between the crew and the ' +
      'flight guidance. Its knobs select speed, heading, altitude and vertical speed, its pushbuttons engage the ' +
      'autopilots and the autothrust, and its two EFIS panels select the barometric references. There are two ' +
      'FCU channels and one can run the unit alone.',
    impact: [
      `FCU channel ${number} fails. The other channel keeps the unit working.`,
      'Both channels failed: the FCU and EFIS displays go blank and the FCU sends no data.',
      'Both channels failed: the PFDs fall back to the standard barometric reference.',
    ],
    alertIds: [number === 1 ? '2200210' : '2200215', '2200202', '2200022'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FCU ${number} FAULT with BARO REF CHECK, ${AWARENESS_ONLY}, while the other channel works. Both channels ` +
          `failed: FCU 1+2 FAULT replaces it, ${CAUTION_SOUND}, with PFD BARO REF: STD ONLY. Both are ` +
          `${NOT_SHOWN_PHASES_3_4_5_7_8}.`,
      },
      {
        where: 'E/WD',
        text:
          `Both channels failed: A/THR OFF, ${CAUTION_SOUND}, because the FWC reads the autothrust state from the ` +
          'FCU data and finds it off. Only if the autothrust was engaged and the thrust levers are not at idle or in ' +
          `reverse. It is ${NOT_SHOWN_PHASES_4_8_10}.`,
      },
      { where: 'SD STATUS', text: 'After A/THR OFF: CAT 2 ONLY, INOP SYS A/THR and CAT 3.' },
      {
        where: 'Glareshield (FCU)',
        text: 'Both channels failed: the speed, heading, altitude and EFIS displays go blank.',
      },
    ],
    notSimulated: ['A single failed channel does not blank the half of the EFIS panel it feeds.'],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM message and a degraded FCU' },
  }),
};

const YawDamperActuatorFamily: FailureDetailFamily = {
  ids: [A320Failure.YawDamperActuator1Failure, A320Failure.YawDamperActuator2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each FAC drives its own yaw damper actuator: FAC 1 the one on the green hydraulic system and FAC 2 the one ' +
      'on the yellow system. The yaw damper moves the rudder to damp the dutch roll and to coordinate turns. FAC 1 ' +
      'normally has it and FAC 2 is in standby.',
    impact: [
      `The yaw damper actuator of FAC ${number} (${number === 1 ? 'green' : 'yellow'} hydraulics) fails, so FAC ${number} cannot engage the yaw damper.`,
      number === 1
        ? 'FAC 2 takes the yaw damper over if the yellow system has pressure.'
        : 'FAC 1 keeps the yaw damper; only the standby is lost.',
      'Both actuators failed: no yaw damper, and the ELACs lose the yaw control and leave normal lateral law.',
    ],
    alertIds: [number === 1 ? '2200236' : '2200237', '2200238'],
    effects: [
      {
        where: 'E/WD',
        text: `YAW DAMPER ${number}, ${AWARENESS_ONLY}, ${NOT_SHOWN_PHASES_3_4_5_7_8_10}.`,
      },
      {
        where: 'E/WD',
        text:
          `No FAC has the yaw damper engaged: YAW DAMPER SYS replaces it, ${CAUTION_SOUND}, with FAC 1 and FAC 2 ` +
          `OFF THEN ON, ${NOT_SHOWN_PHASES_4_5_7_8_10}. It waits 1 s before it shows.`,
      },
      {
        where: 'SD STATUS',
        text: `One actuator: CAT 3 SINGLE ONLY, INOP SYS CAT 3 DUAL and YAW DAMPER ${number}.`,
      },
      {
        where: 'SD STATUS',
        text: 'YAW DAMPER SYS: MAX SPEED 320 KT, the approach procedure (flap 3, APPR SPD VREF+10 KT, LDG DIST PROC APPLY), ALTN LAW: PROT LOST; INOP SYS F/CTL PROT, YAW DAMPER, AP 1+2, CAT 2.',
      },
    ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM message and a degraded yaw damper' },
  }),
};

const RudderTrimActuatorFamily: FailureDetailFamily = {
  ids: [A320Failure.RudderTrimActuator1Failure, A320Failure.RudderTrimActuator2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The rudder trim actuator has two motors, one driven by each FAC. It moves the neutral position of the ' +
      'rudder so that the crew or the autopilot can trim out a yaw tendency. FAC 1 normally drives it and FAC 2 ' +
      'is in standby.',
    impact: [
      `Motor ${number} of the rudder trim actuator fails, so FAC ${number} cannot engage the rudder trim.`,
      `FAC ${number === 1 ? 2 : 1} drives the trim with its own motor.`,
      'Both motors failed: no rudder trim, and the STATUS lists AP 1+2 and CAT 2 as inoperative.',
    ],
    alertIds: [number === 1 ? '2200230' : '2200231', '2200232'],
    effects: [
      {
        where: 'E/WD',
        text: `RUD TRIM ${number} FAULT, ${AWARENESS_ONLY}, ${NOT_SHOWN_PHASES_3_4_5_7_8}.`,
      },
      {
        where: 'E/WD',
        text:
          `No FAC has the rudder trim engaged: RUD TRIM SYS replaces it, ${CAUTION_SOUND}, with FAC 1 and FAC 2 ` +
          `OFF THEN ON, ${NOT_SHOWN_PHASES_4_5_7_8}. It waits 1 s before it shows.`,
      },
      {
        where: 'SD STATUS',
        text: `One motor: CAT 3 SINGLE ONLY, INOP SYS CAT 3 DUAL and RUD TRIM ${number}. RUD TRIM SYS: INOP SYS RUD TRIM, AP 1+2, CAT 2.`,
      },
    ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM message and a degraded rudder trim' },
  }),
};

const RudderTravelLimiterActuatorFamily: FailureDetailFamily = {
  ids: [A320Failure.RudderTravelLimiterActuator1Failure, A320Failure.RudderTravelLimiterActuator2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The rudder travel limiter actuator has two motors, one driven by each FAC. It reduces the rudder travel ' +
      'as the speed increases, so that a full rudder pedal input cannot overload the fin. FAC 1 normally drives ' +
      'it and FAC 2 is in standby.',
    impact: [
      `Motor ${number} of the rudder travel limiter fails, so FAC ${number} cannot engage the limiter.`,
      `FAC ${number === 1 ? 2 : 1} drives the limiter with its own motor.`,
      'Both motors failed: the travel limit stops following the speed, so the rudder must be used with care above 160 kt.',
    ],
    alertIds: [number === 1 ? '2200233' : '2200234', '2200235'],
    effects: [
      {
        where: 'E/WD',
        text: `RUD TRV LIM ${number}, ${AWARENESS_ONLY}.`,
      },
      { where: 'E/WD', text: `RUD TRV LIM ${number} is ${NOT_SHOWN_PHASES_3_4_5_7_8}.` },
      {
        where: 'E/WD',
        text:
          `No FAC has the limiter engaged: RUD TRV LIM SYS replaces it, ${CAUTION_SOUND}, with RUD WITH CARE ABV ` +
          '160 KT and both FAC reset lines. It waits 1 s before it shows.',
      },
      { where: 'E/WD', text: `RUD TRV LIM SYS is ${NOT_SHOWN_PHASES_4_5_7_8}.` },
      {
        where: 'E/WD',
        text:
          'If the slats are extended and the limit is stopped below 24 deg: MAX X WIND FOR LDG 15 KT, AUTO BRK DO ' +
          'NOT USE and DIFF BRAKING AS RQRD at landing roll.',
      },
      {
        where: 'SD STATUS',
        text: `One motor: INOP SYS RUD TRV LIM ${number}. RUD TRV LIM SYS: RUD WITH CARE ABV 160 KT, INOP SYS RUD TRV LIM.`,
      },
    ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM message and a degraded rudder travel limiter' },
  }),
};

export const Ata22Entries: Record<number, FailureDetail> = {
  [A320Failure.TcasModeFailure]: {
    whatItIs:
      'The TCAS mode of the autopilot and flight director follows the vertical speed order of a TCAS resolution ' +
      'advisory. The flight guidance computers arm and engage it from the TCAS sensitivity data when a traffic or ' +
      'resolution advisory is active.',
    impact: [
      'The flight guidance computers lose the TCAS link, so the AP/FD TCAS mode is never available.',
      'The TCAS itself keeps working: its resolution advisories and aurals are unchanged.',
      'For a resolution advisory the crew must disconnect the AP and FD and fly the order manually.',
    ],
    alertIds: ['2200300'],
    effects: [
      {
        where: 'E/WD',
        text:
          `AUTO FLT TCAS MODE FAULT, ${CAUTION_SOUND}, with FOR TCAS ALERT: AP+FD OFF and FLY MANUALLY TCAS ORDER. ` +
          `Shown while a flight guidance computer sends data, ${NOT_SHOWN_PHASES_3_4_5_7_8}.`,
      },
      { where: 'SD STATUS', text: 'INOP SYS lists AP/FD TCAS.' },
      { where: 'PFD (FMA)', text: 'The TCAS mode never arms or engages during a resolution advisory.' },
    ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM caution and a lost TCAS mode' },
  },
};

export const Ata22Families: FailureDetailFamily[] = [
  FacFamily,
  FmgcFamily,
  FcuFamily,
  YawDamperActuatorFamily,
  RudderTrimActuatorFamily,
  RudderTravelLimiterActuatorFamily,
];
