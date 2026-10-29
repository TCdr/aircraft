// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 3, 4, 5, 7 and 8 inhibit most ANTI ICE alerts */
const NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH =
  'not shown from take-off power setting until 1,500 ft, on approach below 800 ft or in the landing roll above 80 kt';

/** Flight phases 4, 5 and 8 inhibit the pitot pair alerts */
const NOT_SHOWN_IN_TAKE_OFF_AND_LANDING_ROLL =
  'not shown in the take-off roll above 80 kt, from lift-off to 1,500 ft or in the landing roll above 80 kt';

/** Flight phases 4, 5, 7 and 8 inhibit WING A.ICE VALVE OPEN */
const NOT_SHOWN_ABOVE_80_KT_AND_ON_APPROACH =
  'not shown in the take-off roll above 80 kt, from lift-off to 1,500 ft, on approach below 800 ft or in the landing roll above 80 kt';

const HEATING_MONITORED_WHEN =
  'Detected only while the computer is powered and the heating is demanded: PROBE/WINDOW HEAT pb-sw ON, an engine running or in flight.';

const NO_PROBE_ICING_MODEL = 'The probe is never unheated in the sim: no icing of the probe or false air data results.';

const SIDE_NAMES = ['CAPT', 'F/O', 'STBY'] as const;

const COMPUTER_FAILED_SHOWS_PROBES_INSTEAD =
  'Hidden while the probe heat computer of that side has itself failed: its PROBES alert is shown instead.';

/** Keys of the pitot pair alerts: CAPT + F/O, CAPT + STBY, F/O + STBY */
const PITOT_PAIR_ALERTS = { captFo: '3001202', captStby: '3001203', foStby: '3001204' } as const;
const ALL_PITOT_ALERT = '3001201';

/** The pitot pair alerts that include a probe set (0 CAPT, 1 F/O, 2 STBY) */
function pitotPairAlertsOf(side: number): string[] {
  return [
    [PITOT_PAIR_ALERTS.captFo, PITOT_PAIR_ALERTS.captStby],
    [PITOT_PAIR_ALERTS.captFo, PITOT_PAIR_ALERTS.foStby],
    [PITOT_PAIR_ALERTS.captStby, PITOT_PAIR_ALERTS.foStby],
  ][side];
}

/** The AIR DATA SWTG line belongs to the CAPT and F/O alerts only */
function singleProbeAlertText(title: string, side: number, tail: string): string {
  const switching = side === 2 ? '' : ` with AIR DATA SWTG ${side === 0 ? 'CAPT 3' : 'F/O 3'} until it is selected`;
  return `${title}${switching}, amber caution with master caution and a single chime, ${tail}.`;
}

function singleProbeEffects(title: string, side: number, inopSystem: string): SeenEffect[] {
  return [
    { where: 'E/WD', text: singleProbeAlertText(title, side, NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH) },
    { where: 'E/WD', text: COMPUTER_FAILED_SHOWS_PROBES_INSTEAD },
    { where: 'SD STATUS', text: `${inopSystem} is listed as inoperative.` },
  ];
}

const PROBE_HEAT_SYSTEM =
  'Each of the three probe heat computers (captain, first officer, standby) switches on and watches the heaters of its ' +
  'air data probes: pitot, static ports, angle of attack and, except on the standby set, total air temperature. ' +
  'The heating runs automatically with an engine running or in flight, or before start with the PROBE/WINDOW HEAT pb-sw ON.';

const EngineAntiIceStuckClosedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1AntiIceValveStuckClosed, A320Failure.Eng2AntiIceValveStuckClosed],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each engine has its own nacelle anti-ice valve, supplied with hot air from the high-pressure compressor of that ' +
      'engine. The ENG ANTI ICE pb-sw closes the valve through a solenoid; with the pb-sw ON, or without electrical power, ' +
      'compressor air opens it and warms the air intake.',
    impact: [
      `The anti-ice valve of engine ${number} stays closed whatever the ENG ANTI ICE pb-sw asks.`,
      'No hot air reaches the nacelle intake, and the sim engine anti-ice, which follows the valve, stays off.',
      'With the pb-sw OFF the closed valve is what is wanted: nothing is shown.',
    ],
    alertIds: [`300110${number}`],
    effects: [
      {
        where: 'E/WD',
        text:
          `ANTI ICE ENG ${number} VALVE CLSD with AVOID ICING CONDITIONS, 5 s after the pb-sw is ON with the engine ` +
          `running.`,
      },
      {
        where: 'E/WD',
        text: `That alert is ${NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH}.`,
      },
      { where: 'Overhead ANTI ICE panel', text: `ENG ${number} FAULT light comes on while the pb-sw is ON.` },
      { where: 'SD STATUS', text: `AVOID ICING CONDITIONS, with ENG ${number} A. ICE listed as inoperative.` },
    ],
    notSimulated: ['The failure adds no icing of its own: any engine icing comes from the sim.'],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost anti-ice' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const EngineAntiIceStuckOpenFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1AntiIceValveStuckOpen, A320Failure.Eng2AntiIceValveStuckOpen],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each engine has its own nacelle anti-ice valve, supplied with hot air from the high-pressure compressor of that ' +
      'engine. The ENG ANTI ICE pb-sw closes the valve through a solenoid; with the pb-sw ON, or without electrical power, ' +
      'compressor air opens it and warms the air intake.',
    impact: [
      `The anti-ice valve of engine ${number} stays open, with the pb-sw OFF and with the engine stopped.`,
      'The FADEC lowers the N1 limit and raises the idle slightly, as for a selected nacelle anti-ice.',
      'With the pb-sw ON the open valve is what is wanted: nothing is shown.',
    ],
    alertIds: [`300110${number + 2}`],
    effects: [
      {
        where: 'E/WD',
        text:
          `ANTI ICE ENG ${number} VALVE OPEN with THRUST LIM PENALTY, 5 s after the valve is open with the pb-sw OFF, ` +
          `also before engine start, ${NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH}.`,
      },
      { where: 'Overhead ANTI ICE panel', text: `ENG ${number} FAULT light comes on while the pb-sw is OFF.` },
      { where: 'SD STATUS', text: 'THRUST LIM PENALTY.' },
      {
        where: 'E/WD',
        text: 'The NAI memo beside the thrust limit follows the pb-sw, not the valve: it does not show for the open valve.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a thrust limit penalty' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const WingAntiIceStuckOpenFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftWingAntiIceValveStuckOpen, A320Failure.RightWingAntiIceValveStuckOpen],
  detail: (number): FailureDetail => {
    const wing = number === 1 ? 'left' : 'right';
    const side = number === 1 ? 'L' : 'R';
    return {
      whatItIs:
        'Each wing has an anti-ice valve that lets bleed air into the three outboard slats, switched on by the WING ' +
        'ANTI ICE pb-sw in flight. On the ground the valve opens only for a 30 s test after the pb-sw is set ON, then ' +
        'closes again.',
      impact: [
        `The ${wing} wing anti-ice valve opens fully and no longer follows the pb-sw or the controller.`,
        'Bleed air flows through the slat ducts and out to the atmosphere for as long as the valve is open.',
        'With the pb-sw ON in flight nothing is shown. On the ground the valve stays open after the 30 s test.',
      ],
      alertIds: [number === 1 ? '3000114' : '3000115', '3000116'],
      effects: [
        {
          where: 'E/WD',
          text:
            `WING A.ICE ${side} VALVE OPEN, 10 s after the valve is open with the pb-sw OFF, ` +
            `${NOT_SHOWN_ABOVE_80_KT_AND_ON_APPROACH}.`,
        },
        {
          where: 'E/WD',
          text:
            'On the ground, 35 s after the pb-sw is ON: WING A.ICE OPEN ON GND with WING ANTI ICE OFF. ' +
            'Shown only before take-off power setting and after landing below 80 kt.',
        },
        {
          where: 'Overhead ANTI ICE panel',
          text: 'WING ANTI ICE FAULT light comes on: the valve disagrees with the pb-sw.',
        },
        {
          where: 'SD BLEED',
          text:
            'The wing anti-ice triangle shows at the bleed of that engine while the valve is open: green in flight, ' +
            'amber on the ground 10 s after the pb-sw is ON.',
        },
      ],
      notSimulated: [
        'The thrust limit follows the wing anti-ice command, not the valve: THRUST LIM PENALTY is shown but not applied.',
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and bleed air lost through the wing' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const ProbeHeatComputerFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptProbeHeatComputer, A320Failure.FoProbeHeatComputer, A320Failure.StbyProbeHeatComputer],
  detail: (number): FailureDetail => {
    const side = number - 1;
    const name = SIDE_NAMES[side];
    return {
      whatItIs: PROBE_HEAT_SYSTEM,
      impact: [
        `The ${name} probe heat computer fails and no longer watches its heaters.`,
        'Single heater alerts of that side are hidden: the PROBES alert covers them.',
        'Its pitot counts as unheated: with another pitot heating lost the alert becomes a pitot pair or ALL PITOT.',
      ],
      alertIds: [['3001211', '3001212', '3001213'][side], ALL_PITOT_ALERT, ...pitotPairAlertsOf(side)],
      effects: [
        {
          where: 'E/WD',
          text:
            `ANTI ICE ${name} PROBES${side === 2 ? '' : ` with AIR DATA SWTG ${side === 0 ? 'CAPT 3' : 'F/O 3'} until it is selected`}, ` +
            `shown whether or not the probes are heated, ${NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH}.`,
        },
        {
          where: 'E/WD',
          text:
            'With another pitot heating lost: CAPT + F/O, CAPT + STBY or F/O + STBY PITOT; with all three: ALL PITOT. ' +
            `Both ${NOT_SHOWN_IN_TAKE_OFF_AND_LANDING_ROLL}.`,
        },
        { where: 'SD STATUS', text: `${name} PROBES is listed as inoperative.` },
      ],
      notSimulated: [NO_PROBE_ICING_MODEL],
      logbook: { required: true, reason: 'ECAM caution and a lost probe heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const PitotHeatFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptPitotHeat, A320Failure.FoPitotHeat, A320Failure.StbyPitotHeat],
  detail: (number): FailureDetail => {
    const side = number - 1;
    const name = SIDE_NAMES[side];
    return {
      whatItIs:
        'Each pitot probe measures the total pressure for the airspeed. An electric heater keeps it free of ice and ' +
        'is watched by the probe heat computer of its air data set. The standby set feeds the standby instruments.',
      impact: [
        `The ${name} pitot heater fails and the computer detects it.`,
        'Losing two or three pitot heaters raises a more complete alert that replaces the single ones.',
        HEATING_MONITORED_WHEN,
      ],
      alertIds: [['3001221', '3001222', '3001223'][side], ...pitotPairAlertsOf(side), ALL_PITOT_ALERT],
      effects: [
        ...singleProbeEffects(`ANTI ICE ${name} PITOT`, side, `${name} PITOT`).slice(0, 1),
        {
          where: 'E/WD',
          text:
            `With another pitot heating also lost: ${side === 0 ? 'CAPT + F/O or CAPT + STBY' : side === 1 ? 'CAPT + F/O or F/O + STBY' : 'CAPT + STBY or F/O + STBY'} ` +
            `PITOT; with all three: ALL PITOT. Both ${NOT_SHOWN_IN_TAKE_OFF_AND_LANDING_ROLL}.`,
        },
        {
          where: 'E/WD',
          text: 'The pair and ALL PITOT alerts list ADR P/B OFF lines. IF ICING EXPECTED and UNREL SPD PROC follow when the third ADR is unavailable.',
        },
        { where: 'SD STATUS', text: `${name} PITOT is listed as inoperative.` },
      ],
      notSimulated: [NO_PROBE_ICING_MODEL],
      logbook: { required: true, reason: 'ECAM caution and a lost pitot heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

/** CAPT left, CAPT right, F/O left, F/O right, STBY left, STBY right */
const StaticPortHeatFamily: FailureDetailFamily = {
  ids: [
    A320Failure.CaptLeftStaticHeat,
    A320Failure.CaptRightStaticHeat,
    A320Failure.FoLeftStaticHeat,
    A320Failure.FoRightStaticHeat,
    A320Failure.StbyLeftStaticHeat,
    A320Failure.StbyRightStaticHeat,
  ],
  detail: (number): FailureDetail => {
    const side = Math.floor((number - 1) / 2);
    const left = number % 2 === 1;
    const name = SIDE_NAMES[side];
    const port = left ? 'L STAT' : 'R STAT';
    return {
      whatItIs:
        'Each air data set has a static port on each side of the fuselage, which senses the outside air pressure for ' +
        'altitude and speed. A heater keeps each port free of ice and is watched by the probe heat computer of that set.',
      impact: [
        `The ${left ? 'left' : 'right'} static port heater of the ${name} set fails and the computer detects it.`,
        'Only the heating alert follows: the static pressure itself is unchanged.',
        HEATING_MONITORED_WHEN,
      ],
      alertIds: [String((left ? 3001231 : 3001241) + side)],
      effects: singleProbeEffects(`ANTI ICE ${name} ${port}`, side, `${name} ${port}`),
      notSimulated: [NO_PROBE_ICING_MODEL],
      logbook: { required: true, reason: 'ECAM caution and a lost static port heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const AoaHeatFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptAoaHeat, A320Failure.FoAoaHeat, A320Failure.StbyAoaHeat],
  detail: (number): FailureDetail => {
    const side = number - 1;
    const name = SIDE_NAMES[side];
    return {
      whatItIs:
        'The angle of attack probes are small vanes on the nose. They feed the flight controls and the stall warning, ' +
        'and a heater keeps each vane free of ice, watched by the probe heat computer of its air data set.',
      impact: [
        `The ${name} angle of attack probe heater fails and the computer detects it.`,
        'Only the heating alert follows: the angle of attack reading itself is unchanged.',
        HEATING_MONITORED_WHEN,
      ],
      alertIds: [String(3001251 + side)],
      effects: singleProbeEffects(`ANTI ICE ${name} AOA`, side, `${name} AOA`),
      notSimulated: [NO_PROBE_ICING_MODEL],
      logbook: { required: true, reason: 'ECAM caution and a lost AOA probe heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const TatHeatFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptTatHeat, A320Failure.FoTatHeat],
  detail: (number): FailureDetail => {
    const name = SIDE_NAMES[number - 1];
    return {
      whatItIs:
        'The total air temperature probes sit on the nose and measure the air temperature for the air data computers. ' +
        'A heater prevents icing in flight; on the ground the probe is not heated.',
      impact: [
        `The ${name} total air temperature probe heater fails and the computer detects it.`,
        'Detected in flight only: the probe is not heated on the ground.',
        'The standby set has no such probe.',
      ],
      alertIds: [String(3001260 + number)],
      effects: [
        {
          where: 'E/WD',
          text: `ANTI ICE ${name} TAT, amber caution with master caution and a single chime, ${NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH}.`,
        },
        { where: 'E/WD', text: COMPUTER_FAILED_SHOWS_PROBES_INSTEAD },
        { where: 'SD STATUS', text: `${name} TAT is listed as inoperative.` },
      ],
      notSimulated: [NO_PROBE_ICING_MODEL],
      logbook: { required: true, reason: 'ECAM caution and a lost TAT probe heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const WINDOW_HEAT_SYSTEM =
  'Each side has a window heat computer that regulates and watches the heating of the windshield and the side ' +
  'window of that side, and protects them from overheating. The heating runs automatically with an engine running ' +
  'or in flight, or before engine start with the PROBE/WINDOW HEAT pb-sw ON.';

const WindshieldHeatFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftWindshieldHeat, A320Failure.RightWindshieldHeat],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    return {
      whatItIs: WINDOW_HEAT_SYSTEM,
      impact: [
        `The windshield heating of the ${number === 1 ? 'left' : 'right'} side fails and the computer detects it.`,
        'With both windshields failed one alert replaces the two single ones.',
        'Detected only while the computer is powered and the heating is demanded.',
      ],
      alertIds: [String(3001271 + number), '3001271'],
      effects: [
        {
          where: 'E/WD',
          text: `ANTI ICE ${side} WINDSHIELD, amber caution with master caution and a single chime, ${NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH}.`,
        },
        { where: 'E/WD', text: 'With the other windshield failed too: L + R WINDSHIELD instead, same inhibition.' },
        { where: 'SD STATUS', text: `${side} WSHLD HEAT is listed as inoperative, or WSHLD HEAT for both.` },
      ],
      notSimulated: ['The glass never fogs or ices up: the heating has no effect on the view.'],
      logbook: { required: true, reason: 'ECAM caution and a lost windshield heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const WindowHeatFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftWindowHeat, A320Failure.RightWindowHeat],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    return {
      whatItIs: WINDOW_HEAT_SYSTEM,
      impact: [
        `The heating of the ${number === 1 ? 'left' : 'right'} cockpit side window fails and the computer detects it.`,
        'Only the side window is affected: the windshield keeps its own heating.',
        'Detected only while the computer is powered and the heating is demanded.',
      ],
      alertIds: [String(3001273 + number)],
      effects: [
        {
          where: 'E/WD',
          text: `ANTI ICE ${side} WINDOW, amber caution with master caution and a single chime, ${NOT_SHOWN_AT_TAKE_OFF_AND_APPROACH}.`,
        },
        { where: 'SD STATUS', text: `${side} WNDW HEAT is listed as inoperative.` },
      ],
      notSimulated: ['The glass never fogs or ices up: the heating has no effect on the view.'],
      logbook: { required: true, reason: 'ECAM caution and a lost window heating' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata30Entries: Record<number, FailureDetail> = {};

export const Ata30Families: FailureDetailFamily[] = [
  EngineAntiIceStuckClosedFamily,
  EngineAntiIceStuckOpenFamily,
  WingAntiIceStuckOpenFamily,
  ProbeHeatComputerFamily,
  PitotHeatFamily,
  StaticPortHeatFamily,
  AoaHeatFamily,
  TatHeatFamily,
  WindshieldHeatFamily,
  WindowHeatFamily,
];
