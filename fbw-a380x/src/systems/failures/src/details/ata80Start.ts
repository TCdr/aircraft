// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Engines 1 and 2 are on the left wing, 3 and 4 on the right wing */
const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

const position = (engine: number): string => ENGINE_POSITIONS[engine - 1];

const alertId = (first: number, engine: number): string => (first + engine - 1).toString();

/** First alert key of each kind; the engine number minus one is added */
const FIRST_START_FAULT_ALERT = 701800117;
const FIRST_START_VALVE_NOT_CLOSED_ALERT = 701800121;
const FIRST_START_VALVE_NOT_OPEN_ALERT = 701800125;
const FIRST_ENG_SHUT_DOWN_ALERT = 701800109;

/** START FAULT, START VLV FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from the second engine at take-off power through the take-off roll and the climb to ' +
  '1,500 ft, nor from 800 ft on the approach until the landing roll is below 80 kt; it shows with the engines off, ' +
  'with the first engine started, in climb, cruise and descent above 800 ft, and after landing below 80 kt';

/** AIR ENG n BLEED OFF and the ENG n SHUT DOWN timing are in the same family of alerts */
const FIRST_ENG_BLEED_OFF_ALERT = 211800052;
const ABNORM_BLEED_CONFIG_ALERT = '211800056';

/** ENG n SHUT DOWN: inhibited in flight phases 5 and 6, and not raised in phases 1, 2, 11 and 12 */
const SHUT_DOWN_TIMING =
  'it appears for an engine switched off in flight, on the take-off roll before V1 or on the landing roll above 80 ' +
  'kt, but not while taxiing or stopped on the ground, and a new one is not shown from V1 to 400 ft';

const START_VALVE_TEXT =
  'Each engine has a start valve that lets compressed air from the APU, a running engine or a ground source drive ' +
  'the pneumatic starter on the accessory gearbox. The FADEC opens it for an engine start, a crank and a starter ' +
  'assisted relight in flight, closes it at about 58 % of the core speed, and compares its real position with its ' +
  'command.';

const STARTER_TEXT =
  'The starter is a pneumatic turbine on the accessory gearbox. It drives the HP compressor and turbine assembly ' +
  'during a start, a crank and a starter assisted relight in flight, until the engine runs by itself.';

const START_SEQUENCE_TEXT =
  'During a start on the ground the FADEC runs the start sequence: it opens the start valve, energizes the igniters, ' +
  'opens the fuel at 20 % of the core speed and watches the start. It closes the start valve and stops the ignition ' +
  'above about 58 % of the core speed.';

/** What the FADEC does with an automatic start on the ground that has a start fault */
const AUTOMATIC_START_ABORT =
  'An automatic start on the ground makes up to three attempts with a 30 second dry crank between them, then aborts ' +
  'with the fuel and the start valve closed.';

const MANUAL_START_NOT_ABORTED =
  'A manual start is not stopped by the FADEC for this fault: the crew has to stop it with ENG MASTER OFF.';

const GROUND_ONLY =
  'Only a start sequence on the ground is affected: a relight in flight and the quick relight on the ground are not.';

const startFaultLines = (engine: number, subTitle: string): string =>
  `ENG ${engine} START FAULT with ${subTitle} appears on a ground start, ${ADVISORY}, and there is no SD page call. On ` +
  `the ground a new one is held back only at take-off power and during the landing roll above 80 kt. With an automatic start the lines are NEW START ` +
  `IN PROGRESS during the dry crank and the further attempts, then ENG ${engine} MASTER OFF once the start is ` +
  `aborted. With a manual start they are ENG ${engine} MASTER OFF, ENG START SEL CRANK, AFTER 30S: ENG START SEL ` +
  `NORM, and ENG ${engine} MAN START OFF while the pushbutton is ON.`;

const FAULT_LIGHT_AFTER_ABORT = (engine: number): string =>
  `After the third attempt of an automatic start the FAULT light of ENG MASTER ${engine} comes on. It goes out ` +
  `when ENG MASTER ${engine} is set to OFF.`;

const START_FAULT_CLEARING =
  'Crew action: ENG MASTER OFF resets the fault and puts out the FAULT light, but the next start fails the same ' +
  'way. Otherwise maintenance only: use Restore.';

// ---------------------------------------------------------------------------------------------------------------------
// Start valve
// ---------------------------------------------------------------------------------------------------------------------

const startValveStuckClosedDetail = (engine: number): FailureDetail => ({
  whatItIs: START_VALVE_TEXT,
  impact: [
    `The start valve of engine ${engine} (${position(engine)}) cannot open, so the starter gets no air and does not ` +
      'turn the core.',
    'The FADEC finds it about 5 seconds after it commands the valve open. A valve that is not commanded open (engine ' +
      'running or off) shows nothing.',
    'On the ground an automatic start is aborted, cranked for 30 seconds and tried again twice; the engine never ' +
      'lights up and the start ends in an abort.',
    'In flight a starter assisted relight is no longer possible, so the engine does not light up below 260 kt: only ' +
      'a windmilling start or the quick relight remain.',
  ],
  alertIds: [
    alertId(FIRST_START_VALVE_NOT_OPEN_ALERT, engine),
    alertId(FIRST_START_FAULT_ALERT, engine),
    alertId(FIRST_ENG_SHUT_DOWN_ALERT, engine),
    ABNORM_BLEED_CONFIG_ALERT,
  ],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} START VLV FAULT (NOT OPEN) appears with VLV STUCK CLOSED, ${CAUTION}; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}. On the ground its lines are ENG ${engine} MAN START OFF (while the ` +
        `pushbutton is ON) and ENG ${engine} MASTER OFF. In flight they are MIN SPEED FOR WINDML RELIGHT : 260 KT, ` +
        `WINDMILL START INITIATED, ENG PARAMETERS MONITOR WITH CARE, then under IF ABNORMAL: ENG ${engine} MAN ` +
        `START OFF (while the pushbutton is ON) and ENG ${engine} MASTER OFF.`,
    },
    {
      where: 'E/WD',
      text:
        'The alert shows only when the FADEC has commanded the valve open: during a start or a crank on the ground, ' +
        'or an in-flight start with the core below 11 % or the speed below 260 kt. It goes out when the command ' +
        'stops, for example after ENG MASTER OFF. ' +
        MANUAL_START_NOT_ABORTED,
    },
    {
      where: 'E/WD',
      text:
        `On a ground start no ENG ${engine} START FAULT appears, because the core never reaches the light-up speed. ` +
        `In flight, a crew relight below 260 kt that does not light up within 30 seconds of ENG MASTER ${engine} ON ` +
        `gives ENG ${engine} START FAULT with NO LIGHT UP, ${ADVISORY}, with the line ENG ${engine} MASTER OFF; it is ` +
        'not held back in climb, cruise and descent above 800 ft.',
    },
    {
      where: 'SD ENG',
      text:
        `The alert calls up the ENG page when it first appears, unless the crew has selected another page. The ` +
        `start valve symbol of engine ${engine} turns amber, and the start indications (IGN, valve, starter inlet ` +
        'pressure) replace the nacelle temperature even with the ENG START selector at NORM.',
    },
    {
      where: 'Pedestal ENG MASTER panel',
      text: `${FAULT_LIGHT_AFTER_ABORT(engine)} That is about 95 seconds after ENG MASTER ${engine} is set ON.`,
    },
    {
      where: 'E/WD',
      text:
        `In flight, if the crew follows IF ABNORMAL and sets ENG MASTER ${engine} to OFF, ENG ${engine} SHUT DOWN ` +
        `appears, ${CAUTION}; ${SHUT_DOWN_TIMING}. On the ground ENG MASTER OFF raises no shut down alert.`,
    },
    {
      where: 'E/WD',
      text:
        'With ENG SHUT DOWN, AIR ABNORM BLEED CONFIG also appears, an amber caution with master caution and no chime ' +
        'of its own; it follows the shut down alert, so a new one is not shown from V1 to 400 ft.',
    },
    {
      where: 'SD BLEED',
      text: 'The page comes up with AIR ABNORM BLEED CONFIG when no other page is selected.',
    },
  ],
  notSimulated: ['The ground mechanic cannot open the valve by hand.'],
  logbook: { required: true, reason: 'caution, the engine cannot be started' },
  clearing:
    'Crew action: ENG MASTER OFF ends the alert, but the next start fails the same way. Otherwise maintenance only: ' +
    'use Restore.',
});

const startValveStuckOpenDetail = (engine: number): FailureDetail => {
  const outerEngine = engine === 1 || engine === 4;
  return {
    whatItIs: START_VALVE_TEXT,
    impact: [
      `The start valve of engine ${engine} (${position(engine)}) stays open whatever the FADEC commands. ` +
        `While it is open the bleed valve of engine ${engine} stays closed, so this engine supplies no bleed air, and ` +
        'air from the cross bleed duct (APU, other engines or ground air) flows out through the starter.',
      'The FADEC finds it about 5 seconds after it commands the valve closed, which is also the case with the engine ' +
        'off or running.',
      'On the ground, with starter air available (APU bleed, a running engine through the cross bleed or ground air), ' +
        'the starter turns the core of an engine with ENG MASTER OFF.',
      `The alert lists the bleed of engine ${engine}${engine === 1 ? ', the APU bleed' : ''}${outerEngine ? ' and the wing anti-ice' : ''} as inoperative.`,
    ],
    alertIds: [alertId(FIRST_START_VALVE_NOT_CLOSED_ALERT, engine), alertId(FIRST_ENG_BLEED_OFF_ALERT, engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} START VLV FAULT (NOT CLOSED) appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its ` +
          `lines are ENG ${engine} BLEED OFF (in flight only)${engine === 1 ? '; APU BLEED OFF' : ''}; X BLEED CLOSE; ` +
          `ENG ${engine} MAN START OFF while the pushbutton is ON; ENG ${engine} MASTER OFF (on the ground only)` +
          `${outerEngine ? '; WING A-ICE OFF and AVOID ICING CONDs' : ''}.`,
      },
      {
        where: 'E/WD',
        text:
          `Setting ENG ${engine} BLEED OFF as the procedure asks gives AIR ENG ${engine} BLEED OFF, ${CAUTION}, ` +
          `with the SD BLEED page. It needs the engine running with the pushbutton OFF, and a new one is not shown from ` +
          'the second engine at take-off power through the climb to 1,500 ft, nor from 800 ft on the approach until ' +
          'the landing roll is below 80 kt. It stays while both conditions last.',
      },
      {
        where: 'SD BLEED',
        text: `The bleed valve of engine ${engine} is drawn closed while the start valve is open.`,
      },
      {
        where: 'SD ENG',
        text:
          `The alert calls up the ENG page when it first appears, unless the crew has selected another page. The ` +
          `start valve symbol of engine ${engine} turns amber and stays drawn open, and the start indications (IGN, ` +
          'valve, starter inlet pressure) replace the nacelle temperature even with the ENG START selector at NORM.',
      },
      {
        where: 'SD STATUS',
        text:
          `While the alert is shown, INOP SYS lists ENG ${engine} BLEED${engine === 1 ? ', APU BLEED' : ''}` +
          `${outerEngine ? ' and WING A-ICE' : ''}, in all phases.` +
          (outerEngine
            ? ' LIMITATIONS lists AVOID ICING CONDs in all phases, also on the PFD, and a deferred procedure for ' +
              'the approach appears: IF SEVERE ICE ACCRETION, FOR LDG : FLAP LVR 3.'
            : ''),
      },
      {
        where: 'SD ENG',
        text:
          'On the ground with ENG MASTER OFF and starter air available, the core turns by itself: N2 and N3 rise ' +
          'with no fuel and no ignition. There is no alert for it besides the valve fault.',
      },
    ],
    logbook: { required: true, reason: 'caution, start valve open, bleed or anti-ice lost' },
    clearing: MAINTENANCE_ONLY,
  };
};

const StartValveStuckClosedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1StartValveStuckClosed,
    A380Failure.Eng2StartValveStuckClosed,
    A380Failure.Eng3StartValveStuckClosed,
    A380Failure.Eng4StartValveStuckClosed,
  ],
  detail: startValveStuckClosedDetail,
};

const StartValveStuckOpenFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1StartValveStuckOpen,
    A380Failure.Eng2StartValveStuckOpen,
    A380Failure.Eng3StartValveStuckOpen,
    A380Failure.Eng4StartValveStuckOpen,
  ],
  detail: startValveStuckOpenDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Start faults the FADEC detects after the light-up, and the starter
// ---------------------------------------------------------------------------------------------------------------------

const hotStartDetail = (engine: number): FailureDetail => ({
  whatItIs:
    'During a start on the ground the FADEC watches the exhaust gas temperature (EGT) and the core speed. It treats ' +
    'an EGT above the start limit of 745 °C as an overlimit and stops the attempt. ' +
    START_SEQUENCE_TEXT,
  impact: [
    `After the light-up of a ground start, the EGT of engine ${engine} (${position(engine)}) climbs about 30 °C ` +
      'every second above its normal start value, and passes the limit within a few seconds.',
    AUTOMATIC_START_ABORT,
    'A manual start is stopped by the FADEC for this fault only: fuel and ignition are cut and the start ends ' +
      'without the FAULT light.',
    GROUND_ONLY,
  ],
  alertIds: [alertId(FIRST_START_FAULT_ALERT, engine)],
  effects: [
    { where: 'E/WD', text: startFaultLines(engine, 'EGT OVERLIMIT') },
    {
      where: 'E/WD',
      text: 'The EGT indication of the engine rises and turns amber once it passes the 745 °C start limit after the light-up.',
    },
    { where: 'Pedestal ENG MASTER panel', text: FAULT_LIGHT_AFTER_ABORT(engine) },
  ],
  notSimulated: ['The engine is not damaged by the over-temperature.'],
  logbook: { required: true, reason: 'advisory, EGT overlimit and aborted start' },
  clearing: START_FAULT_CLEARING,
});

const hungStartDetail = (engine: number): FailureDetail => ({
  whatItIs:
    'A start is hung when the core speed stops rising before the end of the sequence and stays below idle. The FADEC ' +
    'watches the rise of the core speed after the light-up. ' +
    START_SEQUENCE_TEXT,
  impact: [
    `After the light-up of a ground start, the core speed of engine ${engine} (${position(engine)}) is held at about ` +
      '60 % of the idle value, so the engine never reaches idle.',
    'The FADEC finds it when the core speed gains less than 1 % over 20 seconds with starter air, below the end of ' +
      'the start.',
    AUTOMATIC_START_ABORT,
    MANUAL_START_NOT_ABORTED,
  ],
  alertIds: [alertId(FIRST_START_FAULT_ALERT, engine)],
  effects: [
    { where: 'E/WD', text: startFaultLines(engine, 'HUNG START') },
    {
      where: 'SD ENG',
      text: 'The N2 and N3 values stay below idle after the light-up, with the start valve still open.',
    },
    { where: 'Pedestal ENG MASTER panel', text: FAULT_LIGHT_AFTER_ABORT(engine) },
  ],
  logbook: { required: true, reason: 'advisory, hung start and aborted start' },
  clearing: START_FAULT_CLEARING,
});

const startStallDetail = (engine: number): FailureDetail => ({
  whatItIs:
    'A stall during the start is the compressor losing its airflow: the core speed stops rising and the EGT goes up ' +
    'quickly. ' +
    START_SEQUENCE_TEXT,
  impact: [
    `After the light-up of a ground start, the core speed of engine ${engine} (${position(engine)}) is held at ` +
      'about 60 % of the idle value and the EGT climbs about 30 °C every second above its normal start value.',
    'The FADEC reports the stall 3 seconds after the light-up.',
    AUTOMATIC_START_ABORT,
    `${MANUAL_START_NOT_ABORTED} Until then the EGT keeps rising.`,
    GROUND_ONLY,
  ],
  alertIds: [alertId(FIRST_START_FAULT_ALERT, engine)],
  effects: [
    { where: 'E/WD', text: startFaultLines(engine, 'ENG STALL') },
    {
      where: 'SD ENG',
      text: 'The N2 and N3 values stay below idle after the light-up, and the EGT rises quickly on the E/WD gauge.',
    },
    { where: 'Pedestal ENG MASTER panel', text: FAULT_LIGHT_AFTER_ABORT(engine) },
  ],
  notSimulated: ['The engine is not damaged by the stall.'],
  logbook: { required: true, reason: 'advisory, stall during the start and aborted start' },
  clearing: START_FAULT_CLEARING,
});

const starterDetail = (engine: number): FailureDetail => ({
  whatItIs: STARTER_TEXT,
  impact: [
    `The starter shaft of engine ${engine} (${position(engine)}) shears: the start valve opens and air arrives, but ` +
      'the core is not turned. A crank has no effect either.',
    'The FADEC finds it on a start on the ground when, for 10 seconds, the start valve is open, starter air is there ' +
      'and the core stays below 5 %.',
    'An automatic start is aborted at once, with no further attempt; a manual start is not stopped by the FADEC.',
    'In flight a starter assisted relight is no longer possible, so the engine does not light up below 260 kt: only ' +
      'a windmilling start or the quick relight remain.',
  ],
  alertIds: [alertId(FIRST_START_FAULT_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} START FAULT with LOW N2 appears on a ground start, ${ADVISORY}, and there is no SD page ` +
        `call. On the ground a new one is held back only at take-off power and during the landing roll above 80 kt. Its lines are ENG ${engine} MASTER ` +
        `OFF and ENG ${engine} MAN START OFF while the pushbutton is ON.`,
    },
    {
      where: 'SD ENG',
      text: 'The N2 and N3 values stay at zero while the start valve is open and the starter inlet pressure is normal.',
    },
    {
      where: 'Pedestal ENG MASTER panel',
      text: `With an automatic start the FAULT light of ENG MASTER ${engine} comes on when the fault is found. It goes out when ENG MASTER ${engine} is set to OFF.`,
    },
    {
      where: 'E/WD',
      text:
        `In flight there is no starter alert of its own, but a starter assisted relight below 260 kt does not light ` +
        `up and gives ENG ${engine} START FAULT with NO LIGHT UP after 30 seconds, ${ADVISORY}, with the line ENG ` +
        `${engine} MASTER OFF; it is not held back in climb, cruise and descent above 800 ft.`,
    },
  ],
  logbook: { required: true, reason: 'advisory, starter fault and aborted start' },
  clearing: START_FAULT_CLEARING,
});

const HotStartFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1HotStart, A380Failure.Eng2HotStart, A380Failure.Eng3HotStart, A380Failure.Eng4HotStart],
  detail: hotStartDetail,
};

const HungStartFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1HungStart, A380Failure.Eng2HungStart, A380Failure.Eng3HungStart, A380Failure.Eng4HungStart],
  detail: hungStartDetail,
};

const StartStallFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1StartStall, A380Failure.Eng2StartStall, A380Failure.Eng3StartStall, A380Failure.Eng4StartStall],
  detail: startStallDetail,
};

const StarterFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Starter, A380Failure.Eng2Starter, A380Failure.Eng3Starter, A380Failure.Eng4Starter],
  detail: starterDetail,
};

export const Ata80StartFamilies: FailureDetailFamily[] = [
  StartValveStuckClosedFamily,
  StartValveStuckOpenFamily,
  HotStartFamily,
  HungStartFamily,
  StartStallFamily,
  StarterFamily,
];
