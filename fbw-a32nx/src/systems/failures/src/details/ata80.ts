// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

/** The flight phases (3, 4, 5, 7 and 8) that the engine start alerts are inhibited in */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING = 'not shown around take-off and landing';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'amber caution with master caution light and single chime';

const START_FAULT_ALERTS = ['7700801', '7700802'] as const;
const EGT_OVER_LIMIT_ALERTS = ['7700731', '7700732'] as const;

const START_VALVE_TEXT =
  'Each engine has a start valve that lets air from the APU, the other engine or a ground cart turn the starter. ' +
  'The FADEC opens it at the start of the sequence and closes it at about half of the maximum N2, and compares the ' +
  'real position with its command.';

const STARTER_TEXT =
  'The starter is an air turbine on the engine gearbox. It turns the core of the engine during the start, and ' +
  'during a dry or wet crank, until the engine runs by itself.';

/** The procedure of a ground start fault that the FADEC aborts, as the crew sees it */
const AUTOMATIC_START_PROCEDURE =
  'Automatic start: AUTO CRANK IN PROGRESS, NEW START IN PROGRESS on the next attempt, then ENG MASTER OFF once aborted.';
const MANUAL_START_PROCEDURE = 'Manual start: ENG MASTER OFF and MAN START OFF.';

const EGT_OVER_LIMIT_TEXT =
  'EGT above the start limit also gives EGT OVER LIMIT. Not shown on the roll above 80 knots.';

const AUTOMATIC_START_ABORT =
  'An automatic start on the ground makes up to 3 attempts with a dry crank between them, then aborts.';

const StartValveClosedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1StartValveStuckClosed, A320Failure.Eng2StartValveStuckClosed],
  detail: (engine): FailureDetail => ({
    whatItIs: START_VALVE_TEXT,
    impact: [
      `The start valve of engine ${engine} stays closed whatever the FADEC commands.`,
      'The starter gets no air through it, so the cranks do not turn the core.',
      'The FADEC finds the disagreement after 5 seconds.',
    ],
    alertIds: [engine === 1 ? '7700811' : '7700812'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} START VALVE FAULT with START VALVE NOT OPEN, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'X BLEED OPEN if the other engine runs, APU BLEED ON if available below FL 200; if unsuccessful, MAN START or ENG MASTER OFF.',
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: [
      'A normal start is not stopped by the closed valve: only the dry and wet cranks and the alert show it.',
    ],
    logbook: { required: true, reason: 'ECAM caution and a failed start valve' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const StartValveOpenFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1StartValveStuckOpen, A320Failure.Eng2StartValveStuckOpen],
  detail: (engine): FailureDetail => ({
    whatItIs: START_VALVE_TEXT,
    impact: [
      `The start valve of engine ${engine} stays open whatever the FADEC commands.`,
      'On the ground with air available, the starter turns the core even with ENG MASTER OFF.',
      'The FADEC finds the disagreement after 5 seconds.',
    ],
    alertIds: [engine === 1 ? '7700811' : '7700812'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} START VALVE FAULT with START VALVE NOT CLOSED, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'APU BLEED OFF (engine 1) and X BLEED SHUT. Ground: MAN START OFF, ENG MASTER OFF. Flight: ENG BLEED, WING ANTI ICE OFF.',
      },
      {
        where: 'SD STATUS',
        text: 'In flight: AVOID ICING CONDITIONS and landing distance limits; wing anti-ice inoperative.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and a failed start valve' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const HotStartFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1HotStart, A320Failure.Eng2HotStart],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'During a ground start the FADEC watches the exhaust gas temperature (EGT) and the speeds. ' +
      'It stops the fuel when the EGT goes above the start limit of 725 deg C.',
    impact: [
      `After the light-up of a start on the ground, the EGT of engine ${engine} climbs by 30 deg C every second until the limit.`,
      AUTOMATIC_START_ABORT,
      'Only a start on the ground is affected: an engine relight in flight is not.',
    ],
    alertIds: [START_FAULT_ALERTS[engine - 1], EGT_OVER_LIMIT_ALERTS[engine - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} START FAULT with EGT OVERLIMIT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'E/WD', text: `${AUTOMATIC_START_PROCEDURE} ${MANUAL_START_PROCEDURE}` },
      { where: 'E/WD', text: EGT_OVER_LIMIT_TEXT },
      {
        where: 'Pedestal ENG panel',
        text: 'When the automatic start is finally aborted, the ENG MASTER FAULT light comes on.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, over-temperature and failed start' },
    clearing: 'Crew action: ENG MASTER OFF stops the start. Otherwise maintenance only: use Restore.',
  }),
};

const HungStartFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1HungStart, A320Failure.Eng2HungStart],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'A start is hung when the core speed (N2) stops rising before the end of the sequence and stays below idle. ' +
      'The FADEC watches the N2 rise during the start.',
    impact: [
      `After the light-up of a start on the ground, the N2 of engine ${engine} stops at about 60 % of the idle N2.`,
      'The FADEC finds it when N2 gains less than 1 % in 20 seconds with starter air available.',
      AUTOMATIC_START_ABORT,
    ],
    alertIds: [START_FAULT_ALERTS[engine - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} START FAULT with HUNG START, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'E/WD', text: `${AUTOMATIC_START_PROCEDURE} ${MANUAL_START_PROCEDURE}` },
      { where: 'SD ENG', text: 'The ENG page is called, with N2 held below idle.' },
      {
        where: 'Pedestal ENG panel',
        text: 'When the automatic start is finally aborted, the ENG MASTER FAULT light comes on.',
      },
    ],
    notSimulated: ['A relight in flight is not affected by a hung start.'],
    logbook: { required: true, reason: 'ECAM caution and failed start' },
    clearing: 'Crew action: ENG MASTER OFF stops the start. Otherwise maintenance only: use Restore.',
  }),
};

const StartStallFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1StartStall, A320Failure.Eng2StartStall],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'A stall during the start is the compressor losing its airflow: the core speed does not rise and the EGT ' +
      'goes up quickly. The FADEC detects it after the light-up.',
    impact: [
      `After the light-up of a start on the ground, the N2 of engine ${engine} hangs below idle and the EGT climbs by 30 deg C every second.`,
      AUTOMATIC_START_ABORT,
      'Only a start on the ground is affected.',
    ],
    alertIds: [START_FAULT_ALERTS[engine - 1], EGT_OVER_LIMIT_ALERTS[engine - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} START FAULT with STALL, 3 seconds after the light-up, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'E/WD', text: `${AUTOMATIC_START_PROCEDURE} ${MANUAL_START_PROCEDURE}` },
      { where: 'E/WD', text: EGT_OVER_LIMIT_TEXT },
      {
        where: 'Pedestal ENG panel',
        text: 'When the automatic start is finally aborted, the ENG MASTER FAULT light comes on.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, over-temperature and failed start' },
    clearing: 'Crew action: ENG MASTER OFF stops the start. Otherwise maintenance only: use Restore.',
  }),
};

const StarterFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1Starter, A320Failure.Eng2Starter],
  detail: (engine): FailureDetail => ({
    whatItIs: STARTER_TEXT,
    impact: [
      `The starter shaft of engine ${engine} shears: the starter gets air but does not turn the core.`,
      'No crank and no starter assisted relight is possible on that engine.',
      'The FADEC finds it after 10 seconds with the start valve open, starter air and the core not turning.',
    ],
    alertIds: [START_FAULT_ALERTS[engine - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} START FAULT with STARTER SHAFT SHEAR, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'E/WD', text: 'On the ground: ENG MASTER OFF and MAN START OFF. In flight: WINDMILL START ONLY.' },
      { where: 'SD STATUS', text: `ENG ${engine} WINDMILL START ONLY.` },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and an unusable starter' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata80Entries: Record<number, FailureDetail> = {};

export const Ata80Families: FailureDetailFamily[] = [
  StartValveClosedFamily,
  StartValveOpenFamily,
  HotStartFamily,
  HungStartFamily,
  StartStallFamily,
  StarterFamily,
];
