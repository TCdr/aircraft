// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'a caution with master caution and single chime';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.

/** Alerts inhibited in flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert is not shown from take-off power through the landing roll and taxi-in, so it appears on the ground ' +
  'before take-off power or after engine shutdown';

/** Alerts inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until engine shutdown';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 = 'a new alert is not shown from the first engine start until engine shutdown';

/** Alerts inhibited in flight phases 2 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_2_TO_7_AND_9_TO_11 =
  'a new alert is not shown from the first engine start to 1,500 ft, nor from 800 ft on approach until engine shutdown';

const CPIOM_B_POWER_NOTE = 'while the bus of that CPIOM B is powered';

const STATUS_NOTE = 'while the alert is shown';

// ---------------------------------------------------------------------------------------------------------------------
// Pack controllers (FDAC)
// ---------------------------------------------------------------------------------------------------------------------

const FDAC_CTL_FAULT_ALERTS = ['211800001', '211800002', '211800003', '211800004'] as const;
const FDAC_PACK_FAULT_ALERTS = ['211800009', '211800010'] as const;
/** The AC bus that must be powered for the FWS to raise the alert of the channel */
const FDAC_CHANNEL_BUS = ['AC ESS', 'AC 2', 'AC ESS', 'AC 4'] as const;

const FdacChannelFamily: FailureDetailFamily = {
  ids: [A380Failure.Fdac1Ch1, A380Failure.Fdac1Ch2, A380Failure.Fdac2Ch1, A380Failure.Fdac2Ch2],
  detail: (number): FailureDetail => {
    const pack = number <= 2 ? 1 : 2;
    const channel = number % 2 === 1 ? 1 : 2;
    return {
      whatItIs:
        `Pack ${pack} has its own controller, the FDAC, with two independent channels. Either channel can run the ` +
        'whole pack: it commands the two pack flow valves from the AIR FLOW selector and the flow demand, and it ' +
        'watches the pack for overheat, valve and regulation faults.',
      impact: [
        `The other channel of the pack ${pack} controller takes over, so the pack keeps its flow and regulation.`,
        `With both channels lost, pack ${pack} is lost: its two flow valves close.`,
        'Nothing then watches that pack, so its overheat, valve, bypass and bay fan alerts cannot be raised.',
      ],
      alertIds: [FDAC_CTL_FAULT_ALERTS[number - 1], FDAC_PACK_FAULT_ALERTS[pack - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `AIR PACK ${pack} CTL ${channel} FAULT, ${ADVISORY}, while the ${FDAC_CHANNEL_BUS[number - 1]} bus is ` +
            `powered; ${NOT_SHOWN_PHASES_3_TO_11}.`,
        },
        {
          where: 'E/WD',
          text:
            `Both channels lost: AIR PACK ${pack} FAULT, ${CAUTION}, replaces the two CTL FAULT alerts; ` +
            `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are PACK ${pack} CTL 1+2 FAULT and PACK ${pack} OFF.`,
        },
        {
          where: 'E/WD',
          text:
            'If the other pack controller is lost too, AIR PACK 1+2 FAULT replaces PACK FAULT in climb, cruise and ' +
            'descent after 3 min. COND TEMP CTL FAULT appears at once.',
        },
        {
          where: 'SD BLEED',
          text:
            `A CTL box appears under pack ${pack} with channel ${channel} in amber. Both numbers are amber when ` +
            'both channels are lost.',
        },
        {
          where: 'SD BLEED',
          text: `Both channels lost: PACK ${pack} turns amber and its outlet temperature disappears, as no air flows.`,
        },
        {
          where: 'Overhead AIR panel',
          text: `Both channels lost: the PACK ${pack} pushbutton FAULT light comes on.`,
        },
        {
          where: 'SD STATUS',
          text:
            `Both channels lost: PACK ${pack} is listed as inoperative ${STATUS_NOTE}. With the other controller ` +
            `lost too, once AIR PACK 1+2 FAULT shows PACK 1+2 is listed instead, with ENG IDLE HI and FWD CRG TEMP REGUL DEGRADED as information ` +
            'and ALL ZONES TEMP REGUL as inoperative.',
        },
      ],
      logbook: { required: true, reason: 'advisory alert and a lost pack control channel' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Trim air drive device (TADD)
// ---------------------------------------------------------------------------------------------------------------------

const TADD_CHANNEL_ALERTS = ['211800039', '211800040'] as const;
const TADD_CHANNEL_BUS = ['AC 2', 'AC 4'] as const;

const TaddChannelFamily: FailureDetailFamily = {
  ids: [A380Failure.Tadd1, A380Failure.Tadd2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The temperature controller (TADD) has two channels, each able to drive the whole trim air system. It opens and ' +
      'closes the two hot-air valves, steers the trim air valves of the cockpit, cabin and forward cargo zones, and ' +
      'watches the ducts for overheat and the trim air valves for jams.',
    impact: [
      'The other channel keeps driving the valves, so the zone temperatures stay regulated.',
      'With both channels lost, the hot-air valves close and the trim air valves are no longer adjusted.',
      'The zones can then no longer be warmed or regulated.',
      'Nothing then watches the ducts and trim air valves, so their alerts cannot be raised.',
    ],
    alertIds: [TADD_CHANNEL_ALERTS[number - 1], '211800041'],
    effects: [
      {
        where: 'E/WD',
        text:
          `COND TEMP CTL ${number} FAULT, ${ADVISORY}, while the ${TADD_CHANNEL_BUS[number - 1]} bus is powered; ` +
          `${NOT_SHOWN_PHASES_3_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `Both channels lost: COND TEMP CTL FAULT, ${ADVISORY}, replaces the two CTL FAULT alerts; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is CARGO TEMP MONITOR, which the crew does by hand.`,
      },
      {
        where: 'SD COND',
        text: `A TEMP CTL box appears with channel ${number} in amber. Both numbers are amber when both channels are lost.`,
      },
      {
        where: 'SD BLEED',
        text: 'Both channels lost: both hot-air valves are drawn closed in amber.',
      },
      {
        where: 'SD STATUS',
        text:
          `Both channels lost: ALL ZONES TEMP REGUL is listed as inoperative and FWD CRG TEMP REGUL DEGRADED as ` +
          `information, ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'advisory alert and a lost temperature control channel' },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Ventilation control modules (VCM)
// ---------------------------------------------------------------------------------------------------------------------

const VCM_CHANNEL_BUS = {
  forward: ['DC 1', 'DC ESS'],
  aft: ['DC 2', 'DC ESS'],
} as const;

const VcmForwardChannelFamily: FailureDetailFamily = {
  ids: [A380Failure.VcmFwd1, A380Failure.VcmFwd2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The forward ventilation controller has two redundant channels. It runs the forward cargo isolation valves and ' +
      'extraction fan, controls the emergency RAM air inlets, and runs primary cabin fans 1 and 2 itself when the ' +
      'CPIOM B ventilation applications do not.',
    impact: [
      'The other channel carries on, so the forward cargo ventilation and the fans are not affected.',
      'With both channels lost, primary fans 1 and 2 stop, and fans 3 and 4 run at full speed under the aft controller.',
      'The forward cargo isolation valves and extraction fan then keep the state they had, whatever the pushbuttons say.',
      'The RAM air inlet fault report is lost with the controller.',
    ],
    alertIds: [number === 1 ? '212800007' : '212800008', '212800010'],
    effects: [
      {
        where: 'E/WD',
        text:
          `COND FWD VENT CTL ${number} FAULT, ${ADVISORY}, while the ${VCM_CHANNEL_BUS.forward[number - 1]} bus is ` +
          `powered; ${NOT_SHOWN_PHASES_2_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `Both channels lost: COND FWD VENT CTL FAULT, ${CAUTION}, replaces the two channel alerts; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is IFEC OFF.`,
      },
      {
        where: 'SD COND',
        text: `A FWD VENT CTL box appears with channel ${number} in amber. Both numbers are amber when both channels are lost.`,
      },
      {
        where: 'SD STATUS',
        text:
          `Both channels lost: IFE BAY VENT, RAM AIR and FWD VENT CTL are listed as inoperative, with CABIN TEMP ` +
          `REGUL DEGRADED as information, ${STATUS_NOTE}.`,
      },
    ],
    notSimulated: [
      'The loss of the IFE bay ventilation and of the RAM air inlet control is only listed as inoperative.',
    ],
    logbook: { required: true, reason: 'alert and a lost ventilation control channel' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const VcmAftChannelFamily: FailureDetailFamily = {
  ids: [A380Failure.VcmAft1, A380Failure.VcmAft2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The aft ventilation controller has two redundant channels. It runs the bulk cargo isolation valves, ' +
      'extraction fan and heater permission, the cabin air extract valve, and primary cabin fans 3 and 4 itself when ' +
      'the CPIOM B ventilation applications do not.',
    impact: [
      'The other channel carries on, so the bulk cargo ventilation, the extract valve and the fans are not affected.',
      'With both channels lost, primary fans 3 and 4 stop, and fans 1 and 2 run at full speed under the forward controller.',
      'The bulk cargo isolation valves, extraction fan and heater permission then keep the state they had, and the ' +
        'bulk duct overheat monitor stops.',
      'The cabin air extract valve stays where it was: it no longer opens for overpressure or from its pushbutton.',
    ],
    alertIds: [number === 1 ? '212800001' : '212800002', '212800004'],
    effects: [
      {
        where: 'E/WD',
        text:
          `COND AFT VENT CTL ${number} FAULT, ${ADVISORY}, while the ${VCM_CHANNEL_BUS.aft[number - 1]} bus is ` +
          `powered; ${NOT_SHOWN_PHASES_2_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `Both channels lost: COND AFT VENT CTL FAULT, ${CAUTION}, replaces the two channel alerts; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      {
        where: 'SD COND',
        text: `An AFT VENT CTL box appears with channel ${number} in amber. Both numbers are amber when both channels are lost.`,
      },
      {
        where: 'SD STATUS',
        text:
          `Both channels lost: CAB AIR EXTRACT VLV and AFT VENT CTL are listed as inoperative, with CABIN TEMP ` +
          `REGUL DEGRADED as information, ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'alert and a lost ventilation control channel' },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Outflow valve controllers (OCSM)
// ---------------------------------------------------------------------------------------------------------------------

const OUTFLOW_VALVE_CTL_FAULT_ALERTS = ['213800011', '213800012', '213800013', '213800014'] as const;
/** The combined OUTFLW VLV CTL FAULT alerts (two or three valves) that contain the valve, by valve number */
const OUTFLOW_VALVE_COMBINED_ALERTS = [
  ['213800023', '213800024', '213800025', '213800019', '213800020', '213800021'],
  ['213800023', '213800026', '213800027', '213800019', '213800020', '213800022'],
  ['213800024', '213800026', '213800028', '213800019', '213800021', '213800022'],
  ['213800025', '213800027', '213800028', '213800020', '213800021', '213800022'],
] as const;
const CAB_PRESS_SYS_FAULT_ALERT = '213800017';

const AUTO_CTL_SYS_FAULT_ALERTS = ['213800029', '213800030', '213800031', '213800032'] as const;
/** The combined AUTO CTL FAULT alerts (two or three partitions) that contain the partition, by number */
const AUTO_CTL_COMBINED_ALERTS = [
  ['213800033', '213800034', '213800035', '213800039', '213800040', '213800041'],
  ['213800033', '213800036', '213800037', '213800039', '213800040', '213800042'],
  ['213800034', '213800036', '213800038', '213800039', '213800041', '213800042'],
  ['213800035', '213800037', '213800038', '213800040', '213800041', '213800042'],
] as const;
const AUTO_CTL_FAULT_ALERT = '213800005';

const OCSM_DESCRIPTION =
  'Each of the four outflow valves is positioned by its own controller, the OCSM, which has two channels. It moves ' +
  'its valve to follow the cabin vertical speed target, which comes from the automatic partition or from the ' +
  'selectors of the CAB PRESS panel in manual mode, and it limits the differential pressure.';

const BACKUP_MODE_EFFECT =
  'CAB PRESS IN BACKUP MODE, the regulated cabin altitude lines, and the limitation MAN PRESS : DO NOT USE.';

/** The combined and all-controllers-lost effects shared by the two OCSM channel families */
function outflowValveCombinedEffects(number: number): FailureDetail['effects'] {
  return [
    {
      where: 'E/WD',
      text:
        `With other outflow valve controllers lost too, CAB PRESS OUTFLW VLV CTL FAULT, ${CAUTION}, naming the ` +
        `lost valves (the 2 or 3 valve alerts that contain valve ${number}), replaces it; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
    },
    {
      where: 'E/WD',
      text:
        `All four controllers lost: CAB PRESS SYS FAULT, ${CAUTION}, ${NOT_SHOWN_PHASES_4_TO_7_9_10}. In flight it gives the lines for ` +
        'a descent to FL 100/MEA and the limitation MAX FL 100/MEA-MORA. On the ground it gives the pack OFF and ' +
        'residual pressure lines instead.',
    },
    {
      where: 'PFD',
      text: 'All four controllers lost: the limitation AVOID HI DESCENT V/S is shown.',
    },
  ];
}

const OcsmChannel1Family: FailureDetailFamily = {
  ids: [A380Failure.Ocsm1Ch1, A380Failure.Ocsm2Ch1, A380Failure.Ocsm3Ch1, A380Failure.Ocsm4Ch1],
  detail: (number): FailureDetail => ({
    whatItIs: OCSM_DESCRIPTION,
    impact: [
      `The other channel of OCSM ${number} keeps controlling outflow valve ${number}, so the pressure control is unchanged.`,
      `With both channels lost, outflow valve ${number} is commanded closed in automatic mode.`,
      'The other three valves then keep controlling the cabin pressure.',
    ],
    alertIds: [
      OUTFLOW_VALVE_CTL_FAULT_ALERTS[number - 1],
      ...OUTFLOW_VALVE_COMBINED_ALERTS[number - 1],
      CAB_PRESS_SYS_FAULT_ALERT,
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          'Nothing appears for this channel alone. With channel 2 of the same controller also lost, CAB PRESS ' +
          `OUTFLW VLV CTL ${number} FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      ...outflowValveCombinedEffects(number),
      {
        where: 'SD CAB PRESS',
        text:
          `The number ${number} of the outflow valve stays green with this channel alone. It turns amber when both ` +
          'channels are lost, and the valve is shown closed.',
      },
      {
        where: 'SD STATUS',
        text:
          `Both channels lost: OUTFLW VLV CTL ${number} FAULT, or the combined OUTFLW VLV CTL line, is listed as ` +
          `inoperative ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: false, reason: 'no indication to report with this channel alone' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const OcsmChannel2Family: FailureDetailFamily = {
  ids: [A380Failure.Ocsm1Ch2, A380Failure.Ocsm2Ch2, A380Failure.Ocsm3Ch2, A380Failure.Ocsm4Ch2],
  detail: (number): FailureDetail => ({
    whatItIs: OCSM_DESCRIPTION,
    impact: [
      `The other channel of OCSM ${number} keeps controlling outflow valve ${number}, so the pressure control is unchanged.`,
      `With both channels lost, outflow valve ${number} is commanded closed in automatic mode.`,
      'The other three valves then keep controlling the cabin pressure.',
    ],
    alertIds: [
      OUTFLOW_VALVE_CTL_FAULT_ALERTS[number - 1],
      ...OUTFLOW_VALVE_COMBINED_ALERTS[number - 1],
      CAB_PRESS_SYS_FAULT_ALERT,
    ],
    effects: [
      {
        where: 'SD CAB PRESS',
        text: `The number ${number} of the outflow valve turns amber. With both channels lost, the valve is shown closed.`,
      },
      {
        where: 'E/WD',
        text:
          'Nothing appears for this channel alone. With channel 1 of the same controller also lost, CAB PRESS ' +
          `OUTFLW VLV CTL ${number} FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      ...outflowValveCombinedEffects(number),
      {
        where: 'SD STATUS',
        text:
          `Both channels lost: OUTFLW VLV CTL ${number} FAULT, or the combined OUTFLW VLV CTL line, is listed as ` +
          `inoperative ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'the outflow valve number shows amber on the SD' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const OcsmAutoPartitionFamily: FailureDetailFamily = {
  ids: [A380Failure.OcsmAuto1, A380Failure.OcsmAuto2, A380Failure.OcsmAuto3, A380Failure.OcsmAuto4],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The automatic partition of an outflow valve controller (OCSM) takes the cabin vertical speed target from the ' +
      'cabin pressure application of the CPIOM B and hands it to the controller that moves the outflow valve.',
    impact: [
      `OCSM ${number} takes the target shared by the other controllers, so the automatic pressurization carries on ` +
        'while one automatic partition still works.',
      'With all four partitions lost, the controllers keep the last shared target and the automatic schedule is lost.',
    ],
    alertIds: [AUTO_CTL_SYS_FAULT_ALERTS[number - 1], ...AUTO_CTL_COMBINED_ALERTS[number - 1], AUTO_CTL_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text: `CAB PRESS AUTO CTL FAULT with the line AUTO CTL SYS ${number} FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_7_AND_9_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `With other partitions lost too, the combined CAB PRESS AUTO CTL FAULT alerts (lines AUTO CTL SYS 1+2, ` +
          `1+2+3 and so on, for the 2 or 3 partitions that contain ${number}) replace it, also ${ADVISORY}; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}. Unlike the single alert, they still appear after the first engine start.`,
      },
      {
        where: 'E/WD',
        text: `All four partitions lost: CAB PRESS AUTO CTL FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It gives ${BACKUP_MODE_EFFECT}`,
      },
      {
        where: 'PFD',
        text: 'All four partitions lost: the limitation AVOID HI DESCENT V/S is shown.',
      },
      {
        where: 'SD CAB PRESS',
        text: `The number ${number} of the outflow valve turns amber.`,
      },
      {
        where: 'SD STATUS',
        text:
          `CAB PRESS AUTO CTL ${number} is listed as inoperative while this alert or a combined one is shown. With ` +
          'all four lost, it goes away.',
      },
    ],
    logbook: { required: true, reason: 'alert and an amber outflow valve number on the SD' },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Applications in the CPIOM B
// ---------------------------------------------------------------------------------------------------------------------

const PACK_CTL_REDUNDANCY_LOST_ALERTS = ['211800007', '211800008'] as const;
const PACK_CTL_DEGRADED_ALERTS = ['211800005', '211800006'] as const;

const AgsApplicationFamily: FailureDetailFamily = {
  ids: [A380Failure.AgsApp1, A380Failure.AgsApp2, A380Failure.AgsApp3, A380Failure.AgsApp4],
  detail: (number): FailureDetail => {
    const pack = number % 2 === 1 ? 1 : 2;
    const partner = number <= 2 ? number + 2 : number - 2;
    const pair = pack === 1 ? 'B1 and B3' : 'B2 and B4';
    return {
      whatItIs:
        'The air generation application (AGS) runs in a CPIOM B. It works out the flow demand of each pack from the ' +
        'AIR FLOW selector, the passengers, the cabin altitude and the flight condition, and sends it to the pack ' +
        `controller. The applications in CPIOM ${pair} serve pack ${pack}.`,
      impact: [
        `The application of CPIOM B${partner} still sends the flow demand of pack ${pack}, so its control is normal.`,
        `With both applications of pack ${pack} lost (CPIOM ${pair}), the pack gets a fixed demand of 1 kg/s.`,
        'The pack monitoring reports are then lost too, so its overheat, bypass and valve alerts cannot be raised.',
      ],
      alertIds: [PACK_CTL_REDUNDANCY_LOST_ALERTS[pack - 1], PACK_CTL_DEGRADED_ALERTS[pack - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `AIR PACK ${pack} CTL REDUNDANCY LOST, ${ADVISORY}, ${CPIOM_B_POWER_NOTE}; ${NOT_SHOWN_PHASES_3_TO_11}. AIR PACK ` +
            `${pack} CTL DEGRADED replaces it when both applications are lost.`,
        },
        {
          where: 'E/WD',
          text: `Both applications of pack ${pack} lost: AIR PACK ${pack} CTL DEGRADED, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
        },
        {
          where: 'SD BLEED',
          text: 'With all four applications lost, the pack symbols show the packs inoperative.',
        },
        {
          where: 'SD COND',
          text: 'With all four applications lost, the pack symbols show the packs inoperative.',
        },
        {
          where: 'SD STATUS',
          text: `Both applications lost: PACK ${pack} CTL DEGRADED is listed as inoperative ${STATUS_NOTE}.`,
        },
      ],
      logbook: { required: true, reason: 'alert and a lost pack flow control application' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const TcsApplicationFamily: FailureDetailFamily = {
  ids: [A380Failure.TcsApp1, A380Failure.TcsApp2, A380Failure.TcsApp3, A380Failure.TcsApp4],
  detail: (): FailureDetail => ({
    whatItIs:
      'The temperature control application (TCS) runs in a CPIOM B, and all four CPIOM B host one. It reads the zone ' +
      'temperature selectors and the cabin temperatures, and works out the duct temperature each zone needs. The pack ' +
      'controllers and the temperature controller follow that demand, and the application collects the duct ' +
      'overheat and trim air valve reports.',
    impact: [
      'The temperature controller uses the first working application from B1 to B4: nothing is lost.',
      'If both applications of a pack pair (B1 and B3, or B2 and B4) are lost, that pack targets 24 °C for every zone.',
      'With all four lost, every zone is held at 24 °C whatever the selectors say.',
      'The duct overheat, trim air valve, HOT AIR FAULT and VLV OPEN, RAM air, mixer pressure and purser alerts then ' +
        'cannot be raised.',
    ],
    alertIds: ['211800042', '211800050'],
    effects: [
      {
        where: 'E/WD',
        text:
          `COND TEMP CTL REDUNDANCY LOST, ${ADVISORY}, when at least one application is lost ${CPIOM_B_POWER_NOTE} ` +
          `and COND TEMP CTL FAULT is not active (both TADD channels, or all four FDAC channels, lost); ${NOT_SHOWN_PHASES_3_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `All four applications lost, with COND TEMP CTL FAULT not active: COND TEMP CTL DEGRADED, ${ADVISORY}, ` +
          `replaces it; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      {
        where: 'SD BLEED',
        text: 'With all four applications lost, the hot-air valves are drawn closed.',
      },
      {
        where: 'SD COND',
        text: 'With all four applications lost, the hot-air valves are drawn closed.',
      },
      {
        where: 'SD STATUS',
        text: `With all four lost, TEMP CTL DEGRADED is listed as inoperative ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'alert and a lost temperature control application' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const VCS_DESCRIPTION =
  'The ventilation control application (VCS) runs in a CPIOM B. It sets the speed demand of the primary cabin fans in ' +
  'step with the pack flow and reports the cargo, fan and extract valve states of the ventilation controllers. The ' +
  'avionics ventilation function is reported through the same CPIOM B and fails with it.';

const VCS_ALL_FOUR_LOST =
  'With all four lost, the cargo, fan, extract valve, pack bay fan and avionics ventilation alerts cannot be raised.';

const VCS_ALL_FOUR_SD =
  'With all four applications lost, the bulk heater is drawn failed, the cabin fans disabled, the extract fans off ' +
  'and the isolation valves closed.';

const VcsForwardApplicationFamily: FailureDetailFamily = {
  ids: [A380Failure.VcsApp1, A380Failure.VcsApp3],
  detail: (number): FailureDetail => {
    const cpiom = number === 1 ? 'B1' : 'B3';
    return {
      whatItIs: `${VCS_DESCRIPTION} The applications in B1 and B3 also command the bulk cargo heater.`,
      impact: [
        'The other application of the pair (B1 first, then B3) keeps fans 1 and 2 and the bulk heater: nothing is lost.',
        'With both lost, fans 1 and 2 run at full speed under the forward controller, not in step with the pack flow.',
        'The bulk cargo heater can then no longer be switched on.',
        VCS_ALL_FOUR_LOST,
      ],
      alertIds: ['212800011', '212800009'],
      effects: [
        {
          where: 'E/WD',
          text:
            `COND FWD VENT CTL REDUNDANCY LOST, ${ADVISORY}, ${CPIOM_B_POWER_NOTE} (${cpiom}); ${NOT_SHOWN_PHASES_3_TO_11}. ` +
            'COND FWD VENT CTL DEGRADED replaces it when both applications are lost.',
        },
        {
          where: 'E/WD',
          text: `B1 and B3 both lost: COND FWD VENT CTL DEGRADED, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
        },
        {
          where: 'SD COND',
          text: VCS_ALL_FOUR_SD,
        },
        {
          where: 'SD STATUS',
          text: `With B1 and B3 lost, FWD VENT CTL DEGRADED is listed as inoperative ${STATUS_NOTE}.`,
        },
      ],
      logbook: { required: true, reason: 'alert and a lost ventilation control application' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const VcsAftApplicationFamily: FailureDetailFamily = {
  ids: [A380Failure.VcsApp2, A380Failure.VcsApp4],
  detail: (number): FailureDetail => {
    const cpiom = number === 1 ? 'B2' : 'B4';
    return {
      whatItIs: VCS_DESCRIPTION,
      impact: [
        'The other application of the pair (B2 first, then B4) keeps fans 3 and 4: nothing is lost.',
        'With both lost, fans 3 and 4 run at full speed under the aft controller, not in step with the pack flow.',
        VCS_ALL_FOUR_LOST,
      ],
      alertIds: ['212800005', '212800003'],
      effects: [
        {
          where: 'E/WD',
          text:
            `COND AFT VENT CTL REDUNDANCY LOST, ${ADVISORY}, ${CPIOM_B_POWER_NOTE} (${cpiom}); ${NOT_SHOWN_PHASES_3_TO_11}. ` +
            'COND AFT VENT CTL DEGRADED replaces it when both applications are lost.',
        },
        {
          where: 'E/WD',
          text: `B2 and B4 both lost: COND AFT VENT CTL DEGRADED, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
        },
        {
          where: 'SD COND',
          text: VCS_ALL_FOUR_SD,
        },
        {
          where: 'SD STATUS',
          text: `With B2 and B4 lost, AFT VENT CTL DEGRADED is listed as inoperative ${STATUS_NOTE}.`,
        },
      ],
      logbook: { required: true, reason: 'alert and a lost ventilation control application' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

/** The outflow valve controller each CPIOM B (1 to 4) serves with its cabin pressure application */
const OCSM_OF_CPIOM_B = [2, 4, 1, 3] as const;

const CpcsApplicationFamily: FailureDetailFamily = {
  ids: [A380Failure.CpcsApp1, A380Failure.CpcsApp2, A380Failure.CpcsApp3, A380Failure.CpcsApp4],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The cabin pressure control application (CPCS) runs in a CPIOM B, and each of the four CPIOM B hosts one. It ' +
      'works out the cabin altitude, cabin vertical speed and the vertical speed target for the outflow valve ' +
      'controllers, and sends the pressure readings to the displays and the warning system.',
    impact: [
      `Outflow valve controller ${OCSM_OF_CPIOM_B[number - 1]}, served by this application, takes its target from ` +
        'another controller.',
      'The displays use the next working application, so the pressurization stays automatic.',
      'With three or more lost, no controller uses a computed target: they keep the last shared target, or fly the ' +
        'backup profile if none, so the cabin no longer follows its schedule.',
      'With all four lost, the SD gauges fall back to the manual readings and the targets disappear.',
    ],
    alertIds: ['213800006', '213800005'],
    effects: [
      {
        where: 'SD CAB PRESS',
        text: `The number ${number} of the outflow valve turns amber.`,
      },
      {
        where: 'E/WD',
        text:
          `One lost application raises no alert. With two or more lost ${CPIOM_B_POWER_NOTE}, CAB PRESS CTL ` +
          `REDUNDANCY LOST appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}. It shows with three lost too, though the ` +
          'pressurization is already degraded.',
      },
      {
        where: 'E/WD',
        text:
          `All four applications lost: CAB PRESS AUTO CTL FAULT, ${CAUTION}, replaces it; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It gives ` +
          `${BACKUP_MODE_EFFECT}`,
      },
      {
        where: 'PFD',
        text: 'All four applications lost: the limitation AVOID HI DESCENT V/S is shown.',
      },
      {
        where: 'E/WD',
        text:
          'With all four lost, the differential pressure, excess, negative and residual pressure alerts and the ' +
          'pressure sensor alert cannot be raised. EXCESS CAB ALT stays, through the manual value.',
      },
    ],
    logbook: { required: true, reason: 'the outflow valve number shows amber on the SD' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata21ComputersFamilies: FailureDetailFamily[] = [
  FdacChannelFamily,
  TaddChannelFamily,
  VcmForwardChannelFamily,
  VcmAftChannelFamily,
  OcsmChannel1Family,
  OcsmChannel2Family,
  OcsmAutoPartitionFamily,
  AgsApplicationFamily,
  TcsApplicationFamily,
  VcsForwardApplicationFamily,
  VcsAftApplicationFamily,
  CpcsApplicationFamily,
];
