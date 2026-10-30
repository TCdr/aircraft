// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The phases (1, 2, 8, 11 and 12) in which most of the pack and ventilation alerts below are shown */
const SHOWN_ON_GROUND_AND_ABOVE_1500_FT =
  'shown with the engines off, with the first engine started, in flight above 1,500 ft (down to 800 ft), after ' +
  'landing and with the engines shut down, not around take-off or on approach';

const PACK_EXPLANATION =
  'The two air conditioning packs, one per side of the aircraft, cool the hot engine bleed air and deliver it to ' +
  'the mixer unit, which feeds the cabin and cockpit zones. Each pack is controlled by its own digital controller ' +
  '(FDAC).';

const PACK_VLV_ALERTS = ['211800017', '211800018', '211800019', '211800020'] as const;
const PACK_OVHT_ALERTS = ['211800013', '211800014'] as const;
const PACK_REGUL_FAULT_ALERTS = ['211800015', '211800016'] as const;
const PACK_BAY_VENT_ALERTS = ['212800025', '212800026'] as const;
const PACK_OFF_ALERTS = ['211800011', '211800012'] as const;
const RAM_AIR_ALERTS = ['211800037', '211800038'] as const;

const PackFlowValveFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Pack1FlowValve1Jammed,
    A380Failure.Pack1FlowValve2Jammed,
    A380Failure.Pack2FlowValve1Jammed,
    A380Failure.Pack2FlowValve2Jammed,
  ],
  detail: (number): FailureDetail => {
    const pack = number <= 2 ? 1 : 2;
    const valve = ((number - 1) % 2) + 1;
    return {
      whatItIs:
        `Each pack has two flow control valves that let engine bleed air into it. The pack controller opens them ` +
        `when the PACK pushbutton is ON and bleed air is available, closes them when it is OFF, and regulates the ` +
        `flow.`,
      impact: [
        `Flow valve ${valve} of pack ${pack} stops moving and keeps the position it had when the failure was set.`,
        `Stuck open: bleed air keeps flowing into pack ${pack} when the PACK ${pack} pushbutton is set to OFF.`,
        `Stuck closed: pack ${pack} runs on its other valve only, so about half of its flow, and nothing raises the flow of the healthy valve.`,
        `Both valves of the pack stuck closed: the pack gives no air.`,
      ],
      alertIds: [PACK_VLV_ALERTS[number - 1]],
      effects: [
        {
          where: 'Overhead AIR panel',
          text: `The PACK ${pack} pushbutton FAULT light comes on as soon as the valve position no longer matches what the controller commands.`,
        },
        {
          where: 'E/WD',
          text:
            `AIR PACK ${pack} VLV ${valve} FAULT, amber advisory without master caution or chime. Stuck open: about ` +
            `10 s after the pushbutton is set to OFF, and only while it stays OFF. Stuck closed: only when a valve of the other pack is also ` +
            `stuck closed, or the other pack controller is lost. Shown with the engines off, with the first engine ` +
            `started, in flight above 1,500 ft (down to 800 ft) and with the engines shut down; not around ` +
            `take-off, on approach, or after landing. Hidden behind AIR PACK ${pack} FAULT and AIR PACK 1+2 FAULT.`,
        },
        {
          where: 'E/WD',
          text:
            `In flight above 1,500 ft, setting PACK ${pack} OFF to reveal a stuck open valve also raises AIR PACK ` +
            `${pack} OFF, amber caution with master caution and single chime, 60 s after the pushbutton is OFF.`,
        },
        {
          where: 'SD CAB PRESS',
          text: `With both valves of pack ${pack} shut (the other valve also closed), the PACK ${pack} symbol turns amber.`,
        },
        {
          where: 'SD BLEED',
          text: `The valve symbol shows the stuck position (amber when closed). The pack is drawn amber when neither of its valves lets air through.`,
        },
        {
          where: 'SD COND',
          text: `The pack is drawn amber when neither of its valves lets air through.`,
        },
      ],
      notSimulated: [
        'The healthy valve of the pack does not open further to make up for the lost flow.',
        'The jam only shows when the command changes: a valve stuck in the position it already had gives no indication.',
      ],
      logbook: { required: true, reason: 'FAULT light and pack flow not under control' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const PackOverheatFamily: FailureDetailFamily = {
  ids: [A380Failure.Pack1Overheat, A380Failure.Pack2Overheat],
  detail: (number): FailureDetail => ({
    whatItIs:
      PACK_EXPLANATION +
      ' The controller watches the air temperature at the pack outlet and reports an overheat above 95 deg C.',
    impact: [
      `The outlet air of pack ${number} heats up (towards 130 deg C) while the pack has an air flow, and feeds the mixer unit.`,
      `The pack is not shut down by itself: the crew has to select the PACK ${number} pushbutton OFF.`,
      `Without air flow through the pack, nothing overheats: with the pack at rest the failure has no visible effect.`,
    ],
    alertIds: [PACK_OVHT_ALERTS[number - 1], PACK_OFF_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR PACK ${number} OVHT, amber caution with master caution and single chime, after the outlet passes ` +
          `95 deg C (about 10-15 s). It is ${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}, and hidden behind AIR PACK 1+2 FAULT.`,
      },
      {
        where: 'E/WD',
        text: `The procedure line asks for PACK ${number} OFF and is ticked once the pushbutton is OFF.`,
      },
      {
        where: 'E/WD',
        text:
          `In flight above 1,500 ft, once PACK ${number} is OFF and the outlet has cooled: AIR PACK ${number} OFF, ` +
          `amber caution with master caution and single chime, 60 s after the pushbutton is OFF.`,
      },
      { where: 'SD BLEED', text: `The pack outlet temperature readout climbs well above its normal value.` },
      {
        where: 'SD STATUS',
        text: `PACK ${number} is listed as inoperative.`,
      },
    ],
    notSimulated: [
      `The PACK ${number} pushbutton FAULT light stays off: it only reacts to a valve fault or a pack bay leak.`,
      'The pack is not shut down automatically by the controller.',
    ],
    logbook: { required: true, reason: 'ECAM caution and a pack lost' },
    clearing: `Maintenance only: use Restore. The alert goes away when PACK ${number} is selected OFF and the outlet cools below 95 deg C; with the pushbutton back ON the pack overheats again.`,
  }),
};

const PackRegulationFaultFamily: FailureDetailFamily = {
  ids: [A380Failure.Pack1RegulationFault, A380Failure.Pack2RegulationFault],
  detail: (number): FailureDetail => ({
    whatItIs:
      PACK_EXPLANATION +
      ' Each pack regulates its outlet temperature with two air cycle machines. In bypass mode both machines are ' +
      'failed and only the heat exchanger cools the air, so the performance is degraded, and below FL 290 the pack ' +
      'has to be switched OFF.',
    impact: [
      `Pack ${number} is reported in bypass mode to the warning system. The pack itself keeps working normally: only the report is simulated.`,
      `Pack ${number} is listed as inoperative on the status page.`,
      `Once the other pack also has a failed regulation component, the loss of regulation redundancy is shown too.`,
    ],
    alertIds: [PACK_REGUL_FAULT_ALERTS[number - 1], '211800022'],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR PACK ${number} REGUL FAULT, amber caution with master caution and single chime, with PACK ${number} ` +
          `IN BYPASS MODE and AVAIL ABOVE FL 290. Below FL 290 a PACK ${number} OFF line is added. ` +
          `It is ${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}, and hidden behind AIR PACK ${number} FAULT and AIR PACK 1+2 FAULT.`,
      },
      {
        where: 'E/WD',
        text:
          'AIR PACK 1+2 REGUL REDUNDANCY LOST, amber advisory without master caution or chime, when each pack has a ' +
          'failed regulation component (an air cycle machine or bypass mode). Same phases as above, hidden behind AIR PACK 1+2 FAULT.',
      },
      { where: 'SD BLEED', text: 'The BLEED page is called up with the alert.' },
      {
        where: 'SD STATUS',
        text: `PACK ${number} is listed as inoperative, with PACK ${number} AVAIL ABOVE FL 290, PACK ${number} REGUL DEGRADED (and PACK 1+2 REGUL DEGRADED with the redundancy alert) as information.`,
      },
    ],
    notSimulated: [
      'The pack outlet temperature is not affected by the bypass mode: only the report and the alerts are simulated.',
    ],
    logbook: { required: true, reason: 'ECAM caution and a pack listed inoperative' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AirCycleMachineFamily: FailureDetailFamily = {
  ids: [A380Failure.Pack1AirCycleMachine, A380Failure.Pack2AirCycleMachine],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each pack has two air cycle machines (a turbine and compressor unit) that cool and regulate the temperature ' +
      'of the pack air. One machine is enough to keep the pack available, the second gives the redundancy.',
    impact: [
      `One of the two air cycle machines of pack ${number} is failed. The other one keeps the pack available and nothing in the pack changes.`,
      'Only when each pack has a failed regulation component is the loss of redundancy shown to the crew.',
    ],
    alertIds: ['211800022'],
    effects: [
      {
        where: 'E/WD',
        text:
          `Alone: no indication. Once the other pack also has an air cycle machine failed (or is in bypass mode): ` +
          `AIR PACK 1+2 REGUL REDUNDANCY LOST, amber advisory without master caution or chime, ` +
          `${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}, hidden behind AIR PACK 1+2 FAULT.`,
      },
      {
        where: 'SD STATUS',
        text: 'PACK 1+2 REGUL DEGRADED is listed as information with that alert.',
      },
    ],
    notSimulated: ['The cooling performance of the pack is not changed by the failed air cycle machine.'],
    logbook: { required: false, reason: 'no indication for a single failure' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const PackBayBlowingFanFamily: FailureDetailFamily = {
  ids: [A380Failure.PackBay1BlowingFan, A380Failure.PackBay2BlowingFan],
  detail: (number): FailureDetail => ({
    whatItIs:
      `Each pack sits in its own bay. On the ground, where no ram air flows past, a blowing fan ventilates the bay ` +
      `of pack ${number} to carry off the heat of the pack. In flight the ram air does that job.`,
    impact: [
      `The blowing fan of pack bay ${number} is reported failed, but only on the ground. The pack keeps working normally.`,
      'Both bay fans failed: one combined alert replaces the two single ones.',
      `PACK ${number} is listed as inoperative on the status page, although the pack is still delivering air.`,
    ],
    alertIds: [PACK_BAY_VENT_ALERTS[number - 1], '212800027'],
    effects: [
      {
        where: 'E/WD',
        text:
          `On the ground only: VENT PACK BAY ${number} VENT FAULT, amber caution with master caution and single ` +
          `chime, or VENT PACK BAY 1+2 VENT FAULT when both fans are failed. ` +
          `Shown with the engines off, with the first engine started and after landing, never in flight. ` +
          `The single alert is hidden behind AIR PACK ${number} FAULT and AIR PACK 1+2 FAULT, the combined one behind AIR PACK 1+2 FAULT.`,
      },
      {
        where: 'E/WD',
        text: `The first line asks for PACK ${number} OFF and is ticked once the pushbutton is OFF. The second line, PACK ${number} AVAIL IN FLT, is information.`,
      },
      {
        where: 'SD STATUS',
        text: `PACK ${number} and PACK BAY ${number} VENT are listed as inoperative, with PACK ${number} AVAIL IN FLT as information (PACK 1+2, PACK BAY 1+2 VENT and PACK 1+2 AVAIL IN FLT when both fans are failed). They disappear after lift-off.`,
      },
    ],
    notSimulated: ['The bay is not modelled: nothing gets hot when the fan is lost.'],
    logbook: { required: true, reason: 'ECAM caution on the ground and a pack listed inoperative' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const RamAirInletFamily: FailureDetailFamily = {
  ids: [A380Failure.RamAirInlet1, A380Failure.RamAirInlet2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two RAM air inlets feed outside air directly into the mixer unit. The RAM AIR pushbutton opens them, ' +
      'for example when both packs are lost, and the forward ventilation controller moves them.',
    impact: [
      `RAM air inlet ${number} is reported as no longer controlled by the RAM AIR pushbutton. The inlet itself still follows the pushbutton in the simulation.`,
      'Only the forward ventilation controller reports it: with that controller lost, no alert is raised.',
    ],
    alertIds: [RAM_AIR_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `COND RAM AIR ${number} FAULT, amber advisory without master caution or chime, ` +
          `${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}.`,
      },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: `RAM AIR ${number} is listed as a loss of redundancy.` },
    ],
    notSimulated: ['The inlet keeps working: the failure only produces the alert.'],
    logbook: { required: true, reason: 'ECAM advisory and a lost redundancy' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const CabinPressureSensorFamily: FailureDetailFamily = {
  ids: [
    A380Failure.CabinPressureSensor1,
    A380Failure.CabinPressureSensor2,
    A380Failure.CabinPressureSensor3,
    A380Failure.CabinPressureSensor4,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Four cabin pressure sensors feed the cabin pressure controllers with the pressure inside the cabin. The ' +
      'pressurization system uses the sensors that are still available, and four sensors give a lot of redundancy.',
    impact: [
      `Cabin pressure sensor ${number} is reported failed. The pressure control itself is not affected in the simulation.`,
      'The crew is only told when two or three of the four sensors are failed.',
    ],
    alertIds: ['213800016'],
    effects: [
      {
        where: 'E/WD',
        text:
          'One failed sensor: no indication. Two or three failed: CAB PRESS SENSORS FAULT, amber advisory without ' +
          `master caution or chime, ${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}.`,
      },
      { where: 'SD CAB PRESS', text: 'The CAB PRESS page is called up with the alert.' },
    ],
    notSimulated: [
      'The failed sensor has no effect on the automatic or manual pressure control.',
      'All four sensors failed gives no alert.',
    ],
    logbook: { required: false, reason: 'no indication for a single failure' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata21PacksPressureEntries: Record<number, FailureDetail> = {
  [A380Failure.CabinAirExtractValve]: {
    whatItIs:
      'Two cabin air extract valves in the aft pressure bulkhead let cabin air out. They open by themselves when ' +
      'the differential pressure goes too high or too low, and the CABIN AIR EXTRACT pushbutton opens them by hand ' +
      '(for example for smoke removal).',
    impact: [
      'The valve stops moving and keeps the position it had when the failure was set.',
      'Stuck open: the cabin keeps losing air through it. Stuck closed: it cannot open for the pushbutton or for the pressure relief.',
      'The valve is listed inoperative on the status page.',
    ],
    alertIds: ['213800018'],
    effects: [
      {
        where: 'E/WD',
        text:
          'COND CABIN AIR EXTRACT VLV FAULT, amber advisory without master caution or chime, shown only from ' +
          'touch down, during taxi-in and for 5 minutes after engine shutdown, never in flight or before take-off.',
      },
      { where: 'SD STATUS', text: 'CAB AIR EXTRACT VLV is listed as inoperative.' },
      { where: 'SD COND', text: 'The valve symbol shows the position it is stuck in.' },
    ],
    notSimulated: ['Both valves are modelled as one, and it only opens on a too-high pressure difference.'],
    logbook: { required: true, reason: 'ECAM advisory after landing and an inoperative valve' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.CabinPressureManualControl]: {
    whatItIs:
      'The cabin pressure is normally regulated automatically through the four outflow valves. As a backup the crew ' +
      'can take over with the manual modes of the overhead CABIN PRESS panel, setting the cabin altitude or the ' +
      'cabin vertical speed by hand.',
    impact: [
      'The manual cabin altitude and manual vertical speed selections no longer have any effect: the automatic control carries on.',
      'The manual pressurization is not available as a backup for other pressurization faults.',
    ],
    alertIds: ['213800010'],
    effects: [
      {
        where: 'E/WD',
        text:
          'CAB PRESS MAN CTL FAULT, amber caution with master caution and single chime, shown from lift-off up to ' +
          '1,500 ft and from touch down, during taxi-in and for 5 minutes after engine shutdown. Not shown on the ground before ' +
          'take-off, above 1,500 ft or on approach.',
      },
      {
        where: 'E/WD',
        text: 'The procedure line CAB PRESS MAN MODES : DO NOT USE is shown, and MAN PRESS : DO NOT USE is added to the limitations.',
      },
      { where: 'SD CAB PRESS', text: 'The CAB PRESS page is called up with the alert.' },
      { where: 'SD STATUS', text: 'CAB PRESS MAN CTL is listed as inoperative.' },
      {
        where: 'Overhead CABIN PRESS panel',
        text: 'The MAN pushbuttons can still be pressed but nothing happens.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and the manual pressurization lost' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.MixerUnitPressureHigh]: {
    whatItIs:
      'The mixer unit collects the air from the two packs and the primary cabin fans and distributes it to the ' +
      'cabin and cockpit zones. Its pressure is monitored by the temperature control computers.',
    impact: [
      'The mixer unit pressure is reported abnormally high. Only the report is simulated, the air flow itself is not changed.',
      'A risk of reduced cabin air flow is shown as information.',
    ],
    alertIds: ['211800034'],
    effects: [
      {
        where: 'E/WD',
        text:
          'COND MIXER PRESS REGUL FAULT with MIXER PRESS HI, amber advisory without master caution or chime, ' +
          `${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}.`,
      },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: 'RISK OF REDUCED CABIN AIR FLOW is shown as information.' },
    ],
    notSimulated: ['The mixer unit pressure and the cabin air flow are not changed.'],
    logbook: { required: true, reason: 'ECAM advisory' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.MixerUnitPressureLow]: {
    whatItIs:
      'The mixer unit collects the air from the two packs and the primary cabin fans and distributes it to the ' +
      'cabin and cockpit zones. Its pressure is monitored by the temperature control computers.',
    impact: [
      'The mixer unit pressure is reported abnormally low. Only the report is simulated, the air flow itself is not changed.',
      'A risk of reduced cabin air flow is shown as information.',
    ],
    alertIds: ['211800034'],
    effects: [
      {
        where: 'E/WD',
        text:
          'COND MIXER PRESS REGUL FAULT, amber advisory without master caution or chime, ' +
          `${SHOWN_ON_GROUND_AND_ABOVE_1500_FT}. The MIXER PRESS LO line only appears with the engines off.`,
      },
      { where: 'SD COND', text: 'The COND page is called up with the alert.' },
      { where: 'SD STATUS', text: 'RISK OF REDUCED CABIN AIR FLOW is shown as information.' },
    ],
    notSimulated: ['The mixer unit pressure and the cabin air flow are not changed.'],
    logbook: { required: true, reason: 'ECAM advisory' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata21PacksPressureFamilies: FailureDetailFamily[] = [
  PackFlowValveFamily,
  PackOverheatFamily,
  PackRegulationFaultFamily,
  AirCycleMachineFamily,
  PackBayBlowingFanFamily,
  RamAirInletFamily,
  CabinPressureSensorFamily,
];
