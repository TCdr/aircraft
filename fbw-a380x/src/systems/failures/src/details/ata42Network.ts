// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

type SeenEffect = FailureDetail['effects'][number];

/** DOUBLE SWITCH FAULT: inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 =
  'only with the engines off on electrical power, or with the engines shut down after landing';

/** The 211800xxx redundancy alerts: inhibited in flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'it shows only on the ground before take-off power (engines off, or the first engine started) and after the ' +
  'engines are shut down';

/** The multiple switch, IOM and cable alerts: flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** ALL SWITCHES FAULT: flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** The DEGRADED pack and temperature control alerts: flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the engines are ' +
  'shut down';

const ALERT_DOUBLE_SWITCH = '420800003';
const ALERT_MULTIPLE_SWITCH_NETWORK_DEGRADED = '420800006';
const ALERT_MULTIPLE_SWITCH_REDUNDANCY_DEGRADED = '420800007';
const ALERT_ALL_SWITCHES = '420800001';
const ALERT_MULTIPLE_CABLE = '420800008';
const ALERT_ECP_FAULT = '314800007';
const ALERT_PACK_1_CTL_DEGRADED = '211800005';
const ALERT_PACK_2_CTL_DEGRADED = '211800006';
const ALERT_PACK_1_CTL_REDUNDANCY_LOST = '211800007';
const ALERT_PACK_2_CTL_REDUNDANCY_LOST = '211800008';
const ALERT_TEMP_CTL_REDUNDANCY_LOST = '211800042';
const ALERT_TEMP_CTL_DEGRADED = '211800050';

const SWITCH_DESCRIPTION =
  'The AFDX switches are the transit points of the two redundant avionics networks. Each network has 8 switches ' +
  'linked by cables, the computers (CPIOMs) and input/output modules (IOMs) plug into them, and each switch of ' +
  'network A is paired with one of network B. The switches route the data between the aircraft systems.';

const NOT_SIMULATED_SYSTEMS_KEEP_WORKING =
  'A real lost switch or cable path cuts the data between the systems wired through it.';

// ---------------------------------------------------------------------------------------------------------------------
// The network topology: network A switches 1-7 and 9, network B
// the same plus 10, links between switches by switch id
// ---------------------------------------------------------------------------------------------------------------------

const NETWORK_A_SWITCHES = [1, 2, 3, 4, 5, 6, 7, 9] as const;

/** The switches a switch of network A is linked to; network B is the same with 10 added to every id */
const NETWORK_A_LINKS: Record<number, number[]> = {
  1: [2, 3, 9],
  2: [1, 4, 9],
  3: [1, 4, 5, 7, 9],
  4: [2, 3, 6, 7, 9],
  5: [3, 6, 7],
  6: [4, 5, 7],
  7: [3, 4, 5, 6],
  9: [1, 2, 3, 4],
};

/** Cables 1 to 15 of network A as switch pairs; cables 16 to 30 are the same pairs on network B (10 added) */
const NETWORK_A_CABLES: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 3],
  [1, 9],
  [2, 4],
  [2, 9],
  [3, 4],
  [3, 5],
  [3, 7],
  [3, 9],
  [4, 6],
  [4, 7],
  [4, 9],
  [5, 6],
  [5, 7],
  [6, 7],
];

/** The modules wired to a switch of network A (and to the paired switch of network B) */
const MODULES_ON_SWITCH: Record<number, string> = {
  1: 'IOM A1 and IOM A3',
  2: 'IOM A2 and IOM A4',
  3: 'IOM A5, IOM A7, CPIOM C1, CPIOM D1 and CPIOM D3',
  4: 'IOM A6, IOM A8 and CPIOM C2',
  5: 'CPIOM A2, A3, B2, B3, E1, F1 and F3',
  6: 'CPIOM A4, B4, E2, F2, F4, G2 and G4',
  7: 'CPIOM A1, B1, G1 and G3',
  9: '',
};

const joinList = (items: ReadonlyArray<string | number>): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const offset = (networkB: boolean): number => (networkB ? 10 : 0);

// ---------------------------------------------------------------------------------------------------------------------
// AFDX switches
// ---------------------------------------------------------------------------------------------------------------------

/**
 * What the FWS and the displays read from the routing flags, with both FWS healthy (the flight control data
 * concentrators read them too, but no crew effect is traced, so no effect text lists them):
 * - E/WD: FWS reached through switch 3 or 13 (self), or through 4 to 3 / 14 to 13
 * - PFD: 3 to 1, 13 to 11, 4 to 2, 14 to 12
 * - SD STATUS: 4 to 3, 14 to 13, 4 (self), 14 (self)
 * - ECP: switch 3, 13, 4 or 14 available
 * - CPIOM B1 data: 3 or 4 reaching 7, 13 or 14 reaching 17; B2 and B3: 5 and 15; B4: 6 and 16
 * Only the combinations where one network and the other both fail change a flag: a single failure never does.
 */
const switchRoutingEffects = (id: number, networkB: boolean): SeenEffect[] => {
  const plus = offset(networkB);
  const effects: SeenEffect[] = [];
  const asA = id - plus;

  if (asA === 1 || asA === 2 || asA === 3 || asA === 4) {
    effects.push({
      where: 'PFD',
      text:
        'With, on each network, one of switches 1 and 3 and one of switches 2 and 4 failed (on network B 11 and 13, 12 and ' +
        '14), the PFD shows MEMO NOT AVAIL and LIMITATIONS NOT AVAIL in place of the memos and limitations. This switch is part of such a pair.',
    });
  }
  if (asA === 3) {
    effects.push({
      where: 'E/WD',
      text:
        `With switches 3 and 13 both failed, the E/WD can no longer reach the FWS: it hides the FWS alerts, memos ` +
        'and limitations and draws the FWS 1+2 FAULT fallback procedure instead (not on the ground above 50 kt ' +
        'ground speed). The FWS still raises the alerts, with master caution and chime.',
    });
  }
  if (asA === 4) {
    effects.push({
      where: 'SD STATUS',
      text:
        'With switches 4 and 14 both failed, the STATUS page can no longer reach the FWS: it shows its not-available ' +
        'display instead of the status lines.',
    });
  }
  if (asA === 3 || asA === 4) {
    effects.push({
      where: 'E/WD',
      text:
        'With switches 3, 4, 13 and 14 all failed, FWS ECP FAULT appears, ' +
        `${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines say the SYSTEMS, MORE, TO CONFIG and RCL LAST keys ` +
        'are not available. The T.O CONFIG, RCL, RCL LAST and EMER CANC keys of the ECAM control panel are then ' +
        'ignored. The displays also all lose the FWS (E/WD fallback, MEMO NOT AVAIL on the PFD, STATUS not ' +
        'available), and the FWS reads all four air conditioning computers B1 to B4 as lost: the alerts listed for ' +
        'switches 5, 6 and 7 follow at once, with the DEGRADED pack, vent and temperature alerts and CAB PRESS AUTO CTL FAULT.',
    });
  }
  if (asA === 5 || asA === 6 || asA === 7) {
    const computers = asA === 7 ? 'B1' : asA === 6 ? 'B4' : 'B2 and B3';
    const follow =
      asA === 7
        ? 'AIR PACK 1 CTL REDUNDANCY LOST, COND TEMP CTL REDUNDANCY LOST and COND FWD VENT CTL REDUNDANCY LOST'
        : asA === 6
          ? 'AIR PACK 2 CTL REDUNDANCY LOST, COND TEMP CTL REDUNDANCY LOST and COND AFT VENT CTL REDUNDANCY LOST'
          : 'AIR PACK 1 CTL REDUNDANCY LOST, AIR PACK 2 CTL REDUNDANCY LOST, COND TEMP CTL REDUNDANCY LOST, COND FWD ' +
            'VENT CTL REDUNDANCY LOST, COND AFT VENT CTL REDUNDANCY LOST and CAB PRESS CTL REDUNDANCY LOST';
    effects.push({
      where: 'E/WD',
      text:
        `With switches ${asA} and ${asA + 10} both failed, the FWS reads the data of the air conditioning computers ` +
        `${computers} as lost (the computers themselves keep running): ${follow} appear, ${ADVISORY}, while their ` +
        `bus is powered; ${NOT_SHOWN_PHASES_3_TO_11}.`,
    });
    effects.push({
      where: 'E/WD',
      text:
        'With more of the pairs 5/15, 6/16 and 7/17 lost, the DEGRADED alerts replace the REDUNDANCY LOST ones, ' +
        `${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}: AIR PACK 1 CTL DEGRADED (pairs 5 and 7), AIR PACK 2 CTL DEGRADED (5 ` +
        'and 6), COND FWD VENT CTL DEGRADED (5 and 7), COND AFT VENT CTL DEGRADED (5 and 6) and COND TEMP CTL ' +
        'DEGRADED (all three). CAB PRESS CTL REDUNDANCY LOST appears as soon as two of the four pressure computers ' +
        `are lost, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}.`,
    });
    effects.push({
      where: 'E/WD',
      text:
        'With all three pairs lost, CAB PRESS AUTO CTL FAULT replaces CAB PRESS CTL REDUNDANCY LOST, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}, and calls up the SD CAB PRESS page. Its lines: AUTO CTL SYS 1+2+3+4 ` +
        'FAULT, CAB PRESS IN BACKUP MODE, CAB PRESS MAN MODES : DO NOT USE, IN DES : CAB ALT REGULATED TO 7000 FT, ' +
        'BELOW 7000 FT : CAB ALT = ACFT ALT and BELOW 7000 FT : AVOID HI DES V/S. LIMITATIONS: MAN PRESS : DO NOT ' +
        'USE; the PFD shows AVOID HI DESCENT V/S.',
    });
  }
  if (asA === 9) {
    effects.push({
      where: 'E/WD',
      text: `No module is wired to switch ${id}: it is an extra route between switches ${joinList(
        NETWORK_A_LINKS[9].map((link) => link + plus),
      )}. No routing flag that the FWS and the displays read changes with it alone.`,
    });
  }
  return effects;
};

const PACK_AND_AIR_ALERTS = {
  fwdVentRedundancyLost: '212800011',
  fwdVentDegraded: '212800009',
  aftVentRedundancyLost: '212800005',
  aftVentDegraded: '212800003',
  cabPressRedundancyLost: '213800006',
  cabPressAutoCtlFault: '213800005',
};

const switchAlertIds = (asA: number): string[] => {
  const alerts = [
    ALERT_DOUBLE_SWITCH,
    ALERT_MULTIPLE_SWITCH_NETWORK_DEGRADED,
    ALERT_MULTIPLE_SWITCH_REDUNDANCY_DEGRADED,
    ALERT_ALL_SWITCHES,
  ];
  const air = PACK_AND_AIR_ALERTS;
  if (asA === 3 || asA === 4) {
    alerts.push(
      ALERT_ECP_FAULT,
      ALERT_PACK_1_CTL_DEGRADED,
      ALERT_PACK_2_CTL_DEGRADED,
      ALERT_TEMP_CTL_DEGRADED,
      air.fwdVentDegraded,
      air.aftVentDegraded,
      air.cabPressAutoCtlFault,
    );
  } else if (asA === 5) {
    alerts.push(
      ALERT_PACK_1_CTL_REDUNDANCY_LOST,
      ALERT_PACK_2_CTL_REDUNDANCY_LOST,
      ALERT_TEMP_CTL_REDUNDANCY_LOST,
      air.fwdVentRedundancyLost,
      air.aftVentRedundancyLost,
      air.cabPressRedundancyLost,
      ALERT_PACK_1_CTL_DEGRADED,
      ALERT_PACK_2_CTL_DEGRADED,
      ALERT_TEMP_CTL_DEGRADED,
      air.fwdVentDegraded,
      air.aftVentDegraded,
      air.cabPressAutoCtlFault,
    );
  } else if (asA === 6) {
    alerts.push(
      ALERT_PACK_2_CTL_REDUNDANCY_LOST,
      ALERT_TEMP_CTL_REDUNDANCY_LOST,
      air.aftVentRedundancyLost,
      air.cabPressRedundancyLost,
      ALERT_PACK_2_CTL_DEGRADED,
      ALERT_TEMP_CTL_DEGRADED,
      air.aftVentDegraded,
      air.cabPressAutoCtlFault,
    );
  } else if (asA === 7) {
    alerts.push(
      ALERT_PACK_1_CTL_REDUNDANCY_LOST,
      ALERT_TEMP_CTL_REDUNDANCY_LOST,
      air.fwdVentRedundancyLost,
      air.cabPressRedundancyLost,
      ALERT_PACK_1_CTL_DEGRADED,
      ALERT_TEMP_CTL_DEGRADED,
      air.fwdVentDegraded,
      air.cabPressAutoCtlFault,
    );
  }
  return alerts;
};

const switchDetail = (id: number, networkB: boolean): FailureDetail => {
  const plus = offset(networkB);
  const asA = id - plus;
  const partner = networkB ? id - 10 : id + 10;
  const network = networkB ? 'B' : 'A';
  const links = NETWORK_A_LINKS[asA].map((link) => link + plus);
  const modules = MODULES_ON_SWITCH[asA];
  return {
    whatItIs:
      `${SWITCH_DESCRIPTION} Switch ${id} is on network ${network}, paired with switch ${partner}` +
      (modules ? `, and the ${modules} are wired to that pair.` : ', and no computer or module is wired to that pair.'),
    impact: [
      `Switch ${id} is lost. Network ${network} no longer routes through it (it was linked to switches ${joinList(links)}); network ${
        networkB ? 'A' : 'B'
      } carries the data.`,
      modules
        ? `The ${modules} stay available: in the model a module depends on its power and failures, not on the switches.`
        : 'No module depends on this switch.',
      'Alerts need further switch failures: see the combinations below.',
    ],
    alertIds: switchAlertIds(asA),
    effects: [
      {
        where: 'E/WD',
        text:
          'A single failed switch raises no alert and changes no display: the other network carries everything, and the FWS ' +
          'and the displays still reach each other.',
      },
      {
        where: 'E/WD',
        text:
          'With exactly one more switch failed on the same network and none on the other, AVIONICS NETWORK DOUBLE ' +
          `SWITCH FAULT appears, ${ADVISORY}, ${NOT_SHOWN_PHASES_2_TO_11}. With two or more others on that network, AVIONICS NETWORK ` +
          `MULTIPLE SWITCH FAULT (REDUNDANCY DEGRADED) appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          `With switches failed on both networks, AVIONICS NETWORK MULTIPLE SWITCH FAULT (NETWORK DEGRADED) appears, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. With all 16 switches failed, AVIONICS NETWORK ALL SWITCHES FAULT replaces ` +
          `it: ${CAUTION}, LAND ANSA; ${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its LIMITATIONS: A/THR NOT USABLE, XPDR MODE A ` +
          'ONLY, ATC COM VOICE ONLY and MAN PRESS : DO NOT USE in all phases, and for approach and landing AVOID HI ' +
          'DESCENT V/S, MAX SPEED : 220 KT, JETTISON NOT USABLE, L/G GRVTY EXTN ONLY, CAT 1 ONLY, A-SKID NOT USABLE ' +
          'ON ALL L/Gs, LDG DIST AFFECTED and N/W STEER NOT USABLE.',
      },
      ...switchRoutingEffects(id, networkB),
    ],
    notSimulated: [NOT_SIMULATED_SYSTEMS_KEEP_WORKING],
    logbook: { required: false, reason: 'a single failed switch shows nothing to the crew' },
    clearing: `${MAINTENANCE_ONLY} The routing is recomputed straight away.`,
  };
};

const AfdxSwitchNetworkAFamily: FailureDetailFamily = {
  ids: [
    A380Failure.AfdxSwitch1,
    A380Failure.AfdxSwitch2,
    A380Failure.AfdxSwitch3,
    A380Failure.AfdxSwitch4,
    A380Failure.AfdxSwitch5,
    A380Failure.AfdxSwitch6,
    A380Failure.AfdxSwitch7,
    A380Failure.AfdxSwitch9,
  ],
  detail: (number) => switchDetail(NETWORK_A_SWITCHES[number - 1], false),
};

const AfdxSwitchNetworkBFamily: FailureDetailFamily = {
  ids: [
    A380Failure.AfdxSwitch11,
    A380Failure.AfdxSwitch12,
    A380Failure.AfdxSwitch13,
    A380Failure.AfdxSwitch14,
    A380Failure.AfdxSwitch15,
    A380Failure.AfdxSwitch16,
    A380Failure.AfdxSwitch17,
    A380Failure.AfdxSwitch19,
  ],
  detail: (number) => switchDetail(NETWORK_A_SWITCHES[number - 1] + 10, true),
};

// ---------------------------------------------------------------------------------------------------------------------
// AFDX cables
// ---------------------------------------------------------------------------------------------------------------------

const cableDetail = (number: number, networkB: boolean): FailureDetail => {
  const plus = offset(networkB);
  const [firstA, secondA] = NETWORK_A_CABLES[number - 1];
  const first = firstA + plus;
  const second = secondA + plus;
  const network = networkB ? 'B' : 'A';
  const otherLinksFirst = NETWORK_A_LINKS[firstA].length - 1;
  const otherLinksSecond = NETWORK_A_LINKS[secondA].length - 1;
  const modules = [MODULES_ON_SWITCH[firstA], MODULES_ON_SWITCH[secondA]].filter((text) => text !== '');
  return {
    whatItIs:
      'A cable links two switches of the same avionics network. Every switch has several cables, so the data finds ' +
      'another route when one cable fails; the two networks are not connected to each other.',
    impact: [
      `This cable links switches ${first} and ${second} on network ${network}. Switch ${first} keeps ${otherLinksFirst} other links, switch ${second} keeps ${otherLinksSecond}.`,
      'A switch is cut off only when all its cables fail; the modules wired to it stay available in the model.',
      modules.length
        ? `Modules wired to its ends: ${joinList(modules)}.`
        : 'No module is wired to the switches at its ends.',
    ],
    alertIds: [ALERT_MULTIPLE_CABLE],
    effects: [
      {
        where: 'E/WD',
        text:
          'A single failed cable raises no alert and changes no display: the data takes another route and every ' +
          'FWS-to-display link stays up.',
      },
      {
        where: 'E/WD',
        text:
          'With a second cable failed, on either network, AVIONICS NETWORK MULTIPLE CABLE FAULT appears, ' +
          `${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It has no procedure line.`,
      },
      {
        where: 'E/WD',
        text:
          'The routing flags change only when whole groups of cables fail on both networks (at least three on each ' +
          'network, such as every cable of one switch): then the switch-to-switch routes that the FWS and the displays read are lost, as for failed switches (the ECP is not affected).',
      },
    ],
    notSimulated: [NOT_SIMULATED_SYSTEMS_KEEP_WORKING],
    logbook: { required: false, reason: 'a single failed cable shows nothing to the crew' },
    clearing: `${MAINTENANCE_ONLY} The routing is recomputed straight away.`,
  };
};

const AfdxCableNetworkAFamily: FailureDetailFamily = {
  ids: [
    A380Failure.AfdxCable1,
    A380Failure.AfdxCable2,
    A380Failure.AfdxCable3,
    A380Failure.AfdxCable4,
    A380Failure.AfdxCable5,
    A380Failure.AfdxCable6,
    A380Failure.AfdxCable7,
    A380Failure.AfdxCable8,
    A380Failure.AfdxCable9,
    A380Failure.AfdxCable10,
    A380Failure.AfdxCable11,
    A380Failure.AfdxCable12,
    A380Failure.AfdxCable13,
    A380Failure.AfdxCable14,
    A380Failure.AfdxCable15,
  ],
  detail: (number) => cableDetail(number, false),
};

const AfdxCableNetworkBFamily: FailureDetailFamily = {
  ids: [
    A380Failure.AfdxCable16,
    A380Failure.AfdxCable17,
    A380Failure.AfdxCable18,
    A380Failure.AfdxCable19,
    A380Failure.AfdxCable20,
    A380Failure.AfdxCable21,
    A380Failure.AfdxCable22,
    A380Failure.AfdxCable23,
    A380Failure.AfdxCable24,
    A380Failure.AfdxCable25,
    A380Failure.AfdxCable26,
    A380Failure.AfdxCable27,
    A380Failure.AfdxCable28,
    A380Failure.AfdxCable29,
    A380Failure.AfdxCable30,
  ],
  detail: (number) => cableDetail(number, true),
};

export const Ata42NetworkFamilies: FailureDetailFamily[] = [
  AfdxSwitchNetworkAFamily,
  AfdxSwitchNetworkBFamily,
  AfdxCableNetworkAFamily,
  AfdxCableNetworkBFamily,
];
