// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Where the alerts that are inhibited in flight phases 3-7, 9 and 10 can be seen */
const SHOWN_GROUND_AND_CRUISE =
  'not shown from take-off power until 1,500 ft, nor from 800 ft on approach until the aircraft slows below 80 kt after landing';

/** The same, and also inhibited in phase 11 (landing roll) */
const SHOWN_NOT_LANDING_ROLL =
  'not shown from take-off power until 1,500 ft, nor from 800 ft on approach until the engines are shut down';

const PUSHBUTTON_FAULT_CARGO = 'Overhead CARGO AIR COND panel';

const CabinFanFamily: FailureDetailFamily = {
  ids: [A380Failure.CabinFan1, A380Failure.CabinFan2, A380Failure.CabinFan3, A380Failure.CabinFan4],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Four primary cabin fans pull cabin air back into the mixer unit, where it joins the fresh air from the two ' +
      'packs. They let the packs deliver less fresh air for the same cabin comfort.',
    impact: [
      `Cabin fan ${number} stops, so it adds no recirculated air to the mixer unit.`,
      'More failed fans escalate the alert: the more fans are lost, the less recirculated air the zones get.',
    ],
    alertIds: ['211800035', '211800044', '211800043', '211800023'],
    effects: [
      {
        where: 'E/WD',
        text:
          'One fan failed: ONE PRIMARY CABIN FAN FAULT, amber advisory without master caution or chime, shown only ' +
          `before the first engine start, in flight from 1,500 ft down to 800 ft, and after engine shutdown. Not shown when AC bus ${number} is unpowered.`,
      },
      {
        where: 'E/WD',
        text: `Two fans failed: TWO PRIMARY CABIN FANS FAULT, amber caution with master caution and single chime, ${SHOWN_NOT_LANDING_ROLL}.`,
      },
      {
        where: 'E/WD',
        text: `Three fans failed: THREE PRIMARY CABIN FANS FAULT, amber caution with master caution and single chime, ${SHOWN_NOT_LANDING_ROLL}.`,
      },
      {
        where: 'E/WD',
        text: `All four fans failed and powered: ALL PRIMARY CABIN FANS FAULT, amber caution with master caution and single chime, ${SHOWN_GROUND_AND_CRUISE}. The line AIR FLOW HI is asked for.`,
      },
      {
        where: 'SD STATUS',
        text: '1 PRIMARY CAB FAN is listed under redundancy loss. 2, 3 or ALL PRIMARY CAB FANS are listed inoperative, with CABIN TEMP REGUL DEGRADED.',
      },
      { where: 'SD COND', text: `The symbol of fan ${number} shows amber.` },
    ],
    logbook: { required: true, reason: 'fan symbol amber and ECAM alert' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const HOT_AIR_ZONES = ['main deck and forward cargo zones', 'cockpit and upper deck zones'] as const;

const HotAirFamily: FailureDetailFamily = {
  ids: [A380Failure.HotAir1, A380Failure.HotAir2],
  detail: (number): FailureDetail => ({
    whatItIs:
      `Hot air valve ${number} is one of the two hot air valves of the trim air system. It regulates the pressure of the ` +
      'hot bleed air that the trim air valves add to the air from the mixer unit, so each zone reaches the ' +
      `temperature selected for it. In this aircraft it supplies the ${HOT_AIR_ZONES[number - 1]}.`,
    impact: [
      'The valve stops moving and keeps the position it had when the failure was set.',
      number === 1
        ? 'The main deck and forward cargo trim air valves only open while valve 1 is open. In the model valve 1 also supplies the air of every trim air valve.'
        : 'The cockpit and upper deck trim air valves only open while valve 2 is open.',
      number === 1
        ? 'Stuck closed: no zone gets trim air in the model. Stuck open: the pushbutton can no longer shut the hot air off.'
        : 'Stuck closed: those zones get no hot air. Stuck open: the pushbutton can no longer shut the hot air off.',
    ],
    alertIds: number === 1 ? ['211800032', '211800048'] : ['211800033', '211800049'],
    effects: [
      {
        where: 'E/WD',
        text:
          `Stuck closed: HOT AIR ${number} FAULT, amber advisory without master caution or chime, about 30 s after ` +
          `the valve is commanded open (HOT AIR ${number} on and a pack flow valve open), ${SHOWN_GROUND_AND_CRUISE}.`,
      },
      {
        where: 'E/WD',
        text:
          `Stuck open: HOT AIR ${number} VLV OPEN, amber advisory without master caution or chime, about 14 s after ` +
          'the valve is commanded closed (pushbutton OFF or no pack flow valve open). Shown only on the ground ' +
          'before take-off power is set, or after the engines are shut down.',
      },
      { where: 'SD COND', text: 'The valve shows amber while it is closed or disagrees with its command.' },
      {
        where: 'SD STATUS',
        text: 'Stuck closed: CKPT TEMP REGUL and CAB PART TEMP REGUL inoperative, CABIN TEMP REGUL DEGRADED. Stuck open: nothing is listed.',
      },
      {
        where: 'Overhead AIR panel',
        text: `The HOT AIR ${number} pushbutton FAULT light stays off: it only shows a duct overheat or a leak.`,
      },
    ],
    notSimulated: [
      'The trim air shut-off valves that open to share the hot air when a hot air valve fails are not modelled.',
    ],
    logbook: { required: true, reason: 'the alert is raised and the temperature regulation is degraded' },
    clearing: `${MAINTENANCE_ONLY} The alert goes once the valve moves to the commanded position again. The FAULT alert also goes at once when the valve is no longer commanded open (pushbutton OFF or no pack flow valve open); in flight HOT AIR ${number} OFF then appears.`,
  }),
};

interface DuctZone {
  zone: string;
  hotAir: 1 | 2;
  /** the HOT AIR n OFF alert that follows the overheat once the crew has shut the hot air off */
  hotAirOffAlert: string;
  inop: string;
  info: string;
}

const DUCT_ZONES: readonly DuctZone[] = [
  {
    zone: 'cockpit',
    hotAir: 2,
    hotAirOffAlert: '211800047',
    inop: 'CKPT TEMP REGUL',
    info: 'CABIN TEMP REGUL DEGRADED',
  },
  {
    zone: 'main deck zone 1',
    hotAir: 1,
    hotAirOffAlert: '211800046',
    inop: 'CAB PART TEMP REGUL',
    info: 'CABIN TEMP REGUL DEGRADED',
  },
  {
    zone: 'upper deck zone 1',
    hotAir: 2,
    hotAirOffAlert: '211800047',
    inop: 'CAB PART TEMP REGUL',
    info: 'CABIN TEMP REGUL DEGRADED',
  },
  {
    zone: 'forward cargo',
    hotAir: 1,
    hotAirOffAlert: '211800046',
    inop: 'FWD CRG TEMP REGUL',
    info: 'CABIN TEMP REGUL DEGRADED and FWD CRG TEMP REGUL DEGRADED',
  },
];

const DuctOverheatFamily: FailureDetailFamily = {
  ids: [
    A380Failure.CkptDuctOverheat,
    A380Failure.MainDeck1DuctOverheat,
    A380Failure.UpperDeck1DuctOverheat,
    A380Failure.FwdCargoDuctOverheat,
  ],
  detail: (number): FailureDetail => {
    const { zone, hotAir, hotAirOffAlert, inop, info } = DUCT_ZONES[number - 1];
    return {
      whatItIs:
        'Each cockpit, cabin and forward cargo zone has a duct that carries its air, warmed by the trim air valve. ' +
        'The temperature controller watches the duct temperature and raises an overheat above 70 deg C. The crew ' +
        'then sets the hot air valve that feeds the duct to OFF.',
      impact: [
        `Hot air of about 200 deg C is forced into the ${zone} duct, but only while hot air valve ${hotAir} is open.`,
        `The ${zone} heats up and the overheat is declared once the duct stays above 70 deg C for 1.2 s.`,
        'Nothing closes the hot air valve by itself: the crew must set the pushbutton OFF.',
      ],
      alertIds: ['211800028', hotAirOffAlert],
      effects: [
        {
          where: 'E/WD',
          text: `DUCT OVHT, amber caution with master caution and single chime, ${SHOWN_GROUND_AND_CRUISE}. It asks for HOT AIR ${hotAir} OFF.`,
        },
        {
          where: 'Overhead AIR panel',
          text: `The HOT AIR ${hotAir} pushbutton FAULT light comes on. It goes off when the duct is below 70 deg C and the pushbutton is OFF.`,
        },
        { where: 'SD COND', text: `OVHT shows amber at the ${zone}.` },
        { where: 'SD STATUS', text: `${inop} inoperative, ${info}.` },
        {
          where: 'E/WD',
          text:
            `Once the duct has cooled with HOT AIR ${hotAir} set OFF, DUCT OVHT clears and HOT AIR ${hotAir} OFF ` +
            'takes its place, an amber caution shown only in flight from 1,500 ft down to 800 ft.',
        },
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and temperature regulation lost' },
      clearing:
        `Set HOT AIR ${hotAir} OFF and wait until the duct is below 70 deg C. The overheat returns when it is set ` +
        'back ON, as the deferred line of WHEN DUCT OVHT OUT asks, while the failure is set: use Restore.',
    };
  },
};

interface TrimValveZone {
  zone: string;
}

const TRIM_VALVE_ZONES: readonly TrimValveZone[] = [
  { zone: 'cockpit' },
  { zone: 'main deck zone 1' },
  { zone: 'upper deck zone 1' },
];

const TrimAirValveJammedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.CkptTrimAirValveJammed,
    A380Failure.MainDeck1TrimAirValveJammed,
    A380Failure.UpperDeck1TrimAirValveJammed,
  ],
  detail: (number): FailureDetail => {
    const { zone } = TRIM_VALVE_ZONES[number - 1];
    return {
      whatItIs:
        'The trim air valve of a zone adds hot bleed air to the air from the mixer unit until the zone reaches the ' +
        'temperature selected for it. The temperature controller opens or closes it and watches that it follows.',
      impact: [
        `The trim air valve of the ${zone} stops moving and keeps the position it had.`,
        'The temperature controller cannot adjust the hot air of that zone any more, so its temperature drifts.',
      ],
      alertIds: [],
      effects: [
        {
          where: 'SD COND',
          text:
            `An amber H with a triangle appears at the ${zone} once the valve has stayed more than 10 percent away ` +
            'from its command for over 10 s. A valve that already sits where it is commanded shows nothing until the demand changes.',
        },
        { where: 'E/WD', text: 'No alert is raised for this zone.' },
      ],
      notSimulated: [
        'The trim air shut-off valves that bring in hot air from the neighbouring manifolds are not modelled.',
      ],
      logbook: { required: true, reason: 'trim air valve mark on the SD and zone temperature no longer regulated' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata21CabinEntries: Record<number, FailureDetail> = {
  [A380Failure.RapidDecompression]: {
    whatItIs:
      'The pressurised fuselage keeps the cabin at a lower altitude than the aircraft. A hull breach opens a hole ' +
      'in this shell, so the pressurisation can no longer hold the cabin pressure.',
    impact: [
      'The breach adds a leak area of 0.2 square metres to the air that leaves the cabin.',
      'The cabin pressure falls and the cabin altitude climbs toward the aircraft altitude.',
      'The flight crew must treat it as an excessive cabin altitude and descend.',
    ],
    alertIds: ['213800001', '213800008'],
    effects: [
      {
        where: 'E/WD',
        text:
          'EXCESS CAB ALT, red warning with master warning and continuous chime, once the cabin altitude is above ' +
          '9,550 ft and 1,000 ft above both the departure and landing elevation. Shown only in flight from 1,500 ft ' +
          'down to 800 ft on approach.',
      },
      {
        where: 'E/WD',
        text:
          'DIFF PRESS LO, amber caution with master caution and single chime, in a descent faster than 500 ft/min ' +
          'with the cabin differential pressure below 1.45 psi and the cabin 1,500 ft above the landing elevation. ' +
          'Shown only in flight from 1,500 ft until touch down.',
      },
      { where: 'SD CAB PRESS', text: 'The cabin altitude climbs and the differential pressure falls.' },
      {
        where: 'E/WD',
        text: 'Above 13,800 ft cabin altitude the passenger masks drop automatically and the OXY PAX SYS ON memo appears.',
      },
      {
        where: 'Overhead OXYGEN panel',
        text: 'The PAX SYS ON light comes on above 13,800 ft cabin altitude, and stays on until the system is reset.',
      },
      { where: 'Cabin', text: 'All cabin signs come on automatically at an excessive cabin altitude.' },
    ],
    notSimulated: [
      'The crew oxygen masks are not modelled, and no oxygen flows to any mask.',
      'No sound or visual effect of the decompression in the cabin.',
    ],
    logbook: { required: true, reason: 'cabin pressure lost and a red ECAM warning' },
    clearing:
      'Maintenance only: use Restore, which closes the breach so the cabin pressure can recover. The masks stay deployed: the release latches and the crew resets it from the cockpit.',
  },
  [A380Failure.FwdIsolValve]: {
    whatItIs:
      'Four isolation valves close the forward cargo compartment from the cabin air flow, for example if smoke is ' +
      'detected. Normally they stay open, and the forward cargo extraction fan draws air through the compartment.',
    impact: [
      'The valves fail closed: the forward cargo extraction fan stops and no air flows through the compartment.',
      'The forward cargo temperature is no longer regulated.',
    ],
    alertIds: ['211800031'],
    effects: [
      {
        where: 'E/WD',
        text: `FWD CARGO VENT FAULT, amber advisory without master caution or chime, ${SHOWN_NOT_LANDING_ROLL}.`,
      },
      {
        where: PUSHBUTTON_FAULT_CARGO,
        text: 'The FWD ISOL VALVES pushbutton FAULT light comes on.',
      },
      { where: 'SD COND', text: 'The forward cargo isolation valve and extraction fan symbols show amber.' },
      {
        where: 'SD STATUS',
        text: 'FWD CRG VENT and FWD CRG TEMP REGUL inoperative, FWD CRG VENT DEGRADED and FWD CRG TEMP REGUL DEGRADED.',
      },
    ],
    notSimulated: ['The alert for a valve stuck open (FWD CARGO ISOL FAULT) never comes from this failure.'],
    logbook: { required: true, reason: 'ECAM alert, fault light and cargo ventilation lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.FwdExtractionFan]: {
    whatItIs:
      'The forward cargo extraction fan draws the air that was blown into the forward cargo compartment out ' +
      'through the compartment and overboard. It runs whenever the isolation valves are open.',
    impact: [
      'The fan stops, so no air flows through the forward cargo compartment.',
      'The compartment is no longer ventilated or temperature regulated.',
    ],
    alertIds: [],
    effects: [
      { where: 'SD COND', text: 'The forward cargo extraction fan symbol shows amber.' },
      { where: 'E/WD', text: 'No alert is raised.' },
    ],
    logbook: { required: true, reason: 'fan symbol amber and cargo ventilation lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.BulkIsolValve]: {
    whatItIs:
      'An inlet and an outlet isolation valve close the bulk cargo compartment from the cabin air flow. Normally ' +
      'they stay open, and the bulk cargo extraction fan draws cabin air through the compartment.',
    impact: [
      'The valves fail closed: the bulk cargo extraction fan stops and no air flows through the compartment.',
      'The bulk heater cannot run without that air flow.',
    ],
    alertIds: ['211800027'],
    effects: [
      {
        where: 'E/WD',
        text: `BULK CARGO VENT FAULT, amber advisory without master caution or chime, ${SHOWN_NOT_LANDING_ROLL}.`,
      },
      {
        where: PUSHBUTTON_FAULT_CARGO,
        text: 'The BULK ISOL VALVES pushbutton FAULT light comes on.',
      },
      { where: 'SD COND', text: 'The bulk cargo isolation valve and extraction fan symbols show amber.' },
      { where: 'SD STATUS', text: 'BULK CRG HEATER and BULK CRG VENT inoperative.' },
    ],
    notSimulated: ['The alert for a valve stuck open (BULK CARGO ISOL FAULT) never comes from this failure.'],
    logbook: { required: true, reason: 'ECAM alert, fault light and cargo ventilation lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.BulkExtractionFan]: {
    whatItIs:
      'The bulk cargo extraction fan draws cabin air through the bulk cargo compartment and overboard. The bulk ' +
      'heater warms that air when the compartment needs heating, so it only runs while the fan runs.',
    impact: [
      'The fan stops, so no air flows through the bulk cargo compartment.',
      'The bulk heater is held off, even with the HEATER pushbutton on.',
    ],
    alertIds: [],
    effects: [
      { where: 'SD COND', text: 'The bulk cargo extraction fan symbol shows amber.' },
      { where: 'E/WD', text: 'No alert is raised, and the HEATER fault light stays off.' },
    ],
    logbook: { required: true, reason: 'fan symbol amber and bulk cargo ventilation lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.BulkCargoHeater]: {
    whatItIs:
      'An electrical heater warms the cabin air that flows through the bulk cargo compartment, so live animals ' +
      'or sensitive freight can be carried there. The HEATER pushbutton on the CARGO AIR COND panel switches it.',
    impact: [
      'The heater stops heating, so the bulk cargo air is no longer warmed.',
      'The bulk cargo ventilation itself keeps running.',
    ],
    alertIds: ['211800025'],
    effects: [
      {
        where: 'E/WD',
        text:
          'BULK CARGO HEATER FAULT, amber advisory without master caution or chime, ' +
          `${SHOWN_GROUND_AND_CRUISE}. Not shown without power on AC bus 4.`,
      },
      { where: PUSHBUTTON_FAULT_CARGO, text: 'The HEATER pushbutton FAULT light comes on.' },
      { where: 'SD COND', text: 'HEATER shows amber at the bulk cargo temperature.' },
      { where: 'SD STATUS', text: 'BULK CRG HEATER inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM alert, fault light and bulk heating lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.BulkCargoDuctOverheat]: {
    whatItIs:
      'The bulk cargo heater warms the air in the bulk cargo duct. The ventilation controller watches the duct ' +
      'temperature and raises an overheat above 70 deg C, then the crew sets the heater OFF.',
    impact: [
      'While the bulk heater is allowed to run, the duct air is driven to 90 deg C.',
      'The overheat is declared once the duct stays above 70 deg C for 1.2 s.',
      'Nothing switches the heater off by itself.',
    ],
    alertIds: ['211800024'],
    effects: [
      {
        where: 'E/WD',
        text: `BULK CARGO DUCT OVHT, amber caution with master caution and single chime, ${SHOWN_GROUND_AND_CRUISE}. It asks for BULK HEATER OFF.`,
      },
      { where: PUSHBUTTON_FAULT_CARGO, text: 'The HEATER pushbutton FAULT light comes on.' },
      { where: 'SD STATUS', text: 'BULK CRG HEATER inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and heater to be shut off' },
    clearing:
      'Set the HEATER pushbutton OFF: the duct cools, the overheat and the alert clear. It returns when the heater ' +
      'is set back ON while the failure is set: use Restore.',
  },
  [A380Failure.FwdCargoTrimAirValveJammed]: {
    whatItIs:
      'The forward cargo compartment has two trim air valves (one in the model) that add hot bleed air to the cabin air that flows ' +
      'through it, to reach the temperature selected on the CARGO AIR COND panel.',
    impact: [
      'The trim air valve of the forward cargo stops moving and keeps the position it had.',
      'The temperature controller cannot adjust the forward cargo temperature any more, so it drifts.',
    ],
    alertIds: ['211800030'],
    effects: [
      {
        where: 'E/WD',
        text:
          'FWD CARGO TEMP REGUL FAULT, amber advisory without master caution or chime, ' +
          `${SHOWN_GROUND_AND_CRUISE}. It lists CARGO TRIM AIR VLV FAULT and asks to monitor the cargo temperature.`,
      },
      {
        where: 'SD COND',
        text:
          'An amber H with a triangle appears at the forward cargo once the valve has stayed more than 10 percent ' +
          'away from its command for over 10 s.',
      },
      { where: 'SD STATUS', text: 'FWD CRG TEMP REGUL DEGRADED. No system is listed inoperative.' },
    ],
    notSimulated: [
      'The aircraft has two forward cargo trim air valves; the model has one, and a jam only degrades the regulation.',
    ],
    logbook: { required: true, reason: 'ECAM alert and forward cargo temperature no longer regulated' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.PurserTemperatureSelection]: {
    whatItIs:
      'The cabin temperature can be selected by the purser on the flight attendant panel, when the CABIN selector ' +
      'of the AIR panel is turned to PURS SEL. The selection reaches the temperature controller through the ' +
      'cabin systems.',
    impact: [
      'The temperature controller keeps the last temperature it received from the purser.',
      'Later changes at the flight attendant panel are ignored.',
      'With the CABIN selector on a normal value the failure has no effect.',
    ],
    alertIds: ['211800036'],
    effects: [
      {
        where: 'E/WD',
        text:
          'PURSER TEMP SEL FAULT, amber caution with master caution and single chime, only while the CABIN ' +
          `selector is at PURS SEL, ${SHOWN_GROUND_AND_CRUISE}. It asks to adjust the cabin temperature.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution when PURS SEL is selected' },
    clearing: 'Set the CABIN selector to a temperature value, or use Restore.',
  },
};

export const Ata21CabinFamilies: FailureDetailFamily[] = [
  CabinFanFamily,
  HotAirFamily,
  DuctOverheatFamily,
  TrimAirValveJammedFamily,
];
