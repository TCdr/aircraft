// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

type GearPlace = 'nose' | 'left' | 'right';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (L/G SYSTEM DISAGREE, L/G CTL 1 and 2 FAULT) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (L/G DOORS NOT CLOSED) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 7 and 10 (L/G GEAR NOT LOCKED DOWN) */
const NOT_SHOWN_PHASES_3_TO_7_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 3 to 5 and 9 to 12 (L/G GEAR NOT LOCKED UP) */
const NOT_SHOWN_PHASES_3_TO_5_AND_9_TO_12 =
  'a new alert is not shown from take-off power until lift-off, nor from 800 ft on approach until 5 minutes after engine shutdown';

/** Alerts inhibited in flight phases 1 to 7 and 10 to 12 (L/G GEAR NOT DOWN) */
const NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12 =
  'a new alert is shown only in flight, from 1,500 ft after take-off until touch down, never on the ground nor ' +
  'between take-off power and 1,500 ft';

/** Alerts inhibited in flight phases 1 to 11 (the two oleo pressure alerts) */
const NOT_SHOWN_PHASES_1_TO_11 =
  'a new alert is shown only in the engine shutdown phase, which lasts about 5 minutes after the engines stop ' +
  'following a landing or a rejected take-off, or after RCL is held for 3 s, which shows the inhibited alerts until ' +
  'the flight phase changes';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const SD_WHEEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

/**
 * The nose leg is a single gear, so only its doors and the main gears differ from the aircraft: the nose gear has two
 * doors that the simulation merges into one, and each main gear side merges its wing and body parts.
 */
const sensorsNotSimulated = (place: GearPlace, door: boolean): string[] => {
  if (place === 'nose') {
    return door ? ['The aircraft has two nose gear doors; the simulation has one nose door with one sensor pair.'] : [];
  }
  return [
    `Each wing and body ${door ? 'door' : 'gear'} has its own proximity sensors in the aircraft; the simulation has ` +
      `one pair for both ${door ? 'doors' : 'gears'} of the ${place} side, so the whole group is affected.`,
  ];
};

const notSimulatedField = (lines: string[]): Pick<FailureDetail, 'notSimulated'> =>
  lines.length > 0 ? { notSimulated: lines } : {};

const ACTIVE_LGCIS_NOTE =
  'The active LGCIS starts as LGCIS 1 and alternates at every gear lever UP; a fault on the active one also hands ' +
  'control over at the next lever movement, but only to a computer that is not flagged, so a flagged computer is ' +
  'never made active again.';

const FLAGGED_STAYS_CLEARING =
  'A computer flagged by the fault and no longer active stays flagged (L/G CTL n FAULT) until it is powered off and ' +
  'on again, even after Restore.';

const SYSTEM_DISAGREE_BULLET = (when: string): SeenEffect => ({
  where: 'E/WD',
  text:
    `L/G SYSTEM DISAGREE, ${ADVISORY}, when the two LGCIS disagree for 5 s ${when}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ` +
    `${ALREADY_SHOWN_STAYS}. It has no lines and no STATUS entry. ${SD_WHEEL_CALL_UP}`,
});

const ctlFaultBullet = (unit: 1 | 2, when: string): SeenEffect => ({
  where: 'E/WD',
  text:
    `L/G CTL ${unit} FAULT, ${ADVISORY}, when LGCIS ${unit} is the active computer (LGCIS 1 at the start): ${when}, ` +
    `it flags a system fault; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. It has no lines. ${SD_WHEEL_CALL_UP}`,
});

const DOORS_NOT_CLOSED_BULLET = (cause: string): SeenEffect => ({
  where: 'E/WD',
  text:
    `L/G DOORS NOT CLOSED, an amber caution with master caution and single chime, ${cause}, 30 s after the gears ` +
    `stopped locked; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. In flight the lines are MAX SPEED : ` +
    '250/.55 and L/G RECYCLE below 250 kt and M .55, or SPEED : REDUCE, L/G RECYCLE and MAX SPEED above; the ' +
    'limitation MAX SPEED : 250/.55 shows in flight, also on the PFD.',
});

const DOORS_NOT_CLOSED_STATUS_BULLET: SeenEffect = {
  where: 'SD STATUS',
  text:
    'While L/G DOORS NOT CLOSED is shown, L/G DOORS is listed as inoperative for approach and landing, and FUEL ' +
    'CONSUMPT INCRSD : FMS PRED DISREGARD in flight.',
};

const GEAR_NOT_LOCKED_DOWN_BULLET: SeenEffect = {
  where: 'E/WD',
  text:
    'L/G GEAR NOT LOCKED DOWN, a red warning with master warning and continuous chime, when the lever is DOWN and a ' +
    `gear is still not downlocked about 60 s later; ${NOT_SHOWN_PHASES_3_TO_7_10}; ${ALREADY_SHOWN_STAYS}. In flight the ` +
    'line L/G RECYCLE (after 60 s) shows, and after 120 s of alert the gravity extension lines with the limitation ' +
    'MAX SPEED : 220 KT on the E/WD and PFD.',
};

const GEAR_NOT_LOCKED_UP_BULLET: SeenEffect = {
  where: 'E/WD',
  text:
    'L/G GEAR NOT LOCKED UP, an amber caution with master caution and single chime, when the lever is UP and a gear ' +
    `is not uplocked about 40 s later; ${NOT_SHOWN_PHASES_3_TO_5_AND_9_TO_12}; ${ALREADY_SHOWN_STAYS}. In flight the ` +
    'lines are SPEED : REDUCE BELOW 250/.55 (above 250 kt or M .55), L/G LEVER RECYCLE, then L/G LEVER DOWN and MAX ' +
    'SPEED : 250/.55 if the recycle fails. With all gears downlocked and a door not closed the limitations MAX SPEED ' +
    ': 250/.55 and AVOID EXCESS G LOAD show, also on the PFD.',
};

const GEAR_NOT_LOCKED_UP_STATUS_BULLET: SeenEffect = {
  where: 'SD STATUS',
  text:
    'While L/G GEAR NOT LOCKED UP is shown, L/G RETRACTION is listed as inoperative in all phases, L/G DOORS for ' +
    'approach and landing when a door is not closed, and FUEL CONSUMPT INCRSD : FMS PRED DISREGARD in flight.',
};

const GEAR_NOT_DOWN_BULLET: SeenEffect = {
  where: 'E/WD',
  text:
    'L/G GEAR NOT DOWN, a red warning with master warning and continuous chime, when a main gear is not downlocked ' +
    `below 750 ft radio height with no engine at take-off power; ${NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12}. With flaps in CONF 3 or ` +
    'FULL it cannot be cancelled; otherwise it needs the engines at approach thrust and the crew can cancel it.',
};

/** The number after the failure name is the LGCIS that reads the sensor */
type SensorUnit = 1 | 2;

const placeText = (place: GearPlace): string => (place === 'nose' ? 'nose' : `${place} main`);

const otherUnit = (unit: SensorUnit): SensorUnit => (unit === 1 ? 2 : 1);

const SENSOR_PAIR =
  'Each position has two sensors, one read by LGCIS 1 and one by LGCIS 2, so that either computer can monitor it.';

const SD_GEAR_TRIANGLES =
  'Each gear has two triangles on the page, the left one drawn by LGCIS 1 and the right one by LGCIS 2.';

const uplockDetail = (place: GearPlace, unit: SensorUnit): FailureDetail => {
  const where = placeText(place);
  const other = otherUnit(unit);
  const triangleSide = unit === 1 ? 'left' : 'right';
  return {
    whatItIs:
      `A proximity sensor at the uplock of the ${where} landing gear tells an LGCIS that the gear is retracted and ` +
      `locked up. ${SENSOR_PAIR}`,
    impact: [
      `LGCIS ${unit} never sees the ${where} gear uplocked, while LGCIS ${other} does; the gear itself moves normally.`,
      `When LGCIS ${unit} is the active computer it never confirms the gear up: with the gear already up it flags a fault at once, and for a retraction its sequence does not finish and the doors are held open. ${ACTIVE_LGCIS_NOTE}`,
      'While the gear is up the warning system sees the two computers disagree.',
    ],
    alertIds: ['320800045', unit === 1 ? '320800033' : '320800034', '320800036'],
    effects: [
      SYSTEM_DISAGREE_BULLET('with the gear up'),
      ctlFaultBullet(
        unit,
        'at once if the gear is already up when the failure is set, otherwise 30 s after an unfinished retraction',
      ),
      DOORS_NOT_CLOSED_BULLET(`when the doors are held open with the gear up (LGCIS ${unit} active)`),
      DOORS_NOT_CLOSED_STATUS_BULLET,
      {
        where: 'SD WHEEL',
        text:
          `With the gear up, the ${triangleSide} triangle of the ${where} gear (LGCIS ${unit}) shows red instead of ` +
          `going out, while the other triangle is hidden. ${SD_GEAR_TRIANGLES}`,
      },
    ],
    ...notSimulatedField(sensorsNotSimulated(place, false)),
    logbook: { required: true, reason: 'system disagree alert and unfinished gear sequence' },
    clearing: `${MAINTENANCE_ONLY} ${FLAGGED_STAYS_CLEARING}`,
  };
};

const downlockDetail = (place: GearPlace, unit: SensorUnit): FailureDetail => {
  const where = placeText(place);
  const other = otherUnit(unit);
  const triangleSide = unit === 1 ? 'left' : 'right';
  const pfdNote: SeenEffect[] =
    unit === 1
      ? [
          {
            where: 'PFD',
            text: 'The green gear-down symbol of the lower area goes out with all gears down, because the PFD draws it only when LGCIS 1 sees all three gears downlocked.',
          },
        ]
      : [];
  return {
    whatItIs:
      `A proximity sensor at the downlock of the ${where} landing gear tells an LGCIS that the gear is extended and ` +
      `locked down. ${SENSOR_PAIR}`,
    impact: [
      `LGCIS ${unit} never sees the ${where} gear downlocked, while LGCIS ${other} does; the gear itself moves normally.`,
      `When LGCIS ${unit} is the active computer it never confirms the gear down: with the gear already down it flags a fault at once, and for an extension its sequence does not finish and the doors stay open after the gear is down. ${ACTIVE_LGCIS_NOTE}`,
      'While the gear is down the warning system sees the two computers disagree.',
    ],
    alertIds: ['320800045', unit === 1 ? '320800033' : '320800034', '320800036'],
    effects: [
      SYSTEM_DISAGREE_BULLET('with the gear down'),
      ctlFaultBullet(
        unit,
        'at once if the gear is already down when the failure is set, otherwise 30 s after an unfinished extension',
      ),
      DOORS_NOT_CLOSED_BULLET(`when the doors stay open with the gear down (LGCIS ${unit} active)`),
      DOORS_NOT_CLOSED_STATUS_BULLET,
      {
        where: 'SD WHEEL',
        text:
          `With the gear down, the ${triangleSide} triangle of the ${where} gear (LGCIS ${unit}) shows red instead of ` +
          `green, while the other triangle is green. ${SD_GEAR_TRIANGLES}`,
      },
      ...pfdNote,
    ],
    ...notSimulatedField(sensorsNotSimulated(place, false)),
    logbook: { required: true, reason: 'system disagree alert and unfinished gear sequence' },
    clearing: `${MAINTENANCE_ONLY} ${FLAGGED_STAYS_CLEARING}`,
  };
};

const doorClosedDetail = (place: GearPlace, unit: SensorUnit): FailureDetail => {
  const where = placeText(place);
  const other = otherUnit(unit);
  return {
    whatItIs:
      `A proximity sensor at the uplock of the ${where} landing gear door tells an LGCIS that the door is closed and ` +
      `locked. ${SENSOR_PAIR}`,
    impact: [
      `LGCIS ${unit} never sees the ${where} door closed, while LGCIS ${other} does; the door itself moves normally.`,
      `When LGCIS ${unit} is the active computer it never confirms the doors closed: with the gear up or down it flags a fault at once, and neither a retraction nor an extension finishes in its sequence. ${ACTIVE_LGCIS_NOTE}`,
      'The warning system sees the two computers disagree, in every gear position.',
    ],
    alertIds: ['320800045', unit === 1 ? '320800033' : '320800034'],
    effects: [
      SYSTEM_DISAGREE_BULLET('with the door closed'),
      ctlFaultBullet(
        unit,
        'at once with the gear up or down when the failure is set, otherwise 30 s after an unfinished retraction or extension',
      ),
      {
        where: 'SD WHEEL',
        text:
          `The ${where} door is drawn amber, in transit, instead of green closed, because the page takes a door as not ` +
          'closed when either LGCIS sees it so. ' +
          SD_WHEEL_CALL_UP,
      },
    ],
    ...notSimulatedField(sensorsNotSimulated(place, true)),
    logbook: { required: true, reason: 'system disagree alert and amber door indication' },
    clearing: `${MAINTENANCE_ONLY} ${FLAGGED_STAYS_CLEARING}`,
  };
};

const doorOpenedDetail = (place: GearPlace, unit: SensorUnit): FailureDetail => {
  const where = placeText(place);
  const other = otherUnit(unit);
  return {
    whatItIs:
      `A proximity sensor on the ${where} landing gear door tells an LGCIS that the door is fully open. The gear ` +
      `moves only once all three doors are reported fully open. ${SENSOR_PAIR}`,
    impact: [
      `LGCIS ${unit} never sees the ${where} door fully open, while LGCIS ${other} does; the door itself moves normally.`,
      `When LGCIS ${unit} is the active computer no gear moves: an up gear is not extended and a down gear is not retracted, because it waits for every door to be reported open.`,
      `A lever movement after the fault hands control to LGCIS ${other}, which moves the gear normally (the L/G RECYCLE lines). ${ACTIVE_LGCIS_NOTE}`,
    ],
    alertIds: ['320800045', unit === 1 ? '320800033' : '320800034', '320800039', '320800040', '320800037', '320800038'],
    effects: [
      SYSTEM_DISAGREE_BULLET('while the doors are fully open'),
      ctlFaultBullet(unit, 'when a gear movement is still not complete 30 s after the lever order'),
      GEAR_NOT_LOCKED_DOWN_BULLET,
      GEAR_NOT_LOCKED_UP_BULLET,
      GEAR_NOT_LOCKED_UP_STATUS_BULLET,
      GEAR_NOT_DOWN_BULLET,
      {
        where: 'SD WHEEL',
        text: `The amber L/G CTL shows 60 s after the lever went DOWN, or 40 s after UP, with a gear not locked. The doors that stay open are drawn amber, open. ${SD_WHEEL_CALL_UP}`,
      },
    ],
    notSimulated: [
      ...sensorsNotSimulated(place, true),
      'The red arrow on the L/G lever, which the warning system raises while a gear is not down, is not simulated.',
    ],
    logbook: { required: true, reason: 'gear not moving when the damaged unit is active' },
    clearing: `${MAINTENANCE_ONLY} ${FLAGGED_STAYS_CLEARING}`,
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Oleo pressure
// ---------------------------------------------------------------------------------------------------------------

const OLEO_GEARS = ['nose', 'left wing', 'right wing', 'left body', 'right body'];

const OLEO_LINES = ['ON NOSE L/G', 'ON L WING L/G', 'ON R WING L/G', 'ON L BODY L/G', 'ON R BODY L/G'];

const OLEO_DESCRIPTION =
  'The shock absorber (oleo) of each landing gear holds oil and gas under pressure, and the oleo pressure ' +
  'monitoring system (OPMS) measures that pressure on every gear to flag a value outside the normal range, or a ' +
  'difference between two symmetrical gears, for maintenance.';

const oleoAbnormalDetail = (position: number): FailureDetail => {
  const gear = OLEO_GEARS[position - 1];
  const line = OLEO_LINES[position - 1];
  return {
    whatItIs: OLEO_DESCRIPTION,
    impact: [
      `The ${gear} gear oleo pressure is reported abnormal to the warning system only: the shock absorber and the ground and flight logic are unchanged.`,
      'Several gears failed together are listed on the same alert, one line each.',
    ],
    alertIds: ['320800031'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G ABNORM OLEO PRESS, ${ADVISORY}, while the failure is present, with the amber line ${line} (a line for each ` +
          `gear failed); ${NOT_SHOWN_PHASES_1_TO_11}; ${ALREADY_SHOWN_STAYS}. It needs a maintenance action, has no ` +
          'procedure lines and no STATUS entry.',
      },
    ],
    notSimulated: ['The pressure indicators on the gear legs and the maintenance messages are not simulated.'],
    logbook: { required: true, reason: 'oleo pressure abnormal alert, maintenance action' },
    clearing: MAINTENANCE_ONLY,
  };
};

const oleoMonitoringDetail = (position: number): FailureDetail => {
  const gear = OLEO_GEARS[position - 1];
  const line = OLEO_LINES[position - 1];
  return {
    whatItIs: OLEO_DESCRIPTION,
    impact: [
      `The monitoring of the ${gear} gear oleo pressure is lost; the pressure itself and the gear are unchanged.`,
      'Several gears failed together are listed on the same alert, one line each.',
    ],
    alertIds: ['320800043'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G OLEO PRESS MONITORING SYS FAULT, ${ADVISORY}, while the failure is present, with the amber line ${line} ` +
          `(a line for each gear failed); ${NOT_SHOWN_PHASES_1_TO_11}; ${ALREADY_SHOWN_STAYS}. It has no procedure lines.`,
      },
      {
        where: 'SD STATUS',
        text: 'OLEO PRESS MONIT SYS is listed as inoperative, in all phases, while the alert is shown.',
      },
    ],
    logbook: { required: true, reason: 'oleo pressure monitoring fault alert' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------

export const Ata32GearSensorsEntries: Record<number, FailureDetail> = {
  [A380Failure.GearProxSensorDamageGearUplockNose1]: uplockDetail('nose', 1),
  [A380Failure.GearProxSensorDamageGearDownlockNose2]: downlockDetail('nose', 2),
  [A380Failure.GearProxSensorDamageGearUplockRight1]: uplockDetail('right', 1),
  [A380Failure.GearProxSensorDamageGearDownlockRight2]: downlockDetail('right', 2),
  [A380Failure.GearProxSensorDamageGearUplockLeft2]: uplockDetail('left', 2),
  [A380Failure.GearProxSensorDamageGearDownlockLeft1]: downlockDetail('left', 1),
  [A380Failure.GearProxSensorDamageGearDoorClosedNose1]: doorClosedDetail('nose', 1),
  [A380Failure.GearProxSensorDamageGearDoorOpenedNose2]: doorOpenedDetail('nose', 2),
  [A380Failure.GearProxSensorDamageGearDoorClosedRight2]: doorClosedDetail('right', 2),
  [A380Failure.GearProxSensorDamageGearDoorOpenedRight1]: doorOpenedDetail('right', 1),
  [A380Failure.GearProxSensorDamageGearDoorClosedLeft2]: doorClosedDetail('left', 2),
  [A380Failure.GearProxSensorDamageGearDoorOpenedLeft1]: doorOpenedDetail('left', 1),
};

export const Ata32GearSensorsFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.GearOleoPressureAbnormalNose,
      A380Failure.GearOleoPressureAbnormalLeftWing,
      A380Failure.GearOleoPressureAbnormalRightWing,
      A380Failure.GearOleoPressureAbnormalLeftBody,
      A380Failure.GearOleoPressureAbnormalRightBody,
    ],
    detail: oleoAbnormalDetail,
  },
  {
    ids: [
      A380Failure.GearOleoPressureMonitoringNose,
      A380Failure.GearOleoPressureMonitoringLeftWing,
      A380Failure.GearOleoPressureMonitoringRightWing,
      A380Failure.GearOleoPressureMonitoringLeftBody,
      A380Failure.GearOleoPressureMonitoringRightBody,
    ],
    detail: oleoMonitoringDetail,
  },
];
