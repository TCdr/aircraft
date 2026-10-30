// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const CAUTION = 'an amber caution with master caution and single chime';
const WARNING = 'a red warning with master warning and continuous chime';

const STATUS_NOTE = 'while the alert is shown';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const SD_BLEED_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (shown in phases 1, 2, 8, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** AIR BLEED LEAK is inhibited in flight phases 5, 6 and 10 */
const NOT_SHOWN_PHASES_5_6_10 =
  'a new alert is not shown from V1 on take-off to 400 ft, nor from touch down until the landing roll is below 80 kt';

const IN_FLIGHT_ONLY_60_S =
  'a new alert shows only in flight above 1,500 ft in the climb, in cruise and in the descent down to 800 ft, and ' +
  'only once the aircraft has been in that part of the flight for 60 s';

const IN_FLIGHT_ONLY =
  'a new alert shows only in flight above 1,500 ft in the climb, in cruise and in the descent down to 800 ft';

const HOLDS_UNTIL_PB_OFF =
  'The leak signal is held: it stays after the failure is restored, and so do the alert, the closed valves and the ' +
  'FAULT light, until the pushbutton named in the alert is set OFF and the duct air is back to normal.';

const HOT_AIR_NOT_SIMULATED = 'The hot air escaping from the duct does not heat or damage its surroundings.';

const AVOID_ICING_STATUS =
  'In flight with both bleeds of one side lost, the limitation AVOID ICING CONDs is also listed, in all phases and on the PFD';

const AVOID_ICING_STATUS_SIDE =
  'In flight with both bleeds of that side lost, the limitation AVOID ICING CONDs is also listed, in all phases and on the PFD';

/** The WING A-ICE lines of the leak alerts, shown in flight */
const WING_ANTI_ICE_LINES = 'WING A-ICE OFF, ENGs A-ICE AS RQRD and AVOID ICING CONDs';

const WING_ZONES = ['left outer wing', 'left inner wing', 'right inner wing', 'right outer wing'];
const WING_ZONE_TITLES = ['L OUTR WING', 'L INR WING', 'R INR WING', 'R OUTR WING'];

// ---------------------------------------------------------------------------------------------------------------------
// Engine pylon and wing bleed duct leaks
// ---------------------------------------------------------------------------------------------------------------------

/**
 * @param engine the engine, 1 to 4 (the wing zone of an engine is the wing section of that engine)
 * @param wing true for the wing duct, false for the pylon duct
 * @returns the detail of the leak
 */
const engineZoneLeakDetail = (engine: number, wing: boolean): FailureDetail => {
  const outer = engine === 1 || engine === 4;
  const side = engine <= 2 ? 'left' : 'right';
  const pack = engine <= 2 ? 1 : 2;
  const zone = WING_ZONES[engine - 1];
  const title = wing ? `AIR ${WING_ZONE_TITLES[engine - 1]} LEAK` : `AIR ENG ${engine} BLEED LEAK`;
  const alertId = String((wing ? 361800009 : 361800005) + engine - 1);
  const crossbleeds = outer ? `the ${side} and the centre crossbleed valves` : `the ${side} crossbleed valve`;
  const detection = wing
    ? 'holds air above 124 deg C: its own bleed or, with the engines stopped, the APU bleed (directly for the left outer ' +
      'wing, through open crossbleed valves for the others, for instance during an engine start)'
    : 'holds air above 180 deg C, in practice with the engine running and its bleed supplying air';
  return {
    whatItIs: wing
      ? `The bleed air of engine ${engine} flows from the precooler through the duct of the ${zone} to the packs and the ` +
        'wing anti-ice. Leak detection loops run along that duct and report hot air escaping from it.'
      : `The bleed duct of engine ${engine} runs from the engine through its pylon to the precooler. Leak detection ` +
        'loops run along the pylon duct and report hot air escaping from it.',
    impact: [
      `Engine ${engine} bleed valve closes by itself once the leak is detected: engine ${engine} supplies no bleed air.`,
      `With the crossbleed selector at AUTO, ${crossbleeds} close for the leak.`,
      `The packs and the wing anti-ice depend on the remaining bleeds${
        outer
          ? '; the procedure turns WING A-ICE off in flight.'
          : '; the procedure turns WING A-ICE off in flight when both bleeds of the side are lost.'
      }`,
    ],
    alertIds: [alertId, '361800014', String(211800051 + engine), pack === 1 ? '211800011' : '211800012'],
    effects: [
      {
        where: 'E/WD',
        text:
          `${title}, ${CAUTION}, once the ${wing ? 'wing' : 'pylon'} duct is pressurised and ${detection}; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}.`,
      },
      {
        where: 'E/WD',
        text:
          `Lines: before any engine start on the ground ENG 1, 2, 3 and 4 MASTER : KEEP OFF; with an engine running ` +
          `ENG ${engine} BLEED OFF while the bleed valve is open or the pushbutton is OFF (ticked once OFF), PACK ${pack} ` +
          'OFF with two or more bleeds lost, XBLEED CLOSE while a crossbleed valve that has to close is open' +
          `${engine === 1 && wing ? ' (with APU BLEED OFF under it)' : ''}; in flight ${
            outer ? '' : 'with both bleeds of the side lost '
          }${WING_ANTI_ICE_LINES}; AIR LEAK ISOLATED once the bleed valve and those crossbleed valves are closed.`,
      },
      {
        where: 'E/WD',
        text:
          `With the XBLEED selector at OPEN the crossbleed valves stay open and AIR BLEED LEAK shows too, ${WARNING}, ` +
          `with the line XBLEED CLOSE; ${NOT_SHOWN_PHASES_5_6_10}.`,
      },
      {
        where: 'Overhead AIR panel',
        text: `The FAULT light of the ENG ${engine} BLEED pushbutton comes on.`,
      },
      {
        where: 'E/WD',
        text:
          `Setting the ENG ${engine} BLEED pushbutton OFF with the engine running raises AIR ENG ${engine} BLEED OFF, ` +
          `${CAUTION}, which lists ENG ${engine} BLEED as inoperative; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; it stays until the ` +
          `pushbutton is back to AUTO. Setting PACK ${pack} OFF, when the procedure asks for it, raises AIR PACK ${pack} ` +
          `OFF, ${CAUTION}; ${IN_FLIGHT_ONLY_60_S}.`,
      },
      {
        where: 'SD BLEED',
        text:
          `The bleed valve and the HP valve of engine ${engine} are drawn closed; the duct line goes out once no other source feeds it. The ` +
          'pressure digit turns amber at 4 psi or below and the temperature digit below 150 deg C. ' +
          SD_BLEED_CALL_UP,
      },
      {
        where: 'SD STATUS',
        text:
          `Not on the ground before an engine start: ENG ${engine} BLEED and ENG ${engine} STARTER are listed as ` +
          `inoperative${wing && engine === 1 ? ', with APU BLEED' : ''}, PACK ${pack} when ${
            outer ? 'it is set OFF' : 'two or more bleeds are lost'
          }, and WING A-ICE in flight${outer ? '' : ' with both bleeds of the side lost'}. ${AVOID_ICING_STATUS_SIDE}, ` +
          `${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [HOT_AIR_NOT_SIMULATED, 'The pack valve fed by the leaking engine duct does not close by itself.'],
    logbook: { required: true, reason: 'caution, FAULT light and a lost engine bleed' },
    clearing:
      `Maintenance only: use Restore. ${HOLDS_UNTIL_PB_OFF} Set the ENG ${engine} BLEED pushbutton OFF and back to ` +
      'AUTO: the bleed valve and the crossbleed valves then follow their automatic control again.',
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// APU bleed duct leak
// ---------------------------------------------------------------------------------------------------------------------

const apuBleedLeak: FailureDetail = {
  whatItIs:
    'The APU bleed duct takes the compressed air of the APU through the APU bleed valve and the APU isolation valve to ' +
    'the bleed network. Leak detection loops along it report hot air escaping from the duct.',
  impact: [
    'The APU bleed valve and the APU isolation valve close by themselves once the leak is detected.',
    'No APU bleed air is available any more; at AUTO the crossbleed valves close with it.',
  ],
  alertIds: ['361800013', '211800011', '211800012'],
  effects: [
    {
      where: 'E/WD',
      text:
        `AIR APU BLEED LEAK, ${CAUTION}, once the APU duct is pressurised with air above 124 deg C, so with the APU ` +
        `running and the APU bleed valve open; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}.`,
    },
    {
      where: 'E/WD',
      text:
        'Lines: before any engine start on the ground ENG 1, 2, 3 and 4 MASTER LEVER : KEEP OFF; APU BLEED OFF while the ' +
        'APU bleed valve is open or the pushbutton is not ON (ticked once OFF); PACK 1 or PACK 2 OFF with an engine ' +
        'running and two or more bleeds lost (the pack of the side with more lost bleeds, PACK 1 on a tie); in flight ' +
        `with both bleeds of one side lost ${WING_ANTI_ICE_LINES}; AIR LEAK ISOLATED once the APU bleed valve is closed.`,
    },
    {
      where: 'Overhead AIR panel',
      text: 'The FAULT light of the APU BLEED pushbutton comes on.',
    },
    {
      where: 'E/WD',
      text: `When the procedure sets a pack OFF, AIR PACK 1 OFF or AIR PACK 2 OFF shows, ${CAUTION}; ${IN_FLIGHT_ONLY_60_S}.`,
    },
    {
      where: 'SD BLEED',
      text: `The APU bleed valve symbol turns amber: it is closed with the APU available and the pushbutton ON. ${SD_BLEED_CALL_UP}`,
    },
    {
      where: 'SD STATUS',
      text:
        'Not on the ground before an engine start: APU BLEED is listed as inoperative, and PACK 1 or PACK 2 once set OFF. ' +
        `${AVOID_ICING_STATUS}, ${STATUS_NOTE}.`,
    },
  ],
  notSimulated: [HOT_AIR_NOT_SIMULATED],
  logbook: { required: true, reason: 'caution, FAULT light and APU bleed lost' },
  clearing: `Maintenance only: use Restore. ${HOLDS_UNTIL_PB_OFF} Set the APU BLEED pushbutton OFF; the APU bleed valve stays closed until it is selected ON again.`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Pack bay leaks
// ---------------------------------------------------------------------------------------------------------------------

const packBayLeakDetail = (pack: number): FailureDetail => {
  const side = pack === 1 ? 'left' : 'right';
  const engines = pack === 1 ? '1 and 2' : '3 and 4';
  return {
    whatItIs:
      `Pack ${pack} sits in its pack bay and is supplied with the bleed air of the ${side} engines (${engines}) through ` +
      'its two pack flow valves. A leak detection loop in the bay reports hot air escaping from the pack inlet duct.',
    impact: [
      `The two pack flow valves of pack ${pack} close by themselves once the leak is detected: pack ${pack} gives no air.`,
      `Hot air valve ${pack} closes too, so the trim air of the zones it feeds gets no hot air.`,
      'The other pack keeps its own valves and supply.',
    ],
    alertIds: [String(361800030 + pack), String(211800010 + pack)],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR PACK ${pack} LEAK, ${CAUTION}, once the pack inlet is pressurised with air above 124 deg C, so with the ` +
          `pack valves open and bleed air flowing; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}.`,
      },
      {
        where: 'E/WD',
        text:
          `Lines: PACK ${pack} OFF while a pack valve of the pack is open or the pushbutton is not ON (ticked once OFF); ` +
          `in flight with both bleeds of one side lost ${WING_ANTI_ICE_LINES}; AIR LEAK ISOLATED once both pack valves ` +
          'are closed.',
      },
      {
        where: 'Overhead AIR panel',
        text: `The FAULT light of the PACK ${pack} pushbutton comes on; the HOT AIR ${pack} FAULT light stays off.`,
      },
      {
        where: 'E/WD',
        text:
          `With the PACK ${pack} pushbutton set OFF, AIR PACK ${pack} OFF shows, ${CAUTION}, and lists PACK ${pack} as ` +
          `inoperative; ${IN_FLIGHT_ONLY_60_S}.`,
      },
      {
        where: 'SD BLEED',
        text: `The PACK ${pack} symbol and its lines turn amber once it has no flow, and the hot air valve ${pack} is drawn closed in amber. ${SD_BLEED_CALL_UP}`,
      },
      {
        where: 'SD STATUS',
        text:
          `PACK ${pack} is listed as inoperative in all phases, and WING A-ICE in flight with both bleeds of one side ` +
          `lost. ${AVOID_ICING_STATUS}, ${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [HOT_AIR_NOT_SIMULATED],
    logbook: { required: true, reason: 'caution, FAULT light and a pack lost' },
    clearing: `Maintenance only: use Restore. ${HOLDS_UNTIL_PB_OFF} Set the PACK ${pack} pushbutton OFF and back ON to bring the pack back.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Hot air duct leaks and forward cargo duct leak
// ---------------------------------------------------------------------------------------------------------------------

const hotAirStatusEffect = (hotAir: number): string =>
  `Temperature regulation is degraded: with this hot air valve closed alone CAB PART TEMP REGUL and ${
    hotAir === 1 ? 'FWD CRG TEMP REGUL' : 'CKPT TEMP REGUL'
  } are listed as inoperative, with ALL ZONES TEMP REGUL instead when both hot air valves are closed, and the ` +
  `information CABIN TEMP REGUL DEGRADED${
    hotAir === 1 ? ' (with FWD CRG TEMP REGUL DEGRADED while hot air valve 1 alone is closed)' : ''
  }. PACK ${hotAir} is listed too while the hot air valve stays open`;

const hotAirLeakDetail = (hotAir: number): FailureDetail => {
  const side = hotAir === 1 ? 'left' : 'right';
  return {
    whatItIs:
      `Hot air valve ${hotAir} takes bleed air from the ${side} side and sends it through the hot air ducts to the trim ` +
      'air valves, which warm the cockpit, cabin and forward cargo zones it feeds. A leak detection loop along the ducts ' +
      'reports hot air escaping.',
    impact: [
      `Hot air valve ${hotAir} closes by itself once the leak is detected: its trim air ducts get no hot air.`,
      'The temperature regulation of the zones fed by it is degraded; the packs keep running.',
    ],
    alertIds: [String(361800027 + hotAir), String(211800045 + hotAir)],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR HOT AIR ${hotAir} LEAK, ${CAUTION}, once the hot air valve is open and the ducts are pressurised with air ` +
          `above 124 deg C; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. Lines: HOT AIR ${hotAir} OFF while ` +
          'the valve is open or the pushbutton is not ON (ticked once OFF); AIR LEAK ISOLATED once the valve is closed.',
      },
      {
        where: 'Overhead AIR panel',
        text: `The FAULT light of the HOT AIR ${hotAir} pushbutton comes on.`,
      },
      {
        where: 'E/WD',
        text:
          `With the HOT AIR ${hotAir} pushbutton set OFF, COND HOT AIR ${hotAir} OFF shows, ${CAUTION}; ` +
          `${IN_FLIGHT_ONLY}.`,
      },
      {
        where: 'SD BLEED',
        text: `The hot air valve ${hotAir} is drawn closed in amber. ${SD_BLEED_CALL_UP}`,
      },
      { where: 'SD STATUS', text: `${hotAirStatusEffect(hotAir)}, ${STATUS_NOTE}.` },
    ],
    notSimulated: [HOT_AIR_NOT_SIMULATED],
    logbook: { required: true, reason: 'caution, FAULT light and degraded temperature regulation' },
    clearing: `Maintenance only: use Restore. ${HOLDS_UNTIL_PB_OFF} Set the HOT AIR ${hotAir} pushbutton OFF and back ON to bring the valve back.`,
  };
};

const forwardCargoDuctLeak: FailureDetail = {
  whatItIs:
    'The forward cargo compartment is warmed by trim air taken from hot air valve 1. A leak detection loop along its ' +
    'hot air duct reports hot air escaping.',
  impact: [
    'Hot air valve 1 closes by itself once the leak is detected: the trim air of the zones it feeds gets no hot air.',
    'The forward cargo temperature regulation is degraded along with the cabin zones fed by it; the packs keep running.',
  ],
  alertIds: ['361800027', '211800046'],
  effects: [
    {
      where: 'E/WD',
      text:
        `AIR FWD CARGO DUCT LEAK, ${CAUTION}, once hot air valve 1 is open and the duct is pressurised with air above ` +
        `124 deg C; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. Lines: HOT AIR 1 OFF while the valve is open ` +
        'or the pushbutton is not ON (ticked once OFF); AIR LEAK ISOLATED once the valve is closed. It is a separate ' +
        'alert from AIR HOT AIR 1 LEAK.',
    },
    {
      where: 'Overhead AIR panel',
      text: 'The FAULT light of the HOT AIR 1 pushbutton comes on.',
    },
    {
      where: 'E/WD',
      text: `With the HOT AIR 1 pushbutton set OFF, COND HOT AIR 1 OFF shows, ${CAUTION}; ${IN_FLIGHT_ONLY}.`,
    },
    {
      where: 'SD BLEED',
      text: `The hot air valve 1 is drawn closed in amber. ${SD_BLEED_CALL_UP}`,
    },
    { where: 'SD STATUS', text: `${hotAirStatusEffect(1)}, ${STATUS_NOTE}.` },
  ],
  notSimulated: [HOT_AIR_NOT_SIMULATED],
  logbook: { required: true, reason: 'caution, FAULT light and degraded temperature regulation' },
  clearing: `Maintenance only: use Restore. ${HOLDS_UNTIL_PB_OFF} Set the HOT AIR 1 pushbutton OFF and back ON to bring the valve back.`,
};

export const Ata36LeaksEntries: Record<number, FailureDetail> = {
  [A380Failure.ApuBleedLeak]: apuBleedLeak,
  [A380Failure.FwdCargoBleedDuctLeak]: forwardCargoDuctLeak,
};

export const Ata36LeaksFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.Eng1PylonBleedLeak,
      A380Failure.Eng2PylonBleedLeak,
      A380Failure.Eng3PylonBleedLeak,
      A380Failure.Eng4PylonBleedLeak,
    ],
    detail: (number) => engineZoneLeakDetail(number, false),
  },
  {
    ids: [
      A380Failure.LeftOuterWingBleedLeak,
      A380Failure.LeftInnerWingBleedLeak,
      A380Failure.RightInnerWingBleedLeak,
      A380Failure.RightOuterWingBleedLeak,
    ],
    detail: (number) => engineZoneLeakDetail(number, true),
  },
  { ids: [A380Failure.Pack1BayLeak, A380Failure.Pack2BayLeak], detail: packBayLeakDetail },
  { ids: [A380Failure.HotAir1DuctLeak, A380Failure.HotAir2DuctLeak], detail: hotAirLeakDetail },
];
