// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** An amber caution: master caution light and a single chime */
const CAUTION = 'caution with master caution and a single chime';

/** An amber alert of failure level 1 */
const AWARENESS = 'crew awareness only, with no master caution and no chime';

/** Inhibited in the flight phases 3, 4, 5, 7 and 8 */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power until 1,500 ft, nor below 800 ft on approach and in the landing roll above 80 kt';

/** Inhibited in the flight phases 4, 5, 7 and 8 */
const NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES =
  'not shown in the take-off roll above 80 kt, from lift-off to 1,500 ft, below 800 ft on approach or in the landing roll above 80 kt';

const SIDE_OF_DISPLAY = ['captain', 'first officer'] as const;

const DISPLAY_UNITS_DESCRIPTION =
  'Six display units make up the electronic instrument system: a PFD and an ND on each side, and the two ECAM ' +
  'display units in the centre. They show the picture sent by the display management computers.';

const PfdDisplayFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftPfdDisplay, A320Failure.RightPfdDisplay],
  detail: (number): FailureDetail => ({
    whatItIs: `${DISPLAY_UNITS_DESCRIPTION} The PFD shows attitude, airspeed, altitude, heading and the autoflight status.`,
    impact: [
      `The PFD display unit of the ${SIDE_OF_DISPLAY[number - 1]} is lost: its screen stays dark.`,
      'The PFD picture moves by itself to the ND screen of the same side, and the ND picture is lost.',
      'The aircraft raises no alert for it.',
    ],
    alertIds: [],
    effects: [
      { where: 'PFD', text: `The ${SIDE_OF_DISPLAY[number - 1]} PFD screen is dark.` },
      {
        where: 'ND',
        text: 'The PFD appears on the ND screen of that side. The PFD/ND XFR pushbutton brings the ND back and sends the PFD to the dark screen.',
      },
    ],
    notSimulated: ['The real unit can show an amber F or INVALID DISPLAY UNIT; here the screen is blank.'],
    logbook: { required: true, reason: 'display unit lost' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const NdDisplayFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftNdDisplay, A320Failure.RightNdDisplay],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${DISPLAY_UNITS_DESCRIPTION} The ND shows the map or the compass rose with the flight plan, the navaids, ` +
      'the weather radar and the terrain.',
    impact: [
      `The ND display unit of the ${SIDE_OF_DISPLAY[number - 1]} is lost: its screen stays dark.`,
      'The weather radar and the terrain are not drawn behind the dark screen.',
      'The aircraft raises no alert for it.',
    ],
    alertIds: [],
    effects: [
      { where: 'ND', text: `The ${SIDE_OF_DISPLAY[number - 1]} ND screen is dark.` },
      {
        where: 'PFD',
        text: 'The PFD stays on its own screen. The PFD/ND XFR pushbutton sends the ND to the PFD screen and the PFD is then lost.',
      },
    ],
    notSimulated: ['The real unit can show an amber F or INVALID DISPLAY UNIT; here the screen is blank.'],
    logbook: { required: true, reason: 'display unit lost' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FwcFamily: FailureDetailFamily = {
  ids: [A320Failure.Fwc1, A320Failure.Fwc2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two identical flight warning computers produce the ECAM alerts and memos, the aural alerts, the call-outs and ' +
      'the MASTER WARNING and MASTER CAUTION lights. Each one can do all of it alone. FWC 1 is supplied by the AC ' +
      'essential bus and FWC 2 by AC bus 2.',
    impact: [
      `FWC ${number} is lost. The other one does all the warning functions, so nothing else changes.`,
      'Both FWCs lost: the ECAM alerts, memos and STATUS, the aural alerts and the master lights are all lost.',
    ],
    alertIds: [['3100500', '3100510'][number - 1], '3100520'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FWS FWC ${number} FAULT, ${AWARENESS}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
          `It is shown by FWC ${3 - number}, so only while that one works.`,
      },
      {
        where: 'SD STATUS',
        text: `CAT 3 SINGLE ONLY, with CAT 3 DUAL and FWC ${number} listed as inoperative.`,
      },
      {
        where: 'E/WD',
        text:
          'Both FWCs lost: FWS FWC 1+2 FAULT with MONITOR SYS and MONITOR OVERHEAD PANEL, in every flight phase. ' +
          'NOT AVAIL lists ECAM WARN, ALTI ALERT, STATUS, A/CALL OUT and MEMO, and every other alert disappears.',
      },
      {
        where: 'Glareshield',
        text: 'Both FWCs lost: the MASTER WARNING and MASTER CAUTION lights stay off, and there is no aural alert.',
      },
    ],
    notSimulated: ['One simulated warning computer works for both FWCs, so a single failed FWC changes nothing else.'],
    logbook: { required: true, reason: 'ECAM alert and a lost warning computer' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const DmcFamily: FailureDetailFamily = {
  ids: [A320Failure.Dmc1, A320Failure.Dmc2, A320Failure.Dmc3],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Three display management computers (DMC) prepare the pictures of the six display units and send their data ' +
      'to the FWCs. DMC 1 serves the captain, DMC 2 the first officer and DMC 3 is the spare that the EIS DMC ' +
      'selector can put in place of either.',
    impact: [
      `DMC ${number} is declared failed.`,
      'The simulator does not blank or degrade any display for it: only the alert and the STATUS line follow.',
      ...(number === 3 ? ['DMC 3 is the spare, so the crew is only made aware.'] : []),
    ],
    alertIds: [['3100600', '3100610', '3100620'][number - 1], '3100630'],
    effects: [
      {
        where: 'E/WD',
        text:
          `EIS DMC ${number} FAULT, ${number === 3 ? AWARENESS : CAUTION}, not shown with take-off power set below 80 kt, ` +
          'in the take-off roll, in the first 15 s after lift-off, below 800 ft on approach or in the landing roll above 80 kt.',
      },
      ...(number === 3
        ? []
        : [
            {
              where: 'E/WD',
              text: `It asks for the EIS DMC selector on ${number === 1 ? 'CAPT 3' : 'F/O 3'} until the selector is there.`,
            },
          ]),
      { where: 'SD STATUS', text: `DMC ${number} is listed as inoperative.` },
      {
        where: 'E/WD',
        text: 'All three DMCs lost: EIS DMC/FWC COM FAULT, crew awareness only, shown before the first engine start and in the 5 minutes after shutdown.',
      },
    ],
    notSimulated: ['A failed DMC does not blank, freeze or degrade any display unit here.'],
    logbook: { required: true, reason: 'ECAM alert and a lost display computer' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const SdacFamily: FailureDetailFamily = {
  ids: [A320Failure.Sdac1, A320Failure.Sdac2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two system data acquisition concentrators (SDAC) collect the signals of the aircraft systems and send ' +
      'them to the FWCs and to the system display. Each one can do it alone.',
    impact: [
      `SDAC ${number} is declared failed. Only the alert and the STATUS line follow.`,
      'Both SDACs failed: the ECAM asks the crew to monitor the overhead panel.',
    ],
    alertIds: [['3100640', '3100650'][number - 1], '3100660'],
    effects: [
      {
        where: 'E/WD',
        text: `FWS SDAC ${number} FAULT, ${AWARENESS}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: `SDAC ${number} is listed as inoperative.` },
      {
        where: 'E/WD',
        text:
          `Both failed: SDAC 1+2 FAULT replaces the two alerts, ${CAUTION}, ${NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES}. ` +
          'It asks to monitor the overhead panel and lists the ECAM pages still available.',
      },
    ],
    notSimulated: ['A failed SDAC does not remove any data, SD page or ECAM alert here.'],
    logbook: { required: true, reason: 'ECAM alert and a lost data concentrator' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata31Entries: Record<number, FailureDetail> = {
  [A320Failure.UpperEcamDisplay]: {
    whatItIs:
      `${DISPLAY_UNITS_DESCRIPTION} The upper ECAM display unit shows the E/WD: the engine indications, the ` +
      'flight phase memos and the alerts.',
    impact: [
      'The upper ECAM display unit is lost: its screen stays dark.',
      'The E/WD moves by itself to the lower ECAM screen, in place of the SD.',
      'The SD is then shown on an ND with the ECAM/ND XFR selector, or on the lower screen while a system page pushbutton is held.',
    ],
    alertIds: [],
    effects: [
      { where: 'E/WD', text: 'The upper screen is dark and the E/WD appears on the lower screen.' },
      {
        where: 'SD',
        text: 'The SD is gone from the lower screen. A system page pushbutton shows it there while held, for 3 min at most.',
      },
    ],
    notSimulated: ['The real unit can show an amber F or INVALID DISPLAY UNIT; here the screen is blank.'],
    logbook: { required: true, reason: 'display unit lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.LowerEcamDisplay]: {
    whatItIs: `${DISPLAY_UNITS_DESCRIPTION} The lower ECAM display unit shows the SD: the system pages and the STATUS page.`,
    impact: [
      'The lower ECAM display unit is lost: its screen stays dark.',
      'Nothing moves by itself. The E/WD stays on the upper screen.',
      'The SD is shown on an ND with the ECAM/ND XFR selector, or on the upper screen while a system page pushbutton is held.',
    ],
    alertIds: [],
    effects: [
      { where: 'SD', text: 'The lower screen is dark and the SD pages are not displayed.' },
      {
        where: 'E/WD',
        text: 'A system page pushbutton held down shows the SD on the upper screen in place of the E/WD, for 3 min at most.',
      },
    ],
    notSimulated: ['The real unit can show an amber F or INVALID DISPLAY UNIT; here the screen is blank.'],
    logbook: { required: true, reason: 'display unit lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.EcamControlPanel]: {
    whatItIs:
      'The ECAM control panel on the pedestal holds the keys that select the SD pages, call the STATUS page, clear ' +
      'or recall the alerts and cancel the aural warnings. Most of its keys light up.',
    impact: [
      'The panel goes dead: the keys that reach the computers only through the panel data bus stop working.',
      'The system page keys and T.O. CONFIG no longer work.',
      'CLR, RCL, STS, EMER CANC and ALL still send their own wire signals.',
    ],
    alertIds: [],
    effects: [
      { where: 'Pedestal', text: 'No key of the ECAM control panel lights up.' },
      { where: 'SD', text: 'The system page keys no longer select a page.' },
      { where: 'E/WD', text: 'CLR, RCL, STS, EMER CANC and ALL still send their signals. T.O. CONFIG gives no test.' },
    ],
    logbook: { required: true, reason: 'ECAM control panel keys and lights lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.DmcFwcBuses]: {
    whatItIs:
      'The FWCs receive the DMC data on two buses: one from DMC 1 (or DMC 3 in its place), one from DMC 2 (or DMC ' +
      '3). The data tells the FWCs what the display units show.',
    impact: ['Both DMC to FWC buses are lost.', 'Only the alert follows: no display or other alert changes.'],
    alertIds: ['3100630'],
    effects: [
      {
        where: 'E/WD',
        text:
          `EIS DMC/FWC COM FAULT, ${AWARENESS}. It is shown only before the first engine start and in the ` +
          '5 minutes after shutdown.',
      },
    ],
    notSimulated: ['The FWC does not lose any data here: the buses only raise the alert.'],
    logbook: { required: true, reason: 'ECAM alert (before start and after shutdown only)' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.Dfdr]: {
    whatItIs:
      'The digital flight data recorder records the flight parameters for accident investigation. It is controlled ' +
      'from the overhead RCDR panel and fed by the flight data interface unit.',
    impact: ['The DFDR is declared failed. Only the alert and the STATUS line follow.'],
    alertIds: ['3100670'],
    effects: [
      {
        where: 'E/WD',
        text: `RECORDER DFDR FAULT, ${AWARENESS}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'DFDR is listed as inoperative.' },
    ],
    notSimulated: ['The simulator records no flight data, so nothing is actually lost.'],
    logbook: { required: true, reason: 'ECAM alert and a lost flight data recorder' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.Fdiu]: {
    whatItIs:
      'The flight data interface unit collects the aircraft parameters and passes them to the flight data recorder. ' +
      'It is the interface of the recorder system.',
    impact: ['The recorder system is declared failed. Only the alert and the STATUS line follow.'],
    alertIds: ['3100680'],
    effects: [
      {
        where: 'E/WD',
        text: `RECORDER SYS FAULT, ${AWARENESS}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'RECORDER SYS is listed as inoperative.' },
    ],
    notSimulated: ['The simulator records no flight data, so nothing is actually lost.'],
    logbook: { required: true, reason: 'ECAM alert and a lost recorder system' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata31Families: FailureDetailFamily[] = [
  PfdDisplayFamily,
  NdDisplayFamily,
  FwcFamily,
  DmcFamily,
  SdacFamily,
];
