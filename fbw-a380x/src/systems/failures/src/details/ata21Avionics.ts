// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const AVIONICS_ALERT_INHIBITION =
  'Not shown while take-off thrust is set on the ground, nor from 400 ft to 1,500 ft on climb-out.';

const STATUS_INOP =
  'SD STATUS lists VENT AVNCS L (or R) BLOWING as inoperative with a one-sided fault, VENT AVNCS BLOWING when both circuits are out; BLOWING DEGRADED lists nothing.';

const BLOWING_ACTIONS = 'The lines AIR FLOW: HI and CAB FANS: ON are checked by the flow selector and the cabin fans.';

const BLOWING_FAULT_BOTH =
  'VENT AVNCS BLOWING FAULT (amber caution, master caution and single chime) when both circuits are without air: ' +
  'it replaces the L or R alert, and after 5 min adds MAX FLT TIME: 5 HR. ' +
  `${BLOWING_ACTIONS} ${AVIONICS_ALERT_INHIBITION}`;

const NO_AVIONICS_HEAT =
  'Real heating of the avionics bays is not modelled: only the alerts follow from a ventilation failure.';

const COOLING_NOT_SIMULATED = [
  'The cooling unit shutdown and isolation are not modelled, and the avionics ground cooling does not change any temperature.',
  'The COOLG pushbutton has no FAULT light.',
];

/** A blowing circuit loses its air when its fan fails or its filter clogs: the backup valve then takes over. */
function blowingAirLostDetail(
  circuitNumber: number,
  whatItIs: string,
  impactLine: string,
  logbookReason: string,
): FailureDetail {
  const side = circuitNumber === 1 ? 'L' : 'R';
  const otherSide = circuitNumber === 1 ? 'R' : 'L';
  const sideAlert = circuitNumber === 1 ? '212800016' : '212800017';

  return {
    whatItIs,
    impact: [
      impactLine,
      `The ${side} circuit is then fed with air from the mixer unit through its backup valve, so the avionics bays stay ventilated.`,
      `If the ${side} backup valve is also failed, the circuit gets no air at all.`,
    ],
    alertIds: ['212800029', sideAlert, '212800014'],
    effects: [
      {
        where: 'E/WD',
        text: `Alone, nothing shows: the ${side} backup valve takes over.`,
      },
      {
        where: 'E/WD',
        text:
          `VENT AVNCS BLOWING DEGRADED (amber advisory, no master caution or chime) when the ${otherSide} circuit has ` +
          `also lost its fan or filter and both backup valves work. ${AVIONICS_ALERT_INHIBITION}`,
      },
      {
        where: 'E/WD',
        text:
          `VENT AVNCS ${side} BLOWING FAULT (amber caution, master caution and single chime) when the ${side} backup ` +
          `valve is also failed. ${BLOWING_ACTIONS} ${AVIONICS_ALERT_INHIBITION}`,
      },
      { where: 'E/WD', text: BLOWING_FAULT_BOTH },
      { where: 'SD COND', text: 'The COND page is called up with a BLOWING FAULT alert.' },
      { where: 'SD STATUS', text: STATUS_INOP },
    ],
    notSimulated: [NO_AVIONICS_HEAT, 'The SD COND page does not show the low ventilation flow.'],
    logbook: { required: false, reason: logbookReason },
    clearing: 'Maintenance only: use Restore.',
  };
}

const BLOWING_FAN_FAMILY: FailureDetailFamily = {
  ids: [A380Failure.AvionicsBlowingFan1, A380Failure.AvionicsBlowingFan2],
  detail: (n) =>
    blowingAirLostDetail(
      n,
      `The ${n === 1 ? 'left' : 'right'} blowing fan pushes filtered cabin air through the ${n === 1 ? 'left' : 'right'} ` +
        'avionics ventilation circuit into the cockpit panels, the main avionics bay and the upper avionics bay. ' +
        'It runs whenever the aircraft is electrically powered and is monitored by the avionics ventilation controller.',
      `The ${n === 1 ? 'left' : 'right'} blowing fan stops pushing air through its circuit.`,
      'no indication on its own: the backup valve takes over',
    ),
};

const BLOWING_FILTER_FAMILY: FailureDetailFamily = {
  ids: [A380Failure.AvionicsBlowingFilterClogged1, A380Failure.AvionicsBlowingFilterClogged2],
  detail: (n) =>
    blowingAirLostDetail(
      n,
      `The ${n === 1 ? 'left' : 'right'} blowing filter cleans the cabin air before it reaches the ` +
        `${n === 1 ? 'left' : 'right'} blowing fan of the avionics ventilation circuit.`,
      `The ${n === 1 ? 'left' : 'right'} blowing filter is clogged and starves its circuit like a failed fan.`,
      'no indication on its own: the backup valve takes over',
    ),
};

const BACKUP_VALVE_FAMILY: FailureDetailFamily = {
  ids: [A380Failure.AvionicsBackupValve1, A380Failure.AvionicsBackupValve2],
  detail: (n) => {
    const side = n === 1 ? 'L' : 'R';
    return {
      whatItIs:
        `The ${n === 1 ? 'left' : 'right'} backup valve of the avionics ventilation opens when its blowing circuit ` +
        'loses its fan or its filter, and lets in air from the mixer unit so the avionics bays stay ventilated.',
      impact: [
        `Nothing changes while the ${side} blowing fan and filter work: the valve is not needed.`,
        `Once the ${side} fan fails or its filter clogs, the circuit has no air at all.`,
      ],
      alertIds: [n === 1 ? '212800016' : '212800017', '212800014'],
      effects: [
        { where: 'E/WD', text: 'Alone, nothing shows.' },
        {
          where: 'E/WD',
          text:
            `VENT AVNCS ${side} BLOWING FAULT (amber caution, master caution and single chime) when the ${side} fan ` +
            `fails or the ${side} filter is clogged. ${BLOWING_ACTIONS} ${AVIONICS_ALERT_INHIBITION}`,
        },
        { where: 'E/WD', text: BLOWING_FAULT_BOTH },
        { where: 'SD COND', text: 'The COND page is called up with a BLOWING FAULT alert.' },
        { where: 'SD STATUS', text: STATUS_INOP },
      ],
      notSimulated: [NO_AVIONICS_HEAT, 'The SD COND page does not show the low ventilation flow.'],
      logbook: { required: false, reason: 'no indication to report on its own' },
      clearing: 'Maintenance only: use Restore.',
    };
  },
};

const COOLING_OVERHEAT_FAMILY: FailureDetailFamily = {
  ids: [A380Failure.SupplementalCooling1Overheat, A380Failure.SupplementalCooling2Overheat],
  detail: (n) => ({
    whatItIs:
      `Supplemental cooling system ${n} is one of two units that cool the air blown into the avionics bays on the ` +
      'ground, and that also provide supplemental cooling to the galleys. Each unit has its own controller and works ' +
      'independently of the other.',
    impact: [
      `Supplemental cooling system ${n} overheats and the system detects it.`,
      'The alert asks the crew to switch the supplemental cooling off.',
    ],
    alertIds: [n === 1 ? '212800019' : '212800020'],
    effects: [
      {
        where: 'E/WD',
        text:
          `VENT COOLG SYS ${n} OVHT (amber caution, master caution and single chime) while the aircraft is powered, ` +
          'unless the overheat protection of the same system is also failed. The line VENT COOLG: OFF is checked by the ' +
          `COOLG pushbutton, which does not clear the alert. ${AVIONICS_ALERT_INHIBITION}`,
      },
      { where: 'SD STATUS', text: `VENT COOLG SYS ${n} is listed as inoperative while the alert is active.` },
    ],
    notSimulated: COOLING_NOT_SIMULATED,
    logbook: { required: true, reason: 'the alert is raised' },
    clearing: 'Maintenance only: use Restore.',
  }),
};

const COOLING_PROTECTION_FAMILY: FailureDetailFamily = {
  ids: [A380Failure.SupplementalCooling1Protection, A380Failure.SupplementalCooling2Protection],
  detail: (n) => ({
    whatItIs:
      `The overheat protection of supplemental cooling system ${n} detects an overheating of the unit and shuts it ` +
      'down. The supplemental cooling systems cool the galleys and, on the ground, the avionics bay air.',
    impact: [
      `The overheat detection of supplemental cooling system ${n} is lost.`,
      `An overheat of system ${n} is no longer detected, so the VENT COOLG SYS ${n} OVHT alert cannot show.`,
    ],
    alertIds: ['212800021'],
    effects: [
      {
        where: 'E/WD',
        text:
          'VENT COOLG SYS PROT FAULT (amber advisory, no master caution or chime) while the aircraft is powered. ' +
          AVIONICS_ALERT_INHIBITION,
      },
    ],
    notSimulated: COOLING_NOT_SIMULATED,
    logbook: { required: true, reason: 'the alert is raised and overheat protection is lost' },
    clearing: 'Maintenance only: use Restore.',
  }),
};

export const Ata21AvionicsEntries: Record<number, FailureDetail> = {
  [A380Failure.AvionicsExtractionFan]: {
    whatItIs:
      'The extraction fan draws air out of the avionics bays and cockpit panels, either through the extract valve or ' +
      'through the overboard valve. It runs whenever the aircraft is electrically powered and is monitored by the ' +
      'avionics ventilation controller.',
    impact: [
      'The avionics bays are no longer extracted by the fan.',
      'The alert asks the crew to set the EXTRACT pushbutton to OVRD.',
    ],
    alertIds: ['212800015'],
    effects: [
      {
        where: 'E/WD',
        text:
          'VENT AVNCS EXTRACT FAULT (amber caution, master caution and single chime). The line VENT AVNCS EXTRACT: OVRD is ' +
          `checked when the pushbutton is at OVRD. ${AVIONICS_ALERT_INHIBITION}`,
      },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: 'VENT AVNCS EXTRACT is listed as inoperative while the alert is active.' },
      {
        where: 'Overhead VENT panel',
        text: 'The EXTRACT pushbutton FAULT light comes on, and stays on at OVRD because the fan stays failed.',
      },
    ],
    notSimulated: [
      NO_AVIONICS_HEAT,
      'The FAULT light does not go out when the pushbutton is set to OVRD.',
      'The SD COND page does not show the low ventilation flow.',
    ],
    logbook: { required: true, reason: 'the alert is raised and the FAULT light is on' },
    clearing:
      'Maintenance only: use Restore. Setting the EXTRACT pushbutton to OVRD does not clear the alert or the light.',
  },

  [A380Failure.AvionicsExtractValve]: {
    whatItIs:
      'The extract valve opens whenever the overboard valve is closed, so that the extraction fan sends the avionics ' +
      'air through it and then through the outflow valves. With the overboard valve open, the extract valve is closed.',
    impact: [
      'When the valve is commanded open it stays closed, so the extracted air has no way out.',
      'When it is commanded closed anyway, the failure changes nothing.',
    ],
    alertIds: ['212800015'],
    effects: [
      {
        where: 'E/WD',
        text:
          'VENT AVNCS EXTRACT FAULT (amber caution, master caution and single chime) when the valve is commanded open: ' +
          'in flight with the EXTRACT pushbutton at AUTO, on the ground with both inner engines running, or with ' +
          `DITCHING on. ${AVIONICS_ALERT_INHIBITION}`,
      },
      {
        where: 'E/WD',
        text: 'In flight, setting the pushbutton to OVRD commands the valve closed and clears the alert.',
      },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: 'VENT AVNCS EXTRACT is listed as inoperative while the alert is active.' },
      { where: 'Overhead VENT panel', text: 'The EXTRACT pushbutton FAULT light comes on with the alert.' },
    ],
    notSimulated: [NO_AVIONICS_HEAT, 'The SD COND page does not show the valve position or the low ventilation flow.'],
    logbook: { required: true, reason: 'the alert is raised and the FAULT light is on' },
    clearing: 'Crew action: set the EXTRACT pushbutton to OVRD in flight. Otherwise maintenance only: use Restore.',
  },

  [A380Failure.AvionicsOverboardValveStuckOpen]: {
    whatItIs:
      'The overboard valve discharges the avionics bay air overboard. It opens on the ground with the engines not ' +
      'running, closes when both inner engines are started, and partly opens in flight with the EXTRACT pushbutton ' +
      'at OVRD. It also closes when DITCHING is on.',
    impact: [
      'The valve stays fully open, so it is not where it is commanded once the inner engines run or in flight.',
      'A valve fully open limits the flight level and calls for manual cabin pressure control.',
    ],
    alertIds: ['212800018'],
    effects: [
      {
        where: 'E/WD',
        text:
          'VENT AVNCS OVBD VLV FAULT (amber caution, master caution and single chime) when the valve is commanded ' +
          `closed or partly open: not on the ground until both inner engines run, unless DITCHING is on. ${AVIONICS_ALERT_INHIBITION}`,
      },
      {
        where: 'E/WD',
        text: 'Lines: VENT AVNCS EXTRACT: OVRD (does not clear it, the valve stays fully open), VLV STILL FULL OPEN, CABIN ALT MODE: MAN, CAB V/S TRGT: +2500 FT/MIN, and the limitation MAX FL : 100/MEA.',
      },
      { where: 'PFD', text: 'MAX FL : 100/MEA is shown as a limitation.' },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: 'VENT AVNCS OVBD VLV is listed as inoperative while the alert is active.' },
      { where: 'Overhead VENT panel', text: 'The EXTRACT pushbutton FAULT light comes on with the alert.' },
    ],
    notSimulated: [
      'The valve does not leak cabin air: the cabin pressure is not changed by the open valve.',
      'The SD COND page does not show the valve position or the low ventilation flow.',
    ],
    logbook: { required: true, reason: 'the alert is raised, the FAULT light is on and a limitation applies' },
    clearing:
      'Maintenance only: use Restore. Stopping the inner engines on the ground also commands the valve open, which clears the alert.',
  },

  [A380Failure.AvionicsOverboardValveStuckClosed]: {
    whatItIs:
      'The overboard valve discharges the avionics bay air overboard. It opens on the ground with the engines not ' +
      'running, closes when both inner engines are started, and partly opens in flight with the EXTRACT pushbutton ' +
      'at OVRD.',
    impact: [
      'The valve stays closed, so it does not open when commanded.',
      'The alert asks the crew to set the EXTRACT pushbutton to OVRD.',
    ],
    alertIds: ['212800018'],
    effects: [
      {
        where: 'E/WD',
        text:
          'VENT AVNCS OVBD VLV FAULT (amber caution, master caution and single chime) when the valve is commanded ' +
          'open: on the ground until both inner engines run, or in flight with the EXTRACT pushbutton at OVRD. ' +
          AVIONICS_ALERT_INHIBITION,
      },
      {
        where: 'E/WD',
        text: 'The line VENT AVNCS EXTRACT: OVRD is checked when the pushbutton is at OVRD. The valve is not fully open, so no limitation shows.',
      },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: 'VENT AVNCS OVBD VLV is listed as inoperative while the alert is active.' },
      { where: 'Overhead VENT panel', text: 'The EXTRACT pushbutton FAULT light comes on with the alert.' },
    ],
    notSimulated: [NO_AVIONICS_HEAT, 'The SD COND page does not show the valve position or the low ventilation flow.'],
    logbook: { required: true, reason: 'the alert is raised and the FAULT light is on' },
    clearing:
      'Crew action: start both inner engines on the ground, or leave the pushbutton at AUTO in flight. Otherwise maintenance only: use Restore.',
  },

  [A380Failure.AvionicsVentilationController]: {
    whatItIs:
      'The avionics ventilation controller runs in the CPIOM B. It monitors and controls the blowing fans, the ' +
      'extraction fan and the valves, and it raises the ECAM alerts of the avionics ventilation.',
    impact: [
      'The controller no longer monitors the avionics ventilation, so its alerts and the EXTRACT FAULT light are lost.',
      'The cooling and THS bay alerts do not depend on this controller and still show.',
    ],
    alertIds: ['212800006'],
    effects: [
      {
        where: 'E/WD',
        text:
          'COND AVNCS VENT CTL FAULT (amber advisory, no master caution or chime) while the aircraft is powered. ' +
          AVIONICS_ALERT_INHIBITION,
      },
      {
        where: 'E/WD',
        text: 'The blowing, extract and overboard valve alerts can no longer show, and ones already active clear.',
      },
      { where: 'SD STATUS', text: 'AVNCS VENT CTL is listed as inoperative while the alert is active.' },
      {
        where: 'Overhead VENT panel',
        text: 'The EXTRACT pushbutton FAULT light goes out, if a ventilation fault was lighting it.',
      },
    ],
    notSimulated: [
      'The blowing and extraction fans do not go to maximum speed.',
      'Loss of the avionics ventilation indications on the SD COND page is not modelled.',
    ],
    logbook: { required: true, reason: 'the alert is raised and the monitoring is lost' },
    clearing: 'Maintenance only: use Restore.',
  },

  [A380Failure.ThsBayBlowingFan]: {
    whatItIs:
      'The THS bay blowing fan ventilates the trimmable horizontal stabilizer bay at the tail. It runs on the ground ' +
      'when the aircraft is electrically powered.',
    impact: ['The THS bay is no longer ventilated.'],
    alertIds: ['212800028'],
    effects: [
      {
        where: 'E/WD',
        text:
          'VENT THS BAY VENT FAULT (amber advisory, no master caution or chime) while the aircraft is powered, on the ground or in flight. ' +
          AVIONICS_ALERT_INHIBITION,
      },
      { where: 'SD STATUS', text: 'THS BAY VENT is listed as inoperative while the alert is active.' },
    ],
    logbook: { required: true, reason: 'the alert is raised and the ventilation is lost' },
    clearing: 'Maintenance only: use Restore.',
  },
};

export const Ata21AvionicsFamilies: FailureDetailFamily[] = [
  BLOWING_FAN_FAMILY,
  BLOWING_FILTER_FAMILY,
  BACKUP_VALVE_FAMILY,
  COOLING_OVERHEAT_FAMILY,
  COOLING_PROTECTION_FAMILY,
];
