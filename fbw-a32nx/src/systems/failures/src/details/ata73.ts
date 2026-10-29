// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

/** The flight phases (3, 4, 5, 7 and 8) that most engine control alerts are inhibited in */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING = 'not shown around take-off and landing';

/** The flight phases 4, 5, 7 and 8: shown again in the climb, cruise and descent above 800 feet */
const NOT_SHOWN_ABOVE_80_KNOTS_AND_BELOW_1500_FEET =
  'not shown from 80 knots on take-off to 1,500 feet, nor from 800 feet until the landing roll is below 80 knots';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'amber caution, master caution and single chime';

const FADEC_TEXT =
  'Each engine is run by a full authority digital engine control (FADEC) with two identical channels, A and B. ' +
  'One channel is in control and the other waits as a standby; if the active one fails, the other takes over. ' +
  'The FADEC sets the fuel flow, the thrust, the start and the reverser operation of its engine.';

const THRUST_LEVER_RESOLVER_TEXT =
  'Each thrust lever has two resolvers, angle sensors that tell the two FADEC channels where the lever is. ' +
  'The FADEC turns the lever angle into the thrust it commands, and one working resolver is enough to do that.';

const ENGINE_KEEPS_RUNNING_AS_BEFORE = 'The engine runs as before.';

const FADEC_CHANNEL_ALERTS = ['7700501', '7700503', '7700502', '7700504'] as const;
const FADEC_FAULT_ALERTS = ['7700511', '7700512'] as const;

const FadecChannelFamily: FailureDetailFamily = {
  ids: [
    A320Failure.Eng1FadecChannelA,
    A320Failure.Eng2FadecChannelA,
    A320Failure.Eng1FadecChannelB,
    A320Failure.Eng2FadecChannelB,
  ],
  detail: (number): FailureDetail => {
    const engine = ((number - 1) % 2) + 1;
    const channel = number <= 2 ? 'A' : 'B';
    return {
      whatItIs: FADEC_TEXT,
      impact: [
        `Channel ${channel} of the engine ${engine} FADEC fails. The other channel takes control and the engine runs as before.`,
        'Both channels failed: the FADEC no longer commands the reverser and the auto-thrust orders no longer reach the engine.',
        'The engine then keeps following its thrust lever.',
      ],
      alertIds: [FADEC_CHANNEL_ALERTS[number - 1], FADEC_FAULT_ALERTS[engine - 1]],
      effects: [
        {
          where: 'E/WD',
          text: `ENG ${engine} FADEC ${channel} FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
        },
        {
          where: 'E/WD',
          text: `Both channels failed: ENG ${engine} FADEC FAULT replaces it, ${NOT_SHOWN_ABOVE_80_KNOTS_AND_BELOW_1500_FEET}.`,
        },
        {
          where: 'E/WD',
          text: 'Ground: thrust lever not above idle. Flight: idle. Then check parameters; ENG MASTER OFF if abnormal.',
        },
        { where: 'Pedestal ENG panel', text: 'Both channels failed: the ENG MASTER FAULT light comes on.' },
      ],
      notSimulated: [
        'With both channels lost the engine indications are not lost: they keep showing the engine values.',
      ],
      logbook: { required: true, reason: 'ECAM caution and a lost FADEC channel' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const FadecOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FadecOverheat, A320Failure.Eng2FadecOverheat],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The FADEC sits on the fan case and watches the temperature of its own electronics. ' +
      'A temperature above its limit is reported to the crew as FADEC HI TEMP, so that the engine can be shut down ' +
      'before the electronics are lost.',
    impact: [
      `The FADEC of engine ${engine} reports an overheat of its electronics.`,
      'Nothing else changes: the FADEC keeps controlling the engine.',
    ],
    alertIds: [engine === 1 ? '7700521' : '7700522'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FADEC HI TEMP with FADEC OVHT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'Ground: thrust lever idle, ENG MASTER OFF, ENG MODE NORM, FADEC GND PWR OFF. Flight: check parameters; if abnormal, idle, ENG MASTER OFF.',
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: ['The FADEC does not really get hot: its channels keep working and the engine is not affected.'],
    logbook: { required: true, reason: 'ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ThrustLeverBothResolversFamily: FailureDetailFamily = {
  ids: [A320Failure.ThrustLever1Resolvers, A320Failure.ThrustLever2Resolvers],
  detail: (engine): FailureDetail => ({
    whatItIs: THRUST_LEVER_RESOLVER_TEXT,
    impact: [
      `Both resolvers of thrust lever ${engine} fail: the FADEC no longer knows where the lever is.`,
      'On the ground it sets idle. In flight it holds take-off thrust or climb thrust, and sets idle for the approach.',
      'The reverser of that engine no longer deploys.',
    ],
    alertIds: [engine === 1 ? '7700531' : '7700532'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} THR LEVER FAULT, ${CAUTION}. Not shown from 80 knots on take-off to 1,500 feet, unless idle is set.`,
      },
      {
        where: 'E/WD',
        text: `Ground: ENG ${engine} IDLE POWER ONLY. Flight: ENG AT IDLE, or A/THR KEEP ON, or HI PWR IN MAN THR; take-off thrust held: A/THR ON.`,
      },
      {
        where: 'SD STATUS',
        text: `ENG ${engine} AT IDLE once the slats are out. Inoperative: REVERSER ${engine}, ENG ${engine} THR.`,
      },
      { where: 'Pedestal ENG panel', text: 'The ENG MASTER FAULT light comes on.' },
    ],
    notSimulated: ['The two resolvers are not modelled one by one: the failure loses both at once.'],
    logbook: { required: true, reason: 'ECAM caution, fault light and a restricted thrust lever' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ThrustLeverDisagreeFamily: FailureDetailFamily = {
  ids: [A320Failure.ThrustLever1ResolverDisagree, A320Failure.ThrustLever2ResolverDisagree],
  detail: (engine): FailureDetail => ({
    whatItIs: THRUST_LEVER_RESOLVER_TEXT,
    impact: [
      `The two resolvers of thrust lever ${engine} give different angles and the FADEC cannot tell which one is right.`,
      'On the ground the engine is limited to idle, except in a take-off. In flight it uses the larger angle up to climb thrust.',
    ],
    alertIds: [engine === 1 ? '7700541' : '7700542'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} THR LEVER DISAGREE, ${CAUTION}.`,
      },
      {
        where: 'E/WD',
        text: 'Not shown from 80 knots on take-off to 1,500 feet, unless the FADEC has set idle by itself.',
      },
      {
        where: 'E/WD',
        text: `Ground: ENG ${engine} IDLE POWER ONLY; in a take-off: ENG TO, FLX OR DRT TO. Flight: AVAIL MAX POWER CLB, A/THR KEEP ON or ON.`,
      },
      { where: 'SD STATUS', text: `Maximum power limits for engine ${engine}. Inoperative: ENG ${engine} THR.` },
    ],
    notSimulated: [
      'The two resolvers are not modelled one by one: the second one follows the lever, the first one freezes.',
    ],
    logbook: { required: true, reason: 'ECAM caution and a limited engine' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ThrustLeverOneResolverFamily: FailureDetailFamily = {
  ids: [A320Failure.ThrustLever1OneResolver, A320Failure.ThrustLever2OneResolver],
  detail: (engine): FailureDetail => ({
    whatItIs: THRUST_LEVER_RESOLVER_TEXT,
    impact: [
      `One resolver of thrust lever ${engine} fails. The other one still gives the lever angle.`,
      'Only the redundancy is lost. The thrust control and the engine are not affected.',
    ],
    alertIds: [engine === 1 ? '7707361' : '7707362'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} ONE TLA FAULT, ${CAUTION}, not shown from take-off power until the landing roll is below 80 knots, cruise included.`,
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost redundancy' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const EiuFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1Eiu, A320Failure.Eng2Eiu],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'Each engine has an engine interface unit (EIU) that gathers the aircraft data the FADEC needs and sends it ' +
      'over a data bus: the positions of ENG MASTER, ENG MODE and MAN START, the flight or ground status and the slats position.',
    impact: [
      `The FADEC of engine ${engine} no longer gets the aircraft data. The engine itself keeps running.`,
      'Its start and relight, its auto-thrust and its reverser are lost.',
      'The idle is the approach idle and the N1 limit loses its bleed corrections, for both engines.',
    ],
    alertIds: [engine === 1 ? '7707731' : '7707732'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} EIU FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. Shown only while the FADEC has power.`,
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
      {
        where: 'SD STATUS',
        text: `ENG ${engine} APPR IDLE ONLY and CAT 2 ONLY. Inoperative: A/THR, CAT 3, REVERSER ${engine}, ENG ${engine} START.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost start, auto-thrust and reverser' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FuelFilterClogFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FuelFilterClog, A320Failure.Eng2FuelFilterClog],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The fuel filter of each engine stops dirt before the fuel reaches the metering unit. A pressure sensor ' +
      'watches the pressure lost across the filter and warns when it is too high. A clogged filter is bypassed, so ' +
      'engine operation is not affected in the short term.',
    impact: [
      `The fuel filter of engine ${engine} clogs. Maintenance action is due.`,
      'The engine keeps running as before: nothing else changes.',
    ],
    alertIds: [engine === 1 ? '7707301' : '7707302'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FUEL FILTER CLOG, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'E/WD', text: 'Shown only while the engine runs with ENG MASTER ON.' },
      { where: 'SD ENG', text: 'The ENG page is called, with an amber CLOG under the fuel used.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a clogged filter' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const HpFuelValveFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1HpFuelValveStuck, A320Failure.Eng2HpFuelValveStuck],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The high pressure fuel valve is the last shutoff before the burner. The FADEC opens it for a start and closes ' +
      'it when ENG MASTER goes off, and it compares the real position with its command.',
    impact: [
      `The HP fuel valve of engine ${engine} sticks where it is: closed on a shut down engine, open on a running one.`,
      'Stuck closed: no fuel reaches the engine, so it cannot start and a relight in flight does not work.',
      'Stuck open: nothing shows while the engine runs. At ENG MASTER OFF the valve is found not closed.',
    ],
    alertIds: [engine === 1 ? '7707311' : '7707312'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} HP FUEL VALVE, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'It comes 2 seconds after the position differs from the command: at the start if stuck closed, at ENG MASTER OFF if stuck open.',
      },
      {
        where: 'E/WD',
        text: 'Stuck closed: HP FUEL VALVE NOT OPEN, and on the ground MAN START OFF (if used), ENG MASTER OFF. Stuck open: HP FUEL POS SWT FAULT.',
      },
      { where: 'Pedestal ENG panel', text: 'The ENG MASTER FAULT light comes on with the alert.' },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a failed start' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FadecAlternatorFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FadecAlternator, A320Failure.Eng2FadecAlternator],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'Once the engine turns, a magnetic alternator on its gearbox supplies the FADEC with its own power. ' +
      'Before that, and as a back-up, the aircraft network supplies it.',
    impact: [
      `The own electrical supply of the FADEC of engine ${engine} is lost.`,
      'The aircraft network supplies the FADEC, so the engine is not affected.',
    ],
    alertIds: [engine === 1 ? '7707321' : '7707322'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FADEC ALTERNATOR, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. Shown only while the engine runs.`,
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost FADEC supply' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const OverspeedProtectionFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1OverspeedProtection, A320Failure.Eng2OverspeedProtection],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The FADEC protects the engine against N1 and N2 overspeed: it cuts the fuel when a rotor goes beyond its limit. ' +
      'It watches that protection and reports when it is no longer available.',
    impact: [
      `The overspeed protection of engine ${engine} is lost.`,
      'The engine runs as before. The crew has to watch N1 and N2 itself.',
    ],
    alertIds: [engine === 1 ? '7707331' : '7707332'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} OVSPD PROT FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost protection' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const InletProbesFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1InletProbes, A320Failure.Eng2InletProbes],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The probes at the engine inlet measure the air temperature (T12), the ambient pressure (P0) and the pressure ' +
      'at the fan face (PT2). The FADEC needs them to compute thrust, schedules and limits.',
    impact: [
      `The inlet probes data of engine ${engine} is unavailable on both FADEC channels.`,
      'The engine is not affected in this simulation.',
    ],
    alertIds: [engine === 1 ? '7707341' : '7707342'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} PROBES FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING} and in the first minute after touchdown.`,
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: ['The FADEC does not fall back to degraded schedules: thrust and limits are unchanged.'],
    logbook: { required: true, reason: 'ECAM caution and lost probe data' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const CoreSensorsFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1Sensors, A320Failure.Eng2Sensors],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'Sensors in the engine core measure the pressures and temperatures after the compressor (PS3, T25, T3) and the ' +
      'speeds N1 and N2. The FADEC uses them for the fuel control and for the engine indications.',
    impact: [
      `The core sensor data of engine ${engine} is unavailable on both FADEC channels.`,
      'N1 and N2 are shown with a reduced accuracy. The engine itself runs as before.',
    ],
    alertIds: [engine === 1 ? '7707351' : '7707352'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} SENSOR FAULT, ${CAUTION}.`,
      },
      {
        where: 'E/WD',
        text: `Alert ${NOT_SHOWN_ABOVE_80_KNOTS_AND_BELOW_1500_FEET}.`,
      },
      {
        where: 'E/WD',
        text: 'Ground: thrust lever to idle, ENG MASTER OFF. Flight: AVOID RAPID THR CHANGES, also on STATUS.',
      },
      { where: 'E/WD', text: 'The last digit of the N1 and N2 of that engine becomes two amber dashes.' },
    ],
    notSimulated: [
      'The engine really answers normally to thrust changes: the AVOID RAPID THR CHANGES order has no cause.',
    ],
    logbook: { required: true, reason: 'ECAM caution and degraded engine indications' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FuelMeteringValveFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FuelMeteringValve, A320Failure.Eng2FuelMeteringValve],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The fuel metering valve (FMV) sits in the hydromechanical unit and sets the fuel flow to the engine. ' +
      'The FADEC commands its position and reads back the real one.',
    impact: [
      `The metering valve position, command or feedback of engine ${engine} is failed.`,
      'The engine runs as before and answers normally to the thrust lever.',
    ],
    alertIds: [engine === 1 ? '7707371' : '7707372'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FUEL CTL FAULT, ${CAUTION}.`,
      },
      {
        where: 'E/WD',
        text: `Alert ${NOT_SHOWN_ABOVE_80_KNOTS_AND_BELOW_1500_FEET}.`,
      },
      {
        where: 'E/WD',
        text: 'Ground: thrust lever to idle, ENG MASTER OFF. Flight: AVOID RAPID THR CHANGES, also on STATUS.',
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: ['The slow engine response or the loss of fuel control of a real valve fault is not modelled.'],
    logbook: { required: true, reason: 'ECAM caution and a fuel control fault' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FUEL_RETURN_VALVE_TEXT =
  'Part of the fuel leaving the hydromechanical unit cools the oil of the integrated drive generator (IDG) and goes ' +
  'back to the wing tank when the oil is too hot at low thrust. The fuel return valve, commanded by the FADEC, ' +
  'regulates that flow.';

const FuelReturnValveClosedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FuelReturnValveFailedClosed, A320Failure.Eng2FuelReturnValveFailedClosed],
  detail: (engine): FailureDetail => ({
    whatItIs: FUEL_RETURN_VALVE_TEXT,
    impact: [
      `The fuel return valve of engine ${engine} stays closed.`,
      'No fuel goes back to the tank, so the fuel no longer cools the IDG oil.',
      'The FADEC still raises the minimum N2 when the oil is hot, although the return flow cannot cool it.',
      ENGINE_KEEPS_RUNNING_AS_BEFORE,
    ],
    alertIds: [engine === 1 ? '7707381' : '7707382'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FUEL RETURN VALVE with VALVE NOT OPEN, amber caution, crew awareness.`,
      },
      { where: 'E/WD', text: `Alert ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost IDG fuel cooling' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FuelReturnValveOpenFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FuelReturnValveFailedOpen, A320Failure.Eng2FuelReturnValveFailedOpen],
  detail: (engine): FailureDetail => ({
    whatItIs: FUEL_RETURN_VALVE_TEXT,
    impact: [
      `The fuel return valve of engine ${engine} stays open.`,
      'While the engine runs, at least 300 kg/h of fuel goes back to the wing tank, whatever the oil temperature.',
      ENGINE_KEEPS_RUNNING_AS_BEFORE,
    ],
    alertIds: [engine === 1 ? '7707381' : '7707382'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FUEL RETURN VALVE with VALVE NOT CLOSED, amber caution, crew awareness.`,
      },
      { where: 'E/WD', text: `Alert ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
    ],
    logbook: { required: true, reason: 'ECAM caution and a fuel return flow' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ClearanceControlValvesFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1ClearanceControlValves, A320Failure.Eng2ClearanceControlValves],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The burner staging valve, the high pressure turbine clearance control and the rotor active clearance control ' +
      'are FADEC-controlled systems. They manage the burner fuel staging and keep the gaps around the turbine and ' +
      'compressor blades small, to save fuel.',
    impact: [
      `One of the burner staging, turbine clearance or rotor clearance systems of engine ${engine} is failed.`,
      'The alert asks for a maximum N2 of 96 %, but the engine itself is not limited.',
    ],
    alertIds: [engine === 1 ? '7707391' : '7707392'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} CTL VALVE FAULT with MAX N2 96 %, ${CAUTION}.`,
      },
      {
        where: 'E/WD',
        text: `Alert ${NOT_SHOWN_ABOVE_80_KNOTS_AND_BELOW_1500_FEET}.`,
      },
      { where: 'SD STATUS', text: `MAX ENG ${engine} N2 96 %.` },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: ['The engine is not held to 96 % N2: the limit is only displayed.'],
    logbook: { required: true, reason: 'ECAM caution and an N2 limit' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const CompressorVanesFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1CompressorVanes, A320Failure.Eng2CompressorVanes],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The FADEC moves the variable stator vanes and the variable bleed valves of the compressor. They keep the ' +
      'compressor efficient and away from a stall, from engine start to full thrust.',
    impact: [
      `A variable bleed valve or a variable stator vane of engine ${engine} is failed.`,
      'The engine runs as before and answers normally to the thrust lever.',
    ],
    alertIds: [engine === 1 ? '7707401' : '7707402'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} COMPRESSOR VANE, ${CAUTION}.`,
      },
      {
        where: 'E/WD',
        text: `Alert ${NOT_SHOWN_ABOVE_80_KNOTS_AND_BELOW_1500_FEET}.`,
      },
      {
        where: 'E/WD',
        text: 'Ground: thrust lever to idle, ENG MASTER OFF. Flight: AVOID RAPID THR CHANGES, also on STATUS.',
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: ['Stall risk and a slow engine response of a real vane fault are not modelled.'],
    logbook: { required: true, reason: 'ECAM caution and a compressor control fault' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const CompressorVaneChannelFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1CompressorVaneChannel, A320Failure.Eng2CompressorVaneChannel],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The compressor vane control (variable stator vanes and variable bleed valves) of each engine has two control ' +
      'channels, so that one can fail without losing the function.',
    impact: [
      `One channel of the compressor vane control of engine ${engine} fails. The other channel keeps the function.`,
      'The alert comes only when the same fault is on both engines.',
    ],
    alertIds: ['7707400'],
    effects: [
      {
        where: 'E/WD',
        text: 'With the fault on both engines: ENG 1+2 COMPRESSOR VANE, amber caution, crew awareness.',
      },
      { where: 'E/WD', text: `Alert ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. One engine alone shows nothing.` },
    ],
    logbook: { required: false, reason: 'no indication to report on its own: the alert needs both engines' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const BleedValveStatusFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1BleedValveStatus, A320Failure.Eng2BleedValveStatus],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The FADEC reads the position of the engine bleed, pack, wing anti-ice, engine anti-ice and cross-bleed valves. ' +
      'It uses them to raise the idle when the air demand is high and to start the continuous ignition with the engine anti-ice.',
    impact: [
      `The FADEC of engine ${engine} no longer receives the valve positions.`,
      'On the ground it raises the idle of both engines as if all the valves were open.',
      'It no longer selects the continuous ignition by itself with the engine anti-ice on.',
    ],
    alertIds: [engine === 1 ? '7707411' : '7707412'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} BLEED STATUS FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'Ground: HI GND IDLE, and the pack off before take-off. Engine anti-ice on: ENG MODE selector to IGN.',
      },
      { where: 'SD STATUS', text: `ENG ${engine} HI GND IDLE.` },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a higher ground idle' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const RatingPlugFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1RatingPlug, A320Failure.Eng2RatingPlug],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'A rating plug tells the FADEC which thrust rating, and so which engine type, it has to control. ' +
      'The FADECs of the two engines compare their ratings.',
    impact: [
      `The rating plug of engine ${engine} fails, so the two ratings no longer match.`,
      'Nothing else changes: thrust and limits are not affected.',
    ],
    alertIds: ['7000100'],
    effects: [
      {
        where: 'E/WD',
        text: 'ENG TYPE DISAGREE, amber caution, crew awareness.',
      },
      {
        where: 'E/WD',
        text: `Alert ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It goes if both plugs fail: no rating is left to compare.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata73Entries: Record<number, FailureDetail> = {};

export const Ata73Families: FailureDetailFamily[] = [
  FadecChannelFamily,
  FadecOverheatFamily,
  ThrustLeverBothResolversFamily,
  ThrustLeverDisagreeFamily,
  ThrustLeverOneResolverFamily,
  EiuFamily,
  FuelFilterClogFamily,
  HpFuelValveFamily,
  FadecAlternatorFamily,
  OverspeedProtectionFamily,
  InletProbesFamily,
  CoreSensorsFamily,
  FuelMeteringValveFamily,
  FuelReturnValveClosedFamily,
  FuelReturnValveOpenFamily,
  ClearanceControlValvesFamily,
  CompressorVanesFamily,
  CompressorVaneChannelFamily,
  BleedValveStatusFamily,
  RatingPlugFamily,
];
