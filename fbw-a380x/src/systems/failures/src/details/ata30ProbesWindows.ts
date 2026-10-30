// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const STATUS_NOTE = 'while the alert is shown';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const NO_PAGE_CALL_UP = 'It calls up no SD page.';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (shown in phases 1, 2, 8, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 6 and 9 to 11 (shown in phases 1, 2, 7, 8 and 12) */
const NOT_SHOWN_PHASES_3_TO_6_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 400 ft, nor from 800 ft on approach until the engines are shut down';

/** Alerts inhibited in flight phases 3 to 7, 9, 10 and 11 (shown in phases 1, 2, 8 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10_11 =
  'a new alert shows only on the ground before take-off thrust is set, in flight above 800 ft (climb above 1,500 ft, ' +
  'cruise and descent) and after the engines are shut down';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (shown in phases 1, 2, 3, 8, 11 and 12) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 3 to 11 (shown in phases 1, 2 and 12) */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert shows only on the ground before take-off thrust is set and after the engines are shut down';

/** The heater faults are only seen while the heating is demanded */
const HEATING_DEMANDED =
  'It is seen only while the heating is demanded: with an engine running, or with the PROBE/WINDOW HEAT pushbutton ON.';

const AIR_DATA_NOT_CHANGED = 'The air data do not change: the simulation has no probe icing.';

const WINDOW_NOT_SIMULATED =
  'An unheated window does not mist over, and the windshield does not ice up: the simulation only raises the alert.';

/** The AIR DATA SWTG line of the alerts of ADR 1 and 2 (ADR 3 has none) */
const AIR_DATA_SWITCHING_LINE = (adr: number): string =>
  adr === 1
    ? 'The line AIR DATA SWTG : CAPT ON 3 is ticked once the AIR DATA selector is there, and the ADIRS SWTG memo shows while it stays off NORM.'
    : adr === 2
      ? 'The line AIR DATA SWTG : F/O ON 3 is ticked once the AIR DATA selector is there, and the ADIRS SWTG memo shows while it stays off NORM.'
      : 'It has no procedure line.';

// ---------------------------------------------------------------------------------------------------------------------
// ADR probes
// ---------------------------------------------------------------------------------------------------------------------

const probeHeatingCommandDetail = (adr: number): FailureDetail => ({
  whatItIs:
    `Air data reference ${adr} heats its own probes (pitot, TAT and AOA probe, static probes and sideslip probe) ` +
    'automatically as soon as an engine runs; the PROBE/WINDOW HEAT pushbutton can also select the heating on.',
  impact: [
    `ADR ${adr} no longer commands the heating of its probes: with an engine running they are not heated.`,
    'Setting the PROBE/WINDOW HEAT pushbutton ON heats them directly, as long as their heaters work.',
    `A heater fault of ADR ${adr} is no longer seen while the command is lost.`,
  ],
  alertIds: [String(300800025 + adr)],
  effects: [
    {
      where: 'E/WD',
      text:
        `A-ICE ALL PROBES ${adr} NOT DEICED, ${CAUTION}, with an engine running or the PROBE/WINDOW HEAT pushbutton ON; ` +
        `${NOT_SHOWN_PHASES_3_TO_6_AND_9_TO_11}; ${ALREADY_SHOWN_STAYS}. ${NO_PAGE_CALL_UP}`,
    },
    {
      where: 'E/WD',
      text:
        adr < 3
          ? `The line PROBE & WINDOW HEAT : ON is ticked once the pushbutton is ON. If the probes are still not heated 3 s after ` +
            `that, the lines PROBES ${adr} STILL NOT DEICED and AIR DATA SWTG : ${adr === 1 ? 'CAPT' : 'F/O'} ON 3 appear; the ADIRS SWTG memo shows while the AIR DATA selector stays off NORM.`
          : 'The line PROBE & WINDOW HEAT : ON is ticked once the pushbutton is ON; this alert has no further line.',
    },
    {
      where: 'SD STATUS',
      text:
        `Only if the probes stay unheated after the pushbutton is ON: ADR ${adr} PROBES HEATG is listed as ` +
        'inoperative in all phases, CAT 3 DUAL for approach and landing, and the information CAT 3 SINGLE ONLY, ' +
        `${STATUS_NOTE}.`,
    },
  ],
  notSimulated: [
    `The unheated probes of ADR ${adr} do not ice up: ${AIR_DATA_NOT_CHANGED.charAt(0).toLowerCase()}${AIR_DATA_NOT_CHANGED.slice(1)}`,
  ],
  logbook: { required: true, reason: `caution and unheated probes of ADR ${adr}` },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
});

/**
 * The pitot TAT AOA probe alerts of ADR n: a single alert, replaced by a pair alert when another ADR has the same fault
 * (1+2 first, then 1+3, then 2+3; with the three failed, 1+2 and a single 3).
 */
const pitotTatAoaProbeDetail = (adr: number): FailureDetail => {
  const pairs = adr === 1 ? ['1+2', '1+3'] : adr === 2 ? ['1+2', '2+3'] : ['1+3', '2+3'];
  const pairIds =
    adr === 1 ? ['300800045', '300800046'] : adr === 2 ? ['300800045', '300800047'] : ['300800046', '300800047'];
  return {
    whatItIs:
      `The pitot, TAT and AOA probe of ADR ${adr} measures total pressure, total air temperature and angle of attack, ` +
      'and is heated electrically against ice, and its heater is monitored.',
    impact: [
      `The heater of the pitot TAT AOA probe of ADR ${adr} is reported failed.`,
      'The ADR is listed as having lost its probe heating and the approach category drops.',
      'A second failed probe of another ADR changes the alert to a pair alert with limitations.',
    ],
    alertIds: [String(300800041 + adr), ...pairIds],
    effects: [
      {
        where: 'E/WD',
        text:
          `A-ICE PITOT TAT AOA PROBE ${adr} HEATG FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ` +
          `${ALREADY_SHOWN_STAYS}. ${AIR_DATA_SWITCHING_LINE(adr)} ${HEATING_DEMANDED} ${NO_PAGE_CALL_UP}`,
      },
      {
        where: 'E/WD',
        text:
          `With the same fault on another ADR the pair alert replaces the single ones (${pairs.join(' or ')}): A-ICE PITOT ` +
          `TAT AOA ${pairs[0]} HEATG FAULT and the like, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}. It lists AVOID ICING ` +
          'CONDs, and for 1+2 also AIR DATA SWTG : CAPT ON 3 (with the ADIRS SWTG memo while the selector stays off NORM). With all three failed, 1+2 shows with a single alert for ADR 3.',
      },
      {
        where: 'SD STATUS',
        text:
          `Single alert: ADR ${adr} PROBES HEATG is listed as inoperative in all phases, CAT 3 DUAL for approach and ` +
          'landing, and the information CAT 3 SINGLE ONLY. Pair alert: the limitations MAX SPEED : 310 KT and AVOID ICING ' +
          'CONDs (also on the PFD), F/CTL PROT and the ADR pair PROBES HEATG as inoperative in all phases, CAT 2, BTV and ' +
          'ROW/ROP for approach and landing, and the information ALTN LAW : PROT LOST, ' +
          `${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [
      `The unheated probe does not ice up: ${AIR_DATA_NOT_CHANGED.charAt(0).toLowerCase()}${AIR_DATA_NOT_CHANGED.slice(1)}`,
      'With a pair of failed probes the flight controls do not revert to alternate law and the speed is not limited.',
    ],
    logbook: { required: true, reason: `caution and a failed pitot TAT AOA probe heater of ADR ${adr}` },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  };
};

const staticProbeDetail =
  (side: 'left' | 'right') =>
  (adr: number): FailureDetail => {
    const other = side === 'left' ? 'right' : 'left';
    return {
      whatItIs:
        `ADR ${adr} has a ${side} and a ${other} static probe, which measure the static pressure and are heated against ice. ` +
        'Their heaters are monitored.',
      impact: [
        `The heater of the ${side} static probe of ADR ${adr} is reported failed.`,
        `A failure of the ${other} static probe of the same ADR raises the same alert.`,
        'The ADR is listed as having lost its probe heating and the approach category drops.',
      ],
      alertIds: [String(300800050 + adr)],
      effects: [
        {
          where: 'E/WD',
          text:
            `A-ICE STATIC PROBE ${adr} HEATING FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
            `${AIR_DATA_SWITCHING_LINE(adr)} ${HEATING_DEMANDED} ${NO_PAGE_CALL_UP}`,
        },
        {
          where: 'SD STATUS',
          text: `ADR ${adr} PROBES HEATG is listed as inoperative in all phases and CAT 3 DUAL for approach and landing, ${STATUS_NOTE}.`,
        },
      ],
      notSimulated: [
        `The unheated static probe does not ice up: ${AIR_DATA_NOT_CHANGED.charAt(0).toLowerCase()}${AIR_DATA_NOT_CHANGED.slice(1)}`,
      ],
      logbook: { required: true, reason: `caution and a failed static probe heater of ADR ${adr}` },
      clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
    };
  };

const sideslipProbeDetail = (adr: number): FailureDetail => ({
  whatItIs:
    `The sideslip probe of ADR ${adr} measures the angle of the airflow across the fuselage and is heated against ice. ` +
    'Its heater is monitored.',
  impact: [
    `The heater of the sideslip probe of ADR ${adr} is reported failed.`,
    'The approach category drops; nothing else changes.',
  ],
  alertIds: [String(300800047 + adr)],
  effects: [
    {
      where: 'E/WD',
      text:
        `A-ICE SIDESLIP PROBE ${adr} HEATING FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ` +
        `${ALREADY_SHOWN_STAYS}. It has no procedure line. ${HEATING_DEMANDED} ${NO_PAGE_CALL_UP}`,
    },
    {
      where: 'SD STATUS',
      text:
        `SIDESLIP PROBE ${adr} HEAT is listed as inoperative in all phases, CAT 3 DUAL for approach and landing, and ` +
        `the information CAT 3 SINGLE ONLY, ${STATUS_NOTE}.`,
    },
  ],
  notSimulated: [
    `The unheated sideslip probe does not ice up: ${AIR_DATA_NOT_CHANGED.charAt(0).toLowerCase()}${AIR_DATA_NOT_CHANGED.slice(1)}`,
  ],
  logbook: { required: true, reason: `caution and a failed sideslip probe heater of ADR ${adr}` },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
});

const standbyPitotProbeHeater: FailureDetail = {
  whatItIs:
    'The standby pitot probe feeds the standby instruments (ISIS) and is heated electrically against ice, like the ' +
    'probes of the three air data references.',
  impact: ['The heater of the standby pitot probe is reported failed.', 'Only the status page and the alert change.'],
  alertIds: ['300800054'],
  effects: [
    {
      where: 'E/WD',
      text:
        `A-ICE STBY PITOT PROBE HEATG FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
        `It has no procedure line. ${HEATING_DEMANDED} ${NO_PAGE_CALL_UP}`,
    },
    { where: 'SD STATUS', text: `STBY PITOT HEATG is listed as inoperative in all phases, ${STATUS_NOTE}.` },
  ],
  notSimulated: [
    `The unheated standby probe does not ice up: the standby airspeed does not change, the simulation has no probe icing.`,
  ],
  logbook: { required: true, reason: 'caution and a failed standby pitot heater' },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
};

const standbyStaticProbesHeater: FailureDetail = {
  whatItIs:
    'The standby static probes feed the standby instruments (ISIS) with static pressure and are heated electrically ' +
    'against ice.',
  impact: ['The heater of the standby static probes is reported failed.', 'Only the status page and the alert change.'],
  alertIds: ['300800055'],
  effects: [
    {
      where: 'E/WD',
      text:
        `A-ICE STBY STATIC PROBE HEATG FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
        `It has no procedure line. ${HEATING_DEMANDED} ${NO_PAGE_CALL_UP}`,
    },
    { where: 'SD STATUS', text: `STBY STATIC HEATG is listed as inoperative in all phases, ${STATUS_NOTE}.` },
  ],
  notSimulated: [
    'The unheated standby static probes do not ice up: the standby altitude does not change, the simulation has no probe icing.',
  ],
  logbook: { required: true, reason: 'caution and a failed standby static heater' },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------------------------------

const WINDOW_SEEN =
  'It is seen only while the heating is demanded (an engine running, or the PROBE/WINDOW HEAT pushbutton ON) and the ' +
  'channel B of the anti-ice control unit of that side (AICU 1 left, AICU 2 right) works; its loss raises the A-ICE CTL SYS FAULT alert.';

const windshieldDetail = (position: number): FailureDetail => {
  const side = position === 1 ? 'left' : 'right';
  const letter = position === 1 ? 'L' : 'R';
  const other = position === 1 ? 'R' : 'L';
  return {
    whatItIs:
      `The ${side} windshield, in front of the ${position === 1 ? 'captain' : 'first officer'}, is heated electrically ` +
      'against ice and mist. The window heating of each side is controlled and monitored by the anti-ice control unit of that side.',
    impact: [
      `The heating of the ${side} windshield is reported failed.`,
      'With both windshields failed the crew is asked to avoid icing conditions.',
    ],
    alertIds: [String(300800038 + position), '300800041'],
    effects: [
      {
        where: 'E/WD',
        text:
          `A-ICE ${letter} WINDSHIELD HEATG FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no procedure line. ${WINDOW_SEEN} ${NO_PAGE_CALL_UP}`,
      },
      {
        where: 'E/WD',
        text:
          `With the ${other} windshield failed too, A-ICE L+R WINDSHIELDS HEATG FAULT replaces both, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. It lists AVOID ICING CONDs.`,
      },
      {
        where: 'SD STATUS',
        text:
          `${letter} WINDSHIELD HEATG is listed as inoperative in all phases. For both windshields, L+R WINDSHLDs HEATG is ` +
          `listed and the limitation AVOID ICING CONDs (also on the PFD), ${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [WINDOW_NOT_SIMULATED],
    logbook: { required: true, reason: `caution and a failed ${side} windshield heating` },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  };
};

const slidingWindowDetail = (position: number): FailureDetail => {
  const side = position === 1 ? 'left' : 'right';
  const letter = position === 1 ? 'L' : 'R';
  return {
    whatItIs:
      `The ${side} sliding window of the cockpit can be opened on the ground and is heated electrically against mist. ` +
      'The window heating of each side is controlled and monitored by the anti-ice control unit of that side.',
    impact: [
      `The heating of the ${side} sliding window is reported failed.`,
      'Only the alert and the status page change.',
    ],
    alertIds: [String(300800036 + position)],
    effects: [
      {
        where: 'E/WD',
        text:
          `A-ICE ${letter} SLIDING WINDOW HEATG FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no procedure line. ${WINDOW_SEEN} ${NO_PAGE_CALL_UP}`,
      },
      {
        where: 'SD STATUS',
        text: `${letter} SLIDG WINDOW HEATG is listed as inoperative in all phases, ${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [WINDOW_NOT_SIMULATED],
    logbook: { required: true, reason: `advisory and a failed ${side} sliding window heating` },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  };
};

const fixedWindowDetail = (position: number): FailureDetail => {
  const side = position === 1 ? 'left' : 'right';
  const letter = position === 1 ? 'L' : 'R';
  return {
    whatItIs:
      `The ${side} fixed window of the cockpit is heated electrically against mist. The window heating of each ` +
      'side is controlled and monitored by the anti-ice control unit of that side.',
    impact: [
      `The heating of the ${side} fixed window is reported failed.`,
      'Only the alert and the status page change.',
    ],
    alertIds: [String(300800034 + position)],
    effects: [
      {
        where: 'E/WD',
        text:
          `A-ICE ${letter} FIXED WINDOW HEATG FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no procedure line. ${WINDOW_SEEN} ${NO_PAGE_CALL_UP}`,
      },
      {
        where: 'SD STATUS',
        text: `${letter} FIXED WINDOW HEATG is listed as inoperative in all phases, ${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [WINDOW_NOT_SIMULATED],
    logbook: { required: true, reason: `advisory and a failed ${side} fixed window heating` },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Drain masts
// ---------------------------------------------------------------------------------------------------------------------

const drainMastHeat: FailureDetail = {
  whatItIs:
    'The drain masts let the water and waste water of the cabin out of the aircraft. They are heated electrically so ' +
    'that the water does not freeze at the outlet.',
  impact: ['The heating of the cabin drain masts is reported failed.', 'Only the alert and the status page change.'],
  alertIds: ['300800056'],
  effects: [
    {
      where: 'E/WD',
      text:
        `CABIN DRAIN MASTS HEATING FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}. ` +
        `It has no procedure line and is shown whatever the heating demand. ${NO_PAGE_CALL_UP}`,
    },
    { where: 'SD STATUS', text: `DRAIN MASTS HEATG is listed as inoperative in all phases, ${STATUS_NOTE}.` },
  ],
  notSimulated: ['The drain masts do not freeze: the simulation only raises the alert.'],
  logbook: { required: true, reason: 'advisory and failed drain mast heating' },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
};

export const Ata30ProbesWindowsEntries: Record<number, FailureDetail> = {
  [A380Failure.StbyPitotProbeHeater]: standbyPitotProbeHeater,
  [A380Failure.StbyStaticProbesHeater]: standbyStaticProbesHeater,
  [A380Failure.DrainMastHeat]: drainMastHeat,
};

export const Ata30ProbesWindowsFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.Adr1ProbesHeatingCommand,
      A380Failure.Adr2ProbesHeatingCommand,
      A380Failure.Adr3ProbesHeatingCommand,
    ],
    detail: probeHeatingCommandDetail,
  },
  {
    ids: [
      A380Failure.Adr1PitotTatAoaProbeHeater,
      A380Failure.Adr2PitotTatAoaProbeHeater,
      A380Failure.Adr3PitotTatAoaProbeHeater,
    ],
    detail: pitotTatAoaProbeDetail,
  },
  {
    ids: [
      A380Failure.Adr1LeftStaticProbeHeater,
      A380Failure.Adr2LeftStaticProbeHeater,
      A380Failure.Adr3LeftStaticProbeHeater,
    ],
    detail: staticProbeDetail('left'),
  },
  {
    ids: [
      A380Failure.Adr1RightStaticProbeHeater,
      A380Failure.Adr2RightStaticProbeHeater,
      A380Failure.Adr3RightStaticProbeHeater,
    ],
    detail: staticProbeDetail('right'),
  },
  {
    ids: [
      A380Failure.Adr1SideslipProbeHeater,
      A380Failure.Adr2SideslipProbeHeater,
      A380Failure.Adr3SideslipProbeHeater,
    ],
    detail: sideslipProbeDetail,
  },
  { ids: [A380Failure.LeftWindshieldHeat, A380Failure.RightWindshieldHeat], detail: windshieldDetail },
  { ids: [A380Failure.LeftSlidingWindowHeat, A380Failure.RightSlidingWindowHeat], detail: slidingWindowDetail },
  { ids: [A380Failure.LeftFixedWindowHeat, A380Failure.RightFixedWindowHeat], detail: fixedWindowDetail },
];
