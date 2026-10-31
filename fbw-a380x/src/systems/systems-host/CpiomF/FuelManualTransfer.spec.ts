// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { runRpn } from '../../../../../fbw-a32nx/src/behavior/RpnTestInterpreter';
import {
  ALL_TRANSFER_PUMPS,
  ALL_TRANSFER_VALVES,
  FUEL_XFR_PB_IS_AUTO_VARS,
  FuelLineup,
  FuelManualTransfer,
  INNER_TANK_AFT_INLET_VALVES,
  INR_TK_XFR_PB_IS_AUTO_VAR,
  isOuterTransferByGravity,
  L_INR_TK_AFT_PUMP,
  L_MID_TK_AFT_PUMP,
  L_OUTR_TK_PUMP,
  manualTransferLineup,
  ManualTransferFuelSystem,
  ManualTransferPump,
  ManualTransferSelection,
  MID_TK_XFR_PB_IS_AUTO_VAR,
  NO_MANUAL_TRANSFER,
  OUTR_TK_XFR_PB_IS_AUTO_VAR,
  possibleManualTransfers,
  R_INR_TK_AFT_PUMP,
  R_MID_TK_AFT_PUMP,
  R_OUTR_TK_PUMP,
  TRIM_TK_L_PUMP,
  TRIM_TK_R_PUMP,
  TRIM_TK_XFR_PB_IS_AUTO_VAR,
} from './FuelManualTransfer';
import { NO_TRANSFER_RESTRICTION } from './FuelTransferFaults';

const A380X_DIR = join(__dirname, '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X');
const flightModel = readFileSync(join(A380X_DIR, 'common/config/flight_model.cfg'), 'utf-8');
const systemsCfg = readFileSync(
  join(A380X_DIR, 'attachments/flybywire/Part_Interior_Cockpit/config/systems.cfg'),
  'utf-8',
);
const cockpitBehavior = readFileSync(
  join(A380X_DIR, 'attachments/flybywire/Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml'),
  'utf-8',
);

/** The [FUEL_SYSTEM] entries of flight_model.cfg, e.g. Pump.9 -> { Name: 'LeftOuterTankPump', ... } (Option: listed) */
function fuelSystemEntries(kind: 'Pump' | 'Valve' | 'Junction' | 'Line'): Map<number, Map<string, string[]>> {
  const entries = new Map<number, Map<string, string[]>>();
  for (const line of flightModel.split(/\r?\n/)) {
    const match = new RegExp(`^${kind}\\.(\\d+)\\s*=\\s*(.*)$`).exec(line);
    if (!match) {
      continue;
    }
    const fields = new Map<string, string[]>();
    for (const field of match[2].split('#')) {
      const separator = field.indexOf(':');
      const name = field.slice(0, separator).trim();
      fields.set(name, [...(fields.get(name) ?? []), field.slice(separator + 1).trim()]);
    }
    entries.set(Number(match[1]), fields);
  }
  return entries;
}

const pumps = fuelSystemEntries('Pump');
const valves = fuelSystemEntries('Valve');
const junctions = fuelSystemEntries('Junction');
const lines = fuelSystemEntries('Line');

const field = (entry: Map<string, string[]> | undefined, name: string): string => entry?.get(name)?.[0] ?? '';
/** Where an MSFS line goes (its Destination: a tank, valve, pump or junction name) */
const lineDestination = (lineName: string): string =>
  field(
    [...lines.values()].find((line) => field(line, 'Name') === lineName),
    'Destination',
  );
/** Where a valve lets the fuel go */
const valveDestination = (valve: number): string => lineDestination(field(valves.get(valve), 'DestinationLine'));
const valveNumber = (name: string): number => [...valves].find(([, valve]) => field(valve, 'Name') === name)?.[0] ?? -1;
/** The valves and junctions that the lines of a junction option go to */
const junctionOptionDestinations = (junction: number, option: number): string[] =>
  (junctions.get(junction)?.get('Option')?.[option - 1] ?? '').split(',').map((line) => lineDestination(line.trim()));

describe('A380 manual transfer lineups on the MSFS fuel system (flight_model.cfg, systems.cfg)', () => {
  it('names the right transfer pumps, with the circuits of their pb-sws (CIRCUIT_FUEL_PUMP:<pump Index>)', () => {
    const expected: [ManualTransferPump, string][] = [
      [L_OUTR_TK_PUMP, 'LeftOuterTankPump'],
      [R_OUTR_TK_PUMP, 'RightOuterTankPump'],
      [L_MID_TK_AFT_PUMP, 'LeftMidTankPumpAft'],
      [R_MID_TK_AFT_PUMP, 'RightMidTankPumpAft'],
      [L_INR_TK_AFT_PUMP, 'LeftInnerTankPumpAft'],
      [R_INR_TK_AFT_PUMP, 'RightInnerTankPumpAft'],
      [TRIM_TK_L_PUMP, 'TrimTankPumpLeft'],
      [TRIM_TK_R_PUMP, 'TrimTankPumpRight'],
    ];
    for (const [{ pump, circuit }, name] of expected) {
      expect(field(pumps.get(pump), 'Name')).toBe(name);
      const index = field(pumps.get(pump), 'Index');
      expect(systemsCfg).toMatch(new RegExp(`^circuit\\.${circuit} = Type:CIRCUIT_FUEL_PUMP:${index}#`, 'm'));
    }
  });

  it('knows every transfer pump (the outer, mid, inner and trim tank pumps)', () => {
    const transferPumps = [...pumps]
      .filter(([, pump]) => /^(Left|Right)(Outer|Mid|Inner)TankPump|^TrimTankPump/.test(field(pump, 'Name')))
      .map(([number]) => number)
      .sort((a, b) => a - b);
    expect(ALL_TRANSFER_PUMPS).toEqual(transferPumps);
  });

  it('only sets the transfer valves, never the crossfeed, engine, APU, emergency, refuel or jettison valves', () => {
    for (const valve of [...ALL_TRANSFER_VALVES, ...INNER_TANK_AFT_INLET_VALVES]) {
      expect(field(valves.get(valve), 'Name')).toMatch(/TransferValve|TrimTankInletValve|TrimLineIsolationValve/);
      expect(field(valves.get(valve), 'Name')).not.toMatch(/Emer|CrossFeed|LPValve|APU|Jettison|Refuel|Defuel/);
    }
  });

  it('sends the outer tank pumps through the forward gallery into the four feed tanks', () => {
    for (const { pump } of [L_OUTR_TK_PUMP, R_OUTR_TK_PUMP]) {
      expect(lineDestination(field(pumps.get(pump), 'DestinationLine'))).toBe('FwdGalleryJunction');
    }
    // Junction.7 option 1 and Junction.8 option 1
    expect(junctionOptionDestinations(7, 1)).toEqual([
      'FeedTank1FwdTransferValve1',
      'FeedTanks2_3Junction1',
      'FeedTank4FwdTransferValve1',
    ]);
    expect(junctionOptionDestinations(8, 1)).toEqual(['FeedTank2FwdTransferValve1_1', 'FeedTank3FwdTransferValve1_1']);
    expect([5, 6, 7, 10].map(valveDestination)).toEqual(['Feed1', 'Feed2', 'Feed3', 'Feed4']);
    expect([5, 6, 7, 10]).toEqual(
      [
        'FeedTank1FwdTransferValve1',
        'FeedTank2FwdTransferValve1_1',
        'FeedTank3FwdTransferValve1_1',
        'FeedTank4FwdTransferValve1',
      ].map(valveNumber),
    );
  });

  it('sends the inner and mid tank aft pumps through the aft gallery into the four feed tanks', () => {
    for (const { pump } of [L_INR_TK_AFT_PUMP, R_INR_TK_AFT_PUMP, L_MID_TK_AFT_PUMP, R_MID_TK_AFT_PUMP]) {
      expect(lineDestination(field(pumps.get(pump), 'DestinationLine'))).toBe('AftGalleryJunction1');
    }
    // Junction.10 option 3, Junction.11 option 1
    expect(junctionOptionDestinations(10, 3)).toEqual(['AftGalleryJunction2']);
    expect(junctionOptionDestinations(11, 1)).toEqual([
      'FeedTank1AftTransferValve1',
      'FeedTank2AftTransferValve1',
      'FeedTank3AftTransferValve1',
      'FeedTank4AftTransferValve1',
    ]);
    expect([23, 24, 25, 26].map(valveDestination)).toEqual(['Feed1', 'Feed2', 'Feed3', 'Feed4']);
  });

  it('sends the trim tank pumps through the trim line isolation valve and the aft gallery into the inner tanks', () => {
    for (const { pump } of [TRIM_TK_L_PUMP, TRIM_TK_R_PUMP]) {
      expect(lineDestination(field(pumps.get(pump), 'DestinationLine'))).toBe('TrimLineJunction1');
    }
    expect(field(valves.get(45), 'Name')).toBe('TrimLineIsolationValveAft');
    expect(valveDestination(45)).toBe('AftGalleryJunction1');
    // Junction.10 option 1, then Valve.31 -> Valve.37 -> LeftInner and Valve.34 -> Valve.40 -> RightInner
    expect(junctionOptionDestinations(10, 1)).toEqual(['LeftInnerAftTransferValve1', 'RightInnerAftTransferValve1']);
    expect([31, 34].map(valveDestination)).toEqual(['LeftInnerAftTransferValve2', 'RightInnerAftTransferValve2']);
    expect(INNER_TANK_AFT_INLET_VALVES.map(valveDestination)).toEqual(['LeftInner', 'RightInner']);
  });
});

describe('A380 fuel transfer pb-sws in the cockpit (A380_Cockpit_Behavior.xml)', () => {
  it('shows AUTO (L:var 1) released without light, MAN / FWD (L:var 0) pressed in with its light', () => {
    for (const pbVar of FUEL_XFR_PB_IS_AUTO_VARS) {
      const start = cockpitBehavior.indexOf(`<TOGGLE_SIMVAR>${pbVar}</TOGGLE_SIMVAR>`);
      expect(start).toBeGreaterThan(0);
      const template = cockpitBehavior.slice(start, cockpitBehavior.indexOf('</UseTemplate>', start));
      // AUTO (1) is released: the pb is not down and its light is off; MAN / FWD (0) is pressed in with its light
      for (const codeTag of ['DOWN_CODE', 'SEQ2_CODE']) {
        const code = new RegExp(`<${codeTag}>([^<]*)</${codeTag}>`).exec(template)?.[1] ?? '';
        expect(runRpn(code, { [pbVar]: 1 }).value, `${pbVar} ${codeTag} AUTO`).toBe(0);
        expect(runRpn(code, { [pbVar]: 0 }).value, `${pbVar} ${codeTag} MAN`).toBe(1);
      }
    }
  });

  it('AUTO GND XFR: toggles its L:var and shows the light computed by the FQMS (CpiomF/FuelGroundTransfer)', () => {
    const start = cockpitBehavior.indexOf('<NODE_ID>PUSH_OVHD_AUTO_GND_XFR</NODE_ID>');
    expect(start).toBeGreaterThan(0);
    const template = cockpitBehavior.slice(start, cockpitBehavior.indexOf('</UseTemplate>', start));
    expect(template).not.toContain('<INOP>');
    expect(template).toContain('<TOGGLE_SIMVAR>L:A380X_OVHD_FUEL_AUTO_GND_XFR_PB_IS_ON</TOGGLE_SIMVAR>');
    const lightCode = /<SEQ2_CODE>([^<]*)<\/SEQ2_CODE>/.exec(template)?.[1] ?? '';
    expect(runRpn(lightCode, { 'L:A380X_OVHD_FUEL_AUTO_GND_XFR_PB_LIGHT_ON': 1 }).value).toBe(1);
    expect(runRpn(lightCode, { 'L:A380X_OVHD_FUEL_AUTO_GND_XFR_PB_LIGHT_ON': 0 }).value).toBe(0);
  });
});

const ALL_PUMP_PBS_ON = () => true;
const select = (selection: Partial<ManualTransferSelection>): ManualTransferSelection => ({
  ...NO_MANUAL_TRANSFER,
  ...selection,
});
const sortedLineup = ({ pumps, valves, junctions }: FuelLineup): FuelLineup => ({
  pumps: pumps.slice().sort((a, b) => a - b),
  valves: valves.slice().sort((a, b) => a - b),
  junctions: junctions.slice().sort(([a], [b]) => a - b),
});

describe('A380 manual transfer lineups (MANUAL TRANSFERS)', () => {
  it('is empty with every transfer pb-sw in AUTO', () => {
    expect(manualTransferLineup(NO_MANUAL_TRANSFER, ALL_PUMP_PBS_ON)).toEqual({ pumps: [], valves: [], junctions: [] });
  });

  it('OUTR TK XFR MAN: the outer tank pumps, via the forward gallery, into the feed tanks', () => {
    expect(sortedLineup(manualTransferLineup(select({ outer: true }), ALL_PUMP_PBS_ON))).toEqual({
      pumps: [9, 14],
      valves: [5, 6, 7, 10],
      junctions: [
        [7, 1],
        [8, 1],
      ],
    });
  });

  it('OUTR TK XFR MAN with an outer tank pump pb-sw OFF: no pumped transfer (gravity through the emergency valves)', () => {
    const lineup = manualTransferLineup(select({ outer: true }), ({ pump }) => pump !== R_OUTR_TK_PUMP.pump);
    expect(lineup).toEqual({ pumps: [], valves: [], junctions: [] });
    expect(isOuterTransferByGravity(true, true, false)).toBe(true);
    expect(isOuterTransferByGravity(true, false, true)).toBe(true);
    expect(isOuterTransferByGravity(true, true, true)).toBe(false);
    expect(isOuterTransferByGravity(false, false, false)).toBe(false);
  });

  it('OUTR TK XFR MAN without the forward gallery: no pumped transfer (gravity through the emergency valves)', () => {
    expect(manualTransferLineup(select({ outer: true }), ALL_PUMP_PBS_ON, false, true)).toEqual({
      pumps: [],
      valves: [],
      junctions: [],
    });
  });

  it('without both transfer galleries, nothing can leave the inner, mid and trim tanks', () => {
    const all = { outer: true, mid: true, inner: true, trimForward: true };
    expect(possibleManualTransfers(all, NO_TRANSFER_RESTRICTION)).toEqual(all);
    expect(possibleManualTransfers(all, { ...NO_TRANSFER_RESTRICTION, innerMidTrimTransfersLost: true })).toEqual({
      outer: true,
      mid: false,
      inner: false,
      trimForward: false,
    });
  });

  it('INR TK XFR MAN: the inner tank aft pumps, via the aft gallery, into the feed tanks', () => {
    expect(sortedLineup(manualTransferLineup(select({ inner: true }), ALL_PUMP_PBS_ON))).toEqual({
      pumps: [17, 18],
      valves: [23, 24, 25, 26],
      junctions: [
        [10, 3],
        [11, 1],
      ],
    });
  });

  it('MID TK XFR MAN: the mid tank aft pumps, via the aft gallery, into the feed tanks', () => {
    expect(sortedLineup(manualTransferLineup(select({ mid: true }), ALL_PUMP_PBS_ON))).toEqual({
      pumps: [11, 16],
      valves: [23, 24, 25, 26],
      junctions: [
        [10, 3],
        [11, 1],
      ],
    });
  });

  it('TRIM TK XFR FWD: the trim tank pumps, via the isolation valve and the aft gallery, into the inner tanks', () => {
    expect(sortedLineup(manualTransferLineup(select({ trimForward: true }), ALL_PUMP_PBS_ON))).toEqual({
      pumps: [19, 20],
      valves: [31, 34, 37, 40, 45],
      junctions: [[10, 1]],
    });
  });

  it('TRIM TK XFR FWD with TRIM TK FEED in ISOL: no trim tank pump, the trim line stays closed', () => {
    expect(sortedLineup(manualTransferLineup(select({ trimForward: true }), ALL_PUMP_PBS_ON, true))).toEqual({
      pumps: [],
      valves: [],
      junctions: [],
    });
    // the other manual transfers are not isolated
    expect(manualTransferLineup(select({ trimForward: true, inner: true }), ALL_PUMP_PBS_ON, true).pumps).toEqual([
      L_INR_TK_AFT_PUMP.pump,
      R_INR_TK_AFT_PUMP.pump,
    ]);
  });

  it('TRIM TK XFR FWD with INR TK XFR MAN: the aft gallery goes to the feed tanks, for both', () => {
    expect(sortedLineup(manualTransferLineup(select({ trimForward: true, inner: true }), ALL_PUMP_PBS_ON))).toEqual({
      pumps: [17, 18, 19, 20],
      valves: [23, 24, 25, 26, 45],
      junctions: [
        [10, 3],
        [11, 1],
      ],
    });
  });

  it('all four together (FUEL ALL FEED TKs LEVEL LO): outer tanks forward, inner, mid and trim tanks aft', () => {
    expect(
      sortedLineup(manualTransferLineup({ outer: true, mid: true, inner: true, trimForward: true }, ALL_PUMP_PBS_ON)),
    ).toEqual({
      pumps: [9, 11, 14, 16, 17, 18, 19, 20],
      valves: [5, 6, 7, 10, 23, 24, 25, 26, 45],
      junctions: [
        [7, 1],
        [8, 1],
        [10, 3],
        [11, 1],
      ],
    });
  });

  it('does not run a pump whose pb-sw is OFF', () => {
    const lineup = manualTransferLineup(select({ inner: true }), ({ pump }) => pump !== L_INR_TK_AFT_PUMP.pump);
    expect(lineup.pumps).toEqual([R_INR_TK_AFT_PUMP.pump]);
  });

  it('never opens a valve out of a feed tank: every lineup valve goes into a feed tank, an inner tank or a gallery', () => {
    const everything = manualTransferLineup(
      { outer: true, mid: true, inner: true, trimForward: true },
      ALL_PUMP_PBS_ON,
    );
    const trimOnly = manualTransferLineup(select({ trimForward: true }), ALL_PUMP_PBS_ON);
    for (const valve of [...everything.valves, ...trimOnly.valves]) {
      expect(valveDestination(valve)).toMatch(
        /^(Feed[1-4]|LeftInner|RightInner|LeftInnerAftTransferValve2|RightInnerAftTransferValve2|AftGalleryJunction1)$/,
      );
    }
  });
});

/** A fake MSFS fuel system: the switches follow the commands at once, the commands are recorded */
class FakeFuelSystem implements ManualTransferFuelSystem {
  public readonly lVars = new Map<string, boolean>();
  public readonly pumpPbs = new Map<number, boolean>();
  public readonly triggers = new Set<number>();
  public readonly pumpsOn = new Set<number>();
  public readonly valvesOpen = new Set<number>([37, 40]);
  public readonly junctionOptions = new Map<number, number>();
  public readonly commands: string[] = [];
  /** Pumps that a failure holds off: their command is recorded, the switch stays off */
  public readonly failedPumps = new Set<number>();

  isTransferPbAuto(pbVar: string): boolean {
    return this.lVars.get(pbVar) ?? false;
  }
  setTransferPbAuto(pbVar: string, auto: boolean): void {
    this.lVars.set(pbVar, auto);
  }
  isPumpPbOn(circuit: number): boolean {
    return this.pumpPbs.get(circuit) ?? true;
  }
  isTriggerActive(trigger: number): boolean {
    return this.triggers.has(trigger);
  }
  setTriggerOff(trigger: number): void {
    this.commands.push(`TRIGGER ${trigger} OFF`);
    this.triggers.delete(trigger);
  }
  isPumpOn(pump: number): boolean {
    return this.pumpsOn.has(pump);
  }
  setPump(pump: number, on: boolean): void {
    this.commands.push(`PUMP ${pump} ${on ? 'ON' : 'OFF'}`);
    if (on && !this.failedPumps.has(pump)) {
      this.pumpsOn.add(pump);
    } else {
      this.pumpsOn.delete(pump);
    }
  }
  isValveOpen(valve: number): boolean {
    return this.valvesOpen.has(valve);
  }
  setValve(valve: number, open: boolean): void {
    this.commands.push(`VALVE ${valve} ${open ? 'OPEN' : 'CLOSE'}`);
    if (open) {
      this.valvesOpen.add(valve);
    } else {
      this.valvesOpen.delete(valve);
    }
  }
  junctionOption(junction: number): number {
    return this.junctionOptions.get(junction) ?? 1;
  }
  setJunction(junction: number, option: number): void {
    this.commands.push(`JUNCTION ${junction} ${option}`);
    this.junctionOptions.set(junction, option);
  }
}

describe('FuelManualTransfer', () => {
  const settle = FuelManualTransfer.COMMAND_SETTLE_TIME_MS;
  let fuel: FakeFuelSystem;
  let transfer: FuelManualTransfer;

  beforeEach(() => {
    fuel = new FakeFuelSystem();
    transfer = new FuelManualTransfer(fuel);
    transfer.init();
    // An automatic transfer in flight: inner tanks to feed tank 1 (Trigger.1), its valve and pumps
    fuel.triggers.add(1);
    fuel.pumpsOn.add(12).add(13);
    fuel.valvesOpen.add(11);
    fuel.junctionOptions.set(7, 2);
  });

  it('sets the four transfer pb-sws to AUTO at flight load (their L:vars read 0, MAN, before)', () => {
    const fresh = new FakeFuelSystem();
    const freshTransfer = new FuelManualTransfer(fresh);
    expect(freshTransfer.readSelection()).toEqual({ outer: true, mid: true, inner: true, trimForward: true });
    freshTransfer.init();
    expect(freshTransfer.readSelection()).toEqual(NO_MANUAL_TRANSFER);
    expect([...fresh.lVars.values()]).toEqual([true, true, true, true]);
  });

  it('commands nothing with every transfer pb-sw in AUTO: the automatic transfers go on', () => {
    for (let i = 0; i < 10; i++) {
      expect(transfer.update(settle, false)).toBe(false);
    }
    expect(fuel.commands).toEqual([]);
  });

  it('OUTR TK XFR MAN: stops the automatic transfers, then runs the outer tank transfer only', () => {
    fuel.lVars.set(OUTR_TK_XFR_PB_IS_AUTO_VAR, false);
    expect(transfer.update(100, false)).toBe(true);
    expect(fuel.commands).toEqual(['TRIGGER 1 OFF']);

    // Nothing more while MSFS applies the trigger
    expect(transfer.update(100, false)).toBe(true);
    expect(fuel.commands).toEqual(['TRIGGER 1 OFF']);

    expect(transfer.update(settle, false)).toBe(true);
    expect(fuel.commands).toEqual([
      'TRIGGER 1 OFF',
      'PUMP 9 ON',
      'PUMP 12 OFF',
      'PUMP 13 OFF',
      'PUMP 14 ON',
      'VALVE 5 OPEN',
      'VALVE 6 OPEN',
      'VALVE 7 OPEN',
      'VALVE 10 OPEN',
      'VALVE 11 CLOSE',
      'JUNCTION 7 1',
    ]);

    // Nothing more while the selection stays the same
    expect(transfer.update(settle, false)).toBe(true);
    expect(fuel.commands).toHaveLength(11);
  });

  it('back to AUTO: stops the pumps and closes the valves, then gives the transfers back to the automatic transfers', () => {
    fuel.lVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    transfer.update(settle, false);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([17, 18]);
    fuel.commands.length = 0;

    fuel.lVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, true);
    expect(transfer.update(100, false)).toBe(true);
    expect(fuel.commands).toEqual([
      'PUMP 17 OFF',
      'PUMP 18 OFF',
      'VALVE 23 CLOSE',
      'VALVE 24 CLOSE',
      'VALVE 25 CLOSE',
      'VALVE 26 CLOSE',
    ]);
    // Waits for MSFS to apply them, then the automatic transfers take over
    expect(transfer.update(100, false)).toBe(true);
    expect(transfer.update(settle, false)).toBe(false);
    expect(transfer.update(settle, false)).toBe(false);
    expect(fuel.commands).toHaveLength(6);
    expect(fuel.pumpsOn.size).toBe(0);
    // Valve.37 and 40 stay open, as with all the triggers off
    expect([...fuel.valvesOpen].sort((a, b) => a - b)).toEqual([37, 40]);
  });

  it('MID TK XFR MAN: runs the mid tank aft pumps into the feed tanks', () => {
    fuel.lVars.set(MID_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    transfer.update(settle, false);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([11, 16]);
    expect([...fuel.valvesOpen].sort((a, b) => a - b)).toEqual([23, 24, 25, 26, 37, 40]);
    expect(fuel.junctionOption(10)).toBe(3);
    expect(fuel.junctionOption(11)).toBe(1);
  });

  it('TRIM TK XFR FWD: runs the trim tank pumps into the inner tanks; INR TK XFR MAN added sends both to the feed tanks', () => {
    fuel.lVars.set(TRIM_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    transfer.update(settle, false);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([19, 20]);
    expect([...fuel.valvesOpen].sort((a, b) => a - b)).toEqual([31, 34, 37, 40, 45]);
    expect(fuel.junctionOption(10)).toBe(1);

    fuel.lVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, false);
    expect(transfer.update(100, false)).toBe(true);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([17, 18, 19, 20]);
    expect([...fuel.valvesOpen].sort((a, b) => a - b)).toEqual([23, 24, 25, 26, 37, 40, 45]);
    expect(fuel.junctionOption(10)).toBe(3);
  });

  it('follows the pump pb-sws: a pump switched OFF stops, switched ON again runs', () => {
    fuel.lVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    transfer.update(settle, false);
    fuel.pumpPbs.set(L_INR_TK_AFT_PUMP.circuit, false);
    transfer.update(100, false);
    expect([...fuel.pumpsOn]).toEqual([18]);
    fuel.pumpPbs.set(L_INR_TK_AFT_PUMP.circuit, true);
    transfer.update(100, false);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([17, 18]);
  });

  it('commands a failed pump once, without fighting the failure that holds it off', () => {
    fuel.failedPumps.add(TRIM_TK_L_PUMP.pump);
    fuel.lVars.set(TRIM_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    for (let i = 0; i < 10; i++) {
      transfer.update(settle, false);
    }
    expect(fuel.commands.filter((command) => command === 'PUMP 19 ON')).toHaveLength(1);
    expect([...fuel.pumpsOn]).toEqual([20]);
  });

  it('keeps the control without a selection once the automatic transfers are lost: everything stopped', () => {
    const lost = { ...NO_TRANSFER_RESTRICTION, manualTransferRequired: true, automaticTransfersLost: true };
    expect(transfer.update(100, false, lost)).toBe(true);
    expect(fuel.commands).toEqual(['TRIGGER 1 OFF']);
    expect(transfer.update(settle, false, lost)).toBe(true);
    expect(fuel.pumpsOn.size).toBe(0);
    expect(fuel.valvesOpen.has(11)).toBe(false);
    for (let i = 0; i < 5; i++) {
      expect(transfer.update(settle, false, lost)).toBe(true);
    }

    // The flight crew transfers manually: INR TK XFR MAN
    fuel.lVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, false);
    expect(transfer.update(settle, false, lost)).toBe(true);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([17, 18]);

    // Back to AUTO: the pumps stop, the automatic transfers stay lost
    fuel.lVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, true);
    expect(transfer.update(settle, false, lost)).toBe(true);
    expect(transfer.update(settle, false, lost)).toBe(true);
    expect(fuel.pumpsOn.size).toBe(0);
  });

  it('is suspended by a fuel jettison or a refuel, and resumes after it', () => {
    fuel.lVars.set(OUTR_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    transfer.update(settle, false);
    expect(fuel.pumpsOn.size).toBe(2);

    expect(transfer.update(100, true)).toBe(true);
    expect(fuel.pumpsOn.size).toBe(0);
    expect(transfer.update(settle, true)).toBe(false);
    expect(transfer.update(settle, true)).toBe(false);

    expect(transfer.update(100, false)).toBe(true);
    transfer.update(settle, false);
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([9, 14]);
  });

  it('never stops or closes anything outside the transfer pumps and valves (feed pumps, crossfeed, engine, jettison)', () => {
    fuel.pumpsOn.add(1).add(2).add(22);
    for (const valve of [1, 46, 47, 50, 51, 52, 57, 60]) {
      fuel.valvesOpen.add(valve);
    }
    fuel.lVars.set(OUTR_TK_XFR_PB_IS_AUTO_VAR, false);
    fuel.lVars.set(MID_TK_XFR_PB_IS_AUTO_VAR, false);
    transfer.update(100, false);
    transfer.update(settle, false);
    fuel.lVars.set(OUTR_TK_XFR_PB_IS_AUTO_VAR, true);
    fuel.lVars.set(MID_TK_XFR_PB_IS_AUTO_VAR, true);
    transfer.update(100, false);
    transfer.update(settle, false);
    for (const command of fuel.commands) {
      const [kind, number] = command.split(' ');
      if (kind === 'PUMP') {
        expect(ALL_TRANSFER_PUMPS).toContain(Number(number));
      } else if (kind === 'VALVE') {
        expect([...ALL_TRANSFER_VALVES, ...INNER_TANK_AFT_INLET_VALVES]).toContain(Number(number));
      }
    }
    expect([...fuel.pumpsOn].sort((a, b) => a - b)).toEqual([1, 2, 22]);
  });
});
