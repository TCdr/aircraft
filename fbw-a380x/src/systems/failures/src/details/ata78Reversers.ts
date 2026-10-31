// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Only the inner engines 2 and 3 have a thrust reverser; the failure number 1 is the reverser of engine 2 */
const reverserEngine = (number: number): number => number + 1;

const position = (engine: number): string => (engine === 2 ? 'inner left' : 'inner right');

const alertId = (first: number, engine: number): string => (first + engine - 2).toString();

/** First alert key of each kind (the reverser of engine 2); the key of engine 3 is one higher */
const FIRST_CTL_FAULT_ALERT = 701800137;
const FIRST_ENERGIZED_ALERT = 701800139;
const FIRST_FAULT_ALERT = 701800141;
const FIRST_INHIBITED_ALERT = 701800143;
const FIRST_LOCKED_ALERT = 701800145;
const FIRST_MINOR_FAULT_ALERT = 701800147;
const FIRST_UNLOCKED_ALERT = 701800149;
/** ENG 2 SHUT DOWN; the key of engine 3 is one higher (701800109 is engine 1) */
const FIRST_ENG_SHUT_DOWN_ALERT = 701800110;
const ABNORM_BLEED_CONFIG_ALERT = '211800056';

/** CTL FAULT and FAULT: inhibited in flight phases 3 to 7 */
const NOT_SHOWN_PHASES_3_TO_7 =
  'a new alert is not shown from the moment take-off power is set on the take-off roll until 1,500 ft';

/** ENERGIZED: inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** LOCKED: inhibited in flight phases 3 to 9 */
const NOT_SHOWN_PHASES_3_TO_9 =
  'a new alert shows only on the ground: with the engines off, with the first engine started before take-off power, ' +
  'on the landing roll and after landing; it is not shown from take-off power through the flight and the approach';

/** UNLOCKED: inhibited in flight phases 5 and 6 */
const NOT_SHOWN_PHASES_5_AND_6 = 'a new alert is not shown from V1 on the take-off roll until 400 ft';

/** INHIBITED: inhibited in flight phases 3 to 10 */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: with the engines off, with the first engine started before take-off power, ' +
  'and after landing once below 80 kt; a failure that appears in flight shows after landing';

/** MINOR FAULT: inhibited in flight phases 1 to 10 */
const NOT_SHOWN_PHASES_1_TO_10 =
  'a new alert shows only once below 80 kt after landing (or after a rejected take-off), and in the first 5 minutes ' +
  'after the engines are shut down; it is not shown before the engine start, from the first engine start through ' +
  'the flight, or on the landing roll above 80 kt';

/** ENG n SHUT DOWN: inhibited in flight phases 5 and 6, and not raised in phases 1, 2, 11 and 12 */
const SHUT_DOWN_TIMING =
  'it appears for an engine switched off in flight, on the take-off roll before V1 or on the landing roll above 80 ' +
  'kt, but not while taxiing or stopped on the ground, and a new one is not shown from V1 to 400 ft';

const REVERSER_DESCRIPTION =
  'Each inner engine (2 and 3) has a thrust reverser: two translating cowls that slide back after landing to turn ' +
  'the fan air forward and shorten the landing roll. An electric controller (ETRAC) drives the cowls, and three ' +
  'separate lines of defense hold them closed unless the aircraft is on the ground and reverse thrust is selected.';

const INOP_LINES_TEXT = 'T.O PERF CHECK (on the ground only) and LDG DIST IMPACT ON WET/CONTAM RWY ONLY';

const inopSysText = (engine: number, title: string): string =>
  `INOP SYS (APPR & LDG part): ENG ${engine} REVERSER and BTV, at any flight phase, also while the E/WD alert is ` +
  'held back; with both reversers inoperative the two reverser lines become one ENG 2+3 REVERSERs line. While ' +
  `${title} is shown, the STATUS MORE page lists it under ALERTS IMPACTING LDG PERF.`;

const reverseSelectedText = (engine: number): string =>
  `On the ground, REV ${engine} turns amber when reverse is selected, because the reverse mode is not available, ` +
  `and the amber attention box comes up around engine ${engine}.`;

// ---------------------------------------------------------------------------------------------------------------------
// Reverser that does not deploy: fault, control fault, failed locked, inhibited by maintenance
// ---------------------------------------------------------------------------------------------------------------------

interface NoDeployOptions {
  /** the part of the reverser that the failure hits, appended to the description */
  partText: string;
  /** what the crew-visible alert is called, with the engine number */
  title: (engine: number) => string;
  firstAlert: number;
  severity: string;
  notShown: string;
  /** a reverser that is already deployed is driven back to stowed */
  stowsWhenDeployed: boolean;
  /** how the failure is worded in the first impact bullet */
  cause: string;
  logbookReason: string;
}

const noDeployDetail =
  (options: NoDeployOptions) =>
  (number: number): FailureDetail => {
    const engine = reverserEngine(number);
    return {
      whatItIs: `${REVERSER_DESCRIPTION} ${options.partText} Reverser ${engine} is on the ${position(engine)} engine.`,
      impact: [
        `${options.cause} The cowls of reverser ${engine} stay closed when reverse is selected on the ground` +
          `${options.stowsWhenDeployed ? ', and cowls that are already deployed are driven back to stowed' : ''}.`,
        `Engine ${engine} stays at reverse idle: the FADEC allows more reverse thrust only once the cowls are ` +
          'deployed.',
        'The reverser counts as inoperative for the approach: BTV cannot be armed, and the landing distance is longer ' +
          'on a wet or contaminated runway.',
      ],
      alertIds: [alertId(options.firstAlert, engine)],
      effects: [
        {
          where: 'E/WD',
          text:
            `${options.title(engine)} appears, ${options.severity}; ${options.notShown}. Its lines: ` +
            `${INOP_LINES_TEXT}. It calls up no SD page.`,
        },
        { where: 'E/WD', text: reverseSelectedText(engine) },
        { where: 'SD STATUS', text: inopSysText(engine, options.title(engine)) },
      ],
      logbook: { required: true, reason: options.logbookReason },
      clearing: MAINTENANCE_ONLY,
    };
  };

const faultDetail = noDeployDetail({
  partText: 'The ETRAC and the locks and actuators it commands are monitored together as one reverser system.',
  title: (engine) => `ENG ${engine} REVERSER FAULT`,
  firstAlert: FIRST_FAULT_ALERT,
  severity: CAUTION,
  notShown: NOT_SHOWN_PHASES_3_TO_7,
  stowsWhenDeployed: true,
  cause: 'The reverser reports a fault and no longer accepts a deployment order.',
  logbookReason: 'caution, reverser inoperative',
});

const controlFaultDetail = noDeployDetail({
  partText: 'The ETRAC gives the deploy and stow orders to the cowls and releases the primary locks.',
  title: (engine) => `ENG ${engine} REVERSER CTL FAULT`,
  firstAlert: FIRST_CTL_FAULT_ALERT,
  severity: CAUTION,
  notShown: NOT_SHOWN_PHASES_3_TO_7,
  stowsWhenDeployed: true,
  cause: 'The reverser controller (ETRAC) is faulty and no longer accepts a deployment order.',
  logbookReason: 'caution, reverser inoperative',
});

const failedLockedDetail = noDeployDetail({
  partText: 'The primary locks and the tertiary lock keep the cowls closed until the lines of defense are cleared.',
  title: (engine) => `ENG ${engine} REV LOCKED`,
  firstAlert: FIRST_LOCKED_ALERT,
  severity: CAUTION,
  notShown: NOT_SHOWN_PHASES_3_TO_9,
  stowsWhenDeployed: false,
  cause: 'A primary lock or the tertiary lock of the reverser fails in the locked position and is not released.',
  logbookReason: 'caution, reverser inoperative',
});

const inhibitedDetail = noDeployDetail({
  partText: 'Maintenance can inhibit a reverser, which keeps its locks closed so that it cannot deploy.',
  title: (engine) => `ENG ${engine} REVERSER INHIBITED`,
  firstAlert: FIRST_INHIBITED_ALERT,
  severity: ADVISORY,
  notShown: NOT_SHOWN_PHASES_3_TO_10,
  stowsWhenDeployed: true,
  cause: 'The reverser is inhibited by a maintenance action and keeps its locks closed.',
  logbookReason: 'advisory, reverser inhibited and inoperative',
});

// ---------------------------------------------------------------------------------------------------------------------
// Reverser unlocked
// ---------------------------------------------------------------------------------------------------------------------

const unlockedDetail = (number: number): FailureDetail => {
  const engine = reverserEngine(number);
  return {
    whatItIs:
      `${REVERSER_DESCRIPTION} The position switches of the cowls tell the FADEC whether the reverser is stowed and ` +
      `locked. Reverser ${engine} is on the ${position(engine)} engine.`,
    impact: [
      `Reverser ${engine} is reported unlocked although no deployment is commanded.`,
      `The FADEC holds engine ${engine} at idle whatever the position of thrust lever ${engine} above idle, on the ` +
        'ground and in flight.',
      'The cowls themselves stay closed: there is no reverse thrust and no buffet.',
    ],
    alertIds: [
      alertId(FIRST_UNLOCKED_ALERT, engine),
      alertId(FIRST_ENG_SHUT_DOWN_ALERT, engine),
      ABNORM_BLEED_CONFIG_ALERT,
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} REVERSER UNLOCKED appears, ${CAUTION}; ${NOT_SHOWN_PHASES_5_AND_6}. Its lines: ENG ` +
          `${engine} IDLE ONLY, THR LEVER ${engine} IDLE, then on the ground ENG ${engine} MASTER OFF, in flight IF ` +
          `BUFFET and ENG ${engine} MASTER OFF. It calls up no SD page. An alert already on screen stays when the ` +
          'phase changes, and it goes out on the ground while a reverse is commanded.',
      },
      {
        where: 'E/WD',
        text:
          `REV ${engine} turns amber. In flight it pulses for about 9 seconds and then stays steady, and the amber ` +
          `attention box comes up around engine ${engine}; on the ground REV ${engine} is amber without the box.`,
      },
      {
        where: 'SD STATUS',
        text:
          `ENG ${engine} IDLE ONLY is listed under information, on the ground and in flight, also when the alert ` +
          'itself is held back by the flight phase.',
      },
      {
        where: 'E/WD',
        text:
          `If the crew follows the last line and sets the ENG ${engine} MASTER OFF, ENG ${engine} SHUT DOWN appears, ` +
          `${CAUTION}; ${SHUT_DOWN_TIMING}.`,
      },
      {
        where: 'E/WD',
        text:
          `With ENG ${engine} SHUT DOWN, AIR ABNORM BLEED CONFIG also appears, an amber caution with master caution ` +
          'and no chime of its own; a new alert is not shown from V1 to 400 ft. Its lines are XBLEED OPEN while the ' +
          'crossbleed has not opened by itself and, with the crossbleed open and only this bleed lost, IF MAX THR ' +
          'RQRD: AIR FLOW LO and FWD CARGO TEMP REGUL OFF. With a second bleed lost PACK 1 OFF or PACK 2 OFF is ' +
          'asked instead.',
      },
      {
        where: 'SD BLEED',
        text: 'The page comes up with AIR ABNORM BLEED CONFIG when no other page is selected.',
      },
      {
        where: 'SD STATUS',
        text:
          `While ENG ${engine} SHUT DOWN is shown, ENG ${engine} REVERSER and BTV are listed as inoperative for the ` +
          'approach and landing, CAT 3 DUAL is listed while the APU is not available, with CAT 3 SINGLE ONLY under information, and the STATUS MORE page lists ' +
          'it under ALERTS IMPACTING LDG PERF.',
      },
    ],
    notSimulated: ['A real unlocked reverser can open in flight, with buffet and a loss of thrust.'],
    logbook: { required: true, reason: 'caution, engine held at idle' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Reverser energized
// ---------------------------------------------------------------------------------------------------------------------

const energizedDetail = (number: number): FailureDetail => {
  const engine = reverserEngine(number);
  return {
    whatItIs:
      `${REVERSER_DESCRIPTION} The tertiary lock is the lock of the third line of defense: it is controlled by the ` +
      `flight control computers and releases only when reverse is selected on the ground. Reverser ${engine} is on ` +
      `the ${position(engine)} engine.`,
    impact: [
      `The tertiary lock of reverser ${engine} is released although no deployment is commanded.`,
      'The two primary locks still hold the cowls closed: nothing moves and the engine is not limited.',
      'The reverser stays available: it deploys normally when reverse is selected, and BTV is not affected.',
    ],
    alertIds: [alertId(FIRST_ENERGIZED_ALERT, engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} REVERSER ENERGIZED appears, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its only line: ` +
          `THR LEVER ${engine} IDLE. It calls up no SD page and it goes out while a reverse is commanded on the ` +
          'ground.',
      },
    ],
    logbook: { required: true, reason: 'caution, tertiary lock released' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Reverser minor fault
// ---------------------------------------------------------------------------------------------------------------------

const minorFaultDetail = (number: number): FailureDetail => {
  const engine = reverserEngine(number);
  return {
    whatItIs:
      `${REVERSER_DESCRIPTION} The FADEC monitors the reverser system and reports the faults it finds. Reverser ` +
      `${engine} is on the ${position(engine)} engine.`,
    impact: [
      `The FADEC reports a minor fault of reverser ${engine} that does not impair it.`,
      'The reverser deploys and stows normally and the engine is not limited.',
      'Only an advisory is raised, after landing, so that maintenance can look at the reverser.',
    ],
    alertIds: [alertId(FIRST_MINOR_FAULT_ALERT, engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} REVERSER MINOR FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_1_TO_10}. It has no lines ` +
          'and calls up no SD page.',
      },
    ],
    logbook: { required: true, reason: 'advisory shown after landing' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------------------------------------------------

export const Ata78ReversersFamilies: FailureDetailFamily[] = [
  { ids: [A380Failure.Reverser2Fault, A380Failure.Reverser3Fault], detail: faultDetail },
  { ids: [A380Failure.Reverser2Unlocked, A380Failure.Reverser3Unlocked], detail: unlockedDetail },
  { ids: [A380Failure.Reverser2Energized, A380Failure.Reverser3Energized], detail: energizedDetail },
  { ids: [A380Failure.Reverser2Locked, A380Failure.Reverser3Locked], detail: failedLockedDetail },
  { ids: [A380Failure.Reverser2ControlFault, A380Failure.Reverser3ControlFault], detail: controlFaultDetail },
  { ids: [A380Failure.Reverser2MinorFault, A380Failure.Reverser3MinorFault], detail: minorFaultDetail },
  { ids: [A380Failure.Reverser2Inhibited, A380Failure.Reverser3Inhibited], detail: inhibitedDetail },
];
