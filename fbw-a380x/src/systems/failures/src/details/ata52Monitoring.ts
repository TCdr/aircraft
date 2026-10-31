// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'a caution with master caution and single chime';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.

/** The latch monitoring alert can only appear with the engines off */
const LATCH_ALERT_PHASES =
  'it can only appear on the ground with the engines off or after engine shutdown; a fault that occurs from the first ' +
  'engine start on is held until engine shutdown; once shown it stays when the phase changes';

/** The per door POS DET FAULT alert */
const POS_DET_ALERT_PHASES =
  'shown with the engines off, with the first engine started, with the second engine at take-off power below 80 kt, ' +
  'in flight above 1,500 ft down to 800 ft (climb, cruise and descent above 800 ft), at or below 80 kt after landing ' +
  'and with the engines shut down; not from 80 kt on the take-off roll up to 1,500 ft, on approach or at touch down; ' +
  'once shown it stays when the phase changes';

/** The DOOR POS DET FAULT alert (all doors or one side) */
const DOOR_POS_DET_ALERT_PHASES =
  'shown with the engines off, with the first engine started, in flight above 1,500 ft down to 800 ft (climb, cruise ' +
  'and descent above 800 ft), at or below 80 kt after landing and with the engines shut down; not from the second ' +
  'engine at take-off power up to 1,500 ft, on approach or at touch down; once shown it stays when the phase changes';

const SD_DOOR_CALL_UP =
  'The page comes up with the alert when it is the first one on the E/WD and no page is selected.';

/** The passenger doors in the order of the door system (main deck 1L to 5R, then upper deck 1L to 3R) */
const DOOR_NAMES = [
  'Main1L',
  'Main1R',
  'Main2L',
  'Main2R',
  'Main3L',
  'Main3R',
  'Main4L',
  'Main4R',
  'Main5L',
  'Main5R',
  'Upper1L',
  'Upper1R',
  'Upper2L',
  'Upper2R',
  'Upper3L',
  'Upper3R',
];

function doorIds(kind: 'LatchMonitoring' | 'Ldc'): number[] {
  return DOOR_NAMES.map((name) => A380Failure[`Door${name}${kind}` as keyof typeof A380Failure]);
}

interface DoorLabel {
  /** The door as the crew knows it, e.g. MAIN 1L */
  title: string;
  deck: 'main' | 'upper';
  side: 'left' | 'right';
  /** The alert id offset: the door position in DOOR_NAMES */
  index: number;
}

function doorLabel(number: number): DoorLabel {
  const name = DOOR_NAMES[number - 1];
  const upper = name.startsWith('Upper');
  return {
    title: `${upper ? 'UPPER' : 'MAIN'} ${name.slice(upper ? 5 : 4)}`,
    deck: upper ? 'upper' : 'main',
    side: name.endsWith('L') ? 'left' : 'right',
    index: number - 1,
  };
}

const LATCH_ALERT_BASE = 520800141;
const POS_DET_ALERT_BASE = 520800161;
const DOOR_POS_DET_ALERT = '520800203';

function doorDescription(door: DoorLabel): string {
  return (
    `Door ${door.title} is a ${door.side} ${door.deck} deck passenger door. Each of the 16 passenger doors has its own ` +
    'local door controller (LDC), which monitors the door, its latches, its flight lock and its escape slide and ' +
    'reports to the three channels of the doors and slides management system.'
  );
}

function latchMonitoringDetail(number: number): FailureDetail {
  const door = doorLabel(number);
  const latchAlert = (LATCH_ALERT_BASE + door.index).toString();
  const posDetAlert = (POS_DET_ALERT_BASE + door.index).toString();
  return {
    whatItIs:
      `${doorDescription(door)} The latch monitoring is the internal monitoring of the LDC: its fault means the LDC can no longer check ` +
      'itself, while the door is still monitored.',
    impact: [
      `Only the report of the latch monitoring of door ${door.title} is lost: the door itself, its position information, its flight lock and its slide are not affected.`,
      'The loss is only an advisory to the crew; no STATUS line follows.',
      'It needs a working LDC and at least one working channel of the doors and slides management system: without them it is not detected.',
    ],
    alertIds: [latchAlert, posDetAlert],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${door.title} LATCH MONITORING FAULT, ${ADVISORY}, with no line; ${LATCH_ALERT_PHASES}. ` +
          'It does not show when the three channels are lost or when this door LDC is lost.',
      },
      {
        where: 'E/WD',
        text:
          `Only when another fault of this door is detected as well (actuator, flight lock or slide): DOOR ${door.title} POS DET FAULT, ${CAUTION}, ` +
          `shows next to the single alerts. It is ${POS_DET_ALERT_PHASES}.`,
      },
      {
        where: 'SD DOOR',
        text: `Nothing changes on the door symbol of ${door.title}: only the position information and the slide fault are drawn.`,
      },
    ],
    notSimulated: [
      'The failure only changes what the door system reports: the door, its latches and its slide behave as before.',
    ],
    logbook: { required: true, reason: `latch monitoring fault advisory on door ${door.title}` },
    clearing: MAINTENANCE_ONLY,
  };
}

const ABNORM_CAB_VS_LINES =
  'then, in flight, IF ABNORM CAB V/S with MAX FL : 100/MEA-MORA, CABIN CREW ADVISE, ATC NOTIFY, DESCENT TO FL 100/MEA-MORA INITIATE and FLT PLANNING REVIEW';

function ldcDetail(number: number): FailureDetail {
  const door = doorLabel(number);
  const posDetAlert = (POS_DET_ALERT_BASE + door.index).toString();
  const slideLengthening = door.index < 2 ? ', SLIDE LENGTHENING FAULT' : '';
  const sideStatus = door.side === 'left' ? 'L DOORS POS DET' : 'R DOORS POS DET';
  return {
    whatItIs:
      `${doorDescription(door)} Without its LDC a door is no longer monitored: the system does not know whether it is ` +
      'closed, nor its slide state.',
    impact: [
      `The position of door ${door.title} is no longer known, and the faults of this door (actuator, flight lock, latch monitoring, slide${door.index < 2 ? ', slide lengthening' : ''}) are no longer detected. Its flight lock no longer locks the door handle; nothing shows it.`,
      `The door can no longer raise DOOR ${door.title} NOT CLOSED, and it no longer counts for CAB PRESS INHIBITED BY DOORS or for the take-off configuration test.`,
      `If all eight ${door.side} LDCs of the aircraft (main and upper deck) are lost, one DOOR POS DET FAULT replaces the single alerts of that side.`,
    ],
    alertIds: [posDetAlert, DOOR_POS_DET_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${door.title} POS DET FAULT, ${CAUTION}; ${POS_DET_ALERT_PHASES}. It does not show when the three channels of the system are lost, ` +
          `or when all eight ${door.side} LDCs are lost. Its lines: PACK 1+2 & CAB PRESS NOT AVAIL (on the ground before take-off, while the pressurization is not available), ${ABNORM_CAB_VS_LINES}.`,
      },
      {
        where: 'E/WD',
        text:
          `All eight ${door.side} LDCs lost: DOOR POS DET FAULT, ${CAUTION}, replaces the single alerts of the ${door.side} doors; ${DOOR_POS_DET_ALERT_PHASES}. ` +
          'It has the same lines, and the cabin vertical speed lines are shown in flight.',
      },
      {
        where: 'E/WD',
        text: `The faults of this door (ACTUATOR FAULT, FLIGHT LOCK FAULT, LATCH MONITORING FAULT, SLIDE FAULT${slideLengthening}) cannot show while its LDC is lost, and DOOR ${door.title} NOT CLOSED does not show even if the door is open.`,
      },
      {
        where: 'SD DOOR',
        text: `${SD_DOOR_CALL_UP} The door ${door.title} shows an amber X in place of its number (no door outline), the door name with dashes in white, and an amber XX in place of the slide indication.`,
      },
      {
        where: 'SD STATUS',
        text: `INOP SYS for approach and landing: DOOR ${door.title}. With the pressurization not available on the ground before take-off: also CAB PRESS SYS and PACK 1+2. With all eight ${door.side} LDCs lost, ${sideStatus} is listed instead of the DOOR lines of that side, while the alert is shown.`,
      },
      {
        where: 'PFD',
        text: 'In flight, once the crew confirms ABNORM CAB V/S, the limitation MAX FL : 100/MEA-MORA is shown (also on the ECAM limitations).',
      },
    ],
    notSimulated: [
      'The real door system treats a door without its LDC as not closed and not locked; here the door just stops counting.',
      'On the real aircraft the take-off configuration test brings up the POS DET FAULT and T.O CONFIG NORMAL does not appear; here T.O CONFIG NORMAL can appear.',
      'The failure only changes what the door system reports: the door, its latches and its slide behave as before.',
    ],
    logbook: { required: true, reason: `door ${door.title} LDC lost, caution and door position unknown` },
    clearing: MAINTENANCE_ONLY,
  };
}

export const Ata52MonitoringFamilies: FailureDetailFamily[] = [
  { ids: doorIds('LatchMonitoring'), detail: latchMonitoringDetail },
  { ids: doorIds('Ldc'), detail: ldcDetail },
];
