// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

/** The flight phases (3, 4, 5, 7 and 8) that most air conditioning alerts are inhibited in */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING = 'not shown around take-off and landing';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const NO_AFT_CARGO_HEAT = 'AFT CRG HEAT is never listed as inoperative: the aircraft has no cargo heating.';

const CABIN_ZONES = ['cockpit', 'forward cabin', 'aft cabin'] as const;
const DUCT_ZONE_NAMES = ['CKPT', 'FWD CAB', 'AFT CAB'] as const;

const ACSC_LANE_ALERTS = ['2161291', '2161297', '2161294', '2161298'] as const;
const PACK_FAULT_ALERTS = ['2161202', '2161203'] as const;

const AcscLaneFamily: FailureDetailFamily = {
  ids: [A320Failure.Acsc1Lane1, A320Failure.Acsc1Lane2, A320Failure.Acsc2Lane1, A320Failure.Acsc2Lane2],
  detail: (number): FailureDetail => {
    const acsc = number <= 2 ? 1 : 2;
    const letter = number % 2 === 1 ? 'A' : 'B';
    const zones = acsc === 1 ? 'The cockpit' : 'The cabin zones';
    return {
      whatItIs:
        'The two air conditioning system controllers regulate the pack flow and the temperature of the cockpit and ' +
        'cabin zones. Controller 1 looks after pack 1 and the cockpit, controller 2 after pack 2 and the cabin zones. ' +
        'Each has two lanes, A and B, and one lane is enough to keep it working.',
      impact: [
        `Lane ${letter} of controller ${acsc} fails. The other lane takes over, so the controller keeps working.`,
        `Both lanes failed: pack ${acsc} closes and its hot air stops.`,
        `${zones} then hold a fixed 24 deg C.`,
      ],
      alertIds: [ACSC_LANE_ALERTS[number - 1], PACK_FAULT_ALERTS[acsc - 1], '2161206'],
      effects: [
        { where: 'E/WD', text: `COND CTL ${acsc}-${letter} FAULT, shown only with both engines stopped.` },
        { where: 'SD STATUS', text: 'The lane is listed as inoperative.' },
        { where: 'E/WD', text: `Both lanes failed: PACK ${acsc} FAULT. Both controllers lost: PACK 1+2 FAULT.` },
      ],
      notSimulated: ['With both lanes failed, FWD CRG HEAT is never listed inoperative: no cargo heating.'],
      logbook: { required: true, reason: 'ECAM alert and a degraded controller' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const TrimAirValveFamily: FailureDetailFamily = {
  ids: [A320Failure.CkptTrimAirFailure, A320Failure.FwdTrimAirFailure, A320Failure.AftTrimAirFailure],
  detail: (number): FailureDetail => {
    const zone = CABIN_ZONES[number - 1];
    return {
      whatItIs:
        'Each of the three zones (cockpit, forward cabin, aft cabin) has a trim air valve. It adds a little hot air ' +
        'to the cool air from the packs until the zone reaches the selected temperature. The hot air comes from a ' +
        'pressure-regulated supply tapped upstream of the packs.',
      impact: [
        `The trim air valve of the ${zone} zone stops moving and keeps the position it had.`,
        number === 1
          ? 'The hot air valve closes by itself.'
          : 'The hot air valve closes by itself only if both cabin valves fail.',
      ],
      alertIds: ['2163305'],
      effects: [
        {
          where: 'E/WD',
          text:
            `TRIM AIR SYS FAULT with the ${DUCT_ZONE_NAMES[number - 1]} TRIM VALVE line, crew awareness, ` +
            `${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
        },
        { where: 'SD COND', text: 'Amber crosses replace the valve arrow.' },
      ],
      logbook: { required: true, reason: 'ECAM caution and a degraded zone control' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const DuctOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.CkptDuctOvht, A320Failure.FwdDuctOvht, A320Failure.AftDuctOvht],
  detail: (number): FailureDetail => {
    const zone = DUCT_ZONE_NAMES[number - 1];
    return {
      whatItIs:
        'Each zone duct carries the conditioned air, warmed by the trim air valve, to the cockpit or a cabin zone. ' +
        'A sensor in the duct watches its temperature. When the duct is too hot, the hot air valve closes to stop ' +
        'adding hot air.',
      impact: [
        `The ${zone} duct gets very hot (about 200 deg C) while the hot air valve is open.`,
        'The hot air valve closes, so the zones lose their hot air.',
        'No effect while the hot air valve is closed.',
      ],
      alertIds: [['2163210', '2163211', '2163212'][number - 1]],
      effects: [
        { where: 'E/WD', text: `${zone} DUCT OVHT, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
        { where: 'Overhead AIR COND panel', text: 'The HOT AIR FAULT light comes on.' },
        { where: 'SD STATUS', text: 'CAB TEMP BY PACK ONLY and HOT AIR inoperative.' },
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and hot air lost' },
      clearing: 'Below 70 deg C: HOT AIR off then on. It overheats again while the failure is set: use Restore.',
    };
  },
};

const CabinFanFamily: FailureDetailFamily = {
  ids: [A320Failure.CabinFan1Failure, A320Failure.CabinFan2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two recirculation fans pull cabin air back into the mixer unit, where it joins the fresh air from the packs. ' +
      'This lets the packs deliver less fresh air for the same cabin comfort.',
    impact: [
      `Recirculation fan ${number} of the cabin stops and adds no recirculated air to the pack air.`,
      'One fan alone raises no ECAM alert; both fans stopped does.',
    ],
    alertIds: ['2163218'],
    effects: [
      { where: 'SD COND', text: 'FAN shows amber.' },
      {
        where: 'E/WD',
        text: `Both fans: L+R CAB FAN FAULT with PACK FLOW HI, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'Both fans: status lines are listed.' },
    ],
    logbook: { required: true, reason: 'amber indication, ECAM caution if both fail' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const CabinPressureControllerFamily: FailureDetailFamily = {
  ids: [A320Failure.Cpc1, A320Failure.Cpc2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two cabin pressure controllers drive the outflow valve, one at a time with the other as backup. They set the ' +
      'cabin altitude and rate of change from the flight plan data, so pressurisation needs no crew action in normal ' +
      'operation.',
    impact: [
      `Cabin pressure controller ${number} fails. The other controller takes over automatically.`,
      'Both failed: the outflow valve stays where it was until MAN mode moves it.',
    ],
    alertIds: [['2131222', '2131223'][number - 1], '2131224'],
    effects: [
      { where: 'E/WD', text: `CAB PR SYS ${number} FAULT, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: `CAB PR ${number} is listed.` },
      { where: 'SD CAB PRESS', text: `SYS ${number} shows amber.` },
      { where: 'E/WD', text: 'Both failed: SYS 1+2 FAULT.' },
      { where: 'Overhead CAB PRESS panel', text: 'Both failed: the MODE SEL FAULT light comes on.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost pressurisation redundancy' },
    clearing: 'Maintenance only: use Restore. With both failed, MODE SEL MAN and MAN V/S CTL control the cabin.',
  }),
};

const PackOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.Pack1Overheat, A320Failure.Pack2Overheat],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each pack cools bleed air and delivers it to the mixer unit. A temperature sensor on the compressor outlet ' +
      'protects the pack, and a pack that gets too hot is shut by its pack flow valve.',
    impact: [
      `The compressor outlet of pack ${number} overheats about 20 s after the pack starts to flow. The pack valve ` +
        `closes.`,
      'The other pack switches to high flow while this one is closed.',
    ],
    alertIds: [['2161211', '2161212'][number - 1]],
    effects: [
      { where: 'E/WD', text: `PACK ${number} OVHT, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'Overhead AIR COND panel', text: `The PACK ${number} FAULT light comes on.` },
      { where: 'E/WD', text: 'The overheat clears after 30 s; the alert stays while the pack is OFF.' },
      { where: 'E/WD', text: 'Switching the pack ON ends the alert, but it trips again 20 s later.' },
    ],
    notSimulated: ['The compressor outlet temperature is a timer, not a real temperature.'],
    logbook: { required: true, reason: 'ECAM caution, fault light and pack lost' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const PackRegulationFamily: FailureDetailFamily = {
  ids: [A320Failure.Pack1Regulation, A320Failure.Pack2Regulation],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The pack controller regulates the temperature of the air leaving each pack, so it matches what the zone ' +
      'needing the coldest air asks for. The zone controller then adds hot air to refine each zone.',
    impact: [
      `The temperature regulation of pack ${number} fails. Its outlet temperature freezes at the value it had.`,
      'The outlet temperature no longer follows the zone demand, but the pack keeps delivering air.',
    ],
    alertIds: [['2161213', '2161214'][number - 1]],
    effects: [
      { where: 'E/WD', text: `PACK ${number} REGUL FAULT, crew awareness, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: `PACK ${number} REGUL is listed as inoperative.` },
      { where: 'Overhead AIR COND panel', text: `The PACK ${number} FAULT light stays off.` },
    ],
    notSimulated: ['HOT AIR is never listed inoperative, as with the flow control valve in backup mode.'],
    logbook: { required: true, reason: 'ECAM alert and degraded temperature regulation' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata21Entries: Record<number, FailureDetail> = {
  // Pressurisation
  [A320Failure.OutflowValve]: {
    whatItIs:
      'The outflow valve is the single exit for cabin air, at the rear of the fuselage. Opening or closing it sets ' +
      'the cabin pressure. Either of two automatic motors drives it under a cabin pressure controller, and a third ' +
      'motor drives it in manual mode.',
    impact: [
      'The valve stops moving in automatic mode and keeps the position it had. The manual mode still moves it.',
      'In flight the cabin pressure no longer follows the schedule.',
      'EXCESS CAB ALT, LO DIFF PR or SAFETY VALVE OPEN can follow.',
    ],
    alertIds: ['2131232', '2131221', '2131231', '2131233'],
    effects: [
      { where: 'E/WD', text: 'OFV NOT OPEN after landing, when the valve stays below 85 percent open for 70 s.' },
      { where: 'E/WD', text: 'No CAB PR SYS FAULT: the controllers do not see the valve fault.' },
    ],
    notSimulated: ['The second automatic motor of the real valve is not modelled, so nothing takes over.'],
    logbook: { required: true, reason: 'ECAM alert and lost automatic pressurisation' },
    clearing: 'Maintenance only: use Restore. MODE SEL MAN with MAN V/S CTL moves the valve meanwhile.',
  },
  [A320Failure.SafetyValve]: {
    whatItIs:
      'Two pneumatic safety valves on the rear pressure bulkhead protect the hull. They open if the cabin pressure ' +
      'gets too high above, or too low below, the outside pressure. They need no control from the crew.',
    impact: [
      'A cabin safety valve opens part way and the cabin leaks air through it.',
      'The slow leak can lead to EXCESS CAB ALT or LO DIFF PR.',
    ],
    alertIds: ['2131233', '2131221', '2131231'],
    effects: [
      { where: 'E/WD', text: 'SAFETY VALVE OPEN: at once before take-off, after 1 minute en route.' },
      { where: 'SD CAB PRESS', text: 'The SAFETY legend and valve turn amber.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and cabin pressure leak' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.RapidDecompression]: {
    whatItIs:
      'The cabin is a pressurised shell: the packs push air in and the outflow valve lets it out at a controlled ' +
      'rate. A hull breach is not a system part, so the cabin pressure controllers cannot hold the pressure against ' +
      'it.',
    impact: [
      'A hole opens in the pressure hull and the cabin loses pressure through it.',
      'The passenger oxygen masks drop when the cabin passes 14000 ft.',
      'LO DIFF PR can follow in a fast descent (over 500 ft/min) with low differential pressure.',
    ],
    alertIds: ['2131221', '2131231'],
    effects: [
      { where: 'SD CAB PRESS', text: 'Cabin altitude and vertical speed climb.' },
      {
        where: 'E/WD',
        text: 'EXCESS CAB ALT with emergency descent steps, only en route above 9550 ft cabin altitude.',
      },
    ],
    notSimulated: ['Only the pressure loss is modelled: no noise or other effect of the hull breach.'],
    logbook: { required: true, reason: 'ECAM warning and structural pressure loss' },
    clearing: 'Maintenance only: use Restore. The cabin then repressurises through the normal controllers.',
  },

  // Conditioning
  [A320Failure.HotAir]: {
    whatItIs:
      'The hot air pressure regulating valve controls the hot air that the zone trim air valves mix into the pack ' +
      'air. The air is tapped upstream of the packs. The valve is electrically controlled, and the HOT AIR pushbutton ' +
      'closes it.',
    impact: [
      'The valve stops moving and keeps the position it had. It no longer follows the temperature controllers or ' +
        'the HOT AIR pushbutton.',
    ],
    alertIds: ['2163290'],
    effects: [
      {
        where: 'E/WD',
        text:
          `Stuck closed: HOT AIR FAULT about 30 s after it is commanded open. Stuck open: about 14 s after it is ` +
          `commanded closed. ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD COND', text: 'The valve turns amber.' },
      { where: 'Overhead AIR COND panel', text: 'The HOT AIR FAULT light stays off: only a duct overheat lights it.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a stuck valve' },
    clearing: 'Maintenance only: use Restore. HOT AIR OFF ends the alert only if the valve is stuck closed.',
  },
  [A320Failure.TrimAirHighPressure]: {
    whatItIs:
      'The hot air supply to the trim air valves is held at a regulated low pressure, so the valves can meter it ' +
      'accurately into each zone duct. A pressure sensor downstream of the hot air valve monitors it.',
    impact: ['The pressure downstream of the hot air valve rises above its limit, to about 22 psi.'],
    alertIds: ['2163305'],
    effects: [
      {
        where: 'E/WD',
        text:
          `TRIM AIR SYS FAULT with TRIM AIR HI PR, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
          `It shows even with the hot air valve closed.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution for a trim air fault' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.LabGalleyFan]: {
    whatItIs:
      'An extraction fan draws cabin air through the lavatories and galleys and sends it out near the outflow valve. ' +
      'It runs continuously whenever there is electrical power. Cabin temperature sensors use this airflow to read ' +
      'the cabin air temperature.',
    impact: [
      'The extraction fan stops. The cabin temperature sensors lose their airflow.',
      'Cabin regulation is lost: the cabin selectors set the duct temperature directly.',
    ],
    alertIds: ['2163260'],
    effects: [
      { where: 'E/WD', text: `LAV+GALLEY FAN FAULT, crew awareness, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: 'CAB TEMP CKPT CTL ONLY and GALLEY FAN inoperative.' },
      { where: 'SD STATUS', text: 'With ACSC 2 also failed: CAB AT FIXED TEMP, PACK 2 and COND CTL 2 inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and degraded cabin temperature control' },
    clearing: MAINTENANCE_ONLY,
  },

  // Ventilation
  [A320Failure.AvionicsVentilationController]: {
    whatItIs:
      'The avionics equipment ventilation controller runs all the fans and valves that cool the avionics bay. It ' +
      'chooses open, closed or intermediate circuit from the skin temperature and the flight phase.',
    impact: [
      'The controller is reported failed. There is no avionics ventilation model, so only the warning system reacts.',
    ],
    alertIds: ['2140010'],
    effects: [
      { where: 'E/WD', text: 'VENT AVNCS SYS FAULT, crew awareness, shown only on the ground at low power.' },
      { where: 'SD STATUS', text: 'AVNCS VENT inoperative.' },
      { where: 'SD CAB PRESS', text: 'The blower, extract and valve legends stay normal.' },
    ],
    notSimulated: [
      'The controller-not-supplied case (VENT BLOWER and VENT EXTRACT also inoperative) is not simulated.',
      'The avionics cooling and the weather radar are not affected.',
    ],
    logbook: { required: true, reason: 'ECAM alert on the ground' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AvionicsBlowerFan]: {
    whatItIs:
      'The blower fan pushes air through the avionics bay to cool the equipment. It is controlled by the avionics ' +
      'ventilation controller and the BLOWER pushbutton, which can force it to its override mode.',
    impact: ['The blower fan is reported failed. The fan itself is not modelled, so only the warning system reacts.'],
    alertIds: ['2140020'],
    effects: [
      { where: 'E/WD', text: `VENT BLOWER FAULT with BLOWER OVRD, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'E/WD', text: 'With a DC ESS bus fault, LAND ASAP replaces BLOWER OVRD.' },
      { where: 'SD STATUS', text: 'VENT BLOWER inoperative.' },
      { where: 'Overhead VENTILATION panel', text: 'The BLOWER pushbutton FAULT light stays off.' },
      { where: 'SD CAB PRESS', text: 'The BLOWER legend stays white.' },
    ],
    notSimulated: ['The FAULT light of the pushbutton and the legend on the CAB PRESS page.'],
    logbook: { required: true, reason: 'ECAM caution and a lost fan' },
    clearing: 'Maintenance only: use Restore. The OVRD pushbutton only removes the procedure line.',
  },
  [A320Failure.AvionicsExtractFan]: {
    whatItIs:
      'The extract fan pulls the warm air out of the avionics bay. It is controlled by the avionics ventilation ' +
      'controller and the EXTRACT pushbutton, which can force it to its override mode.',
    impact: ['The extract fan is reported failed. The fan itself is not modelled, so only the warning system reacts.'],
    alertIds: ['2140030'],
    effects: [
      { where: 'E/WD', text: `VENT EXTRACT FAULT with EXTRACT OVRD, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: 'VENT EXTRACT inoperative.' },
      { where: 'Overhead VENTILATION panel', text: 'The EXTRACT pushbutton FAULT light stays off.' },
      { where: 'SD CAB PRESS', text: 'The EXTRACT legend stays white.' },
    ],
    notSimulated: ['The FAULT light of the pushbutton and the legend on the CAB PRESS page.'],
    logbook: { required: true, reason: 'ECAM caution and a lost fan' },
    clearing: 'Maintenance only: use Restore. The OVRD pushbutton only removes the procedure line.',
  },
  [A320Failure.AvionicsSkinExtractValveStuckOpen]: {
    whatItIs:
      'The skin exchange valves let air flow between the avionics bay and the space under the cargo floor, where ' +
      'the cold fuselage skin cools it. The extract valve is the exit for that air and is positioned by the ' +
      'avionics ventilation controller.',
    impact: [
      'The skin extract valve sticks open. The valve itself is not modelled.',
      'The BLOWER and EXTRACT OVRD steps do not close the valve.',
    ],
    alertIds: ['2140040'],
    effects: [
      { where: 'E/WD', text: 'VENT SKIN VALVE FAULT, shown only en route and early in the take-off roll.' },
      { where: 'E/WD', text: 'After both OVRD steps: MAX FL 100, MODE SEL MAN, MAN V/S CTL FULL UP.' },
      { where: 'SD STATUS', text: 'The manual pressurisation table and AVNCS VALVE inoperative.' },
    ],
    notSimulated: [
      'The open valve does not leak cabin air.',
      'The loss of the weather radar picture from poor ventilation is not modelled.',
    ],
    logbook: { required: true, reason: 'ECAM caution and pressurisation affected' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AvionicsSkinInletValveStuckOpen]: {
    whatItIs:
      'The skin exchange valves let air flow between the avionics bay and the space under the cargo floor, where ' +
      'the cold fuselage skin cools it. The inlet valve is the entry for that air and is positioned by the ' +
      'avionics ventilation controller.',
    impact: ['The skin inlet valve sticks open. The valve itself is not modelled.', 'No crew action is required.'],
    alertIds: ['2140050'],
    effects: [
      {
        where: 'E/WD',
        text: 'VENT SKIN VALVE FAULT, crew awareness, shown only en route. Nothing shows on the ground.',
      },
      { where: 'SD STATUS', text: 'AVNCS VALVE inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM alert on a stuck valve' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AftCargoExtractionFan]: {
    whatItIs:
      'The aft cargo compartment is ventilated by an extraction fan that draws cabin air through it. Isolation valves ' +
      'at the compartment inlet and outlet close it off, and the AFT ISOL VALVE pushbutton controls them.',
    impact: [
      'The extraction fan of the aft cargo ventilation is reported failed. The fan itself is not modelled.',
      'The alert needs the AFT ISOL VALVE pushbutton in AUTO, no smoke and both valves open.',
    ],
    alertIds: ['2150010'],
    effects: [
      { where: 'E/WD', text: `AIR AFT CRG VENT FAULT, crew awareness, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: 'AFT CRG VENT inoperative.' },
    ],
    notSimulated: [NO_AFT_CARGO_HEAT],
    logbook: { required: true, reason: 'ECAM alert and a lost fan' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AftCargoIsolationValvesStuckClosed]: {
    whatItIs:
      'Two isolation valves, at the inlet and outlet of the aft cargo compartment, open to ventilate it and close ' +
      'to seal it, for example when smoke is detected. They follow the AFT ISOL VALVE pushbutton.',
    impact: [
      'Both isolation valves of the aft cargo ventilation stay closed, whatever the AFT ISOL VALVE pushbutton says.',
      'Pushbutton OFF ends light and alert: the valves then match the command.',
    ],
    alertIds: ['2150020'],
    effects: [
      {
        where: 'Overhead VENTILATION panel',
        text: 'With the pushbutton in AUTO the AFT ISOL VALVE FAULT light comes on.',
      },
      { where: 'E/WD', text: `COND AFT CRG ISOL VALVE, crew awareness, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: 'AFT CRG VENT inoperative.' },
    ],
    notSimulated: ['No airflow through the compartment is modelled.', NO_AFT_CARGO_HEAT],
    logbook: { required: true, reason: 'ECAM alert, fault light and compartment ventilation lost' },
    clearing: 'Maintenance only: use Restore. The pushbutton OFF only ends the alert.',
  },
};

export const Ata21Families: FailureDetailFamily[] = [
  AcscLaneFamily,
  TrimAirValveFamily,
  DuctOverheatFamily,
  CabinFanFamily,
  CabinPressureControllerFamily,
  PackOverheatFamily,
  PackRegulationFamily,
];
