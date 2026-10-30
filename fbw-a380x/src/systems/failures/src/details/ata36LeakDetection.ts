// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';

/** Alerts inhibited in flight phases 3 to 7, 9, 10 and 11 (AIR LEAK DET FAULT) */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is shown only on the ground before take-off power, in flight from 1,500 ft after take-off until 800 ft ' +
  'on approach, and after engine shutdown';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const SD_BLEED_CALL_UP =
  'The page is called up when the alert first appears, unless another page was selected; it draws nothing for the ' +
  'lost detection.';

const LEAK_DET_FAULT_ALERT = '361800030';

const SYSTEMS_DESCRIPTION =
  'Two bleed leak detection systems, 1 and 2, watch the bleed ducts for hot air. Every monitored duct has a dual ' +
  'loop, one loop connected to each system, and the leak alert comes when both loops see the overheat, or when one ' +
  'sees it and the other is inoperative.';

const DUAL_LOOP_NOT_SIMULATED =
  'Losing only one loop of a dual loop, with the other loop still detecting, cannot be simulated.';

/** Why the zone, not its leak, is what the crew sees */
const HELD_LEAK_IMPACT =
  'A leak of this duct is neither detected nor isolated, and a leak that was already isolated is released at the ' +
  'moment the detection is lost, except for valves the crew set OFF with their pushbutton, which stay closed.';

const RESTORE_REDETECTS =
  'A leak that is still there is detected and isolated again while its duct is pressurised; valves the crew set OFF ' +
  'stay closed.';

const leakDetFaultBullet = (line: string) => ({
  where: 'E/WD',
  text:
    `AIR LEAK DET FAULT, ${ADVISORY}, as soon as the detection of the duct is lost, with the amber line ON ${line} ` +
    `(one line for each duct that lost its detection, none when it is lost on every duct); ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}; ${ALREADY_SHOWN_STAYS}. ` +
    'It is crew awareness only and has no actions.',
});

const sdBleedBullet = { where: 'SD BLEED', text: SD_BLEED_CALL_UP };

const statusBullet = (inop: string) => ({
  where: 'SD STATUS',
  text:
    `${inop} is listed as inoperative in all phases, while the alert is shown (AIR LEAK DET instead of the single ` +
    'duct names when the detection is lost on every duct).',
});

const panelFaultBullet = (light: string, what: string) => ({
  where: 'Overhead AIR panel',
  text: `The ${light} pb-sw FAULT light does not come on for ${what} while the detection is lost.`,
});

const ZONE_PLAIN = 'The detection of this duct is the only one lost; the other ducts keep theirs.';

// ---------------------------------------------------------------------------------------------------------------
// Engine pylon and wing ducts
// ---------------------------------------------------------------------------------------------------------------

const PYLON_LEAK_ALERTS = [
  'AIR ENG 1 BLEED LEAK',
  'AIR ENG 2 BLEED LEAK',
  'AIR ENG 3 BLEED LEAK',
  'AIR ENG 4 BLEED LEAK',
];

const pylonDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${SYSTEMS_DESCRIPTION} The loops of the engine ${engine} pylon follow the bleed duct that runs in the pylon and ` +
    'react to an ambient overheat above 180 °C, a higher threshold than elsewhere.',
  impact: [
    `${ZONE_PLAIN} ${HELD_LEAK_IMPACT}`,
    `A leak of the engine ${engine} pylon duct then raises no ${PYLON_LEAK_ALERTS[engine - 1]} (nor AIR BLEED LEAK with the XBLEED selector OPEN): the engine ${engine} bleed valve and the crossbleed valves are not closed for it and the duct keeps venting.`,
    'The wing zone of the same engine has its own loops: a leak there is still detected.',
  ],
  alertIds: [LEAK_DET_FAULT_ALERT],
  effects: [
    leakDetFaultBullet(`ENG ${engine} BLEED`),
    sdBleedBullet,
    statusBullet(`ENG ${engine} BLEED LEAK DET`),
    {
      where: 'Overhead AIR panel',
      text: `The ENG ${engine} BLEED pb-sw FAULT light does not come on for a leak of the pylon duct while the detection is lost.`,
    },
  ],
  notSimulated: [DUAL_LOOP_NOT_SIMULATED],
  logbook: { required: true, reason: 'leak detection fault advisory' },
  clearing: `${MAINTENANCE_ONLY} ${RESTORE_REDETECTS}`,
});

/** Wing zones in the order of the failure ids: left outer, left inner, right inner, right outer (engines 1, 2, 3, 4) */
const WING_ZONES = [
  { name: 'L OUTR WING', alert: 'AIR L OUTR WING LEAK', engine: 1, side: 'left outer' },
  { name: 'L INR WING', alert: 'AIR L INR WING LEAK', engine: 2, side: 'left inner' },
  { name: 'R INR WING', alert: 'AIR R INR WING LEAK', engine: 3, side: 'right inner' },
  { name: 'R OUTR WING', alert: 'AIR R OUTR WING LEAK', engine: 4, side: 'right outer' },
];

const wingDetail = (position: number): FailureDetail => {
  const zone = WING_ZONES[position - 1];
  return {
    whatItIs:
      `${SYSTEMS_DESCRIPTION} The loops of the ${zone.side} wing follow the bleed duct of that wing area, fed by ` +
      `engine ${zone.engine}, and react to an ambient overheat above 124 °C.`,
    impact: [
      `${ZONE_PLAIN} ${HELD_LEAK_IMPACT}`,
      `A leak in the ${zone.side} wing then raises no ${zone.alert} (nor AIR BLEED LEAK with the XBLEED selector OPEN): the engine ${zone.engine} bleed valve and the crossbleed valves are not closed for it and the duct keeps venting.`,
      `The pylon duct of engine ${zone.engine} has its own loops: a leak there is still detected.`,
    ],
    alertIds: [LEAK_DET_FAULT_ALERT],
    effects: [
      leakDetFaultBullet(zone.name),
      sdBleedBullet,
      statusBullet(`${zone.name} LEAK DET`),
      {
        where: 'Overhead AIR panel',
        text: `The ENG ${zone.engine} BLEED pb-sw FAULT light does not come on for a leak of the ${zone.side} wing while the detection is lost.`,
      },
    ],
    notSimulated: [DUAL_LOOP_NOT_SIMULATED],
    logbook: { required: true, reason: 'leak detection fault advisory' },
    clearing: `${MAINTENANCE_ONLY} ${RESTORE_REDETECTS}`,
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Other ducts
// ---------------------------------------------------------------------------------------------------------------

const apuDetail: FailureDetail = {
  whatItIs:
    `${SYSTEMS_DESCRIPTION} The loops of the APU bleed duct react to an ambient overheat above 124 °C and, with a ` +
    'leak, make the APU bleed source close.',
  impact: [
    `${ZONE_PLAIN} ${HELD_LEAK_IMPACT}`,
    'A leak of the APU bleed duct then raises no AIR APU BLEED LEAK: the APU bleed valve and the APU isolation valve are not closed for it.',
  ],
  alertIds: [LEAK_DET_FAULT_ALERT],
  effects: [
    leakDetFaultBullet('APU BLEED'),
    sdBleedBullet,
    statusBullet('APU BLEED LEAK DET'),
    panelFaultBullet('APU BLEED', 'a leak of the APU bleed duct'),
  ],
  notSimulated: [DUAL_LOOP_NOT_SIMULATED],
  logbook: { required: true, reason: 'leak detection fault advisory' },
  clearing: `${MAINTENANCE_ONLY} ${RESTORE_REDETECTS}`,
};

const packBayDetail = (pack: number): FailureDetail => ({
  whatItIs:
    `${SYSTEMS_DESCRIPTION} The loops of the pack ${pack} bay react to an ambient overheat above 124 °C and, with a ` +
    'leak, make the pack valves close.',
  impact: [
    `${ZONE_PLAIN} ${HELD_LEAK_IMPACT}`,
    `A leak in the pack ${pack} bay then raises no AIR PACK ${pack} LEAK: the pack ${pack} valves and the hot-air valve of that side are not closed for it.`,
  ],
  alertIds: [LEAK_DET_FAULT_ALERT],
  effects: [
    leakDetFaultBullet(`PACK ${pack}`),
    sdBleedBullet,
    statusBullet(`PACK ${pack} LEAK DET`),
    panelFaultBullet(`PACK ${pack}`, `a leak in the pack ${pack} bay`),
  ],
  notSimulated: [DUAL_LOOP_NOT_SIMULATED],
  logbook: { required: true, reason: 'leak detection fault advisory' },
  clearing: `${MAINTENANCE_ONLY} ${RESTORE_REDETECTS}`,
});

const hotAirDetail = (hotAir: number): FailureDetail => ({
  whatItIs:
    `${SYSTEMS_DESCRIPTION} The loops of the hot-air duct ${hotAir} of the air conditioning react to an ambient ` +
    'overheat above 124 °C and, with a leak, make the hot-air valve close.',
  impact: [
    `${ZONE_PLAIN} ${HELD_LEAK_IMPACT}`,
    `A leak of the hot-air duct ${hotAir} then raises no AIR HOT AIR ${hotAir} LEAK: the hot-air valve ${hotAir} is not closed for it.`,
    ...(hotAir === 1
      ? ['The forward cargo duct has its own loops: its leak, which also closes hot-air valve 1, is still detected.']
      : []),
  ],
  alertIds: [LEAK_DET_FAULT_ALERT],
  effects: [
    leakDetFaultBullet(`HOT AIR ${hotAir}`),
    sdBleedBullet,
    statusBullet(`HOT AIR ${hotAir} LEAK DET`),
    panelFaultBullet(`HOT AIR ${hotAir}`, `a leak of the hot-air duct ${hotAir}`),
  ],
  notSimulated: [DUAL_LOOP_NOT_SIMULATED],
  logbook: { required: true, reason: 'leak detection fault advisory' },
  clearing: `${MAINTENANCE_ONLY} ${RESTORE_REDETECTS}`,
});

const fwdCargoDetail: FailureDetail = {
  whatItIs: `${SYSTEMS_DESCRIPTION} The loops of the forward cargo bleed duct react to an ambient overheat above 124 °C.`,
  impact: [
    `${ZONE_PLAIN} ${HELD_LEAK_IMPACT}`,
    'A leak of the forward cargo duct then raises no AIR FWD CARGO DUCT LEAK: hot-air valve 1 is not closed for it.',
  ],
  alertIds: [LEAK_DET_FAULT_ALERT],
  effects: [
    leakDetFaultBullet('FWD CARGO DUCT'),
    sdBleedBullet,
    statusBullet('FWD CRG LEAK DET'),
    panelFaultBullet('HOT AIR 1', 'a leak of the forward cargo duct'),
  ],
  notSimulated: [DUAL_LOOP_NOT_SIMULATED],
  logbook: { required: true, reason: 'leak detection fault advisory' },
  clearing: `${MAINTENANCE_ONLY} ${RESTORE_REDETECTS}`,
};

const aftCargoDetail: FailureDetail = {
  whatItIs: `${SYSTEMS_DESCRIPTION} The loops of the aft cargo bleed duct react to an ambient overheat above 124 °C.`,
  impact: [
    ZONE_PLAIN,
    'No leak of the aft cargo duct exists in the simulation, so losing its detection only brings the fault advisory.',
  ],
  alertIds: [LEAK_DET_FAULT_ALERT],
  effects: [leakDetFaultBullet('AFT CARGO DUCT'), sdBleedBullet, statusBullet('AFT CRG LEAK DET')],
  notSimulated: [DUAL_LOOP_NOT_SIMULATED],
  logbook: { required: true, reason: 'leak detection fault advisory' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------
// The two detection systems
// ---------------------------------------------------------------------------------------------------------------

const detectionSystemDetail = (system: number): FailureDetail => {
  const other = system === 1 ? 2 : 1;
  return {
    whatItIs: `${SYSTEMS_DESCRIPTION} This is bleed leak detection system ${system}, which holds one loop of every dual loop.`,
    impact: [
      `Alone, the failure changes nothing: every duct keeps its detection on the loop of system ${other}.`,
      `With system ${other} also failed, the detection is lost on every duct: no leak is detected or isolated.`,
    ],
    alertIds: [LEAK_DET_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          `Alone: no alert and no indication. With both systems failed: AIR LEAK DET FAULT, ${ADVISORY}, with no duct ` +
          `lines; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}; ${ALREADY_SHOWN_STAYS}. It is crew awareness only and has no actions.`,
      },
      { where: 'SD BLEED', text: `With both systems failed. ${SD_BLEED_CALL_UP}` },
      {
        where: 'SD STATUS',
        text: 'With both systems failed, AIR LEAK DET is listed as inoperative in all phases, while the alert is shown.',
      },
    ],
    logbook: { required: false, reason: 'no indication to report unless both systems fail' },
    clearing: `${MAINTENANCE_ONLY} Restoring either system brings the detection back on every duct. ${RESTORE_REDETECTS}`,
  };
};

// ---------------------------------------------------------------------------------------------------------------

export const Ata36LeakDetectionEntries: Record<number, FailureDetail> = {
  [A380Failure.ApuLeakDetectionDualLoop]: apuDetail,
  [A380Failure.FwdCargoLeakDetectionDualLoop]: fwdCargoDetail,
  [A380Failure.AftCargoLeakDetectionDualLoop]: aftCargoDetail,
};

export const Ata36LeakDetectionFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.Eng1PylonLeakDetectionDualLoop,
      A380Failure.Eng2PylonLeakDetectionDualLoop,
      A380Failure.Eng3PylonLeakDetectionDualLoop,
      A380Failure.Eng4PylonLeakDetectionDualLoop,
    ],
    detail: pylonDetail,
  },
  {
    ids: [
      A380Failure.LeftOuterWingLeakDetectionDualLoop,
      A380Failure.LeftInnerWingLeakDetectionDualLoop,
      A380Failure.RightInnerWingLeakDetectionDualLoop,
      A380Failure.RightOuterWingLeakDetectionDualLoop,
    ],
    detail: wingDetail,
  },
  {
    ids: [A380Failure.Pack1BayLeakDetectionDualLoop, A380Failure.Pack2BayLeakDetectionDualLoop],
    detail: packBayDetail,
  },
  {
    ids: [A380Failure.HotAir1LeakDetectionDualLoop, A380Failure.HotAir2LeakDetectionDualLoop],
    detail: hotAirDetail,
  },
  {
    ids: [A380Failure.BleedLeakDetectionSystem1, A380Failure.BleedLeakDetectionSystem2],
    detail: detectionSystemDetail,
  },
];
