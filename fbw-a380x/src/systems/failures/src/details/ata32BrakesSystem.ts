// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const SD_WHEEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const STATUS_NOTE = 'while the alert is shown';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const FOR_APPROACH_AND_LANDING = 'for approach and landing';

/** Alerts inhibited in flight phases 3 to 7, 10 and 11 (shown in phases 1, 2, 8, 9 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_10_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch-down until the engines are shut down';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (shown in phases 1, 2, 8, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 7, 9, 10 and 11 (shown in phases 1, 2, 8 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10_11 =
  'a new alert shows only on the ground before take-off thrust is set, in flight above 800 ft (climb above 1,500 ft, ' +
  'cruise and descent) and after the engines are shut down';

/** Alerts inhibited in flight phases 3 to 11 (shown in phases 1, 2 and 12) */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert shows only on the ground before take-off thrust is set and after the engines are shut down';

/** Alerts inhibited in flight phases 3 to 10 (shown in phases 1, 2, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: before take-off thrust is set, once below 80 kt after landing and after ' +
  'the engines are shut down';

/** Alerts inhibited in flight phases 2 to 11 (shown in phases 1 and 12) */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert shows only before the first engine is started and after the engines are shut down';

/** Alerts inhibited in flight phases 3 to 7 */
const NOT_SHOWN_PHASES_3_TO_7 = 'a new alert is not shown from take-off power until 1,500 ft';

/** Alerts inhibited in flight phases 4 to 7 */
const NOT_SHOWN_PHASES_4_TO_7 = 'a new alert is not shown from 80 kt on take-off until 1,500 ft';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

const BRAKING_FAULT_ALERTS_NOTE =
  'The fault is applied to all wheel groups at once: the brake model has one normal and one alternate circuit.';

const IN_FLIGHT_OR_AFTER_LANDING =
  'in flight (above 1,500 ft in the climb, above 800 ft in the descent), once below 80 kt after landing and after the ' +
  'engines are shut down';

const AUTO_BRK_OFF_MEMO_NOTE =
  'In these cases, if the autobrake was braking in the landing roll above 33 kt of ground speed, it is disarmed and the AUTO BRK OFF ' +
  'memo, its alert sound and the master caution light for 3 s follow.';

const BRAKE_LAYOUT_NOT_SIMULATED =
  'The aircraft feeds the normal brakes of the wing gears from the green system and those of the body gears from the ' +
  'yellow system, and the alternate braking from two LEHGS and four accumulators. The sim feeds all the normal brakes ' +
  'from the green system and the alternate brakes, through one accumulator, from the yellow system; the LEHGS are ' +
  'not modelled.';

const LANDING_PERFORMANCE =
  'LDG DIST AFFECTED is listed as a limitation and A-SKID, AUTO BRK and CAT 3 are listed as inoperative';

// ---------------------------------------------------------------------------------------------------------------------
// Brake circuits
// ---------------------------------------------------------------------------------------------------------------------

const circuitLeakDetail = (green: boolean): FailureDetail => {
  const letter = green ? 'G' : 'Y';
  const name = green ? 'green' : 'yellow';
  const engines = green ? '1 or 2' : '3 or 4';
  const engineNumbers = green ? ['1', '2'] : ['3', '4'];
  const lossAlert = green ? '290800035' : '290800036';
  return {
    whatItIs: green
      ? 'The normal brake circuit carries hydraulic fluid to the brake servo valves for the normal braking mode, with ' +
        'anti-skid and the autobrake. On the aircraft the wing gears are fed by the green system and the body gears by ' +
        'the yellow system.'
      : 'The alternate brake circuit carries hydraulic fluid, through the brake accumulators, to the brakes for the ' +
        'alternate braking mode, the emergency braking and the parking brake. On the aircraft it is fed by the two ' +
        'LEHGS.',
    impact: [
      `Fluid leaks out of the ${name} system for as long as the circuit is pressurised.`,
      `The ${name} reservoir level falls until the low level shows; the brakes themselves still work as long as the ` +
        `${name} system holds pressure.`,
      `Following the procedure takes the ${name} system out of service and brings the alerts of its loss.`,
    ],
    alertIds: [green ? '290800021' : '290800022', lossAlert, '341800015', '320800014'],
    effects: [
      {
        where: 'E/WD',
        text:
          `HYD ${letter} RSVR LEVEL LO, ${CAUTION}, once the ${name} reservoir level is below its low level, about 1.5 ` +
          `minutes after a start with the usual reservoir quantity; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ` +
          `${ALREADY_SHOWN_STAYS}. The lines are ${letter} ENG ${engineNumbers[0]} PMP A AND B OFF and ${letter} ENG ` +
          `${engineNumbers[1]} PMP A AND B OFF (each only while that engine runs), ${letter} ENG ${engineNumbers[0]} ` +
          `PMP A+B DISC and ${letter} ENG ${engineNumbers[1]} PMP A+B DISC, and ${letter} ELEC PMP A AND B OFF only on ` +
          'the ground with all engines off.',
      },
      {
        where: 'SD HYD',
        text: 'The alert calls up the hydraulic page when it first appears, unless another page was selected.',
      },
      {
        where: 'Overhead HYD panel',
        text:
          `The ENG PMP FAULT lights and the ENG PMP A+B DISC FAULT lights of the ${name} engine pumps come on with the ` +
          `alert (the A+B DISC light goes off once DISC is selected), and on the ground with all engines off the ` +
          `${letter} ELEC PMP FAULT lights come on too.`,
      },
      {
        where: 'E/WD',
        text:
          `Once the ${name} system is no longer pressurised (for instance after the pumps are off), HYD ${letter} SYS ` +
          `PRESS LO shows, ${CAUTION}, while engine ${engines} runs or in flight; ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          `The loss also reaches the flight control computers: SURV ROW/ROP LOST, ${CAUTION}, with an engine running on each side or in flight ` +
          `(${NOT_SHOWN_PHASES_3_TO_7_9_10}), and BRAKES BTV FAULT, ${CAUTION}, with engines 2 and 3 running ` +
          `(${NOT_SHOWN_PHASES_3_TO_7}).`,
      },
    ],
    notSimulated: [BRAKE_LAYOUT_NOT_SIMULATED],
    logbook: { required: true, reason: `fluid loss from the ${name} system` },
    clearing: 'Maintenance only: use Restore. It stops the leak; the fluid already lost is not refilled by it.',
  };
};

const normalCircuitLeak: FailureDetail = circuitLeakDetail(true);

const alternateCircuitLeak: FailureDetail = circuitLeakDetail(false);

const accumulatorGasLeak: FailureDetail = {
  whatItIs:
    'The brake accumulators store hydraulic pressure for the alternate braking and the parking brake, so they still ' +
    'work when the system that feeds them is not pressurised. A gas charge in each accumulator keeps the pressure up. ' +
    'On the aircraft four accumulators are kept charged by the LEHGS.',
  impact: [
    'The gas charge leaks out at a steady rate until it is almost empty.',
    'While the yellow system is pressurised nothing changes; without it the accumulator keeps almost no pressure.',
    'The parking brake and the alternate braking then lose their reserve.',
  ],
  alertIds: ['320800009', '320800023'],
  effects: [
    {
      where: 'E/WD',
      text:
        'While the yellow system is not pressurised the accumulator pressure falls, from a full charge to 3,840 psi in ' +
        'about 12 s, and BRAKES ACCU PRESS LO shows once it has stayed below 3,840 psi for 10 s, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. With the engines off the lines are ACCUS REINFLATE and CHOCKS; with an engine running they are BEFORE ENGINE SHUTDOWN and CHOCKS.`,
    },
    {
      where: 'E/WD',
      text:
        'With the PARK BRK handle ON and the parking brake pressure below 1,700 psi for 5 s, BRAKES PARK BRK PRESS LO ' +
        `shows too, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_10}. It has the same lines as BRAKES ACCU PRESS LO.`,
    },
    {
      where: 'SD WHEEL',
      text:
        'The WING ACCU gauge appears when the accumulator pressure is in its amber range, up to 3,480 psi. ' +
        SD_WHEEL_CALL_UP,
    },
    {
      where: 'SD STATUS',
      text: `BRK ACCU is listed as inoperative in all phases with the first alert, and PARK BRK with the second, ${STATUS_NOTE}.`,
    },
  ],
  notSimulated: [
    'The ACCUS REINFLATE pushbutton is not modelled: on the aircraft it refills the accumulators with fluid.',
    BRAKE_LAYOUT_NOT_SIMULATED,
  ],
  logbook: { required: true, reason: 'accumulator charge lost' },
  clearing:
    'Maintenance only: use Restore. It stops the leak and restores the gas charge, but empties the accumulator: it ' +
    'refills, and the alerts clear, only once the yellow system is pressurised.',
};

// ---------------------------------------------------------------------------------------------------------------------
// Braking modes
// ---------------------------------------------------------------------------------------------------------------------

const normalBraking: FailureDetail = {
  whatItIs:
    'Normal braking is the mode in use in normal operation. The braking control system sends the pedal and autobrake ' +
    'orders to the normal circuit, with anti-skid protection. On the aircraft the green system feeds the wing gear ' +
    'brakes and the yellow system the body gear brakes.',
  impact: [
    'The normal braking is lost; the alternate braking takes over automatically and brakes with anti-skid.',
    'The autobrake still works in the alternate mode. If the alternate braking is failed too, the braking changes to ' +
      'the emergency braking without anti-skid.',
    BRAKING_FAULT_ALERTS_NOTE,
  ],
  alertIds: ['320800020', '320800001', '320800024'],
  notSimulated: [BRAKE_LAYOUT_NOT_SIMULATED],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES NORM BRK FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_10_11}; ${ALREADY_SHOWN_STAYS}. ` +
        'The line NO LOSS IN BRK EFFICIENCY is never shown by this alert.',
    },
    {
      where: 'SD STATUS',
      text:
        `NORM BRK is listed as inoperative ${FOR_APPROACH_AND_LANDING}, and the information ALTN BRK WITH A-SKID ` +
        `shows while the alternate braking is not failed, ${STATUS_NOTE}.`,
    },
    {
      where: 'E/WD',
      text:
        'With the alternate braking failed as well, BRAKES A-SKID FAULT ON ALL L/G shows with the A-SKID switch ON, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. ${LANDING_PERFORMANCE} ${FOR_APPROACH_AND_LANDING}. With the emergency ` +
        'braking failed too, BRAKES PEDAL BRAKING FAULT replaces the three single alerts, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. ${AUTO_BRK_OFF_MEMO_NOTE}`,
    },
    {
      where: 'SD WHEEL',
      text: `With the alternate braking failed too, the BRK CTL line shows BCS 1 and BCS 2 failed. ${SD_WHEEL_CALL_UP}`,
    },
  ],
  logbook: { required: true, reason: 'advisory and loss of the normal braking' },
  clearing: MAINTENANCE_ONLY,
};

const alternateBraking: FailureDetail = {
  whatItIs:
    'Alternate braking is the first backup of the normal braking. The braking control system sends the pedal orders ' +
    'to the alternate circuit, with anti-skid protection, and it can use the autobrake. On the aircraft the alternate ' +
    'circuit is fed by the two LEHGS and four accumulators.',
  impact: [
    'While the normal braking works nothing changes.',
    'If the normal braking is lost too, for example with the green system, the braking changes to the emergency ' +
      'braking without anti-skid.',
    BRAKING_FAULT_ALERTS_NOTE,
  ],
  alertIds: ['320800011', '320800010', '320800001', '320800024'],
  notSimulated: [BRAKE_LAYOUT_NOT_SIMULATED],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES ALTN BRK FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
        'The line NO LOSS IN BRK EFFICIENCY is never shown by this alert.',
    },
    {
      where: 'E/WD',
      text:
        'With the emergency braking failed as well, BRAKES ALTN + EMER BRK FAULT replaces both single alerts while ' +
        `the normal braking works, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It adds the line NO LOSS IN BRK EFFICIENCY ` +
        `${IN_FLIGHT_OR_AFTER_LANDING}.`,
    },
    {
      where: 'SD STATUS',
      text: `ALTN BRK is listed as inoperative ${FOR_APPROACH_AND_LANDING}; with the combined alert ALTN BRK and EMER BRK are listed in all phases, ${STATUS_NOTE}.`,
    },
    {
      where: 'E/WD',
      text:
        `With the normal braking failed as well, BRAKES NORM BRK FAULT also shows (${NOT_SHOWN_PHASES_3_TO_7_10_11}), and BRAKES A-SKID FAULT ON ALL L/G ` +
        `shows with the A-SKID switch ON, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. If the emergency braking is failed ` +
        `too, BRAKES PEDAL BRAKING FAULT replaces the single alerts, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. ${AUTO_BRK_OFF_MEMO_NOTE}`,
    },
  ],
  logbook: { required: true, reason: 'advisory and loss of the alternate braking' },
  clearing: MAINTENANCE_ONLY,
};

const emergencyBraking: FailureDetail = {
  whatItIs:
    'The emergency brake control unit brakes the aircraft when the normal and the alternate braking are lost, or when ' +
    'the A-SKID switch is set to OFF. It has no anti-skid and limits the brake pressure.',
  impact: [
    'While the normal or the alternate braking works, nothing changes in the braking.',
    'If both are lost too, no pedal braking is left; only the parking brake brakes.',
    BRAKING_FAULT_ALERTS_NOTE,
  ],
  alertIds: ['320800017', '320800010', '320800024'],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES EMER BRK FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. The line NO LOSS IN BRK ` +
        `EFFICIENCY shows ${IN_FLIGHT_OR_AFTER_LANDING}, while the normal braking is not failed.`,
    },
    {
      where: 'E/WD',
      text:
        'With the alternate braking failed as well, BRAKES ALTN + EMER BRK FAULT replaces both single alerts while ' +
        `the normal braking works, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. With the normal and the alternate braking failed too, BRAKES PEDAL ` +
        `BRAKING FAULT replaces the three single alerts, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. It shows PARK BRK ONLY ` +
        `and LDG DIST AFFECTED. ${AUTO_BRK_OFF_MEMO_NOTE}`,
    },
    {
      where: 'SD STATUS',
      text:
        `EMER BRK is listed as inoperative ${FOR_APPROACH_AND_LANDING}. With the pedal braking fault EMER BRK is no longer ` +
        `listed; PEDAL BRAKING and AUTO BRK are listed instead ${FOR_APPROACH_AND_LANDING}, with the limitation LDG ` +
        `DIST AFFECTED, ${STATUS_NOTE}.`,
    },
    { where: 'SD WHEEL', text: `The BRK CTL line shows the EBCU failed. ${SD_WHEEL_CALL_UP}` },
  ],
  logbook: { required: true, reason: 'advisory and a failed emergency braking unit' },
  clearing: MAINTENANCE_ONLY,
};

const autobrake: FailureDetail = {
  whatItIs:
    'The autobrake is a function of the braking control system. It brakes the aircraft automatically at the deceleration ' +
    'selected on the AUTO BRK panel after landing, or at the maximum for a rejected take-off, and the BTV mode ' +
    'brakes it towards a chosen runway exit.',
  impact: [
    'The autobrake is disarmed and cannot be armed again, so the AUTO BRK selector returns to DISARM.',
    'The BTV mode cannot be armed either. The pedal braking is not affected.',
  ],
  alertIds: ['320800013'],
  effects: [
    {
      where: 'E/WD',
      text: `BRAKES AUTO BRK FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7}; ${ALREADY_SHOWN_STAYS}. It has no procedure line.`,
    },
    { where: 'SD STATUS', text: `AUTO BRK is listed as inoperative in all phases, ${STATUS_NOTE}.` },
    { where: 'SD WHEEL', text: `AUTO BRAKE appears in amber. ${SD_WHEEL_CALL_UP}` },
    {
      where: 'E/WD',
      text: `${AUTO_BRK_OFF_MEMO_NOTE.replace('In these cases, if', 'If')} This is a memo, not an alert of the table.`,
    },
  ],
  logbook: { required: true, reason: 'caution and loss of the autobrake' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Braking control systems
// ---------------------------------------------------------------------------------------------------------------------

const brakingControlSystemDetail = (number: number): FailureDetail => {
  const other = number === 1 ? 2 : 1;
  return {
    whatItIs:
      'The braking control system has two redundant computers, BCS 1 and BCS 2. One is active and the other a backup; ' +
      'it turns the pedal, autobrake and landing gear lever orders into brake commands for the normal and the alternate ' +
      'braking.',
    impact: [
      `BCS ${number} is lost; BCS ${other} takes over and the braking is not changed.`,
      `With BCS ${other} lost too, the anti-skid is lost on all landing gears and the braking changes to the emergency ` +
        'braking without anti-skid.',
    ],
    alertIds: [number === 1 ? '320800015' : '320800016', number === 1 ? '320800016' : '320800015', '320800001'],
    effects: [
      {
        where: 'E/WD',
        text:
          `BRAKES CTL ${number} FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ${ALREADY_SHOWN_STAYS}. ` +
          'It has no procedure line and no STATUS line.',
      },
      {
        where: 'E/WD',
        text:
          `With BCS ${other} failed as well, BRAKES CTL ${other} FAULT shows too and BRAKES A-SKID FAULT ON ALL L/G ` +
          `shows with the A-SKID switch ON, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. It lists DELAY BRAKING UNTIL NLG ` +
          `TOUCHDOWN and LDG DIST AFFECTED. ${LANDING_PERFORMANCE} ${FOR_APPROACH_AND_LANDING}. It needs the emergency braking unit to work; with that unit failed too, this alert does not show, and no alert says that the pedal braking is lost. ${AUTO_BRK_OFF_MEMO_NOTE}`,
      },
      {
        where: 'SD STATUS',
        text:
          'With both BCS lost, the information BRK PRESS AUTO LIMITED ON ALL L/Gs and DELAY BRAKING UNTIL NLG TOUCHDOWN ' +
          `shows; with an engine running also TAXI WITH CARE, NO BRAKED PIVOT TURN and CAT 2 ONLY, ${STATUS_NOTE}.`,
      },
      {
        where: 'SD WHEEL',
        text: `The BRK CTL line does not show these failures, not even with both BCS lost. ${SD_WHEEL_CALL_UP}`,
      },
    ],
    notSimulated: ['The WHEEL page BRK CTL line does not show a failed BCS in amber.'],
    logbook: { required: true, reason: `advisory and a failed BCS ${number}` },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// RDC channels
// ---------------------------------------------------------------------------------------------------------------------

/**
 * @param position 1-based position in the family: 1 and 2 RDC 1 (A, B), 3 and 4 RDC 2, 5 and 6 RDC 3
 * @returns the RDC number, the channel letter and the gear group served
 */
const rdcOfPosition = (position: number) => {
  const rdc = Math.ceil(position / 2);
  const channel = position % 2 === 1 ? 'A' : 'B';
  const group = rdc === 1 ? 'both wing gears' : rdc === 2 ? 'the right body gear' : 'the left body gear';
  const lostAlert = rdc === 1 ? 'ON WING L/Gs' : rdc === 2 ? 'ON RIGHT BODY L/G' : 'ON LEFT BODY L/G';
  const lostAlertId = rdc === 1 ? '320800007' : rdc === 2 ? '320800004' : '320800003';
  const redundancyLine =
    channel === 'B'
      ? 'SYS B REDUNDANCY LOST'
      : rdc === 1
        ? 'SYS A REDUNDANCY LOST ON WING'
        : rdc === 2
          ? 'SYS A REDUNDANCY LOST ON R BODY (ON L + R BODY with channel 3A lost too)'
          : 'SYS A REDUNDANCY LOST ON L BODY (ON L + R BODY with channel 2A lost too)';
  const comboIds =
    rdc === 1 ? ['320800005', '320800006'] : rdc === 2 ? ['320800002', '320800006'] : ['320800002', '320800005'];
  const comboNames =
    rdc === 1 ? 'WING+L BODY or WING+R BODY' : rdc === 2 ? 'L + R BODY or WING+R BODY' : 'L + R BODY or WING+L BODY';
  const brakes = rdc === 1 ? '1 to 8' : rdc === 2 ? '11, 12, 15 and 16' : '9, 10, 13 and 14';
  return { rdc, channel, group, lostAlert, lostAlertId, comboIds, comboNames, redundancyLine, brakes };
};

const rdcChannelDetail = (position: number): FailureDetail => {
  const { rdc, channel, group, lostAlert, lostAlertId, comboIds, comboNames, redundancyLine, brakes } =
    rdcOfPosition(position);
  const otherChannel = channel === 'A' ? 'B' : 'A';
  return {
    whatItIs:
      `Remote data concentrator ${rdc} collects the wheel speeds of ${group} (brakes ${brakes}) and sends them to the ` +
      'braking control system for the anti-skid. It has two channels, A and B, which back each other up.',
    impact: [
      `Channel ${channel} of RDC ${rdc} is lost; channel ${otherChannel} keeps the anti-skid of ${group}, so braking is ` +
        'not changed.',
      `With channel ${otherChannel} lost too, ${group} loses the anti-skid: its brakes are pressure limited as in ` +
        'emergency braking, and the autobrake is disarmed.',
    ],
    alertIds: ['320800028', lostAlertId, ...comboIds, '320800001'],
    effects: [
      {
        where: 'E/WD',
        text:
          `BRAKES SYS REDUNDANCY LOST, ${ADVISORY}, with the line ${redundancyLine}; ${NOT_SHOWN_PHASES_3_TO_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It shows only while channel ${otherChannel} of RDC ${rdc} works.`,
      },
      {
        where: 'E/WD',
        text:
          `With channel ${otherChannel} lost too, in normal or alternate braking with the A-SKID switch ON, BRAKES ` +
          `A-SKID FAULT ${lostAlert} replaces it, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. With another RDC lost too, ` +
          `the alert names both groups (${comboNames}). With all three RDCs lost, BRAKES A-SKID FAULT ON ALL L/G shows ` +
          'instead, while the emergency braking unit works. The partial alerts list DELAY BRAKING UNTIL NLG TOUCHDOWN and ' +
          `LDG DIST AFFECTED. ${AUTO_BRK_OFF_MEMO_NOTE}`,
      },
      {
        where: 'SD STATUS',
        text:
          `With the gear group lost, PART A-SKID, AUTO BRK and CAT 3 are listed as inoperative and LDG DIST AFFECTED as ` +
          `a limitation ${FOR_APPROACH_AND_LANDING} (with all three RDCs lost A-SKID instead of PART A-SKID); the information BRK PRESS AUTO LMTD on the lost groups and DELAY ` +
          `BRAKING UNTIL NLG TOUCHDOWN shows, and with an engine running TAXI WITH CARE, NO BRAKED PIVOT TURN and CAT 2 ONLY, ` +
          `${STATUS_NOTE}.`,
      },
      { where: 'SD WHEEL', text: `The A-SKID alerts call up the page. ${SD_WHEEL_CALL_UP}` },
    ],
    logbook: { required: true, reason: `advisory and a lost RDC ${rdc} channel ${channel}` },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Monitoring and crew awareness faults
// ---------------------------------------------------------------------------------------------------------------------

const normalPressureTransmitter: FailureDetail = {
  whatItIs:
    'The normal brake pressure transmitters measure the pressure of the normal brake circuit, one per brake pair, and ' +
    'feed it to the braking control system.',
  impact: ['The monitoring of the normal brake pressure is reported lost.', 'The braking itself is not changed.'],
  alertIds: ['320800021'],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES NORM BRK PRESS MONITORING FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}; ` +
        `${ALREADY_SHOWN_STAYS}. It has no procedure line and no STATUS line.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  logbook: { required: true, reason: 'advisory and lost normal brake pressure monitoring' },
  clearing: MAINTENANCE_ONLY,
};

const alternatePressureTransmitter: FailureDetail = {
  whatItIs:
    'The alternate brake pressure transmitters measure the pressure of the alternate brake circuit, one per brake pair, ' +
    'and feed it to the braking control system and the triple pressure indicator.',
  impact: ['The monitoring of the alternate brake pressure is reported lost.', 'The braking itself is not changed.'],
  alertIds: ['320800012'],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES ALTN BRK PRESS MONITORING FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}; ` +
        `${ALREADY_SHOWN_STAYS}. It has no procedure line and no STATUS line.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  logbook: { required: true, reason: 'advisory and lost alternate brake pressure monitoring' },
  clearing: MAINTENANCE_ONLY,
};

const selectorValveJammedOpen: FailureDetail = {
  whatItIs:
    'The brake selector valve connects either the normal or the alternate circuit to the brakes, and isolates the circuit ' +
    'that is not in use.',
  impact: ['The valve is reported jammed open.', 'The warning is the only change: the braking works as before.'],
  alertIds: ['320800027'],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES SEL VLV JAMMED OPEN, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}. ` +
        'It has no procedure line and no STATUS line.',
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  logbook: { required: true, reason: 'advisory and a brake selector valve jammed open' },
  clearing: MAINTENANCE_ONLY,
};

const controlSystemMinorFault: FailureDetail = {
  whatItIs:
    'The braking control system monitors itself. A minor fault is a self-detected fault that does not reduce the braking ' +
    'functions but that maintenance has to look at.',
  impact: ['A minor fault of the braking control system is reported.', 'The braking is not changed.'],
  alertIds: ['320800019'],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES MINOR FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}. ` +
        'It has no procedure line and no STATUS line, and calls up no page.',
    },
  ],
  logbook: { required: true, reason: 'advisory and a braking control system fault' },
  clearing: MAINTENANCE_ONLY,
};

const safetyTestOverdue: FailureDetail = {
  whatItIs:
    'The braking system has to run a periodic safety test. When the test is overdue, the crew is asked to have it done ' +
    'before the next flight.',
  impact: ['The safety test is reported required.', 'The braking is not changed.'],
  alertIds: ['320800029'],
  effects: [
    {
      where: 'E/WD',
      text:
        `BRAKES SYS SAFETY TEST REQUIRED, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_11}; ${ALREADY_SHOWN_STAYS}. ` +
        'It has no procedure line and no STATUS line, and calls up no page.',
    },
  ],
  logbook: { required: true, reason: 'advisory and an overdue brake system safety test' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata32BrakesSystemEntries: Record<number, FailureDetail> = {
  [A380Failure.BrakesNormCircuitLeak]: normalCircuitLeak,
  [A380Failure.BrakesAltnCircuitLeak]: alternateCircuitLeak,
  [A380Failure.BrakesAltnAccumulatorGasLeak]: accumulatorGasLeak,
  [A380Failure.BrakesNormalBraking]: normalBraking,
  [A380Failure.BrakesAlternateBraking]: alternateBraking,
  [A380Failure.BrakesEmergencyBraking]: emergencyBraking,
  [A380Failure.BrakesAutobrake]: autobrake,
  [A380Failure.BrakesNormPressureTransmitter]: normalPressureTransmitter,
  [A380Failure.BrakesAltnPressureTransmitter]: alternatePressureTransmitter,
  [A380Failure.BrakesSelectorValveJammedOpen]: selectorValveJammedOpen,
  [A380Failure.BrakesControlSystemMinorFault]: controlSystemMinorFault,
  [A380Failure.BrakesSafetyTestOverdue]: safetyTestOverdue,
};

export const Ata32BrakesSystemFamilies: FailureDetailFamily[] = [
  { ids: [A380Failure.BrakesControlSystem1, A380Failure.BrakesControlSystem2], detail: brakingControlSystemDetail },
  {
    ids: [
      A380Failure.BrakesRdc1ChannelA,
      A380Failure.BrakesRdc1ChannelB,
      A380Failure.BrakesRdc2ChannelA,
      A380Failure.BrakesRdc2ChannelB,
      A380Failure.BrakesRdc3ChannelA,
      A380Failure.BrakesRdc3ChannelB,
    ],
    detail: rdcChannelDetail,
  },
];
