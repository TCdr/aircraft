// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the engines are shut ' +
  'down after landing';

/** Alerts inhibited in flight phases 5 and 6 */
const NOT_SHOWN_PHASES_5_AND_6 = 'a new alert is not shown from V1 on take-off until 400 ft';

/** Alerts inhibited in every flight phase but 8 and 9 */
const NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12 =
  'a new alert is shown only in flight, in climb above 1,500 ft, in cruise, in descent and on approach until touch ' +
  'down';

const SD_BLEED_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const SD_NEVER_AMBER_FOR_VALVES =
  'With the engine running the page draws the valve where it really is but compares it with nothing, so it stays green.';

const AMBER_SYMBOL_NOT_SHOWN = 'The amber symbol of a valve abnormally open or closed on the BLEED page is not shown.';

/** ENG n START FAULT, NO STARTER AIR PRESSURE, for the engines that cannot get starter air (alert keys 701800117 to 120) */
const startFaultAlertIds = (engines: number[]): string[] => engines.map((engine) => String(701800116 + engine));

const startFaultBullet = (engines: number[]) => ({
  where: 'E/WD',
  text:
    `${engines.map((engine) => `ENG ${engine} START FAULT`).join(' and ')}, ${ADVISORY}, on the ground, about 10 s ` +
    'after the start valve of that engine opens with no starter air: the core does not turn and the engine does not ' +
    'start. Its lines are NO STARTER AIR PRESSURE, XBLEED OPEN, APU BLEED ON, then IF NOT SUCCESSFUL : ENG MAN START ' +
    `OFF and ENG MASTER OFF; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
});

/** AIR ENG n BLEED OFF (key 211800052 to 055), raised by the pushbutton OFF line of the procedures */
const bleedOffAlertId = (engine: number): string => String(211800051 + engine);

const pushbuttonOf = (engine: number): string => `ENG ${engine} BLEED pushbutton`;

const bleedOffBullet = (engine: number, asker: string) => ({
  where: 'E/WD',
  text:
    `AIR ENG ${engine} BLEED OFF, ${CAUTION}, once the ${pushbuttonOf(engine)} is set OFF with the engine running ` +
    `(${asker}); ${NOT_SHOWN_PHASES_3_TO_7_9_10}. STATUS then shows INOP SYS ENG ${engine} BLEED, and at AUTO the ` +
    'crossbleed valves open.',
});

/** The pack that the ducts of engine `engine` feed: packs 1 and 2 take the left and right pair */
const packOf = (engine: number): number => (engine <= 2 ? 1 : 2);

/** The other engine of the same side, whose duct also feeds the pack */
const otherEngineOfSide = (engine: number): number => (engine % 2 === 1 ? engine + 1 : engine - 1);

// ---------------------------------------------------------------------------------------------------------------------
// APU bleed valve
// ---------------------------------------------------------------------------------------------------------------------

const APU_VALVE_DESCRIPTION =
  'The APU bleed valve, together with the APU isolation valve that works with it, connects the APU compressor air to ' +
  'the bleed system. They are not pressure-regulating valves because the APU runs at constant speed. With the APU ' +
  'BLEED pushbutton ON and the APU running they open, the crossbleed valves open and the engine bleed valves close.';

const APU_VALVE_NOT_SIMULATED = [
  'The APU isolation valve is not a separate valve: one valve stands for both, so the APU ISOL VLV lines of the alert never appear.',
];

const APU_FAULT_LIGHT_BULLET = {
  where: 'Overhead AIR panel',
  text: 'The FAULT light of the APU BLEED pushbutton stays off: it lights only for a leak in the APU bleed duct.',
};

const ApuBleedValveStuckClosedDetail: FailureDetail = {
  whatItIs: APU_VALVE_DESCRIPTION,
  impact: [
    'The valve stays closed whatever the APU controller commands, so no APU air enters the bleed system.',
    'The crossbleed valves do not open for the APU at AUTO, and with the engines stopped the packs have no air source.',
    'On the ground no engine can be started from the APU. A ground air source, or the crossbleed air of an engine that already runs, still starts it.',
    'Nothing shows while the APU BLEED pushbutton is OFF, because the valve is then commanded closed anyway.',
  ],
  alertIds: ['211800051', ...startFaultAlertIds([1, 2, 3, 4])],
  effects: [
    {
      where: 'E/WD',
      text:
        `AIR APU BLEED FAULT, ${CAUTION}, about 10 s after the APU is available with the APU BLEED pushbutton ON ` +
        `(the valve is commanded open but stays closed); ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is APU BLEED OFF, ` +
        'with APU BLEED AVAIL BELOW FL225 added above FL 225. Setting the pushbutton OFF, or stopping the APU, ' +
        'ends the alert.',
    },
    {
      where: 'SD BLEED',
      text:
        `${SD_BLEED_CALL_UP} The APU bleed valve symbol (shown with the APU master switch ON) turns amber as soon as ` +
        'the APU is available with the pushbutton ON, without the 10 s delay of the alert, and is drawn closed. The ' +
        'APU isolation valve symbol stays closed and green.',
    },
    { where: 'SD STATUS', text: 'INOP SYS APU BLEED, only while the alert is shown.' },
    APU_FAULT_LIGHT_BULLET,
    startFaultBullet([1, 2, 3, 4]),
  ],
  notSimulated: APU_VALVE_NOT_SIMULATED,
  logbook: { required: true, reason: 'AIR APU BLEED FAULT caution, no engine start from the APU' },
  clearing: `${MAINTENANCE_ONLY} Setting the APU BLEED pushbutton OFF ends the alert, but the APU still supplies no air.`,
};

const ApuBleedValveStuckOpenDetail: FailureDetail = {
  whatItIs: APU_VALVE_DESCRIPTION,
  impact: [
    'The valve stays open whatever the APU controller commands, so a running APU feeds the bleed system even with the APU BLEED pushbutton OFF.',
    'At AUTO the crossbleed valves open while the valve is open, but the engine bleed valves do not close, because they close only with the pushbutton ON.',
    'The fault is noticed only with the pushbutton OFF and the APU running: with the pushbutton ON the open valve is where it is commanded.',
    'With the APU BLEED pushbutton ON and the APU stopped, the valve still reads open, so all four engine bleed valves stay closed: the engine bleed supply is lost without a bleed alert.',
  ],
  alertIds: ['211800051'],
  effects: [
    {
      where: 'E/WD',
      text:
        `AIR APU BLEED FAULT, ${CAUTION}, about 10 s after the APU is available while the valve is open and the ` +
        `controller commands it closed (pushbutton OFF); ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its only line is APU ` +
        'BLEED VLV NOT CLOSED. Setting the pushbutton ON, or stopping the APU, ends the alert.',
    },
    {
      where: 'SD BLEED',
      text:
        `${SD_BLEED_CALL_UP} The APU bleed valve symbol (shown with the APU master switch ON) is drawn open and is ` +
        'amber only when the pushbutton is ON and the APU is not yet available. The APU isolation valve symbol, the ' +
        'duct line and the three crossbleed valves are drawn open.',
    },
    { where: 'SD STATUS', text: 'INOP SYS APU BLEED, only while the alert is shown.' },
    APU_FAULT_LIGHT_BULLET,
    {
      where: 'SD BLEED',
      text:
        'With the pushbutton ON and the APU stopped no E/WD alert shows (it needs the APU running). The four engine ' +
        'bleed valve symbols are drawn closed and the APU valve symbol is amber.',
    },
  ],
  notSimulated: APU_VALVE_NOT_SIMULATED,
  logbook: { required: true, reason: 'AIR APU BLEED FAULT caution, or engine bleeds closed with the APU stopped' },
  clearing:
    `${MAINTENANCE_ONLY} Setting the APU BLEED pushbutton ON ends the alert, but the valve stays open: keep the ` +
    'pushbutton OFF before the APU is stopped, or the engine bleeds stay closed.',
};

// ---------------------------------------------------------------------------------------------------------------------
// Engine bleed valves
// ---------------------------------------------------------------------------------------------------------------------

const ENGINE_BLEED_VALVE_DESCRIPTION =
  'Each engine has a bleed valve downstream of the point where the IP and HP stage air meet. It holds the bleed ' +
  'pressure at about 40 psi and closes to cut the engine off from the bleed system: during the engine start, with the ' +
  'ENG BLEED pushbutton OFF, with the APU bleed on, with the engine fire pushbutton released, on a bleed overpressure, ' +
  'overtemperature or leak, and when the pressure upstream is too low. An overpressure valve behind it closes above ' +
  '85 psi and opens again below 55 psi.';

const EngineBleedValveStuckClosedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1BleedValveStuckClosed,
    A380Failure.Eng2BleedValveStuckClosed,
    A380Failure.Eng3BleedValveStuckClosed,
    A380Failure.Eng4BleedValveStuckClosed,
  ],
  detail: (engine): FailureDetail => ({
    whatItIs: ENGINE_BLEED_VALVE_DESCRIPTION,
    impact: [
      `The engine ${engine} bleed valve cannot open, so the engine feeds no air into its bleed duct.`,
      `The crossbleed valves do not open for it at AUTO: pack ${packOf(engine)} gets air from engine ` +
        `${otherEngineOfSide(engine)} only, unless the APU bleed or the XBLEED selector OPEN joins the ducts.`,
      'No alert follows by itself: the crew sees the FAULT light and the SD BLEED page.',
    ],
    alertIds: [bleedOffAlertId(engine)],
    effects: [
      {
        where: 'Overhead AIR panel',
        text:
          `The FAULT light of the ${pushbuttonOf(engine)} comes on about 10 s after the bleed monitoring commands the ` +
          'valve open (engine running with more than 15 psi upstream, pushbutton at AUTO) and the valve stays ' +
          'closed. It stays off while the valve is commanded closed anyway: engine stopped, pushbutton OFF, engine ' +
          'start, or APU bleed on.',
      },
      {
        where: 'SD BLEED',
        text:
          `The engine ${engine} bleed valve symbol is drawn closed. ${SD_NEVER_AMBER_FOR_VALVES} Once the duct ` +
          'empties, the pressure readout under it falls to amber at or below 4 psi and the temperature readout ' +
          'below 150 C.',
      },
      bleedOffBullet(engine, 'only if the crew chooses to; no procedure asks for it'),
    ],
    notSimulated: [AMBER_SYMBOL_NOT_SHOWN],
    logbook: { required: true, reason: `FAULT light of the ENG ${engine} BLEED pushbutton, bleed lost` },
    clearing:
      `${MAINTENANCE_ONLY} Setting the ${pushbuttonOf(engine)} OFF puts the light out because the valve is then ` +
      `commanded closed; the engine then shows ENG ${engine} BLEED OFF, as for any bleed switched off.`,
  }),
};

const EngineBleedValveStuckOpenFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1BleedValveStuckOpen,
    A380Failure.Eng2BleedValveStuckOpen,
    A380Failure.Eng3BleedValveStuckOpen,
    A380Failure.Eng4BleedValveStuckOpen,
  ],
  detail: (engine): FailureDetail => {
    const bleedFaultAlert = `36180000${engine}`;
    const bleedNotClosedAlert = String(361800014 + engine);
    const isOuterEngine = engine === 1 || engine === 4;
    return {
      whatItIs: ENGINE_BLEED_VALVE_DESCRIPTION,
      impact: [
        `The engine ${engine} bleed valve stays open whatever the bleed monitoring commands, so it can neither cut the engine off nor regulate the pressure.`,
        'During an engine start or the APU bleed supply the engine stays connected to its duct (BLEED NOT CLOSED).',
        'At high engine power the duct pressure rises well above 40 psi until the overpressure valve cycles, and a bleed fault follows that the stuck valve cannot isolate. The crossbleed valves open at AUTO.',
        'A leak in the pylon or wing zone of this engine cannot be isolated at this valve: the leak alert asks for the pushbutton OFF, and the valve stays open.',
      ],
      alertIds: [bleedNotClosedAlert, bleedFaultAlert, '211800056', bleedOffAlertId(engine)],
      effects: [
        {
          where: 'E/WD',
          text:
            `AIR ENG ${engine} BLEED NOT CLOSED, ${CAUTION}, about 10 s after the valve is commanded closed for the ` +
            'engine start (start valve open) or for the APU bleed supply (APU BLEED pushbutton ON with the APU ' +
            `bleed valve open); ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is ENG ${engine} BLEED OFF; once that ` +
            `pushbutton is OFF it adds WHEN ENG ${engine} STARTED : and ENG ${engine} BLEED ON. It stays while the ` +
            'pushbutton is OFF and goes out when the pushbutton is back at AUTO and nothing asks the valve closed.',
        },
        {
          where: 'E/WD',
          text:
            `AIR ENG ${engine} BLEED FAULT, ${CAUTION}, at high engine power: the monitoring latches an overpressure ` +
            `about 15 s after the overpressure valve first closes; ${NOT_SHOWN_PHASES_3_TO_7_9_10}, so with take-off ` +
            `thrust it appears only above 1,500 ft. Its line is ENG ${engine} BLEED OFF while the valve is open. It ` +
            'stays while the pushbutton is at AUTO. With the pushbutton OFF it follows the detection, and with this ' +
            'valve stuck open the overpressure stays at high power, so it stays until the thrust is reduced.',
        },
        bleedOffBullet(
          engine,
          'asked by the lines of BLEED FAULT and, during an APU bleed supply, of BLEED NOT CLOSED',
        ),
        {
          where: 'E/WD',
          text:
            `AIR ABNORM BLEED CONFIG, an amber caution with no aural of its own, joins the BLEED FAULT; ` +
            `${NOT_SHOWN_PHASES_5_AND_6}. With the crossbleed valves open it carries only IF XBLEED OPEN; if they ` +
            'did not open it asks XBLEED OPEN first' +
            (isOuterEngine
              ? ', and the heading IF XBLEED STILL CLOSED follows, with WING A-ICE OFF, ENGs A-ICE AS RQRD and AVOID ICING CONDs while the valves stay closed.'
              : '.'),
        },
        {
          where: 'Overhead AIR panel',
          text:
            `The FAULT light of the ${pushbuttonOf(engine)} comes on about 10 s after the monitoring commands the ` +
            'valve closed and it stays open: engine start, pushbutton OFF, APU bleed on with its valve open, fire ' +
            'pushbutton released, overpressure, overtemperature or low pressure upstream. With the overpressure the ' +
            'light is latched until the pushbutton is set OFF and the cause is gone.',
        },
        {
          where: 'SD STATUS',
          text:
            `INOP SYS ENG ${engine} BLEED while either E/WD alert is shown` +
            (isOuterEngine
              ? ', and LIMITATION AVOID ICING CONDs, on the PFD too, while AIR ABNORM BLEED CONFIG is shown and the WING A-ICE is off.'
              : '.'),
        },
        {
          where: 'SD BLEED',
          text: `${SD_BLEED_CALL_UP} The engine ${engine} bleed valve symbol is drawn open. ${SD_NEVER_AMBER_FOR_VALVES} At high engine power its pressure readout turns amber above 60 psi.`,
        },
      ],
      notSimulated: [AMBER_SYMBOL_NOT_SHOWN],
      logbook: { required: true, reason: `FAULT light and ECAM caution when the valve should be closed` },
      clearing:
        `${MAINTENANCE_ONLY} An overpressure that was latched stays: set the ${pushbuttonOf(engine)} OFF and back ` +
        'to AUTO after the restore.',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// HP valves
// ---------------------------------------------------------------------------------------------------------------------

const HP_VALVE_DESCRIPTION =
  'The engine normally bleeds from the IP stage of the compressor. At low thrust that pressure is too low, so the HP ' +
  'valve adds air from the HP stage and limits the pressure to 48.5 psi. It closes by itself when the IP pressure is ' +
  'high enough (above 33.5 psi), when the HP stage pressure is too low (for example during the start), when the bleed ' +
  'valve is closed, and on a bleed overtemperature.';

const HpValveStuckClosedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1HpValveStuckClosed,
    A380Failure.Eng2HpValveStuckClosed,
    A380Failure.Eng3HpValveStuckClosed,
    A380Failure.Eng4HpValveStuckClosed,
  ],
  detail: (engine): FailureDetail => ({
    whatItIs: HP_VALVE_DESCRIPTION,
    impact: [
      `The HP valve of engine ${engine} cannot open, so the engine bleeds from the IP stage only.`,
      'At high thrust the IP stage is enough and the valve would be closed anyway: nothing changes.',
      'At low thrust the bleed pressure can fall short; the bleed valve then closes by itself when the pressure upstream drops below 15 psi.',
    ],
    alertIds: [String(361800018 + engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR ENG ${engine} HP VLV NOT OPEN, ${ADVISORY}, when the HP valve stays closed for 5 s although it is ` +
          'commanded open (low thrust: IP pressure under 33.5 psi, HP stage pressure at least 15 psi, bleed valve open, no overtemperature); ' +
          `${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}. It has no procedure lines.`,
      },
      {
        where: 'SD STATUS',
        text: `INFO NO BLEED ${engine} AT LO ENG PWR, only while the alert is shown.`,
      },
      {
        where: 'SD BLEED',
        text:
          `${SD_BLEED_CALL_UP} The engine ${engine} HP valve symbol is drawn closed and the line from it to the ` +
          `duct is not drawn. ${SD_NEVER_AMBER_FOR_VALVES}`,
      },
    ],
    notSimulated: [AMBER_SYMBOL_NOT_SHOWN],
    logbook: { required: true, reason: `AIR ENG ${engine} HP VLV NOT OPEN advisory` },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Fan air valves
// ---------------------------------------------------------------------------------------------------------------------

const FAN_AIR_VALVE_DESCRIPTION =
  'Each engine has a precooler, an air-to-air heat exchanger downstream of the bleed valve, that cools the bleed air ' +
  'with air taken from the engine fan. The fan air valve meters that cooling air to hold the bleed at about 200 C, ' +
  'and down to 150 C when the wing anti-ice is off. It closes when there is no bleed pressure.';

const FanAirValveStuckOpenFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FanAirValveStuckOpen,
    A380Failure.Eng2FanAirValveStuckOpen,
    A380Failure.Eng3FanAirValveStuckOpen,
    A380Failure.Eng4FanAirValveStuckOpen,
  ],
  detail: (engine): FailureDetail => ({
    whatItIs: FAN_AIR_VALVE_DESCRIPTION,
    impact: [
      `The fan air valve of engine ${engine} stays fully open, so the precooler cools the bleed air as much as it can.`,
      'The bleed air then leaves the precooler too cold: at idle thrust in descent it falls below 150 C.',
      'Cold bleed air matters for the wing anti-ice, so the alert watches it only with the WING A-ICE pushbutton ON, in flight.',
    ],
    alertIds: [String(361800022 + engine), bleedOffAlertId(engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR ENG BLEED TEMP LO ON BLEED ${engine}, ${CAUTION}, in flight with the WING A-ICE pushbutton ON, when ` +
          `the bleed valve is open and the bleed stays below 150 C for 60 s; ${NOT_SHOWN_PHASES_1_TO_7_AND_10_TO_12}. ` +
          `Its lines are ENG THRUST INCREASE, then under IF NOT SUCCESSFUL : ENG ${engine} BLEED OFF when this is ` +
          'the only bleed too cold, or WING A-ICE OFF, ENGs A-ICE AS RQRD and AVOID ICING CONDs when more than one ' +
          'bleed is too cold.',
      },
      {
        where: 'E/WD',
        text:
          `Once the ${pushbuttonOf(engine)} or the WING A-ICE is OFF, the alert stays until both are back ON or the ` +
          'aircraft lands, even when the temperature recovers.',
      },
      bleedOffBullet(engine, 'asked by the line ENG BLEED OFF of TEMP LO when this is the only bleed too cold'),
      {
        where: 'SD STATUS',
        text:
          `What the crew has set OFF is listed as inoperative while the alert is shown: ENG ${engine} BLEED, PACK ` +
          `${packOf(engine)} and WING A-ICE. With more than one bleed too cold, LIMITATION AVOID ICING CONDs also ` +
          'appears, on the PFD too.',
      },
      {
        where: 'SD BLEED',
        text:
          `${SD_BLEED_CALL_UP} The temperature readout of engine ${engine} turns amber below 150 C, with or without ` +
          'the WING A-ICE pushbutton ON.',
      },
    ],
    notSimulated: [
      'The second trigger of the alert (wing anti-ice air below 150 C) is not simulated.',
      'AIR ABNORM BLEED CONFIG does not follow this alert.',
    ],
    logbook: { required: true, reason: 'AIR ENG BLEED TEMP LO caution in flight with wing anti-ice' },
    clearing:
      `${MAINTENANCE_ONLY} The alert stays after the restore while the ${pushbuttonOf(engine)} or the WING A-ICE ` +
      'that the crew set OFF is still OFF, until both are back ON or the aircraft lands; the pushbuttons stay as set.',
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Crossbleed valves
// ---------------------------------------------------------------------------------------------------------------------

const CROSSBLEED_DESCRIPTION =
  'A crossbleed duct joins the left and right bleed systems through three valves: the left valve joins the ducts of ' +
  'engines 1 and 2, the right valve those of engines 3 and 4, and the center valve joins the left and right sides. At ' +
  'AUTO they are normally closed and open together on the ground at engine start, when the APU bleed valve is open and ' +
  'when an engine bleed system fails. The XBLEED selector can open or shut them all.';

/** Left, center and right valve, position 1 to 3 */
const CROSSBLEED_NAMES = ['left', 'center', 'right'];
const CROSSBLEED_INOP_SYS = ['L XBLEED', 'CTR XBLEED', 'R XBLEED'];
const XBLEED_FAULT_ALERT = '361800033';

const CROSSBLEED_STATUS_BULLET = (valve: number) => ({
  where: 'SD STATUS',
  text: `INOP SYS ${CROSSBLEED_INOP_SYS[valve - 1]}, only while the alert is shown.`,
});

const CROSSBLEED_SD_COMMON =
  'The crossbleed valve symbols are always green: the abnormal position is shown by the E/WD alert only.';

const CROSSBLEED_STUCK_CLOSED_TOPOLOGY = [
  'The APU air, which enters the duct of engine 1, cannot reach the duct of engine 2.',
  'The left and right bleed systems cannot be joined, so the APU air and the air of engines 1 and 2 cannot reach the ducts of engines 3 and 4, nor the other way round.',
  'The duct of engine 3 cannot get air from the duct of engine 4.',
];

/** The engines that cannot be started on the ground: the valve is the only link of their duct to the other sources */
const STARTS_BLOCKED_BY_CLOSED_VALVE = [[2], [3, 4], [3]];

const CROSSBLEED_STUCK_CLOSED_START = [
  'On the ground engine 2 cannot be started: its duct has no other link to the APU, the ground air or engine 1.',
  'On the ground engines 3 and 4 cannot be started: they are cut off from the APU, the ground air and engines 1 and 2.',
  'On the ground engine 3 cannot be started: the APU reaches engine 4 through the center valve, but engine 3 only through this one.',
];

const CROSSBLEED_STUCK_OPEN_LEAKS = [
  'a leak at engine 1 or 2 (its pylon duct or wing zone)',
  'a leak at engine 1 or 4 (its pylon duct or outer wing zone)',
  'a leak at engine 3 or 4 (its pylon duct or wing zone)',
];

const CrossBleedValveStuckClosedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.LeftXBleedValveStuckClosed,
    A380Failure.CenterXBleedValveStuckClosed,
    A380Failure.RightXBleedValveStuckClosed,
  ],
  detail: (valve): FailureDetail => ({
    whatItIs: CROSSBLEED_DESCRIPTION,
    impact: [
      `The ${CROSSBLEED_NAMES[valve - 1]} crossbleed valve stays closed, so the ducts it joins stay apart whenever the crossbleed is asked to open.`,
      CROSSBLEED_STUCK_CLOSED_TOPOLOGY[valve - 1],
      CROSSBLEED_STUCK_CLOSED_START[valve - 1],
      'Nothing shows while the crossbleed is closed at AUTO: the fault appears only when the valves are asked to open.',
    ],
    alertIds: [XBLEED_FAULT_ALERT, ...startFaultAlertIds(STARTS_BLOCKED_BY_CLOSED_VALVE[valve - 1])],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR XBLEED FAULT, ${CAUTION}, about 10 s after the valves are commanded open and this one stays closed: ` +
          'engine start on the ground, APU bleed valve open, an ENG BLEED pushbutton OFF or a bleed fault at AUTO, ' +
          `or the XBLEED selector at OPEN; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. A stuck valve gives no procedure lines. ` +
          'The command counts only while its motor is powered (DC 2 for AUTO, DC ESS for the selector).',
      },
      CROSSBLEED_STATUS_BULLET(valve),
      startFaultBullet(STARTS_BLOCKED_BY_CLOSED_VALVE[valve - 1]),
      { where: 'SD BLEED', text: `${SD_BLEED_CALL_UP} The valve symbol stays closed. ${CROSSBLEED_SD_COMMON}` },
    ],
    notSimulated: [AMBER_SYMBOL_NOT_SHOWN],
    logbook: { required: true, reason: 'AIR XBLEED FAULT caution when the crossbleed is asked to open' },
    clearing:
      `${MAINTENANCE_ONLY} The alert also goes out once nothing asks the crossbleed open, or when the XBLEED ` +
      'selector is set to SHUT.',
  }),
};

const CrossBleedValveStuckOpenFamily: FailureDetailFamily = {
  ids: [
    A380Failure.LeftXBleedValveStuckOpen,
    A380Failure.CenterXBleedValveStuckOpen,
    A380Failure.RightXBleedValveStuckOpen,
  ],
  detail: (valve): FailureDetail => ({
    whatItIs: CROSSBLEED_DESCRIPTION,
    impact: [
      `The ${CROSSBLEED_NAMES[valve - 1]} crossbleed valve stays open, so the ducts it joins stay connected although the crossbleed is closed at AUTO.`,
      `For ${CROSSBLEED_STUCK_OPEN_LEAKS[valve - 1]}, the valve cannot be closed to isolate it: the leak alert then also asks XBLEED CLOSE.`,
      'Seen at once: at AUTO the valves are commanded closed unless something asks them open.',
    ],
    alertIds: [XBLEED_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR XBLEED FAULT, ${CAUTION}, about 10 s after the valves are commanded closed and this one stays open: ` +
          `XBLEED at AUTO with nothing asking the crossbleed open, or the selector at SHUT; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. A stuck valve gives no procedure lines. The command counts only while its ` +
          'motor is powered (DC 2 for AUTO, DC ESS for the selector). The alert goes out while the valves are ' +
          'commanded open (engine start on the ground, APU bleed, bleed fault, selector at OPEN).',
      },
      CROSSBLEED_STATUS_BULLET(valve),
      { where: 'SD BLEED', text: `${SD_BLEED_CALL_UP} The valve symbol stays open. ${CROSSBLEED_SD_COMMON}` },
    ],
    notSimulated: [AMBER_SYMBOL_NOT_SHOWN],
    logbook: { required: true, reason: 'AIR XBLEED FAULT caution with the crossbleed at AUTO' },
    clearing:
      `${MAINTENANCE_ONLY} Setting the XBLEED selector to OPEN also ends the alert, because the valve is then where ` +
      'it is commanded, but it opens the other two valves too.',
  }),
};

export const Ata36ValvesEntries: Record<number, FailureDetail> = {
  [A380Failure.ApuBleedValveStuckClosed]: ApuBleedValveStuckClosedDetail,
  [A380Failure.ApuBleedValveStuckOpen]: ApuBleedValveStuckOpenDetail,
};

export const Ata36ValvesFamilies: FailureDetailFamily[] = [
  EngineBleedValveStuckClosedFamily,
  EngineBleedValveStuckOpenFamily,
  HpValveStuckClosedFamily,
  FanAirValveStuckOpenFamily,
  CrossBleedValveStuckClosedFamily,
  CrossBleedValveStuckOpenFamily,
];
