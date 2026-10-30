// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';
const WARNING = 'a red warning with master warning and continuous chime';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (L/G CTL 1 and 2 FAULT) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (L/G CTL 1+2 FAULT, L/G DOORS NOT CLOSED) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 7 and 10 (L/G GEAR NOT LOCKED DOWN) */
const NOT_SHOWN_PHASES_3_TO_7_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 3, 4, 5 and 9 to 12 (L/G GEAR NOT LOCKED UP) */
const NOT_SHOWN_PHASES_3_TO_5_AND_9_TO_12 =
  'a new alert is not shown from take-off power until lift-off, nor from 800 ft on approach until after engine shutdown';

/** Alerts inhibited in flight phases 1 to 7 and 10 to 12 (L/G GEAR NOT DOWN) */
const NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12 =
  'a new alert is shown only in flight, from 1,500 ft after take-off until touch down, never on the ground nor ' +
  'between take-off power and 1,500 ft';

/** Alerts inhibited in flight phases 4, 5 and 8 to 11 (L/G RETRACTION FAULT) */
const NOT_SHOWN_PHASES_4_5_AND_8_TO_11 =
  'a new alert is not shown above 80 kt on the take-off roll, nor in flight from 1,500 ft until after engine ' +
  'shutdown';

/** Alerts inhibited in flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert is shown only on the ground before take-off power or after engine shutdown';

/** Alerts inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert is shown only on the ground with the engines off, before the first engine start or after shutdown';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const SD_WHEEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const LGCIS_DESCRIPTION =
  'The landing gear control and indicating system (LGCIS) is made of two redundant computers, LGCIS 1 and LGCIS 2. ' +
  'The active one sequences the uplocks, downlocks and selector valves when the gear lever moves, while the other ' +
  'is a backup. Each reads its own set of proximity sensors for gear, door, shock absorber and bogie positions, and ' +
  'sends the ground and flight data to the warning system, the SD WHEEL page, the PFD and many other systems.';

const L_G_CTL_FAULT_LINE_PER_UNIT =
  'is shown while one LGCIS is faulty; L/G CTL 1+2 FAULT replaces both single alerts when both are faulty';

const CTL_12_LINES =
  'The lines are [MFD SURV] GPWS : OFF, ticked when the GPWS is switched off on the MFD SURV page, and NO L/G ' +
  'RETRACTION, shown only with an engine running when all gears were downlocked as the alert came up.';

const CTL_12_LIMITATIONS =
  'If all gears were downlocked as the alert came up the limitation is NO L/G RETRACTION; otherwise it is MAX SPEED ' +
  ': 220 KT and L/G GRVTY EXTN ONLY (MAX SPEED : 220 KT also on the PFD).';

const CTL_12_STATUS =
  'With L/G CTL 1+2 FAULT shown, L/G CTL 1+2 and GPWS 1+2 are listed as inoperative for approach and landing; the ' +
  'single L/G CTL alerts add no STATUS line.';

const ctl12Bullet = (when: string): { where: string; text: string } => ({
  where: 'E/WD',
  text:
    `L/G CTL 1+2 FAULT, ${CAUTION}, ${when}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
    `${CTL_12_LINES} ${CTL_12_LIMITATIONS}`,
});

const ctlSingleBullet = (unit: 1 | 2, when: string): { where: string; text: string } => ({
  where: 'E/WD',
  text:
    `L/G CTL ${unit} FAULT, ${ADVISORY}, ${when}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. It ` +
    `${L_G_CTL_FAULT_LINE_PER_UNIT}.`,
});

const LGCIS_BASE_NOT_SIMULATED =
  'The real active LGCIS changes after each landing gear extension; the simulation switches over at each gear ' +
  'retraction and on a fault.';

// ---------------------------------------------------------------------------------------------------------------
// LGCIS 1 and 2
// ---------------------------------------------------------------------------------------------------------------

const lgcisPowerSupplyDetail = (unit: 1 | 2): FailureDetail => {
  const other = unit === 1 ? 2 : 1;
  const triangle = unit === 1 ? 'left' : 'right';
  return {
    whatItIs:
      `${LGCIS_DESCRIPTION} LGCIS ${unit} is one of the two, and the simulation starts with LGCIS 1 as the active ` +
      'computer.',
    impact: [
      `LGCIS ${unit} loses its supply: its data become invalid, so the warning system and the WHEEL page rely on LGCIS ${other} alone.`,
      `An active LGCIS ${unit} hands control to LGCIS ${other} at once, and the gear keeps following the lever.`,
      'With both LGCIS lost the gears and doors cannot be moved by the lever and the lever cannot be raised from DOWN: only the gravity extension can extend an up gear. No main gear is reported compressed either, so the pedal braking demand on the ground is cut (the parking brake is not affected) and neither reverser deploys.',
      `The engine ${unit === 1 ? 2 : 3} reverser takes its ground signal from LGCIS ${unit} only, so without LGCIS ${unit} it cannot deploy after landing.`,
      ...(unit === 1
        ? [
            'The nose wheel steering demand (tiller, pedals, autopilot) is passed on only while LGCIS 1 reports the nose gear compressed, so without LGCIS 1 the nose wheel gets a zero demand on the ground.',
          ]
        : []),
    ],
    alertIds: ['320800033', '320800034', '320800035', '320800037', '320800038'],
    effects: [
      ctlSingleBullet(unit, `while LGCIS ${other} is still healthy`),
      ctl12Bullet('as soon as both LGCIS are lost or faulty'),
      {
        where: 'E/WD',
        text:
          `With both LGCIS unpowered, L/G GEAR NOT DOWN, ${WARNING}: the warning system no longer sees any main gear ` +
          'downlocked, so it comes up below 750 ft radio height with no engine at take-off power, even with the gear ' +
          `down; ${NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12}; ${ALREADY_SHOWN_STAYS}. With flaps in CONF 3 or FULL it cannot be cancelled; otherwise it needs the ` +
          'engines at approach thrust and the crew can cancel it.',
      },
      {
        where: 'SD WHEEL',
        text:
          `Each gear shows an amber XX in place of the ${triangle} triangle that LGCIS ${unit} draws; the gear door ` +
          `indications use LGCIS ${other}, and show XX only when both are lost. ${SD_WHEEL_CALL_UP}`,
      },
      ...(unit === 1
        ? [
            {
              where: 'PFD',
              text: 'The green gear-down symbol of the lower area goes out even with all gears down, because the PFD reads only LGCIS 1.',
            },
          ]
        : []),
      { where: 'SD STATUS', text: CTL_12_STATUS },
    ],
    notSimulated: [LGCIS_BASE_NOT_SIMULATED],
    logbook: { required: true, reason: 'L/G CTL fault alert and a lost computer' },
    clearing:
      `${MAINTENANCE_ONLY} LGCIS ${unit} is powered again and the alerts clear; the other LGCIS stays the active ` +
      'computer until its own switch-over.',
  };
};

const lgcisInternalErrorDetail = (unit: 1 | 2): FailureDetail => {
  const other = unit === 1 ? 2 : 1;
  return {
    whatItIs:
      `${LGCIS_DESCRIPTION} LGCIS ${unit} is one of the two, and the simulation starts with LGCIS 1 as the active ` +
      'computer.',
    impact: [
      `LGCIS ${unit} stays powered and keeps sending its data, but flags a system fault and no longer controls the gear hydraulics.`,
      `An active LGCIS ${unit} hands control to LGCIS ${other} within a frame; with LGCIS ${other} also faulty nothing takes over and the gear selector valves stay closed, so the gear and doors do not move.`,
      'Gear lever lock, sensor readings, SD WHEEL indications and PFD symbol are unchanged.',
    ],
    alertIds: ['320800033', '320800034', '320800035'],
    effects: [
      ctlSingleBullet(unit, `while LGCIS ${other} is still healthy`),
      ctl12Bullet('as soon as both LGCIS are lost or faulty'),
      { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
      { where: 'SD STATUS', text: CTL_12_STATUS },
    ],
    notSimulated: [LGCIS_BASE_NOT_SIMULATED],
    logbook: { required: true, reason: 'L/G CTL fault alert' },
    clearing:
      `${MAINTENANCE_ONLY} Unless LGCIS ${unit} is still the active computer, L/G CTL ${unit} FAULT stays after ` +
      'Restore (it was handed over, or it was already the backup; the usual case for both): the flag clears only when ' +
      'that LGCIS loses power and is powered again. An LGCIS that kept control because the other one was also faulty ' +
      'clears at once.',
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Jammed gear and door actuators
// ---------------------------------------------------------------------------------------------------------------

type GearPlace = 'nose' | 'left' | 'right';

const placeText = (place: GearPlace): string => (place === 'nose' ? 'nose' : `${place} main`);

const jamSentence = (actuator: string): string =>
  `Once the ${actuator} actuator reaches, or already sits near, a random point of its travel (a new point is drawn ` +
  'every time the failure is cleared), it holds position like a closed actuator, in both directions.';

const JAM_RECYCLE_CLEARING =
  'If the lever was moved again while the gear was stuck, the LGCIS that flagged first keeps L/G CTL 1 (2) FAULT until ' +
  'it is powered down and up again.';

const ONE_ACTUATOR_PER_SIDE_NOT_SIMULATED =
  'Each wing gear, body gear and door has its own actuator in the aircraft; the simulation has one for the nose, ' +
  'one for each side of the main gears (wing and body together) and one door actuator per place, so the whole side jams at once.';

const GEAR_NOT_LOCKED_DOWN_BULLET: { where: string; text: string } = {
  where: 'E/WD',
  text:
    `L/G GEAR NOT LOCKED DOWN, ${WARNING}, when the lever is DOWN and a gear is still not downlocked about 60 s later; ` +
    `${NOT_SHOWN_PHASES_3_TO_7_10}; ${ALREADY_SHOWN_STAYS}. In flight the line L/G RECYCLE (after 60 s) shows, and after ` +
    '120 s of alert the gravity extension lines (L/G LEVER UP, L/G GRVTY DOWN, L/G LEVER DOWN) with the limitation MAX ' +
    'SPEED : 220 KT on the E/WD and PFD; LDG WITH ABNORM L/G PROC APPLY shows if the L/G GRVTY sw is DOWN, the lever is ' +
    'DOWN again and the gear is still not down.',
};

const GEAR_NOT_LOCKED_UP_BULLET: { where: string; text: string } = {
  where: 'E/WD',
  text:
    `L/G GEAR NOT LOCKED UP, ${CAUTION}, when the lever is UP and a gear is not uplocked about 40 s later; ` +
    `${NOT_SHOWN_PHASES_3_TO_5_AND_9_TO_12}; ${ALREADY_SHOWN_STAYS}. It stays until all gears are uplocked for 5 s or the ` +
    'aircraft is on the ground. In flight with a door not closed the lines are SPEED : REDUCE BELOW 250/.55 (above ' +
    '250 kt or M .55), L/G LEVER RECYCLE, then L/G LEVER DOWN and MAX SPEED : 250/.55 if the recycle fails; with all ' +
    'doors closed it shows AVOID EXCESS G LOAD. With all gears downlocked and a door not closed the limitations ' +
    'MAX SPEED : 250/.55 and AVOID EXCESS G LOAD show, also on the PFD.',
};

const GEAR_NOT_LOCKED_UP_STATUS_BULLET: { where: string; text: string } = {
  where: 'SD STATUS',
  text:
    'L/G RETRACTION is listed as inoperative in all phases and L/G DOORS for approach and landing when a door is not ' +
    'closed; FUEL CONSUMPT INCRSD : FMS PRED DISREGARD is listed in flight. With all gears downlocked and a door ' +
    'not closed the limitations MAX SPEED : 250/.55 and AVOID EXCESS G LOAD are listed too.',
};

const DOORS_NOT_CLOSED_BULLET: { where: string; text: string } = {
  where: 'E/WD',
  text:
    `L/G DOORS NOT CLOSED, ${CAUTION}, when the gears have stopped locked (lever DOWN with all downlocked, or UP with ` +
    `all uplocked) and a door is still not closed 30 s later; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
    'It is hidden while GEAR NOT LOCKED DOWN or UP is shown, and not raised while the L/G GRVTY sw is DOWN. In flight ' +
    'the lines are MAX SPEED : 250/.55 and L/G RECYCLE below 250 kt and M .55, or SPEED : REDUCE, L/G RECYCLE and ' +
    'MAX SPEED above; the limitation MAX SPEED : 250/.55 shows in flight, also on the PFD.',
};

const DOORS_NOT_CLOSED_STATUS_BULLET: { where: string; text: string } = {
  where: 'SD STATUS',
  text:
    'While L/G DOORS NOT CLOSED is shown, L/G DOORS is listed as inoperative for approach and landing, and FUEL ' +
    'CONSUMPT INCRSD : FMS PRED DISREGARD in flight.',
};

const CTL_TIMEOUT_BULLET: { where: string; text: string } = {
  where: 'E/WD',
  text:
    `L/G CTL 1 FAULT or L/G CTL 2 FAULT, ${ADVISORY}, when the gear movement is still not complete 30 s after the lever ` +
    `order: the active LGCIS flags a system fault; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. After the ` +
    'lever is moved again the other LGCIS takes over and flags the same way, which turns the two alerts into L/G CTL ' +
    `1+2 FAULT (caution; ${NOT_SHOWN_PHASES_4_TO_7_9_10}). ${CTL_12_LIMITATIONS}`,
};

const SD_LG_CTL_BULLET: { where: string; text: string } = {
  where: 'SD WHEEL',
  text:
    'The amber L/G CTL shows when a gear is still not downlocked 60 s after the lever went DOWN or not uplocked 40 s ' +
    'after it went UP. A gear that is not locked shows a red triangle (one per LGCIS); a door in transit or open is ' +
    'amber. Gear alerts call the page up.',
};

const GEAR_NOT_DOWN_BULLET: { where: string; text: string } = {
  where: 'E/WD',
  text:
    `L/G GEAR NOT DOWN, ${WARNING}, when a main gear is not downlocked below 750 ft radio height with no engine at ` +
    `take-off power; ${NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12}. With flaps in CONF 3 or FULL it cannot be cancelled; otherwise ` +
    'it needs the engines at approach thrust and the crew can cancel it. It is not raised while both LGCIS flag a fault.',
};

const gearActuatorDetail = (place: GearPlace): FailureDetail => {
  const mainGear = place !== 'nose';
  const where = placeText(place);
  const hydraulics = mainGear
    ? 'powered by the GREEN and YELLOW systems together in the simulation'
    : 'powered by the GREEN system';
  return {
    whatItIs:
      `The ${where} gear extension and retraction actuator is a hydraulic jack, ${hydraulics}, that swings the ` +
      `${mainGear ? 'wing and body gears of that side' : 'nose leg'} between the uplock and the downlock. The ` +
      'active LGCIS orders it through a selector valve once the gear doors are fully open, and the downlock ' +
      'springs hold the gear down.',
    impact: [
      `${jamSentence(`${where} gear`)} The gear moves normally until then.`,
      mainGear
        ? `The ${place} main gears (wing and body) are affected together: on retraction they stop before the uplock, on extension before the downlock; a point near the extended position keeps them down and unable to retract.`
        : 'On retraction the nose gear stops before the uplock, on extension before the downlock; a point near the extended position keeps it down and unable to retract.',
      'A gear that stopped keeps the doors open (they close only when every gear is locked), and after 30 s of unfinished movement the active LGCIS flags a fault.',
    ],
    alertIds: [
      '320800039',
      '320800040',
      '320800033',
      '320800034',
      '320800035',
      ...(mainGear ? ['320800037', '320800038'] : []),
    ],
    effects: [
      GEAR_NOT_LOCKED_DOWN_BULLET,
      GEAR_NOT_LOCKED_UP_BULLET,
      GEAR_NOT_LOCKED_UP_STATUS_BULLET,
      CTL_TIMEOUT_BULLET,
      ...(mainGear ? [GEAR_NOT_DOWN_BULLET] : []),
      SD_LG_CTL_BULLET,
      {
        where: 'PFD',
        text: 'The green gear-down symbol of the lower area is drawn only while LGCIS 1 reports all three gears downlocked.',
      },
    ],
    notSimulated: [ONE_ACTUATOR_PER_SIDE_NOT_SIMULATED],
    logbook: { required: true, reason: 'gear not locked alert and unfinished gear movement' },
    clearing:
      `${MAINTENANCE_ONLY} The actuator moves again and the gear finishes its travel; the alerts clear when the ` +
      'gears reach their locks (GEAR NOT LOCKED UP also clears on the ground). ' +
      JAM_RECYCLE_CLEARING,
  };
};

const doorActuatorDetail = (place: GearPlace): FailureDetail => {
  const where = placeText(place);
  return {
    whatItIs:
      `The ${where} gear door actuator is a hydraulic jack that opens the doors of that gear before it moves and ` +
      'closes them once the gear is locked. The doors stay closed and locked by the uplock otherwise; the LGCIS ' +
      'senses closed and fully open with proximity sensors, and the gear moves only when every door is fully open.',
    impact: [
      `${jamSentence(`${where} door`)} The door then stops short of fully open when it opens, or short of closed when it closes; a point near the closed position keeps it closed.`,
      'Gear extension and retraction wait until every door is fully open, so one door stopped short keeps all gears where they are: an up gear does not extend (use the gravity extension), a down gear does not retract.',
      'A door stopped partly open after the gears locked stays open; after 30 s of unfinished movement the active LGCIS flags a fault.',
    ],
    alertIds: ['320800039', '320800040', '320800036', '320800033', '320800034', '320800035', '320800037', '320800038'],
    effects: [
      GEAR_NOT_LOCKED_DOWN_BULLET,
      GEAR_NOT_LOCKED_UP_BULLET,
      GEAR_NOT_LOCKED_UP_STATUS_BULLET,
      DOORS_NOT_CLOSED_BULLET,
      DOORS_NOT_CLOSED_STATUS_BULLET,
      CTL_TIMEOUT_BULLET,
      GEAR_NOT_DOWN_BULLET,
      SD_LG_CTL_BULLET,
      {
        where: 'SD WHEEL',
        text: `The ${where} door is drawn amber, in transit or open, instead of the green closed door, unless it jammed while closed.`,
      },
    ],
    notSimulated: [ONE_ACTUATOR_PER_SIDE_NOT_SIMULATED],
    logbook: { required: true, reason: 'gear or door not locked alert' },
    clearing:
      `${MAINTENANCE_ONLY} The door moves again and finishes its travel; the alerts clear when the doors and gears ` +
      'reach their locks. ' +
      JAM_RECYCLE_CLEARING,
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Retraction configuration and gravity extension
// ---------------------------------------------------------------------------------------------------------------

const RETRACTION_FAULT_BULLET: { where: string; text: string } = {
  where: 'E/WD',
  text:
    `L/G RETRACTION FAULT, ${CAUTION}, when the lever is raised in flight and the gear stays down; ` +
    `${NOT_SHOWN_PHASES_4_5_AND_8_TO_11}; ${ALREADY_SHOWN_STAYS}. In flight the lines are MAX SPEED : 250/.55 (or SPEED : ` +
    'REDUCE BELOW 250/.55 above 250 kt or M .55), L/G RECYCLE, and if that fails L/G : KEEP DOWN. It stays after the ' +
    'lever is lowered, until the gears are uplocked or the aircraft is on the ground.',
};

const RETRACTION_FAULT_LIMITATIONS_BULLET: { where: string; text: string } = {
  where: 'SD STATUS',
  text:
    'While L/G RETRACTION FAULT is shown in flight the limitations MAX SPEED : 250/.55 and L/G : KEEP DOWN show; L/G ' +
    'RETRACTION is listed as inoperative in all phases, and FUEL CONSUMPT INCRSD : FMS PRED DISREGARD with an engine running.',
};

const RETRACTION_IMPACT =
  'The LGCIS do not start a retraction out of the retraction configuration: raising the lever in flight does nothing, ' +
  'the gears stay down and locked, and the lever counts as DOWN for them.';

const NO_L_G_RETRACTION_LINE =
  'With an engine running and all gears downlocked as the alert came up, the line NO L/G RETRACTION and the ' +
  'limitation of the same name show.';

const uplockClosedDetail = (place: GearPlace): FailureDetail => {
  const where = placeText(place);
  const gearKey =
    place === 'nose'
      ? 'the nose gear is downlocked'
      : 'both main gears are downlocked (the left and right failures act the same way)';
  return {
    whatItIs:
      'Each landing gear is held up by an uplock hook that opens to let the gear fall and should stay open once the ' +
      'gear is down, so that the gear can be retracted again. A proximity sensor reports the uplock position to ' +
      'the LGCIS, which monitors the retraction configuration before it lets a gear go up.',
    impact: [
      `The ${where} uplock is closed although the gear is extended; the failure counts as soon as ${gearKey}, also on the ground.`,
      RETRACTION_IMPACT,
      'The fault is a flag in the simulation: the uplock hook itself is not drawn or moved.',
    ],
    alertIds: ['320800041', '320800044'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G GEAR UPLOCK FAULT, ${ADVISORY}, while the failure is present and the gear is downlocked; ` +
          `${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}. ${NO_L_G_RETRACTION_LINE}`,
      },
      { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
      RETRACTION_FAULT_BULLET,
      RETRACTION_FAULT_LIMITATIONS_BULLET,
    ],
    notSimulated: ['The amber UP LOCK indication of the WHEEL page is not shown.'],
    logbook: { required: true, reason: 'uplock fault and no gear retraction' },
    clearing: `${MAINTENANCE_ONLY} A retraction fault already shown stays until the gears are uplocked or the aircraft is on the ground.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------

export const Ata32GearSystemEntries: Record<number, FailureDetail> = {
  [A380Failure.LgciuPowerSupply1]: lgcisPowerSupplyDetail(1),
  [A380Failure.LgciuPowerSupply2]: lgcisPowerSupplyDetail(2),
  [A380Failure.LgciuInternalError1]: lgcisInternalErrorDetail(1),
  [A380Failure.LgciuInternalError2]: lgcisInternalErrorDetail(2),

  [A380Failure.GearActuatorJammedGearNose]: gearActuatorDetail('nose'),
  [A380Failure.GearActuatorJammedGearLeft]: gearActuatorDetail('left'),
  [A380Failure.GearActuatorJammedGearRight]: gearActuatorDetail('right'),
  [A380Failure.GearActuatorJammedGearDoorNose]: doorActuatorDetail('nose'),
  [A380Failure.GearActuatorJammedGearDoorLeft]: doorActuatorDetail('left'),
  [A380Failure.GearActuatorJammedGearDoorRight]: doorActuatorDetail('right'),

  [A380Failure.GearUplockClosedNose]: uplockClosedDetail('nose'),
  [A380Failure.GearUplockClosedLeft]: uplockClosedDetail('left'),
  [A380Failure.GearUplockClosedRight]: uplockClosedDetail('right'),

  [A380Failure.GearBogiePosition]: {
    whatItIs:
      'The wing and body gear bogies are held in a pitch-down (dip) attitude in flight so that they stow cleanly, ' +
      'and lie flat under the aircraft weight on the ground. Sensors tell the LGCIS whether the bogies are in the ' +
      'dip position, which is one of the conditions to allow a gear retraction.',
    impact: [
      'The bogie position fault counts as soon as both main gears are downlocked, also on the ground.',
      RETRACTION_IMPACT,
      'The fault is a flag in the simulation: the bogies themselves keep moving normally.',
    ],
    alertIds: ['320800032', '320800044'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G BOGIE POSITION FAULT, ${ADVISORY}, while the failure is present and the main gears are downlocked; ` +
          `${NOT_SHOWN_PHASES_2_TO_11}; ${ALREADY_SHOWN_STAYS}. ${NO_L_G_RETRACTION_LINE} Applied after the first engine ` +
          'start, the alert stays hidden until engine shutdown.',
      },
      RETRACTION_FAULT_BULLET,
      RETRACTION_FAULT_LIMITATIONS_BULLET,
    ],
    logbook: { required: true, reason: 'bogie fault and no gear retraction' },
    clearing: `${MAINTENANCE_ONLY} A retraction fault already shown stays until the gears are uplocked or the aircraft is on the ground.`,
  },

  [A380Failure.GearGravityExtension]: {
    whatItIs:
      'The landing gear gravity extension system lets the crew drop the gear without hydraulics or the LGCIS when the ' +
      'normal extension fails. The L/G GRVTY switch starts two independent free fall control modules, which isolate ' +
      'the retraction actuators, put them in free flow, then release the door uplocks and the gear uplocks in turn.',
    impact: [
      'The L/G GRVTY switch commands nothing: no cut-out valve, no free flow and no uplock release.',
      'The normal extension and retraction are not affected, so the failure shows only when a gravity extension is needed.',
    ],
    alertIds: ['320800042'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G GRVTY EXTN FAULT, ${ADVISORY}, while the failure is present; ${NOT_SHOWN_PHASES_3_TO_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no lines and no STATUS entry.`,
      },
      {
        where: 'SD WHEEL',
        text:
          'With the L/G GRVTY switch DOWN the message L/G GRVTY EXTN IN PROGRESS still shows for up to 120 s, even though ' +
          'nothing is released; the L/G GRVTY EXTN memo, which needs all gears down, does not appear while the gear stays up.',
      },
    ],
    logbook: { required: true, reason: 'gravity extension unavailable' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.GearWeightOnWheels]: {
    whatItIs:
      'The shock absorber proximity sensors of each landing gear tell the LGCIS whether the gear is compressed, which ' +
      'is the weight on wheels information used for the ground and flight logic of many systems.',
    impact: [
      'Only the warning system sees the failure: the LGCIS data, the ground and flight logic and the other systems are unchanged.',
    ],
    alertIds: ['320800046'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G WEIGHT ON WHEELS FAULT, ${ADVISORY}, while the failure is present; ${NOT_SHOWN_PHASES_2_TO_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no lines and no STATUS entry.`,
      },
    ],
    notSimulated: [
      'In the aircraft the LGCIS can no longer compute the ground and flight condition; the simulation keeps it.',
    ],
    logbook: { required: true, reason: 'weight on wheels fault alert' },
    clearing: MAINTENANCE_ONLY,
  },
};
