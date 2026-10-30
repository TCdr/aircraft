// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the engines are shut ' +
  'down after landing';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 3 to 10 */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert is not shown from take-off power until the landing roll is below 80 kt, so never in flight';

/** Alerts inhibited in flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert is not shown from take-off power until the engines are shut down after landing, so never in flight';

/** Alerts inhibited in flight phases 4 to 10 */
const NOT_SHOWN_PHASES_4_TO_10 =
  'a new alert is not shown from 80 kt on take-off until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 4 to 6, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_6_9_10 =
  'a new alert is not shown from 80 kt on take-off to 400 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts shown only in flight phase 8 */
const ONLY_ABOVE_800_FT =
  'a new alert is shown only in flight, in climb above 1,500 ft, in cruise and in descent down to 800 ft';

const SD_FUEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

// ---------------------------------------------------------------------------------------------------------------------
// Jettison valves
// ---------------------------------------------------------------------------------------------------------------------

const JETTISON_VALVE_DESCRIPTION =
  'Two jettison valves sit on the aft transfer gallery, one for each wing. When the JETTISON ARM and JETTISON ACTIVE ' +
  'pushbuttons are both on, the FQMS opens them and the fuel of the transfer tanks is discharged overboard through a ' +
  'discharge point on the trailing edge of each wing. Each valve has two motors with different electrical supplies.';

const sideWord = (number: number): string => (number === 1 ? 'left' : 'right');

const JettisonValveStuckClosedFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelJettisonValveLeftStuckClosed, A380Failure.FuelJettisonValveRightStuckClosed],
  detail: (number): FailureDetail => {
    const side = sideWord(number);
    return {
      whatItIs: JETTISON_VALVE_DESCRIPTION,
      impact: [
        `The ${side} jettison valve cannot open, so the fuel can only leave through the other wing.`,
        'With one valve left the jettison runs at half the normal rate (about 2,756 lb/min instead of 5,512 lb/min). ' +
          'With both valves stuck closed the jettison is not available and no fuel leaves.',
        'The fault is found only when the jettison is selected (both pushbuttons on, AC bus 1 powered). Nothing shows before that.',
      ],
      alertIds: ['281800054'],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL JETTISON FAULT, ${CAUTION}, when the jettison is selected; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}. ` +
            'The valve fault is remembered from then on: setting the pushbuttons off does not clear it while the ' +
            'valve stays stuck.',
        },
        {
          where: 'E/WD',
          text:
            'With one valve stuck closed the alert has a title only in flight; on the ground it also names the valve ' +
            '(JETTISON L VLV FAULT or JETTISON R VLV FAULT). With both valves stuck closed it adds JETTISON NOT AVAIL ' +
            'with JETTISON ACTIVE OFF and JETTISON ARM OFF while the jettison is selected.',
        },
        {
          where: 'SD FUEL',
          text:
            `${SD_FUEL_CALL_UP} While the jettison runs, the JETTISON legend of the stuck side is amber and its ` +
            'discharge line is not drawn; the other side is drawn normally.',
        },
        {
          where: 'Overhead JETTISON / EMER OUTR TK XFR panel',
          text:
            'The OPEN light of the JETTISON ACTIVE pushbutton comes on as soon as the other valve opens. With both ' +
            'valves stuck closed it stays off while the ON light stays on.',
        },
        {
          where: 'Outside view',
          text: 'The fuel spray under the wing of the stuck valve is not drawn.',
        },
      ],
      logbook: { required: true, reason: 'ECAM caution when the jettison is selected' },
      clearing: `${MAINTENANCE_ONLY} The remembered valve fault goes with it.`,
    };
  },
};

const JettisonValveStuckOpenFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelJettisonValveLeftStuckOpen, A380Failure.FuelJettisonValveRightStuckOpen],
  detail: (number): FailureDetail => {
    const side = sideWord(number);
    return {
      whatItIs: JETTISON_VALVE_DESCRIPTION,
      impact: [
        `The ${side} jettison valve stays open whatever the jettison pushbuttons select.`,
        'A jettison that is selected still works normally: the stuck valve counts as an open valve.',
        'No fuel leaves through the open valve while no jettison is selected.',
      ],
      alertIds: ['281800055'],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL JETTISON VLV NOT CLOSED, ${CAUTION}, as soon as a valve is open and no jettison is running; ` +
            `${NOT_SHOWN_PHASES_4_TO_7_9_10}. Lines: JETTISON ACTIVE OFF and JETTISON ARM OFF. It goes out while a jettison ` +
            'runs and comes back when the jettison ends or is stopped.',
        },
        {
          where: 'SD FUEL',
          text:
            `${SD_FUEL_CALL_UP} The discharge line and the JETTISON legend of the open valve turn amber while no ` +
            'jettison runs.',
        },
        {
          where: 'Overhead JETTISON / EMER OUTR TK XFR panel',
          text: 'The OPEN light of the JETTISON ACTIVE pushbutton comes on with the pushbutton off.',
        },
      ],
      notSimulated: [
        'The loss of the normal transfers (FUEL NORM XFR FAULT, alternate transfers on the forward gallery) is not simulated.',
      ],
      logbook: { required: true, reason: 'ECAM caution and OPEN light with no jettison selected' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// APU feed valves
// ---------------------------------------------------------------------------------------------------------------------

const ApuValveFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelApuIsolationValveJammed, A380Failure.FuelApuLpValveJammed],
  detail: (number): FailureDetail => {
    const valve = number === 1 ? 'isolation valve' : 'LP valve';
    return {
      whatItIs:
        'The APU is fed from the engine feed system through two valves in series, an APU isolation valve and an APU ' +
        'LP valve. Both open when the APU MASTER pushbutton is on and both close when it is set to OFF or when the ' +
        'APU FIRE pushbutton is pushed.',
      impact: [
        `The APU ${valve} is frozen where it was when the failure was set, and ignores the APU MASTER and the APU FIRE pushbutton (open if it was at least half open).`,
        'Frozen closed, the APU gets no fuel once the APU MASTER is on: it cannot run, and an APU that starts to turn shuts down on low fuel pressure.',
        'Frozen open, the valve stays open after the APU MASTER goes off or the APU FIRE pushbutton is pushed, while the other valve closes.',
      ],
      alertIds: ['281800003', '281800004', '490800001'],
      effects: [
        {
          where: 'E/WD',
          text:
            `Frozen closed: FUEL APU FEED FAULT, ${CAUTION}, about 5 s after the APU MASTER is set ON; ` +
            `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Line: APU MASTER SW OFF.`,
        },
        {
          where: 'SD STATUS',
          text: 'INOP SYS APU, only while FUEL APU FEED FAULT is shown.',
        },
        {
          where: 'SD FUEL',
          text:
            `${SD_FUEL_CALL_UP} With the APU MASTER on and a valve not open, the APU legend is amber and the APU ` +
            'feed line is not drawn.',
        },
        {
          where: 'E/WD',
          text:
            'Frozen closed, once the APU has started to turn: APU FAULT with AUTO SHUTDOWN and APU MASTER SW OFF, ' +
            `${CAUTION}, as the APU shuts down on low fuel pressure; a new alert is not shown from take-off power ` +
            'to 1,500 ft, nor from 800 ft on approach until the landing roll is below 80 kt. Its STATUS shows INOP ' +
            'SYS APU.',
        },
        {
          where: 'SD APU',
          text: 'The page is called up with APU FAULT. FUEL PRESS LO in amber when the APU has started to turn without fuel pressure.',
        },
        {
          where: 'E/WD',
          text:
            `Frozen open: FUEL APU FEED VLV NOT CLOSED, ${CAUTION}, about 5 s after the APU MASTER is set OFF or the ` +
            `APU FIRE pushbutton is pushed with a valve still open; ${NOT_SHOWN_PHASES_3_TO_11}. No procedure lines ` +
            'and no page call-up.',
        },
      ],
      notSimulated: [
        'The APU feed pump that starts when the fuel pressure is too low is not simulated, so a closed valve cannot be overcome that way.',
        'The motors of the APU LP valve and their two electrical supplies are not simulated.',
        'The amber indication of a feed valve left open is not simulated: the SD FUEL page treats both valves as closed with the APU MASTER off.',
      ],
      logbook: { required: true, reason: 'ECAM caution and APU cannot run, or valve left open' },
      clearing: `${MAINTENANCE_ONLY} The valves then follow the APU MASTER and the APU FIRE pushbutton again.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Refuel system and refuel isolation valves
// ---------------------------------------------------------------------------------------------------------------------

const RefuelSystemDetail: FailureDetail = {
  whatItIs:
    'The refuel system loads fuel through the two refuel couplings under the wings. The FQMS opens the refuel ' +
    'isolation valves and the inlet valves of the tanks to fill, and closes each inlet valve when its tank reaches ' +
    'its target quantity.',
  impact: [
    'Any refuel request (flyPad, OIS REFUEL, GSX) is cancelled at once and a new one is cancelled again, so no fuel is loaded while the failure is set.',
    'The fuel already on board is not affected.',
  ],
  alertIds: ['281800084'],
  effects: [
    {
      where: 'E/WD',
      text:
        `FUEL REFUEL FAULT, ${ADVISORY}, as soon as the failure is set, with or without a refuel request; ` +
        `${NOT_SHOWN_PHASES_3_TO_10}. No procedure lines.`,
    },
    { where: 'SD STATUS', text: 'INOP SYS REFUEL, only while the alert is shown.' },
    { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
  ],
  logbook: { required: true, reason: 'refuel advisory, no fuel can be loaded' },
  clearing: MAINTENANCE_ONLY,
};

const RefuelIsolationValveFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelRefuelLeftIsolationValve, A380Failure.FuelRefuelRightIsolationValve],
  detail: (number): FailureDetail => {
    const side = sideWord(number);
    return {
      whatItIs:
        'The refuel couplings connect to the aft gallery, and to the forward gallery through the refuel/defuel valves. The ' +
        'refuel isolation valves are among the refuel valves that the FQMS opens for a refuel or a defuel.',
      impact: [
        `The ${side} refuel isolation valve is reported failed.`,
        'The model has no fuel flow through this valve, so refuel and defuel are not changed.',
      ],
      alertIds: ['281800082'],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL REFUEL / DEFUEL SYS FAULT, ${CAUTION}, as soon as the failure is set; ` +
            `${NOT_SHOWN_PHASES_3_TO_11}. Line: REFUEL ${number === 1 ? 'L' : 'R'} ISOL VLV FAULT.`,
        },
      ],
      notSimulated: ['A failed isolation valve does not limit the refuel or the defuel.'],
      logbook: { required: true, reason: 'ECAM caution on the ground' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Tank inlet valves stuck open: overflow
// ---------------------------------------------------------------------------------------------------------------------

const OVERFLOW_AUTOMATIC_FUNCTIONS =
  'The FQMS stops a refuel in progress (FUEL REFUEL FAULT follows, ' +
  `${ADVISORY}, never in flight, with INOP SYS REFUEL) and aborts an automatic ground transfer that is selected with the AUTO GND XFR pushbutton (FUEL AUTO GND XFR FAULT, ${CAUTION}, never in flight, with INOP SYS FUEL AUTO GND XFR).`;

const OVERFLOW_GND_XFR_LIGHT =
  'When the FQMS aborts a selected automatic ground transfer, the light of the AUTO GND XFR pushbutton flashes.';

const OUTER_INLET_VALVE_DESCRIPTION =
  'Each wing tank receives fuel from the forward and aft transfer galleries through an inlet valve; the refuel also ' +
  'uses it. A surge tank at each wing tip collects the fuel that spills when a tank is full, and returns it to the ' +
  'outboard feed tank.';

const OuterTankInletValveFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelLeftOuterTankInletValveStuckOpen, A380Failure.FuelRightOuterTankInletValveStuckOpen],
  detail: (number): FailureDetail => {
    const side = sideWord(number);
    return {
      whatItIs: OUTER_INLET_VALVE_DESCRIPTION,
      impact: [
        `With the ${side} outer tank inlet valve stuck open, fuel pushed into the galleries (a refuel, or the transfer pumps of other tanks) keeps entering that tank when it is full and spills into the ${side} wing surge tank.`,
        'The spill runs at about 44,100 lb/h; the FQMS detects the overflow above 1,730 lb in the surge tank, after about 140 s. The fuel is taken from the tanks being pumped, or comes from the refuel.',
        'The surge tank holds about 3,460 lb; more is lost. It drains back at about 4,400 lb/h once the outer tank has room.',
        'With no manual transfer selected when the overflow starts, the fuel transfers become manual.',
      ],
      alertIds: [
        '281800097',
        '281800084',
        '281800006',
        '281800074',
        '281800099',
        '281800058',
        '281800060',
        '281800059',
        '281800061',
        '281800027',
        '281800028',
        '281800029',
        '281800030',
        '281800031',
        '281800032',
        '281800033',
        '281800034',
        '281800035',
        '281800036',
        '281800037',
        '281800038',
      ],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL WING TK OVERFLOW, ${CAUTION}, while the overflow is detected, for either wing; ` +
            `${NOT_SHOWN_PHASES_3_TO_7_9_10}. On the ground: DELAY T.O. With a manual transfer selected when it started: ` +
            'OUTR TK XFR AUTO, EMER OUTR TK XFR OFF, TRIM TK XFR AUTO, INR TK XFR AUTO and MID TK XFR AUTO for the ' +
            'transfers set manual. Otherwise: FUEL XFR : MAN ONLY.',
        },
        { where: 'SD STATUS', text: 'LIMITATION DELAY T.O on the ground, only while the alert is shown.' },
        { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
        {
          where: 'E/WD',
          text:
            'If the transfers became manual: FUEL MAN XFR PROCEDURE, ' +
            `${CAUTION}, with INOP SYS JETTISON; ${ONLY_ABOVE_800_FT}. In flight the manual state stays until the aircraft is on the ground, even if the overflow stops. ` +
            'Once the transfers are manual, FUEL WINGS MAN BALANCING PROCEDURE follows when a pair of tanks goes out of balance, ' +
            `${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
        },
        { where: 'E/WD', text: OVERFLOW_AUTOMATIC_FUNCTIONS },
        { where: 'Overhead FUEL panel', text: OVERFLOW_GND_XFR_LIGHT },
        {
          where: 'E/WD',
          text: `Setting an inner tank aft pump OFF as FUEL MAN XFR PROCEDURE asks (one inner tank empty) raises (except with the engines off on the ground) FUEL L (R) INR TK AFT PMP FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}, with an SD FUEL call-up and INOP SYS L (R) INR TK AFT PMP.`,
        },
        {
          where: 'E/WD',
          text: `Setting pumps OFF as FUEL WINGS MAN BALANCING PROCEDURE asks raises their pump alerts (except with the engines off on the ground), ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}: FUEL FEED TK n STBY PMP FAULT and MAIN PMP FAULT, replaced by FEED TK n MAIN + STBY PMPs FAULT once both pumps of the tank are OFF, and FUEL L (R) INR TK AFT PMP FAULT or L (R) MID TK AFT PMP FAULT.`,
        },
      ],
      notSimulated: [
        'The OVERFLOW indication on the SD FUEL page and the OVERFLOW light of the refuel panel are not simulated.',
        'The vent tanks that take the fuel after a full surge tank are not simulated: the fuel is lost instead.',
        'The surge tank fuel drains back into the outer tank instead of the outboard feed tank.',
        'An outer tank inlet valve failure does not remove the normal transfers (FUEL NORM XFR FAULT, alternate transfers).',
      ],
      logbook: { required: true, reason: 'ECAM caution and fuel spilled' },
      clearing: `${MAINTENANCE_ONLY} Fuel already spilled is not recovered, the surge tank drains back into the tank, and transfers made manual in flight stay manual until landing.`,
    };
  },
};

const TrimTankInletValveStuckOpenDetail: FailureDetail = {
  whatItIs:
    'The trim tank in the horizontal stabiliser holds fuel for centre of gravity control. It receives fuel from the ' +
    'wing tanks through two inlet valves, which the fuel page shows as one. A surge tank collects the fuel that ' +
    'spills when the trim tank is full.',
  impact: [
    'With an inlet valve stuck open, fuel pushed into the galleries (a refuel, or the transfer pumps of other tanks) keeps entering the trim tank when it is full and spills into the trim surge tank.',
    'The spill runs at about 44,100 lb/h; the FQMS detects the overflow above 524 lb in the surge tank, after about 43 s. The fuel is taken from the tanks being pumped, or comes from the refuel.',
    'The surge tank holds about 1,050 lb; more is lost. It drains back at about 4,400 lb/h once the trim tank has room.',
  ],
  alertIds: ['281800093', '281800084', '281800006'],
  effects: [
    {
      where: 'E/WD',
      text:
        `FUEL TRIM TK OVERFLOW, ${CAUTION}, while the overflow is detected; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. ` +
        'Line: TRIM TK XFR FWD.',
    },
    { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
    { where: 'E/WD', text: OVERFLOW_AUTOMATIC_FUNCTIONS },
    { where: 'Overhead FUEL panel', text: OVERFLOW_GND_XFR_LIGHT },
  ],
  notSimulated: [
    'The OVERFLOW indication on the SD FUEL page and the OVERFLOW light of the refuel panel are not simulated.',
    'The vent tank that takes the fuel after a full surge tank is not simulated: the fuel is lost instead.',
  ],
  logbook: { required: true, reason: 'ECAM caution and fuel spilled' },
  clearing: `${MAINTENANCE_ONLY} Fuel already spilled is not recovered, and the surge tank drains back into the trim tank.`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Crossfeed valves
// ---------------------------------------------------------------------------------------------------------------------

const CROSSFEED_ALERTS = ['281800014', '281800015', '281800016', '281800017'] as const;

const CrossFeedValveFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelCrossFeedValve1Jammed,
    A380Failure.FuelCrossFeedValve2Jammed,
    A380Failure.FuelCrossFeedValve3Jammed,
    A380Failure.FuelCrossFeedValve4Jammed,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each engine has a crossfeed valve that connects the engine and its pumps to the crossfeed line, so that any ' +
      'feed tank pump can feed it. The valves are normally closed; the CROSSFEED pushbuttons open them to correct a ' +
      'feed tank imbalance or to feed an engine when its own pumps are off. Each valve has two motors with different ' +
      'electrical supplies.',
    impact: [
      `Crossfeed valve ${number} is frozen where it was when the failure was set (open if it was at least half open) and ignores its CROSSFEED ${number} pushbutton.`,
      `The fuel system keeps engine ${number} connected to the crossfeed line, or cut from it, accordingly.`,
      'The valve is reported faulty when its position still disagrees with the pushbutton after about 5 s: pushbutton ON with the valve closed, or pushbutton off with the valve open. A valve frozen where the pushbutton already puts it is not reported.',
    ],
    alertIds: [CROSSFEED_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `FUEL CROSSFEED VLV ${number} FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}. No procedure lines.`,
      },
      {
        where: 'SD FUEL',
        text: `${SD_FUEL_CALL_UP} The crossfeed valve ${number} symbol turns amber.`,
      },
      {
        where: 'SD STATUS',
        text:
          `INOP SYS CROSSFEED VLV ${number}. If the valve is closed and engine ${number} is not running, the ` +
          `limitation FEED TK ${number} NOT USABLE too. Only while the alert is shown.`,
      },
      {
        where: 'Overhead FUEL panel',
        text: `The ON light of the CROSSFEED ${number} pushbutton follows the pushbutton, not the valve.`,
      },
      {
        where: 'E/WD',
        text:
          'The CROSSFEED OPEN memo shows when at least two crossfeed valves are open, so a valve frozen open counts ' +
          'but does not make it alone; in the take-off and go-around phases (take-off power to 1,500 ft) the ' +
          'CROSSFEED OPEN memo of take-off and go-around shows instead.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and a crossfeed valve not under control' },
    clearing: `${MAINTENANCE_ONLY} The valve then follows its CROSSFEED pushbutton again.`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Engine LP valves
// ---------------------------------------------------------------------------------------------------------------------

const ENG_LP_VALVE_ALERTS = ['281800018', '281800019', '281800020', '281800021'] as const;

const EngineLpValveFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelEng1LpValveJammed,
    A380Failure.FuelEng2LpValveJammed,
    A380Failure.FuelEng3LpValveJammed,
    A380Failure.FuelEng4LpValveJammed,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each engine has a low pressure (LP) valve that stops the flow of fuel to the engine. The ENG MASTER switch ' +
      'controls it and it closes by itself when the ENG FIRE pushbutton of the engine is pushed. Each valve has two ' +
      'motors with different electrical supplies.',
    impact: [
      `The engine ${number} LP valve is frozen where it was when the failure was set, whatever ENG MASTER ${number} and the ENG FIRE pushbutton ask.`,
      `Frozen open, ENG MASTER ${number} OFF still stops the engine, because it also closes the HP valve, but the LP valve stays open.`,
      `Frozen closed (set with the engine off), engine ${number} lights up but flames out once the about 3 kg of fuel left beyond the valve is burned.`,
      'The disagreement is reported once it lasts longer than the valve travel, about 4 s.',
    ],
    alertIds: [ENG_LP_VALVE_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `FUEL ENG ${number} LP VLV FAULT, ${CAUTION}, on the ground only: valve closed after ENG MASTER ${number} ` +
          `ON (engine start), or open after ENG MASTER ${number} OFF or the ENG FIRE pushbutton pushed (shutdown). ` +
          `${NOT_SHOWN_PHASES_4_TO_10}. In flight a frozen valve gives no alert.`,
      },
      {
        where: 'E/WD',
        text: `Line: ENG ${number} MASTER OFF, until the touch down; after landing the alert has no line.`,
      },
      { where: 'SD STATUS', text: `INOP SYS ENG ${number} LP VLV, only while the alert is shown.` },
      {
        where: 'SD FUEL',
        text:
          `${SD_FUEL_CALL_UP} A closed LP valve is always drawn as an amber cross, so a valve frozen closed looks like a normal ` +
          'engine-off valve. A valve frozen open with the engine commanded off is drawn in line in amber, in flight too, where no alert shows.',
      },
    ],
    notSimulated: ['The valve motors and their two electrical supplies are not simulated.'],
    logbook: { required: true, reason: 'ECAM caution and an LP valve not under control' },
    clearing: `${MAINTENANCE_ONLY} The valve then follows ENG MASTER ${number} and the ENG FIRE pushbutton again.`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Transfer gallery and trim line valves
// ---------------------------------------------------------------------------------------------------------------------

const GALLERY_DESCRIPTION =
  'Two galleries, forward and aft, run through all the wing tanks. Each wing tank receives fuel from a gallery ' +
  'through an inlet valve. In normal operation the forward gallery carries the transfers to the wing tanks and the ' +
  'aft gallery carries the transfers from the trim tank. If one gallery is lost, the other takes over for alternate ' +
  'transfers.';

const BOTH_GALLERIES_LOST: readonly string[] = [
  'FUEL NORM + ALTN XFR FAULT replaces NORM XFR FAULT when the other gallery inlet valve failure is also set, ' +
    `${CAUTION}; ${ONLY_ABOVE_800_FT}, so on the ground nothing shows. It asks to reselect all transfer pumps and ` +
    'reset the FQMS one by one, and tells that the inner, mid and trim tanks are not usable.',
  'With both galleries lost, all automatic transfers stop, the manual inner, mid and trim tank transfers are not possible, and the outer tanks can only be emptied by gravity, manually. STATUS then shows INOP SYS FUEL NORM + ALTN XFR and JETTISON, and the info to use the trim tank transfer for the centre of gravity if necessary, and that the inner, mid and trim tanks are not usable. An automatic ground transfer that is selected is aborted (FUEL AUTO GND XFR FAULT).',
];

const FwdGalleryInletValveDetail: FailureDetail = {
  whatItIs: GALLERY_DESCRIPTION,
  impact: [
    'An inlet valve stuck open on the forward gallery makes the gallery unusable. The failure stands for the feed tank 1 forward inlet valve.',
    'The outer tank pumps no longer transfer fuel to the feed tanks: in flight the outer tanks go by gravity through the aft gallery.',
    'The transfers that control the centre of gravity stop.',
  ],
  alertIds: ['281800078', '281800077', '281800079', '281800068', '281800069'],
  effects: [
    {
      where: 'E/WD',
      text:
        `FUEL NORM XFR FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}. On the ground: FEED TK 1 FWD INLET VLV ` +
        'FAULT. In flight, with fuel in the outer tanks: FEED TK 1 + 4 < 15000 KG, EMER OUTR TK XFR ON (done when the ' +
        'emergency transfer is on), EXPECT FEED TKS IMBALANCE and FUEL MAN BALANCING PROC CONSIDER.',
    },
    {
      where: 'SD STATUS',
      text:
        'INOP SYS JETTISON and CG MANAGEMENT; INFO OUTR TKs XFR BY GRVTY ONLY and FUEL ALTN XFR IN USE. Only while ' +
        'the alert is shown.',
    },
    { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
    {
      where: 'E/WD',
      text:
        `With OUTR TK XFR on MAN and both outer tank pumps on while the outer tanks hold fuel, FUEL OUTR TK XFR FAULT, ${CAUTION}; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Lines: L OUTR TK PMP OFF and R OUTR TK PMP OFF, then EXPECT FEED TKS IMBALANCE and FUEL MAN BALANCING PROC CONSIDER once a pump is off.`,
    },
    {
      where: 'E/WD',
      text: `Setting an outer tank pump OFF as that alert asks raises (not with the engines off on the ground) FUEL L (R) OUTR TK PMP FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}, with an SD FUEL call-up, INOP SYS L (R) OUTR TK PMP, and the info OUTR TKs XFR BY GRVTY ONLY while the outer tanks hold fuel.`,
    },
    { where: 'E/WD', text: BOTH_GALLERIES_LOST[0] },
    { where: 'E/WD', text: BOTH_GALLERIES_LOST[1] },
  ],
  logbook: { required: true, reason: 'ECAM caution and normal transfers lost' },
  clearing: `${MAINTENANCE_ONLY} FUEL OUTR TK XFR FAULT stays until OUTR TK XFR is back at AUTO or the outer tanks are empty.`,
};

const AftGalleryInletValveDetail: FailureDetail = {
  whatItIs: GALLERY_DESCRIPTION,
  impact: [
    'An inlet valve stuck open on the aft gallery makes the gallery unusable. The failure stands for the feed tank 1 aft inlet valve.',
    'The outer tank pumps still work through the forward gallery.',
    'The transfers that control the centre of gravity stop.',
  ],
  alertIds: ['281800078', '281800077'],
  effects: [
    {
      where: 'E/WD',
      text:
        `FUEL NORM XFR FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}. On the ground: FEED TK 1 AFT INLET VLV ` +
        'FAULT. In flight the alert has a title only.',
    },
    { where: 'SD STATUS', text: 'INOP SYS JETTISON and CG MANAGEMENT, only while the alert is shown.' },
    { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
    { where: 'E/WD', text: BOTH_GALLERIES_LOST[0] },
    { where: 'E/WD', text: BOTH_GALLERIES_LOST[1] },
  ],
  logbook: { required: true, reason: 'ECAM caution and normal transfers lost' },
  clearing: MAINTENANCE_ONLY,
};

const TRIM_PUMPS_OFF_ALERTS = `Setting a trim pump OFF as the procedure asks raises (except on the ground with no engine started, or after the engines are shut down) FUEL TRIM TK L (R) PMP FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}, with an SD FUEL call-up. Both pumps OFF raise FUEL TRIM TK L+R PMPs FAULT instead, with INOP SYS TRIM TK PMPs, the limitation FOR TRIM TK FWD XFR: PITCH ATT < 3° and the info TRIM TK XFR BY GRVTY ONLY and TRIM TK GRVTY XFR : AROUND 3000 KG / HR.`;

const TRIM_TANK_DESCRIPTION =
  'The trim tank in the horizontal stabiliser holds fuel for centre of gravity control. Its fuel goes forward with ' +
  'two trim transfer pumps through the trim tank isolation valve, or by gravity with the TRIM TK FEED selector at ' +
  'OPEN. A trim line connects the tank to the galleries and is isolated by the fuel system if it is damaged.';

const TrimTankIsolationValveDetail: FailureDetail = {
  whatItIs: TRIM_TANK_DESCRIPTION,
  impact: [
    'The trim tank isolation valve stays closed. There is no automatic transfer out of the trim tank and no pumped forward manual transfer.',
    'The trim tank fuel only leaves by gravity, with TRIM TK FEED at OPEN and a pitch below 3 degrees.',
    'The centre of gravity management through the trim tank is lost.',
  ],
  alertIds: ['281800094', '281800088', '281800089', '281800090', '281800091'],
  effects: [
    {
      where: 'E/WD',
      text:
        `FUEL TRIM TK XFR FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. On the ground: TRIM TK ISOL VLV FAULT. In ` +
        'flight: TRIM TK L PMP OFF, TRIM TK R PMP OFF, TRIM TK XFR AUTO, PITCH ATT < 3° FOR GRVTY FWD XFR, TRIM TK ' +
        'FEED OPEN and TRIM TK : 2300 KG MAX NOT USABLE.',
    },
    {
      where: 'SD STATUS',
      text:
        'INOP SYS CG MANAGEMENT. In flight also the limitations FOR TRIM TK FWD XFR: PITCH ATT < 3° and FUEL PARTLY ' +
        'UNUSABLE, and the info TRIM TK : 2300 KG MAX NOT USABLE and TRIM TK GRVTY XFR : AROUND 3000 KG / HR. Only ' +
        'while the alert is shown.',
    },
    { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
    {
      where: 'E/WD',
      text:
        `With TRIM TK FEED at OPEN, a nose-up pitch of 3° or more and fuel in the trim tank, FUEL TRIM TK GRVTY FWD XFR FAULT, ${CAUTION}; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Lines: EXCESS PITCH ATT and TRIM TK FEED AUTO, then PITCH ATT < 3° FOR GRVTY FWD XFR and TRIM TK FEED OPEN. It stays until the pitch is below 3° with TRIM TK FEED at OPEN, the selector goes to ISOL, or the trim tank is empty. STATUS shows the limitation FOR TRIM TK FWD XFR: PITCH ATT < 3°.`,
    },
    { where: 'E/WD', text: TRIM_PUMPS_OFF_ALERTS },
  ],
  notSimulated: [
    'The trim tank isolation valve symbol of the SD FUEL page does not turn amber: the fault exists only in the FQMS.',
    'The trim line isolation valves are not simulated.',
  ],
  logbook: { required: true, reason: 'ECAM caution and trim tank transfer lost' },
  clearing: `${MAINTENANCE_ONLY} The TRIM TK FEED selection and the pumps set by the crew stay as set.`,
};

const TrimAndApuLinesDetail: FailureDetail = {
  whatItIs:
    'The trim line connects the trim tank to the aft and forward galleries, and the APU feed line brings fuel to the ' +
    'APU. If the fuel system detects damage to either line, it isolates it, to avoid fuel leaks in the fuselage.',
  impact: [
    'The FQMS stops all automatic transfers out of the trim tank.',
    'The crew has to isolate the trim tank, switch the trim pumps off and switch the APU MASTER off; the trim tank is then not usable.',
    'The model does not close the APU feed valves or stop the APU on its own.',
  ],
  alertIds: ['281800087', '281800094', '281800089', '281800090', '281800091'],
  effects: [
    {
      where: 'E/WD',
      text:
        `FUEL TRIM & APU LINES FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_6_9_10}. Lines: TRIM TK FEED ISOL, TRIM TK L PMP ` +
        'OFF, TRIM TK R PMP OFF, APU MASTER SW OFF and TRIM TK NOT USABLE (only while the trim tank holds fuel).',
    },
    {
      where: 'SD STATUS',
      text: 'INOP SYS APU, and the limitation TRIM TK NOT USABLE while the trim tank holds fuel. Only while the alert is shown.',
    },
    { where: 'SD FUEL', text: SD_FUEL_CALL_UP },
    {
      where: 'E/WD',
      text: `Flying the procedure with fuel in the trim tank (TRIM TK FEED at ISOL) also raises FUEL TRIM TK XFR FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Lines: TRIM TK XFR AUTO, TRIM TK FEED ISOL and TRIM TK NOT USABLE. STATUS adds INOP SYS CG MANAGEMENT and the limitation TRIM TK NOT USABLE.`,
    },
    { where: 'E/WD', text: TRIM_PUMPS_OFF_ALERTS },
  ],
  notSimulated: [
    'The automatic closing of the APU LP valve and the APU isolation valve, and the stop of the APU feed pump, are not simulated.',
    'The trim line and its isolation are not drawn on the SD FUEL page.',
  ],
  logbook: { required: true, reason: 'ECAM caution, trim tank and APU lines' },
  clearing: `${MAINTENANCE_ONLY} TRIM TK FEED at ISOL, the trim pumps OFF and the APU MASTER OFF stay as the crew set them.`,
};

export const Ata28ValvesEntries: Record<number, FailureDetail> = {
  [A380Failure.FuelRefuelSystem]: RefuelSystemDetail,
  [A380Failure.FuelTrimTankInletValveStuckOpen]: TrimTankInletValveStuckOpenDetail,
  [A380Failure.FuelFeedTank1FwdInletValveOpen]: FwdGalleryInletValveDetail,
  [A380Failure.FuelFeedTank1AftInletValveOpen]: AftGalleryInletValveDetail,
  [A380Failure.FuelTrimTankIsolationValveClosed]: TrimTankIsolationValveDetail,
  [A380Failure.FuelTrimAndApuLineDamaged]: TrimAndApuLinesDetail,
};

export const Ata28ValvesFamilies: FailureDetailFamily[] = [
  JettisonValveStuckClosedFamily,
  JettisonValveStuckOpenFamily,
  ApuValveFamily,
  RefuelIsolationValveFamily,
  OuterTankInletValveFamily,
  CrossFeedValveFamily,
  EngineLpValveFamily,
];
