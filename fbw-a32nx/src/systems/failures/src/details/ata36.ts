// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

/** Flight phases 3, 4, 5, 7 and 8: most bleed alerts are inhibited there */
const NOT_SHOWN_TAKE_OFF_TO_LANDING =
  'not shown from take-off power to 1,500 ft, on approach below 800 ft or on the landing roll above 80 kt';

/** Flight phases 3, 4, 5 and 8: the LO TEMP alerts are still shown on approach */
const NOT_SHOWN_TAKE_OFF_AND_LANDING_ROLL =
  'not shown from take-off power to 1,500 ft or on the landing roll above 80 kt';

/** Flight phases 1, 3, 4, 5, 7, 8 and 10: BLEED FAULT, HI TEMP and ABNORM PR */
const SHOWN_AIRBORNE_AND_TAXI_ONLY =
  'shown only during engine start and taxi, in climb, cruise and descent above 800 ft, and after landing below 80 kt';

/** Flight phases 3 to 8: the detection fault alerts and MONIT SYS FAULT */
const SHOWN_ON_GROUND_ONLY = 'shown only on the ground, before take-off power and after landing below 80 kt';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const LEAK_CLEARING =
  'Set the ENG BLEED pb-sw OFF to isolate the leak. The leak itself ends only with Restore, and the alert returns ' +
  'when the bleed is selected on again.';

const ENGINE_BLEED_VALVE_EXPLAINED =
  'Each engine bleed valve is a pneumatic shut-off and pressure-regulating valve between the engine compressor ' +
  'ducts and the precooler. The bleed monitoring computer commands it, and it also closes by itself when the engine ' +
  'gives too little pressure. It feeds the packs and the wing anti-ice of its side.';

const FAN_AIR_VALVE_EXPLAINED =
  'The precooler cools the hot engine bleed air with fan air taken behind the engine fan. The fan air valve ' +
  'meters that cooling flow so the bleed air leaves near 200 deg C, and a spring keeps it closed without pressure.';

const CROSS_BLEED_EXPLAINED =
  'The crossbleed valve joins the left and right bleed ducts. In AUTO it opens while the APU bleed valve is open ' +
  'and closes otherwise, and it closes when a leak is detected. The X BLEED selector can open or shut it by hand.';

const LEAK_LOOP_EXPLAINED =
  'Heat-sensing loops run along the hot bleed ducts. When a loop senses a temperature above its threshold the ' +
  'bleed monitoring computer declares a leak, closes the valves that feed the duct and lights the FAULT light.';

const PYLON_LEAK_ALERTS = ['3612003', '3612004'] as const;
const PYLON_LOOP_ALERTS = ['3612006', '3612007'] as const;
const WING_LEAK_ALERTS = ['3612001', '3612002'] as const;
const WING_LOOP_ALERTS = ['3612008', '3612009'] as const;
const BLEED_FAULT_ALERTS = ['3611001', '3611002'] as const;
const BLEED_NOT_CLOSED_ALERTS = ['3611009', '3611010'] as const;
const BLEED_FAULT_NOT_CLOSED_ALERTS = ['3611015', '3611016'] as const;
const HI_TEMP_ALERTS = ['3611007', '3611008'] as const;
const LO_TEMP_ALERTS = ['3611004', '3611005'] as const;
const ABNORMAL_PRESSURE_ALERTS = ['3611020', '3611021'] as const;
const HP_VALVE_ALERTS = ['3612011', '3612012'] as const;
const MONITORING_SYSTEM_ALERTS = ['3612013', '3612014'] as const;

/** WING A.ICE SYS FAULT with the X BLEED OPEN line, used when the faulty wing has no bleed of its own */
const WING_ANTI_ICE_FAULT_X_BLEED_ALERT = '3000111';
const APU_BLEED_FAULT_ALERT = '3611013';
const CROSS_BLEED_FAULT_ALERT = '3611014';

const EngineBleedValveStuckClosedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1BleedValveStuckClosed, A320Failure.Eng2BleedValveStuckClosed],
  detail: (number): FailureDetail => ({
    whatItIs: ENGINE_BLEED_VALVE_EXPLAINED,
    impact: [
      `The engine ${number} bleed valve stays closed whatever the computer or the ENG BLEED pb-sw commands.`,
      `Engine ${number} gives no bleed air: its pack and wing anti-ice depend on the other side through X BLEED.`,
      'Engine start is not affected, as this valve is closed during a start anyway.',
    ],
    alertIds: [WING_ANTI_ICE_FAULT_X_BLEED_ALERT],
    effects: [
      {
        where: 'SD BLEED',
        text: 'With the engine running, the bleed valve shows amber when it should be open, after about 5 s.',
      },
      {
        where: 'E/WD',
        text:
          'No alert on its own. With WING ANTI ICE on in flight and the wing duct short of pressure, WING A.ICE SYS ' +
          `FAULT with X BLEED OPEN shows after 10 s, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'Overhead ANTI ICE panel',
        text: 'The WING ANTI ICE FAULT light comes on with the low wing duct pressure.',
      },
    ],
    logbook: { required: true, reason: 'amber valve on the BLEED page and a lost bleed source' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const EngineBleedValveStuckOpenFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1BleedValveStuckOpen, A320Failure.Eng2BleedValveStuckOpen],
  detail: (number): FailureDetail => ({
    whatItIs: ENGINE_BLEED_VALVE_EXPLAINED,
    impact: [
      `The engine ${number} bleed valve stays fully open, so the bleed pressure is no longer regulated.`,
      'At high thrust the pressure goes above 57 PSI and the computer detects an overpressure.',
      'The valve cannot close for a start, APU bleed, shutdown, ENG BLEED OFF or the automatic closures.',
      'With APU BLEED on, engine 2 is affected only while X BLEED is open.',
    ],
    alertIds: [
      BLEED_NOT_CLOSED_ALERTS[number - 1],
      BLEED_FAULT_ALERTS[number - 1],
      BLEED_FAULT_NOT_CLOSED_ALERTS[number - 1],
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} BLEED NOT CLSD, 10 s after the valve is open during the engine start, with APU BLEED on ` +
          `or with the engine stopped, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'E/WD',
        text:
          `With the engine running, ENG ${number} BLEED FAULT once the pressure stays above 57 PSI for 15 s. ` +
          `10 s later it gains the BLEED NOT CLOSED subtitle. Both ${SHOWN_AIRBORNE_AND_TAXI_ONLY}.`,
      },
      {
        where: 'Overhead AIR COND panel',
        text: `The ENG ${number} BLEED FAULT light comes on with the overpressure, and during a start or with APU BLEED on.`,
      },
      {
        where: 'SD BLEED',
        text: 'The bleed valve shows amber when it should be closed, and the pressure shows amber in overpressure.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and unregulated bleed pressure' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const HpValveStuckClosedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1HpValveStuckClosed, A320Failure.Eng2HpValveStuckClosed],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each engine has two bleed ports: an intermediate-pressure port used most of the time, and a high-pressure ' +
      'port used when the intermediate pressure is too low, mainly at low thrust. The HP valve opens on command of ' +
      'the bleed monitoring computer to add the high-pressure air.',
    impact: [
      `The HP valve of engine ${number} stays closed, so only the intermediate port feeds the bleed duct.`,
      'At high thrust nothing changes. At idle the regulated pressure falls below 38 PSI.',
      'Less air reaches the packs and the wing anti-ice of that side at low thrust, such as in a descent.',
    ],
    alertIds: [HP_VALVE_ALERTS[number - 1], ABNORMAL_PRESSURE_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} HP VALVE FAULT, 5 s after the computer asks for the HP valve and it stays closed, ` +
          `${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'E/WD',
        text:
          `ENG ${number} BLEED ABNORM PR, 15 s after the pressure stays under 38 PSI with the bleed valve open and ` +
          `the engine running, ${SHOWN_AIRBORNE_AND_TAXI_ONLY}.`,
      },
      { where: 'SD BLEED', text: 'The HP valve shows an amber crossline.' },
      { where: 'SD STATUS', text: 'AIR PRESS LOW AT IDLE is listed with the HP VALVE FAULT.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and low bleed pressure at idle' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FanAirValveStuckClosedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FanAirValveStuckClosed, A320Failure.Eng2FanAirValveStuckClosed],
  detail: (number): FailureDetail => ({
    whatItIs: FAN_AIR_VALVE_EXPLAINED,
    impact: [
      `The fan air valve of engine ${number} stays closed, so the precooler no longer cools the bleed air.`,
      'At climb power the bleed air passes about 300 deg C. At idle it stays under 200 deg C.',
      'On an overheat the computer closes the bleed valve and holds it closed, so that side loses its bleed.',
      'An overheat is above 257 deg C for 55 s, 270 deg C for 15 s or 290 deg C for 5 s.',
    ],
    alertIds: [HI_TEMP_ALERTS[number - 1], BLEED_FAULT_ALERTS[number - 1], WING_ANTI_ICE_FAULT_X_BLEED_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} BLEED HI TEMP above 240 deg C. On the overheat ENG ${number} BLEED FAULT replaces it. ` +
          `Both ${SHOWN_AIRBORNE_AND_TAXI_ONLY}.`,
      },
      {
        where: 'Overhead AIR COND panel',
        text: `The ENG ${number} BLEED FAULT light comes on and the bleed valve closes, until the pb-sw is set OFF.`,
      },
      { where: 'SD BLEED', text: 'The precooler outlet temperature shows amber on the overheat.' },
      {
        where: 'E/WD',
        text:
          'With WING ANTI ICE on in flight and the wing duct short of pressure, WING A.ICE SYS FAULT with X BLEED ' +
          `OPEN follows after 10 s, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost bleed source' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FanAirValveStuckOpenFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FanAirValveStuckOpen, A320Failure.Eng2FanAirValveStuckOpen],
  detail: (number): FailureDetail => ({
    whatItIs: FAN_AIR_VALVE_EXPLAINED,
    impact: [
      `The fan air valve of engine ${number} stays fully open, so the precooler over-cools the bleed air.`,
      'In flight at low thrust with WING ANTI ICE on, the bleed air falls below 150 deg C.',
      'The wing anti-ice then heats less, and the icing limitations may apply.',
    ],
    alertIds: [LO_TEMP_ALERTS[number - 1], '3611006'],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} BLEED LO TEMP, in flight with WING ANTI ICE on, the bleed valve open and the outlet under ` +
          `150 deg C, ${NOT_SHOWN_TAKE_OFF_AND_LANDING_ROLL}.`,
      },
      {
        where: 'E/WD',
        text: 'If both engines give low temperature air, ENG 1+2 BLEED LO TEMP replaces the single alerts.',
      },
      { where: 'SD BLEED', text: 'The precooler outlet temperature shows amber.' },
      {
        where: 'SD STATUS',
        text: 'With the other bleed available, ENG BLEED and the pack are listed. Otherwise the icing limitations.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and reduced wing anti-ice heat' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const LEAK_STATUS_EFFECT = (n: number) => ({
  where: 'SD STATUS',
  text:
    'AVOID ICING CONDITIONS, IF SEVERE ICE ACCRETION and LDG DIST PROC APPLY are listed. WING A.ICE, ' +
    `ENG ${n} BLEED and PACK ${n} are inoperative.`,
});

const WING_ANTI_ICE_FOLLOW_UP =
  'With WING ANTI ICE on in flight, WING A.ICE SYS FAULT with X BLEED OPEN follows after 10 s.';

const PylonLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1PylonBleedLeak, A320Failure.Eng2PylonBleedLeak],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The pylon duct carries the engine bleed air from the engine, through the pylon, to the wing. The duct is hot ' +
      'and pressurised, so a heat-sensing loop around it detects a leak.',
    impact: [
      `A hot air leak opens in the engine ${number} pylon duct while the duct is pressurised.`,
      'The loop detects it above 204 deg C, at most thrust settings but not always at ground idle.',
      number === 1
        ? 'Once detected, the engine 1 bleed valve, the APU bleed valve and, in AUTO, X BLEED all close.'
        : 'Once detected, the engine 2 bleed valve closes, and so does X BLEED in AUTO.',
    ],
    alertIds: [
      PYLON_LEAK_ALERTS[number - 1],
      number === 1 ? APU_BLEED_FAULT_ALERT : CROSS_BLEED_FAULT_ALERT,
      WING_ANTI_ICE_FAULT_X_BLEED_ALERT,
    ],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${number} BLEED LEAK once the leak is detected and the engine runs, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      { where: 'Overhead AIR COND panel', text: `The ENG ${number} BLEED FAULT light comes on.` },
      {
        where: 'E/WD',
        text:
          (number === 1
            ? 'The APU valve closes while APU BLEED is on, so APU BLEED FAULT follows after 10 s. '
            : 'With APU BLEED on and X BLEED in AUTO, X BLEED closes but the APU valve stays open: X BLEED FAULT ' +
              'follows after 5 s. ') + WING_ANTI_ICE_FOLLOW_UP,
      },
      LEAK_STATUS_EFFECT(number),
    ],
    notSimulated: ['The leak only lets air out. The hot air does not damage structure or other systems.'],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost bleed source' },
    clearing: LEAK_CLEARING,
  }),
};

const WingLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftWingBleedLeak, A320Failure.RightWingBleedLeak],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'left' : 'right';
    return {
      whatItIs:
        'The wing duct carries the bleed air from the precooler of each engine to the packs, the wing anti-ice and ' +
        'the crossbleed valve. Two heat-sensing loops, A and B, run along it, and a leak needs both to sense heat.',
      impact: [
        `A hot air leak opens in the ${side} wing duct, downstream of the precooler, while the duct is pressurised.`,
        `Above 124 deg C the engine ${number} bleed valve, the ${side} wing anti-ice valve and, in AUTO, X BLEED close.`,
        'With WING ANTI ICE on, the closed wing valve lights the WING ANTI ICE pb-sw FAULT light.',
        number === 1 ? 'The APU bleed valve closes too.' : 'The APU bleed valve stays open.',
      ],
      alertIds: [
        WING_LEAK_ALERTS[number - 1],
        WING_ANTI_ICE_FAULT_X_BLEED_ALERT,
        number === 1 ? APU_BLEED_FAULT_ALERT : CROSS_BLEED_FAULT_ALERT,
      ],
      effects: [
        {
          where: 'E/WD',
          text: `${number === 1 ? 'L' : 'R'} WING LEAK once detected, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
        },
        { where: 'Overhead AIR COND panel', text: `The ENG ${number} BLEED FAULT light comes on.` },
        {
          where: 'E/WD',
          text:
            (number === 1
              ? 'The APU valve closes while APU BLEED is on, so APU BLEED FAULT follows after 10 s. '
              : 'With APU BLEED on and X BLEED in AUTO, X BLEED closes but the APU valve stays open: X BLEED FAULT ' +
                'follows after 5 s. ') + WING_ANTI_ICE_FOLLOW_UP,
        },
        LEAK_STATUS_EFFECT(number),
      ],
      notSimulated: ['The leak only lets air out. The hot air does not damage structure or other systems.'],
      logbook: { required: true, reason: 'ECAM caution, fault light and a lost bleed source' },
      clearing: LEAK_CLEARING,
    };
  },
};

const PylonLeakLoopFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1PylonLeakDetectionLoop, A320Failure.Eng2PylonLeakDetectionLoop],
  detail: (number): FailureDetail => ({
    whatItIs: LEAK_LOOP_EXPLAINED,
    impact: [
      `The pylon loop of engine ${number} senses nothing, so a leak in that pylon duct goes undetected.`,
      'The bleed valve then does not close for a pylon leak, and no leak alert or light shows.',
    ],
    alertIds: [PYLON_LOOP_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${number} LEAK DET FAULT while bleed monitoring computer ${number} works, ${SHOWN_ON_GROUND_ONLY}.`,
      },
      { where: 'SD STATUS', text: `ENG ${number} LEAK DETECTION is listed as inoperative.` },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost leak detection' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const WingLeakLoopFamily: FailureDetailFamily = {
  ids: [
    A320Failure.LeftWingLeakDetectionLoopA,
    A320Failure.LeftWingLeakDetectionLoopB,
    A320Failure.RightWingLeakDetectionLoopA,
    A320Failure.RightWingLeakDetectionLoopB,
  ],
  detail: (number): FailureDetail => {
    const wing = number <= 2 ? 'left' : 'right';
    const letter = number % 2 === 1 ? 'A' : 'B';
    const other = number % 2 === 1 ? 'B' : 'A';
    return {
      whatItIs: LEAK_LOOP_EXPLAINED,
      impact: [
        `Loop ${letter} of the ${wing} wing senses nothing. Loop ${other} alone still detects a leak.`,
        'A leak counts when one loop senses it and the other is inoperative, so detection still works.',
        'With both loops of the wing failed, a wing leak is no longer detected.',
      ],
      alertIds: [WING_LOOP_ALERTS[wing === 'left' ? 0 : 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `Only with both loops of the ${wing} wing failed: ${wing === 'left' ? 'L' : 'R'} WNG LEAK DET FAULT, ` +
            `${SHOWN_ON_GROUND_ONLY}.`,
        },
        {
          where: 'SD STATUS',
          text: `With both loops failed, ${wing.toUpperCase()} WING LEAK DETECTION is listed as inoperative.`,
        },
        { where: 'E/WD', text: 'One loop alone raises no alert and no indication.' },
      ],
      logbook: { required: false, reason: 'no indication to report while the other loop works' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const BleedMonitoringComputerFamily: FailureDetailFamily = {
  ids: [A320Failure.Bmc1, A320Failure.Bmc2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two bleed monitoring computers, one per engine, command the bleed valve and the precooler fan air valve of ' +
      'their engine. They watch pressure, temperature and leaks and light the FAULT lights. If one fails, the ' +
      'other takes over most of the monitoring.',
    impact: [
      `Computer ${number} fails. Bleed valve ${number} no longer closes by itself for an overheat, an overpressure, ` +
        `a leak, a start or APU bleed.`,
      `The ENG ${number} BLEED pb-sw and the ENG FIRE pb still close it, and the other computer still monitors.`,
      number === 1
        ? 'The pylon 1 and APU leak detection are lost; the wing loops and engine 2 stay.'
        : 'The pylon 2 leak detection is lost; the wing loops, engine 1 and APU stay.',
      'With both computers failed, X BLEED in AUTO keeps its position and nothing is monitored.',
    ],
    alertIds: [MONITORING_SYSTEM_ALERTS[number - 1], '3612015', BLEED_NOT_CLOSED_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `BLEED MONIT SYS ${number} FAULT, ${SHOWN_ON_GROUND_ONLY}.`,
      },
      {
        where: 'E/WD',
        text: `Both computers failed: BLEED MONITORING FAULT replaces them, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'E/WD',
        text:
          `ENG ${number} BLEED NOT CLSD after 10 s if the valve stays open during a start or with APU BLEED on, ` +
          `${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'Overhead AIR COND panel',
        text: `The ENG ${number} BLEED FAULT light no longer comes on, even for a real fault.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost bleed monitoring' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const SEVERITY = 'All these alerts are amber cautions with master caution and a single chime.';

/** Names the severity once per failure, in its first E/WD effect */
function withSeverity(detail: FailureDetail): FailureDetail {
  const index = detail.effects.findIndex((effect) => effect.where === 'E/WD');
  return {
    ...detail,
    effects: detail.effects.map((effect, i) =>
      i === index ? { ...effect, text: `${effect.text} ${SEVERITY}` } : effect,
    ),
  };
}

const RawAta36Entries: Record<number, FailureDetail> = {
  [A320Failure.CrossBleedValveStuckClosed]: {
    whatItIs: CROSS_BLEED_EXPLAINED,
    impact: [
      'The crossbleed valve goes closed and stays there whatever the selector or the automatic motor asks.',
      'The APU bleed or one engine bleed can no longer feed the opposite side.',
      'An engine start from the APU or the other engine through X BLEED is not possible.',
    ],
    alertIds: [CROSS_BLEED_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          'X BLEED FAULT, 5 s after the valve is commanded open: selector OPEN, or AUTO with the APU bleed valve ' +
          `open. ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'E/WD',
        text:
          'With the selector OPEN, one bleed only and WING ANTI ICE on, the alert adds WING ANTI ICE OFF and AVOID ' +
          'ICING CONDITIONS.',
      },
      { where: 'SD BLEED', text: 'The crossbleed valve shows amber when it is not in the commanded position.' },
      { where: 'SD STATUS', text: 'X BLEED MAN CTL and X BLEED inoperative are listed.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost crossbleed' },
    clearing: MAINTENANCE_ONLY,
  },

  [A320Failure.CrossBleedValveStuckOpen]: {
    whatItIs: CROSS_BLEED_EXPLAINED,
    impact: [
      'The crossbleed valve goes open and stays there whatever the selector or the automatic motor asks.',
      'The two ducts stay joined, so one side cannot be isolated.',
      'A leak on one side drains both, because X BLEED cannot close.',
    ],
    alertIds: [CROSS_BLEED_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          'X BLEED FAULT, 5 s after the valve is commanded closed: selector SHUT, or AUTO with the APU bleed valve ' +
          `closed. ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'While the selector is in AUTO the alert shows the X BLEED MAN CTL line.',
      },
      { where: 'SD BLEED', text: 'The crossbleed valve shows amber when it is not in the commanded position.' },
      { where: 'SD STATUS', text: 'X BLEED MAN CTL and X BLEED inoperative are listed.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost crossbleed' },
    clearing: MAINTENANCE_ONLY,
  },

  [A320Failure.ApuBleedValveStuckClosed]: {
    whatItIs:
      'The APU bleed valve connects the APU compressor to the left bleed duct. The APU control box opens it above ' +
      '95 % APU speed with the APU BLEED pb-sw ON, and closes it with the pb-sw OFF.',
    impact: [
      'The APU bleed valve stays closed whatever the APU control box or the APU BLEED pb-sw asks.',
      'APU air cannot reach the packs or the engine starters.',
      'An engine start from the APU gets no starter air: use X BLEED from the other engine or ground air.',
    ],
    alertIds: [APU_BLEED_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          'APU BLEED FAULT, 10 s after the APU runs (AVAIL, above 95 %) with the APU BLEED pb-sw ON, ' +
          `${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      {
        where: 'SD BLEED',
        text: 'With the APU master switch ON, the APU valve shows an amber crossline after the pb-sw is ON for 10 s.',
      },
      { where: 'SD STATUS', text: 'APU BLEED is listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost APU bleed' },
    clearing: MAINTENANCE_ONLY,
  },

  [A320Failure.ApuBleedValveStuckOpen]: {
    whatItIs:
      'The APU bleed valve connects the APU compressor to the left bleed duct. The APU control box opens it above ' +
      '95 % APU speed with the APU BLEED pb-sw ON, and closes it with the pb-sw OFF.',
    impact: [
      'The APU bleed valve stays open whatever the APU control box or the APU BLEED pb-sw asks.',
      'APU air keeps feeding the left duct with the pb-sw OFF.',
      'The leak protection cannot close it for an APU leak, a left wing leak or a pylon 1 leak.',
    ],
    alertIds: [APU_BLEED_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          'APU BLEED FAULT, 10 s after the APU runs with the APU BLEED pb-sw OFF and the valve open, ' +
          `${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      { where: 'SD BLEED', text: 'The APU valve stays in line (open) with the pb-sw OFF.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and APU air that cannot be isolated' },
    clearing: MAINTENANCE_ONLY,
  },

  [A320Failure.ApuBleedLeak]: {
    whatItIs:
      'The APU bleed duct carries APU air to the left bleed duct. A heat-sensing loop along it detects a leak, ' +
      'and the bleed monitoring computer 1 then closes the APU bleed valve.',
    impact: [
      'A hot air leak opens in the APU bleed duct, while the APU bleed valve is open.',
      'The loop detects it above 124 deg C: the APU bleed valve closes, and X BLEED closes in AUTO.',
      'The detection needs bleed monitoring computer 1.',
    ],
    alertIds: ['3612005', APU_BLEED_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text: `APU BLEED LEAK once detected, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      { where: 'Overhead AIR COND panel', text: 'The APU BLEED FAULT light comes on.' },
      {
        where: 'E/WD',
        text:
          'The valve closes while the APU BLEED pb-sw is ON, so APU BLEED FAULT follows after 10 s with the APU ' +
          'running.',
      },
      { where: 'SD STATUS', text: 'APU BLEED is listed as inoperative.' },
    ],
    notSimulated: ['The leak only blows APU air. It takes no air from the duct and the engines cannot feed it.'],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost APU bleed' },
    clearing: LEAK_CLEARING,
  },

  [A320Failure.ApuLeakDetectionLoop]: {
    whatItIs: LEAK_LOOP_EXPLAINED,
    impact: [
      'The APU loop senses nothing, so an APU bleed leak goes undetected.',
      'The APU bleed valve then does not close for an APU leak, and no leak alert or light shows.',
    ],
    alertIds: ['3612010'],
    effects: [
      {
        where: 'E/WD',
        text: `APU LEAK DET FAULT while bleed monitoring computer 1 works, ${NOT_SHOWN_TAKE_OFF_TO_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'APU LEAK DETECTION is listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost leak detection' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata36Entries: Record<number, FailureDetail> = Object.keys(RawAta36Entries).reduce(
  (entries, key) => {
    entries[Number(key)] = withSeverity(RawAta36Entries[Number(key)]);
    return entries;
  },
  {} as Record<number, FailureDetail>,
);

const RawAta36Families: FailureDetailFamily[] = [
  EngineBleedValveStuckClosedFamily,
  EngineBleedValveStuckOpenFamily,
  HpValveStuckClosedFamily,
  FanAirValveStuckClosedFamily,
  FanAirValveStuckOpenFamily,
  PylonLeakFamily,
  WingLeakFamily,
  PylonLeakLoopFamily,
  WingLeakLoopFamily,
  BleedMonitoringComputerFamily,
];

export const Ata36Families: FailureDetailFamily[] = RawAta36Families.map((family) => ({
  ids: family.ids,
  detail: (number: number): FailureDetail => withSeverity(family.detail(number)),
}));
