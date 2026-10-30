// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const STATUS_NOTE = 'while the alert is shown';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (every pump alert) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt; one already shown stays when the phase changes';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (OUTR TK XFR FAULT) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt; one already shown stays when the phase changes';

const SD_FUEL_CALL_UP =
  'The page comes up with the alert when it is the first one on the E/WD and no page is selected.';

/** What a pump switched OFF by the crew does to the FAULT light and the alert of a pump that is already failed */
const PB_OFF_NOTE =
  'The FAULT light goes out when the crew sets the pushbutton OFF, but the alert stays: a pump switched OFF counts as ' +
  'faulty, except with the engines off on the ground, where the alert goes out with the light.';

// ---------------------------------------------------------------------------------------------------------------------
// Weight and balance backup computers
// ---------------------------------------------------------------------------------------------------------------------

const WbbcFamily: FailureDetailFamily = {
  ids: [A380Failure.Wbbc1, A380Failure.Wbbc2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two weight and balance backup computers (WBBC) work out the gross weight and the centre of gravity from ' +
      'aerodynamic data and the flight control surface positions, without using the fuel quantity measurement. They ' +
      'start computing once the slats and flaps are retracted after take-off. Their figures back up the fuel quantity ' +
      'management system (FQMS) and are an independent check of its weight and centre of gravity.',
    impact: [
      `WBBC ${number} alone: the other WBBC still gives the data. The simulation computes one set of values for both, ` +
        'so a single lost WBBC changes nothing.',
      'Both WBBCs lost: the backup gross weight and CG are flagged invalid.',
      'The checks that compare the FQMS figures with the WBBC figures (FUEL WEIGHT DATA DISAGREE, FUEL CG DATA ' +
        'DISAGREE) and the FUEL EXCESS AFT CG alert can then no longer trigger, with both FQMS also failed the ' +
        'FMS has no backup CG, and the trim-forward CG check of FUEL MAN XFR PROCEDURE is lost.',
    ],
    alertIds: ['281800095'],
    effects: [
      {
        where: 'E/WD',
        text:
          `With one WBBC lost: nothing. With both lost: FUEL WEIGHT & BALANCE BKUP FAULT, ${ADVISORY}, also on the ` +
          'ground with the engines off. A new alert is shown only with the engines off, with the first engine ' +
          'started, in climb, cruise and descent above 800 ft, or once the engines are shut down; not from take-off ' +
          'power to 1,500 ft, nor from 800 ft on approach until the engines are shut down. One already shown stays ' +
          'when the phase changes. It has no procedure line and no SD page comes up with it.',
      },
      { where: 'SD STATUS', text: `INOP SYS WBBC ${STATUS_NOTE}.` },
    ],
    logbook: { required: false, reason: 'no indication to report unless both WBBCs are lost' },
    clearing: `${MAINTENANCE_ONLY} The advisory goes out as soon as one WBBC is restored.`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Feed tank pumps
// ---------------------------------------------------------------------------------------------------------------------

const FEED_TANK_MAIN_PMP_FAULT_ALERTS = ['281800031', '281800032', '281800033', '281800034'] as const;
const FEED_TANK_STBY_PMP_FAULT_ALERTS = ['281800035', '281800036', '281800037', '281800038'] as const;
const FEED_TANK_MAIN_AND_STBY_FAULT_ALERTS = ['281800027', '281800028', '281800029', '281800030'] as const;
const WING_FEED_PMPS_FAULT_ALERTS = ['281800070', '281800071'] as const;

/**
 * The detail of one pump of a feed tank.
 * @param tank the feed tank, 1 to 4 (it feeds the engine of the same number)
 * @param kind the main or the standby pump
 */
function feedTankPumpDetail(tank: number, kind: 'MAIN' | 'STBY'): FailureDetail {
  const isMain = kind === 'MAIN';
  const pumpName = isMain ? 'main' : 'standby';
  const otherName = isMain ? 'standby' : 'main';
  const wingIndex = tank <= 2 ? 0 : 1;
  const wingLetter = wingIndex === 0 ? 'L' : 'R';
  const crossFeeds = tank <= 2 ? 'CROSSFEED 1 and 2' : 'CROSSFEED 3 and 4';
  const wingTanks = tank <= 2 ? 'feed tanks 1 and 2' : 'feed tanks 3 and 4';
  const singleAlert = isMain ? FEED_TANK_MAIN_PMP_FAULT_ALERTS[tank - 1] : FEED_TANK_STBY_PMP_FAULT_ALERTS[tank - 1];
  const bothAlert = FEED_TANK_MAIN_AND_STBY_FAULT_ALERTS[tank - 1];
  const wingAlert = WING_FEED_PMPS_FAULT_ALERTS[wingIndex];

  const effects: FailureDetail['effects'][number][] = [
    {
      where: 'E/WD',
      text: isMain
        ? `FUEL FEED TK ${tank} MAIN PMP FAULT, ${CAUTION}, as soon as the pump stops. The procedure asks for FEED TK ` +
          `${tank} MAIN PMP OFF. It is ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`
        : `FUEL FEED TK ${tank} STBY PMP FAULT, ${CAUTION}, as soon as the pump stops. It has no procedure line. It ` +
          `is ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
    },
    {
      where: 'E/WD',
      text:
        `If the ${otherName} pump of the tank is also failed or switched OFF, FUEL FEED TK ${tank} MAIN + STBY PMPs ` +
        `FAULT replaces the single alert (a pump switched OFF counts as faulty only outside the engines-off ground ` +
        `phases): in flight ${crossFeeds} ON, then both pumps OFF and AVOID NEG G LOAD; on the ground both pumps ` +
        `OFF and AVOID NEG G LOAD. Same caution and phases. If the pumps of both tanks of the wing (${wingTanks}) are in that state, FUEL ` +
        `${wingLetter} WING FEED PMPs FAULT replaces the two tank alerts.`,
    },
    {
      where: 'SD STATUS',
      text: isMain
        ? `INOP SYS FEED TK ${tank} MAIN PMP ${STATUS_NOTE}. With the combined alert: INOP SYS FEED TK ${tank} PMPs ` +
          `and INFO FEED TK ${tank} BY GRVTY ONLY; with the wing alert: INOP SYS for the PMPs of both tanks and ` +
          `INFO ${wingLetter} WING FEED TKs BY GRVTY ONLY.`
        : `The single alert adds nothing to the STATUS page. With the combined alert: INOP SYS FEED TK ${tank} PMPs ` +
          `and INFO FEED TK ${tank} BY GRVTY ONLY; with the wing alert: INOP SYS for the PMPs of both tanks and ` +
          `INFO ${wingLetter} WING FEED TKs BY GRVTY ONLY.`,
    },
    {
      where: 'SD FUEL',
      text: isMain
        ? `${SD_FUEL_CALL_UP} The main pump symbol of feed tank ${tank} turns amber with a bar instead of the ` +
          'running line, and the standby pump symbol of the tank shows green.'
        : `${SD_FUEL_CALL_UP} The standby pump symbol of feed tank ${tank} turns amber with a bar instead of the ` +
          'running line.',
    },
    {
      where: 'Overhead FUEL panel',
      text: `The FAULT light of the FEED TK ${tank} ${kind} pushbutton comes on while it is ON. ${PB_OFF_NOTE}`,
    },
  ];

  return {
    whatItIs:
      'Each feed tank has a main pump and a standby pump in its collector cell. The main pump runs continuously and ' +
      'feeds the engine of the same number as the tank; the standby pump takes over automatically if the main pump ' +
      'shows low pressure or is switched off. Each pump has its own pushbutton on the overhead FUEL panel. The ' +
      'crossfeed valves let an engine be fed by the pumps of another tank.',
    impact: [
      `Feed tank ${tank} ${pumpName} pump stops and stays off whatever its pushbutton does. The ${otherName} pump ` +
        `keeps engine ${tank} supplied.`,
      isMain
        ? 'The standby pump already runs alongside the main pump in the simulation, so nothing changes in the fuel ' +
          'flow to the engine.'
        : 'The main pump keeps feeding the engine, so only the back-up is lost.',
      `With both pumps of the tank lost (a second failure) the tank is left to gravity feed, with the crossfeeds ` +
        'as the way to keep the engine supplied.',
    ],
    alertIds: [singleAlert, bothAlert, wingAlert],
    effects,
    notSimulated: [
      'With both pumps of a tank lost, the gravity feed ceiling (MAX FL 280, or 50 / MEA once the inner and mid tanks are empty) is not simulated.',
    ],
    logbook: { required: true, reason: `FUEL caution and a feed tank ${pumpName} pump lost` },
    clearing: `${MAINTENANCE_ONLY} A pump pushbutton the crew set OFF stays OFF.`,
  };
}

const FeedTankMainPumpFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelFeedTank1MainPump,
    A380Failure.FuelFeedTank2MainPump,
    A380Failure.FuelFeedTank3MainPump,
    A380Failure.FuelFeedTank4MainPump,
  ],
  detail: (number): FailureDetail => feedTankPumpDetail(number, 'MAIN'),
};

const FeedTankStbyPumpFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelFeedTank1StbyPump,
    A380Failure.FuelFeedTank2StbyPump,
    A380Failure.FuelFeedTank3StbyPump,
    A380Failure.FuelFeedTank4StbyPump,
  ],
  detail: (number): FailureDetail => feedTankPumpDetail(number, 'STBY'),
};

// ---------------------------------------------------------------------------------------------------------------------
// Outer tank pumps
// ---------------------------------------------------------------------------------------------------------------------

const OUTER_TANK_PMP_FAULT_ALERTS = ['281800068', '281800069'] as const;
const OUTER_TANK_PMP_INOP_SYS = ['L OUTR TK PMP', 'R OUTR TK PMP'] as const;

const OuterTankPumpFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelLeftOuterTankPump, A380Failure.FuelRightOuterTankPump],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    const sideWord = number === 1 ? 'left' : 'right';
    const gravityFeedTank = number === 1 ? 2 : 3;
    return {
      whatItIs:
        'Each outer wing tank has one transfer pump. It pumps the fuel of the tank into the forward transfer gallery, ' +
        'which carries it to the feed tanks. Without the pump the fuel of the outer tank can only go by gravity.',
      impact: [
        `The ${sideWord} outer tank pump stops and stays off whatever the FQMS commands, so that tank cannot be ` +
          'pumped out. The other outer tank pump keeps working (the real FQMS would turn it off).',
        `In flight, with the automatic transfers running, the fuel of the ${sideWord} outer tank then goes by gravity ` +
          `into feed tank ${gravityFeedTank}, once the lowest feed tank holds less than 28,660 lb (about 13,000 kg), ` +
          'at about 500 US gal per hour, until the outer tank is empty.',
        `The load alleviation transfer that lowers the ${sideWord} outer tank before landing stops.`,
      ],
      alertIds: [OUTER_TANK_PMP_FAULT_ALERTS[number - 1], '281800078', '281800079'],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL ${side} OUTR TK PMP FAULT, ${CAUTION}, about 2 s after the pump fails. The procedure asks for ` +
            `${side} OUTR TK PMP OFF. It is ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
        },
        {
          where: 'E/WD',
          text:
            `FUEL NORM XFR FAULT, ${CAUTION}, once the gravity transfer has started in flight. It asks for EMER OUTR ` +
            'TK XFR ON when feed tanks 1 and 4 are both below 15,000 kg, and tells the crew to expect a feed tank ' +
            'imbalance and to consider the FUEL MAN BALANCING procedure. As the gravity transfer only runs in ' +
            'flight, the alert shows in climb, cruise and descent above 800 ft. It goes out when the outer tank is ' +
            'empty, the pump is restored, or the automatic transfers stop (landing, a transfer pushbutton at MAN, a ' +
            'jettison or a refuel).',
        },
        {
          where: 'E/WD',
          text:
            `FUEL OUTR TK XFR FAULT, ${CAUTION}, if the crew sets the OUTR TK XFR pushbutton to MAN with both outer ` +
            'pump pushbuttons ON while the failed pump still has fuel in its tank. The lines ask for both outer pumps ' +
            'OFF, then to expect a feed tank imbalance and to consider the FUEL MAN BALANCING procedure. It stays ' +
            `until OUTR TK XFR is back at AUTO or the outer tanks are empty. It is ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
        },
        {
          where: 'SD STATUS',
          text:
            `INOP SYS ${OUTER_TANK_PMP_INOP_SYS[number - 1]}, and INFO OUTR TKs XFR BY GRVTY ONLY while an outer tank ` +
            `holds fuel, ${STATUS_NOTE}. With FUEL NORM XFR FAULT: INOP SYS JETTISON and CG MANAGEMENT.`,
        },
        {
          where: 'SD FUEL',
          text: `${SD_FUEL_CALL_UP} The ${sideWord} outer tank pump symbol turns amber with a bar instead of the running line.`,
        },
        {
          where: 'Overhead FUEL panel',
          text: `The FAULT light of the ${side} OUTR TK PMP pushbutton comes on about 2 s after the failure, while it is ON. ${PB_OFF_NOTE}`,
        },
      ],
      notSimulated: [
        'The FQMS does not automatically turn off the outer tank pump of the other side to prevent a fuel imbalance.',
      ],
      logbook: { required: true, reason: 'FUEL caution and an outer tank pump lost' },
      clearing: `${MAINTENANCE_ONLY} A pump pushbutton the crew set OFF stays OFF; fuel already moved by gravity stays moved.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Inner and mid tank forward pumps
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The detail of the forward transfer pump of an inner or mid tank.
 * @param tankName INR or MID
 * @param side 1 for the left tank, 2 for the right one
 */
function forwardPumpDetail(tankName: 'INR' | 'MID', side: number): FailureDetail {
  const isInner = tankName === 'INR';
  const letter = side === 1 ? 'L' : 'R';
  const sideWord = side === 1 ? 'left' : 'right';
  const tankWord = isInner ? 'inner' : 'mid';
  const singleAlert = isInner ? ['281800063', '281800065'][side - 1] : ['281800062', '281800064'][side - 1];
  const bothAlert = isInner ? ['281800056', '281800057'][side - 1] : ['281800066', '281800067'][side - 1];
  const tankUnusable = isInner ? `${letter} INR TK NOT USABLE` : `${letter} MID TK NOT USABLE`;
  return {
    whatItIs:
      `Each ${tankWord} tank has a forward and an aft transfer pump. The forward pump pushes the fuel of the tank ` +
      'into the forward gallery, which carries it to the feed tanks in the main transfers; the aft pump uses the aft ' +
      'gallery and serves the manual transfers and as an alternate route.',
    impact: [
      `The ${sideWord} ${tankWord} tank forward pump stops and stays off whatever the FQMS commands, so the normal ` +
        'main transfer from that tank stops.',
      `In flight, in automatic mode, when the FQMS calls for that pump and the ${letter} ${tankName} TK AFT PMP ` +
        'pushbutton is ON, the aft pump takes over: the fuel goes to the feed tanks that receive the main transfer, ' +
        'at half the normal main transfer rate for each of them.',
      'On the ground, or with the aft pump pushbutton OFF, the fuel of the tank stays where it is.',
    ],
    alertIds: [singleAlert, bothAlert],
    effects: [
      {
        where: 'E/WD',
        text:
          `FUEL ${letter} ${tankName} TK FWD PMP FAULT, ${CAUTION}, about 2 s after the pump fails. The procedure ` +
          `asks for ${letter} ${tankName} TK FWD PMP OFF. It is ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          `If the crew has also set the ${letter} ${tankName} TK AFT PMP pushbutton OFF, FUEL ${letter} ${tankName} ` +
          `TK FWD+AFT PMPs FAULT replaces the single alert, with both pumps OFF as lines. Same caution and phases.`,
      },
      {
        where: 'SD STATUS',
        text:
          `INOP SYS ${letter} ${tankName} TK FWD PMP ${STATUS_NOTE}. With the FWD+AFT alert: INOP SYS ${letter} ` +
          `${tankName} TK PMPs and the LIMITATION ${tankUnusable} while the tank holds fuel.`,
      },
      {
        where: 'SD FUEL',
        text: `${SD_FUEL_CALL_UP} The ${sideWord} ${tankWord} tank forward pump symbol turns amber with a bar instead of the running line.`,
      },
      {
        where: 'Overhead FUEL panel',
        text: `The FAULT light of the ${letter} ${tankName} TK FWD pushbutton comes on about 2 s after the failure, while it is ON. ${PB_OFF_NOTE}`,
      },
    ],
    notSimulated: ['The INFO line FUEL ALTN XFR IN USE of the alternate transfer is not shown on the STATUS page.'],
    logbook: { required: true, reason: `FUEL caution and a ${tankWord} tank transfer pump lost` },
    clearing: `${MAINTENANCE_ONLY} A pump pushbutton the crew set OFF stays OFF.`,
  };
}

const InnerTankForwardPumpFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelLeftInnerTankFwdPump, A380Failure.FuelRightInnerTankFwdPump],
  detail: (number): FailureDetail => forwardPumpDetail('INR', number),
};

const MidTankForwardPumpFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelLeftMidTankFwdPump, A380Failure.FuelRightMidTankFwdPump],
  detail: (number): FailureDetail => forwardPumpDetail('MID', number),
};

// ---------------------------------------------------------------------------------------------------------------------
// Trim tank pumps
// ---------------------------------------------------------------------------------------------------------------------

const TRIM_TANK_PMP_FAULT_ALERTS = ['281800089', '281800090'] as const;

const TrimTankPumpFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelTrimTankLeftPump, A380Failure.FuelTrimTankRightPump],
  detail: (number): FailureDetail => {
    const letter = number === 1 ? 'L' : 'R';
    const otherLetter = number === 1 ? 'R' : 'L';
    return {
      whatItIs:
        'The trim tank in the horizontal stabiliser has two pumps. They push its fuel forward into the aft ' +
        'gallery, for the CG control transfers in flight and for the load alleviation transfer that empties the ' +
        'trim tank before landing.',
      impact: [
        `The ${letter === 'L' ? 'left' : 'right'} trim tank pump stops and stays off whatever the FQMS commands. ` +
          'The other trim pump keeps running.',
        'The load alleviation transfer out of the trim tank then runs at half the rate.',
        `With both pumps lost (the ${otherLetter} pump failed too, or its pushbutton OFF) the trim tank fuel can only go ` +
          'forward by gravity, with the TRIM TK FEED selector at OPEN and a pitch below 3 degrees.',
      ],
      alertIds: [TRIM_TANK_PMP_FAULT_ALERTS[number - 1], '281800091'],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL TRIM TK ${letter} PMP FAULT, ${CAUTION}, about 2 s after the pump fails. The procedure asks for ` +
            `TRIM TK ${letter} PMP OFF. It is ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
        },
        {
          where: 'E/WD',
          text:
            `If the ${otherLetter} trim pump is also failed or its pushbutton is OFF, FUEL TRIM TK L+R PMPs FAULT ` +
            'replaces the single alert: both pumps OFF, in flight PITCH ATT < 3° FOR GRVTY FWD XFR, TRIM TK FEED ' +
            'OPEN, and TRIM TK : 2300 KG MAX NOT USABLE only if both pumps are failed. Same caution and phases.',
        },
        {
          where: 'SD STATUS',
          text:
            `The single alert adds nothing to the STATUS page. With the L+R alert: INOP SYS TRIM TK PMPs; ` +
            'LIMITATIONS FOR TRIM TK FWD XFR: PITCH ATT < 3°, and FUEL PARTLY UNUSABLE if both pumps are failed; INFO ' +
            'TRIM TK XFR BY GRVTY ONLY and TRIM TK GRVTY XFR : AROUND 3000 KG / HR, and TRIM TK : 2300 KG MAX NOT ' +
            `USABLE if both pumps are failed; ${STATUS_NOTE}.`,
        },
        {
          where: 'SD FUEL',
          text: `${SD_FUEL_CALL_UP} The ${letter === 'L' ? 'left' : 'right'} trim tank pump symbol turns amber with a bar instead of the running line.`,
        },
        {
          where: 'Overhead FUEL panel',
          text: `The FAULT light of the TRIM TK ${letter} pushbutton comes on about 2 s after the failure, while it is ON. ${PB_OFF_NOTE}`,
        },
      ],
      logbook: { required: true, reason: 'FUEL caution and a trim tank pump lost' },
      clearing: `${MAINTENANCE_ONLY} A pump pushbutton the crew set OFF stays OFF.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Feed tank leaks
// ---------------------------------------------------------------------------------------------------------------------

const FeedTankLeakFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelFeedTank1Leak,
    A380Failure.FuelFeedTank2Leak,
    A380Failure.FuelFeedTank3Leak,
    A380Failure.FuelFeedTank4Leak,
  ],
  detail: (tank): FailureDetail => ({
    whatItIs:
      `Feed tank ${tank} holds the fuel for engine ${tank}, which its main and standby pumps deliver. The FQMS ` +
      'compares the fuel on board with the fuel the engines have used, and signals a leak when fuel disappears ' +
      'faster than the engines burn it.',
    impact: [
      `Feed tank ${tank} loses 6,000 kg of fuel per hour, a fast leak, whatever its level and with the engines ` +
        'running or not, until the tank is empty. In flight the transfers keep refilling it, so the other tanks lose ' +
        'that fuel.',
      'The tank quantity and the fuel on board fall faster than the engines burn it.',
      'The FQMS detection only runs with all four engines running. It finds the leak about 20 minutes later, when ' +
        'the fuel on board has fallen by more than 4,400 lb over the fuel used in a 30 minute window.',
    ],
    alertIds: ['281800073', '281800072', `701800${108 + tank}`, '281800100'],
    effects: [
      {
        where: 'SD FUEL',
        text: `The quantity of feed tank ${tank} and the fuel on board fall steadily from the moment the failure is set.`,
      },
      {
        where: 'E/WD',
        text:
          `FUEL LEAK DETECTED, ${CAUTION}, about 20 minutes after all four engines are running with the leak. It is ` +
          'shown only on the ground after the first engine start, before take-off power, and in climb, cruise and ' +
          'descent above 800 ft. The lines ask to check the tank quantities, fuel on board and fuel used, to set all ' +
          'crossfeeds OFF and the transfer pumps OFF, and, with a feed tank leak suspected, to set the affected ' +
          'thrust lever to IDLE and the engine master OFF. The SD FUEL page comes up with it when it is the first ' +
          'alert on the E/WD and no page is selected. Once raised it stays until the aircraft is on the ground with ' +
          'an engine shut down.',
      },
      {
        where: 'SD STATUS',
        text:
          `LIMITATIONS LAND ANSA and FUEL PARTLY UNUSABLE ${STATUS_NOTE}. Ticking the line that keeps the affected ` +
          'engine master OFF removes FUEL PARTLY UNUSABLE; ticking the line that sets the affected feed tank pumps ' +
          'ON under LEAK CONTINUES adds INFO MIN FUEL USABLE : OTHER FEED TKs and (ALL OTHER FUEL MAYBE LOST).',
      },
      { where: 'PFD', text: `The limitation LAND ANSA is shown ${STATUS_NOTE}.` },
      {
        where: 'E/WD',
        text:
          `Setting the engine master OFF in flight, as the procedure asks, raises ENG ${tank} SHUT DOWN, ${CAUTION}. ` +
          'A new alert is not shown from V1 to 400 ft.',
      },
      {
        where: 'E/WD',
        text:
          'On the ground the transfers do not refill the tank: after about 30 minutes of leak, FUEL WINGS NOT ' +
          `BALANCED, ${CAUTION}, as the imbalance between feed tanks 1 and 4 or 2 and 3 exceeds 6,600 lb (not during ` +
          'a refuel or with the refuel panel open). It brings DELAY T.O and INFO FUEL CONSUMPT INCRSD : FMS PRED ' +
          `DISREGARD on the STATUS page; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. FUEL LEAK DETECTED does not show on the ground ` +
          'unless all four engines are running, as the detection needs them.',
      },
      {
        where: 'E/WD',
        text:
          `Once an engine is shut down in flight, as the procedure asks for the leaking engine, the leak detection is ` +
          `inhibited and FUEL LEAK DET FAULT shows, ${ADVISORY}, with INOP SYS FUEL LEAK DET on the STATUS page. It ` +
          'is shown only in climb, cruise and descent above 800 ft, has no SD page, and lasts as long as the engine ' +
          'is out.',
      },
    ],
    logbook: { required: true, reason: 'fuel leak caution' },
    clearing:
      `${MAINTENANCE_ONLY} It stops the leak, but the fuel already lost is not refilled, and a FUEL LEAK DETECTED ` +
      'already raised stays until the aircraft is on the ground with an engine shut down.',
  }),
};

export const Ata28PumpsFamilies: FailureDetailFamily[] = [
  WbbcFamily,
  FeedTankMainPumpFamily,
  FeedTankStbyPumpFamily,
  OuterTankPumpFamily,
  InnerTankForwardPumpFamily,
  MidTankForwardPumpFamily,
  TrimTankPumpFamily,
  FeedTankLeakFamily,
];
