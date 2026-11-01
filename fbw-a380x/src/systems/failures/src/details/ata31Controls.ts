// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** The captain side is number 1 of a family, the first officer side number 2 */
const sideName = (side: number): string => (side === 1 ? 'CAPT' : 'F/O');
const sideWords = (side: number): string => (side === 1 ? 'captain' : 'first officer');

/** The FCU backup of the captain is powered by DC ESS, the one of the first officer by DC 2 */
const backupBus = (side: number): string => (side === 1 ? 'DC ESS' : 'DC 2');

const alertId = (first: number, side: number): string => (first + side - 1).toString();

/** First alert key of each kind; the side number minus one is added */
const FIRST_EFIS_BACKUP_FAULT_ALERT = 311800002;
const FIRST_EFIS_PANEL_FAULT_ALERT = 311800004;
const EFIS_PANELS_FAULT_ALERT = '311800006';
const FIRST_CURSOR_CONTROL_FAULT_ALERT = 313800001;
const FIRST_KCCU_FAULT_ALERT = 313800003;
const FIRST_KEYBOARD_FAULT_ALERT = 313800005;
const FIRST_MAILBOX_ACCESS_FAULT_ALERT = 313800007;

/** CDS EFIS CTL PNL FAULT, CAPT+F/O EFIS CTL PNLs FAULT, EFIS BKUP CTL FAULT: inhibited in flight phases 4, 5, 6, 7 and 10 */
const NOT_SHOWN_EFIS_PHASES =
  'a new alert is not shown from 80 kt on the take-off roll through the climb to 1,500 ft, nor on the landing roll ' +
  'above 80 kt; it shows with the engines off, on the ground before 80 kt, in climb, cruise and descent above 800 ' +
  'ft, on the approach, after landing below 80 kt and after engine shutdown';

/** CDS CURSOR CTL, KEYBOARD, CURSOR CTL+KEYBOARD, MAILBOX ACCESS FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_KCCU_PHASES =
  'a new alert is not shown from the second engine at take-off power through the take-off roll and the climb to ' +
  '1,500 ft, nor from 800 ft on the approach until the landing roll is below 80 kt; it shows with the engines off, ' +
  'with the first engine started, in climb, cruise and descent above 800 ft, after landing below 80 kt and after engine shutdown';

/** What the STATUS page does with the INOP SYS and INFO lines of these alerts */
const STATUS_ALL_PHASES = 'in all phases, whether or not the alert itself is held back by the flight phase';

// ---------------------------------------------------------------------------------------------------------------------
// EFIS control panels and the EFIS page of the FCU backup
// ---------------------------------------------------------------------------------------------------------------------

const EFIS_PANEL_TEXT =
  'The EFIS control panel sits on the glareshield, one for each pilot. It sets the baro reference, the PFD options ' +
  'and the range and mode of the ND on its side. If it fails, the same functions are on the EFIS page of the FCU ' +
  'backup, which the MFD of that side offers.';

const FCU_BACKUP_TEXT =
  'The FCU backup is a set of MFD pages that replace the FCU controls when a panel is lost: an EFIS page for the ' +
  'EFIS control panel of that side and an AFS page for the autoflight control panel. Each side has its own backup, ' +
  'with its own power supply.';

const efisPanelDetail = (side: number): FailureDetail => ({
  whatItIs: EFIS_PANEL_TEXT,
  impact: [
    `The ${sideWords(side)} EFIS control panel is flagged as failed: the warning system raises the CDS alerts and the ` +
      'STATUS lines.',
    `The warning system counts the ${sideName(side)} FCU backup as available while its EFIS page is not failed and it ` +
      `has power (${backupBus(side)} bus).`,
    'Nothing else reads the failure: the buttons and knobs of the panel keep working.',
  ],
  alertIds: [
    alertId(FIRST_EFIS_PANEL_FAULT_ALERT, side),
    EFIS_PANELS_FAULT_ALERT,
    alertId(FIRST_EFIS_BACKUP_FAULT_ALERT, side),
  ],
  effects: [
    {
      where: 'E/WD',
      text:
        `CDS ${sideName(side)} EFIS CTL PNL FAULT appears with the line USE ${sideName(side)} MFD FCU BKUP, ` +
        `${CAUTION}; ${NOT_SHOWN_EFIS_PHASES}. It shows only while the ${sideName(side)} FCU backup is available.`,
    },
    {
      where: 'E/WD',
      text:
        `If the ${sideName(side)} FCU backup is not available (its EFIS page is failed, or the ${backupBus(side)} ` +
        `bus has no power), CDS ${sideName(side)} EFIS BKUP CTL FAULT appears instead, with the line ` +
        `${sideName(side)} BARO REF : STD ONLY, ${CAUTION}, with the same phase rule.`,
    },
    {
      where: 'E/WD',
      text:
        'If the EFIS control panels of both sides are failed and both FCU backups are available, CDS CAPT+F/O EFIS ' +
        `CTL PNLs FAULT appears with the line USE MFD FCU BKUP and replaces the two single alerts, ${CAUTION}, with ` +
        'the same phase rule.',
    },
    {
      where: 'SD STATUS',
      text:
        `INOP SYS lists ${sideName(side)} EFIS CTL PNL (also in the CAPT+F/O case, which lists both sides), ` +
        `${STATUS_ALL_PHASES}. With the BKUP CTL FAULT, INOP SYS lists ${sideName(side)} EFIS CTL instead and INFO ` +
        `lists ${sideName(side)} BARO REF : STD ONLY, in the same way.`,
    },
  ],
  notSimulated: [
    'The failed panel still works: its buttons and knobs are not disabled, and the baro reference is not limited to STD.',
    'The EFIS page of the FCU backup is not modelled: the MFD shows a NOT FOUND page for it, so the USE MFD FCU BKUP line has nothing behind it.',
  ],
  logbook: { required: true, reason: 'caution, EFIS control panel failed' },
  clearing: MAINTENANCE_ONLY,
});

const efisBackupPageDetail = (side: number): FailureDetail => ({
  whatItIs: FCU_BACKUP_TEXT,
  impact: [
    `The EFIS page of the ${sideName(side)} FCU backup is flagged as failed, but alone it changes nothing.`,
    `It matters only when the ${sideName(side)} EFIS control panel fails too: the warning system then counts the ` +
      'backup as lost.',
    'Nothing else reads the failure.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'E/WD',
      text:
        `On its own the failure shows no alert and no STATUS line. Together with the ${sideName(side)} EFIS control ` +
        `panel failure, CDS ${sideName(side)} EFIS BKUP CTL FAULT appears instead of CDS ${sideName(side)} EFIS CTL ` +
        'PNL FAULT, and the STATUS lines change accordingly.',
    },
  ],
  notSimulated: [
    'The EFIS page of the FCU backup is not modelled: the MFD shows a NOT FOUND page for it, so a failure of it changes nothing there.',
  ],
  logbook: { required: false, reason: 'no indication to report on its own' },
  clearing: MAINTENANCE_ONLY,
});

const EfisPanelFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptEfisControlPanel, A380Failure.FoEfisControlPanel],
  detail: efisPanelDetail,
};

const EfisBackupPageFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptFcuBackupEfisPage, A380Failure.FoFcuBackupEfisPage],
  detail: efisBackupPageDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// KCCU: cursor control device, keyboard, whole unit
// ---------------------------------------------------------------------------------------------------------------------

const KCCU_TEXT =
  'The keyboard and cursor control unit (KCCU) is the pilot interface to the MFD and the ND. Each pilot has one on ' +
  'the pedestal: a keyboard and a cursor control device, each with its own ON/OFF switch.';

const kccuTakenBy = (side: number): string => `the ${sideName(side)} MFD and the ${sideName(side)} ND`;

const CCD_KEYS = 'the ESC key of the cursor control device (not the ESC key of the keyboard), KBD, rewind and forward';

const cursorControlDetail = (side: number): FailureDetail => ({
  whatItIs: KCCU_TEXT,
  impact: [
    `The cursor control device of the ${sideName(side)} KCCU is flagged as failed.`,
    `${kccuTakenBy(side)} no longer take its device keys (${CCD_KEYS}), as if the device were switched OFF.`,
    'The keyboard of the same KCCU keeps working.',
  ],
  alertIds: [alertId(FIRST_CURSOR_CONTROL_FAULT_ALERT, side), alertId(FIRST_KCCU_FAULT_ALERT, side)],
  effects: [
    {
      where: 'E/WD',
      text:
        `CDS ${sideName(side)} CURSOR CTL FAULT appears with the line ${sideName(side)} KEYBOARD CURSOR CTL AVAIL, ` +
        `${ADVISORY}; ${NOT_SHOWN_KCCU_PHASES}.`,
    },
    {
      where: 'E/WD',
      text:
        `If the ${sideName(side)} keyboard failure is active too, CDS ${sideName(side)} CURSOR CTL+KEYBOARD FAULT ` +
        `replaces it, ${ADVISORY}, with no lines and the same phase rule.`,
    },
    {
      where: 'SD STATUS',
      text:
        `INOP SYS lists ${sideName(side)} CCD and INFO lists ${sideName(side)} KEYBOARD CURSOR CTL AVAIL, ` +
        `${STATUS_ALL_PHASES}.`,
    },
    {
      where: 'MFD',
      text: `The device keys of the ${sideName(side)} KCCU do nothing on the ${sideName(side)} MFD and ND.`,
    },
  ],
  notSimulated: ['The cursor can still be moved and clicked with the mouse.'],
  logbook: { required: true, reason: 'advisory, KCCU cursor control device failed' },
  clearing: MAINTENANCE_ONLY,
});

const keyboardDetail = (side: number): FailureDetail => ({
  whatItIs: KCCU_TEXT,
  impact: [
    `The keyboard of the ${sideName(side)} KCCU is flagged as failed.`,
    `${kccuTakenBy(side)} no longer take any key of that KCCU except the device keys (${CCD_KEYS}), as if the ` +
      'keyboard were switched OFF.',
    'The cursor control device of the same KCCU keeps working.',
  ],
  alertIds: [alertId(FIRST_KEYBOARD_FAULT_ALERT, side), alertId(FIRST_KCCU_FAULT_ALERT, side)],
  effects: [
    {
      where: 'E/WD',
      text:
        `CDS ${sideName(side)} KEYBOARD FAULT appears with the line ${sideName(side)} SOFT KEYBOARD AVAIL, ` +
        `${ADVISORY}; ${NOT_SHOWN_KCCU_PHASES}.`,
    },
    {
      where: 'E/WD',
      text:
        `If the ${sideName(side)} cursor control device failure is active too, CDS ${sideName(side)} CURSOR ` +
        `CTL+KEYBOARD FAULT replaces it, ${ADVISORY}, with no lines and the same phase rule.`,
    },
    {
      where: 'SD STATUS',
      text:
        `INOP SYS lists ${sideName(side)} KBD and INFO lists ${sideName(side)} SOFT KEYBOARD AVAIL, ` +
        `${STATUS_ALL_PHASES}.`,
    },
    {
      where: 'MFD',
      text: `The keyboard keys of the ${sideName(side)} KCCU (DIR among them) do nothing on the ${sideName(side)} MFD and ND.`,
    },
  ],
  notSimulated: ['The MAILBOX key still brings the cursor to the SD mailbox: it is not blocked by this failure.'],
  logbook: { required: true, reason: 'advisory, KCCU keyboard failed' },
  clearing: MAINTENANCE_ONLY,
});

const kccuDetail = (side: number): FailureDetail => ({
  whatItIs: KCCU_TEXT,
  impact: [
    `The whole ${sideName(side)} KCCU is flagged as failed: its keyboard and its cursor control device.`,
    `${kccuTakenBy(side)} take no key of that KCCU, as if both were switched OFF.`,
    'The KCCU of the other pilot is not affected.',
  ],
  alertIds: [alertId(FIRST_KCCU_FAULT_ALERT, side)],
  effects: [
    {
      where: 'E/WD',
      text:
        `CDS ${sideName(side)} CURSOR CTL+KEYBOARD FAULT appears with no lines, ${ADVISORY}; ` +
        `${NOT_SHOWN_KCCU_PHASES}. It replaces the single cursor and keyboard alerts of that side.`,
    },
    {
      where: 'SD STATUS',
      text: `INOP SYS lists ${sideName(side)} CCD+KBD, ${STATUS_ALL_PHASES}. There is no INFO line.`,
    },
    {
      where: 'MFD',
      text: `No key of the ${sideName(side)} KCCU does anything on the ${sideName(side)} MFD and ND.`,
    },
  ],
  notSimulated: [
    'The cursor can still be moved and clicked with the mouse.',
    'The MAILBOX key still brings the cursor to the SD mailbox: it is not blocked by this failure.',
  ],
  logbook: { required: true, reason: 'advisory, KCCU failed' },
  clearing: MAINTENANCE_ONLY,
});

const CursorControlFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptKccuCursorControl, A380Failure.FoKccuCursorControl],
  detail: cursorControlDetail,
};

const KeyboardFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptKccuKeyboard, A380Failure.FoKccuKeyboard],
  detail: keyboardDetail,
};

const KccuFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptKccu, A380Failure.FoKccu],
  detail: kccuDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// ATC mailbox access
// ---------------------------------------------------------------------------------------------------------------------

const mailboxAccessDetail = (side: number): FailureDetail => ({
  whatItIs:
    'The ATC mailbox is the list of ATC messages shown on the SD. Each pilot reaches it with the cursor of the KCCU ' +
    'on his side, through the MAILBOX key.',
  impact: [
    `The ${sideName(side)} access to the ATC mailbox is flagged as failed.`,
    `While the ${sideName(side)} cursor is on the mailbox, nothing in it can be clicked.`,
    'The mailbox keeps showing its messages.',
  ],
  alertIds: [alertId(FIRST_MAILBOX_ACCESS_FAULT_ALERT, side)],
  effects: [
    {
      where: 'E/WD',
      text: `CDS ${sideName(side)} MAILBOX ACCESS FAULT appears with no lines, ${ADVISORY}; ${NOT_SHOWN_KCCU_PHASES}.`,
    },
    {
      where: 'SD STATUS',
      text: `INOP SYS lists ${sideName(side)} MAILBOX ACCESS, ${STATUS_ALL_PHASES}.`,
    },
    {
      where: 'SD',
      text:
        `A clear layer over the ATC mailbox blocks every click while the cursor of the mailbox belongs to the ` +
        `${sideName(side)} side, within about one second of the failure. The cursor belongs to the side of the SD ` +
        'display unit (the captain side, the first officer side when the SD is shown on his ND display unit), then ' +
        'to the side that last pressed the MAILBOX key.',
    },
    {
      where: 'SD',
      text: `The MAILBOX key of the ${sideName(side)} KCCU no longer moves the cursor to the mailbox.`,
    },
  ],
  logbook: { required: true, reason: 'advisory, ATC mailbox access failed' },
  clearing: MAINTENANCE_ONLY,
});

const MailboxAccessFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptMailboxAccess, A380Failure.FoMailboxAccess],
  detail: mailboxAccessDetail,
};

export const Ata31ControlsFamilies: FailureDetailFamily[] = [
  EfisPanelFamily,
  EfisBackupPageFamily,
  CursorControlFamily,
  KeyboardFamily,
  KccuFamily,
  MailboxAccessFamily,
];
