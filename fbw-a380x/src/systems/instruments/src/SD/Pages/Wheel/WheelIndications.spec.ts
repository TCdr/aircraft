// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  BRAKE_COUNT,
  brakeControlIndication,
  brakeTemperatureColour,
  HottestBrakeArc,
  hottestBrakeArcs,
  readBrakeTemperatures,
  readTirePressures,
  readWheelControlInputs,
  roundBrakeTemperature,
  steeringControlIndication,
  tirePressureIndication,
  WheelControlInputs,
  wingAccuIndication,
} from './WheelIndications';

const NO_FAULT: WheelControlInputs = {
  normBrkFault: false,
  altnBrkFault: false,
  emerBrkFault: false,
  autoBrkFault: false,
  scs1Fault: false,
  scs2Fault: false,
};

/** 16 brake temperatures, all at `base`, with some brakes set */
function temperatures(base: number, set: Record<number, number> = {}): number[] {
  const t = new Array<number>(BRAKE_COUNT).fill(base);
  for (const [brake, value] of Object.entries(set)) {
    t[Number(brake) - 1] = value;
  }
  return t;
}

describe('WHEEL page hottest brake arcs', () => {
  it('has no arc while the hottest brake is at or below 100 °C', () => {
    expect(hottestBrakeArcs(temperatures(40, { 5: 100 }))).toEqual(temperatures(HottestBrakeArc.None));
  });

  it('draws a green arc on the hottest brake above 100 °C, none on the others', () => {
    const arcs = hottestBrakeArcs(temperatures(80, { 7: 160 }));
    expect(arcs[6]).toBe(HottestBrakeArc.Green);
    expect(arcs.filter((arc) => arc !== HottestBrakeArc.None)).toHaveLength(1);
  });

  it('draws an amber arc on the hottest brake above 300 °C', () => {
    const arcs = hottestBrakeArcs(temperatures(150, { 12: 320, 3: 290 }));
    expect(arcs[11]).toBe(HottestBrakeArc.Amber);
    // a brake above 100 °C that is not the hottest has no arc
    expect(arcs[2]).toBe(HottestBrakeArc.None);
    expect(arcs[0]).toBe(HottestBrakeArc.None);
  });

  it('marks every brake that shows the same highest value', () => {
    // 201 and 199 both show 200
    const arcs = hottestBrakeArcs(temperatures(50, { 1: 201, 16: 199 }));
    expect(arcs[0]).toBe(HottestBrakeArc.Green);
    expect(arcs[15]).toBe(HottestBrakeArc.Green);
  });

  it('ignores a temperature that is not a number', () => {
    const arcs = hottestBrakeArcs(temperatures(120, { 2: NaN }));
    expect(arcs[1]).toBe(HottestBrakeArc.None);
    expect(arcs[0]).toBe(HottestBrakeArc.Green);
  });

  it('colours the number amber above 300 °C and rounds it to 5 °C', () => {
    expect(brakeTemperatureColour(300)).toBe('Green');
    expect(brakeTemperatureColour(301)).toBe('Amber');
    expect(roundBrakeTemperature(123)).toBe(125);
    expect(roundBrakeTemperature(-4)).toBe(0);
    expect(roundBrakeTemperature(1200)).toBe(995);
  });

  it('reads the 16 BTMS brake temperatures', () => {
    const names: string[] = [];
    readBrakeTemperatures((name) => {
      names.push(name);
      return 0;
    });
    expect(names).toHaveLength(16);
    expect(names[0]).toBe('L:A32NX_REPORTED_BRAKE_TEMPERATURE_1');
    expect(names[15]).toBe('L:A32NX_REPORTED_BRAKE_TEMPERATURE_16');
  });
});

describe('WHEEL page BRK CTL and STEER CTL lines', () => {
  it('hides both lines without a fault and without MORE', () => {
    expect(brakeControlIndication(NO_FAULT, false).lineVisible).toBe(false);
    expect(steeringControlIndication(NO_FAULT, false).lineVisible).toBe(false);
  });

  it('shows both lines, all green, on the MORE page', () => {
    expect(brakeControlIndication(NO_FAULT, true)).toEqual({
      lineVisible: true,
      bcs1Failed: false,
      bcs2Failed: false,
      ebcuFailed: false,
      autoBrakeFailedVisible: false,
    });
    expect(steeringControlIndication(NO_FAULT, true)).toEqual({
      lineVisible: true,
      scs1Failed: false,
      scs2Failed: false,
    });
  });

  it('shows the BRK CTL line with E failed when the EBCU is failed', () => {
    const brk = brakeControlIndication({ ...NO_FAULT, emerBrkFault: true }, false);
    expect(brk.lineVisible).toBe(true);
    expect(brk.ebcuFailed).toBe(true);
    expect(brk.bcs1Failed).toBe(false);
  });

  it('shows BCS 1 and 2 failed when the normal and the alternate braking are failed', () => {
    const brk = brakeControlIndication({ ...NO_FAULT, normBrkFault: true, altnBrkFault: true }, false);
    expect(brk.lineVisible).toBe(true);
    expect(brk.bcs1Failed && brk.bcs2Failed).toBe(true);
    // one braking mode failed is not a BCS failure
    expect(brakeControlIndication({ ...NO_FAULT, normBrkFault: true }, false).lineVisible).toBe(false);
  });

  it('shows AUTO BRAKE only when the autobrake is failed, also on the MORE page', () => {
    expect(brakeControlIndication(NO_FAULT, true).autoBrakeFailedVisible).toBe(false);
    expect(brakeControlIndication({ ...NO_FAULT, autoBrkFault: true }, false).autoBrakeFailedVisible).toBe(true);
  });

  it('shows the STEER CTL line with the failed SCS', () => {
    const steer = steeringControlIndication({ ...NO_FAULT, scs2Fault: true }, false);
    expect(steer).toEqual({ lineVisible: true, scs1Failed: false, scs2Failed: true });
  });

  it('reads the fault L:vars of the Rust model as > 0', () => {
    const values: Record<string, number> = {
      'L:A32NX_BRAKES_EMER_BRK_FAULT': 1,
      'L:A32NX_STEERING_SCS_1_FAULT': 1,
    };
    expect(readWheelControlInputs((name) => values[name] ?? 0)).toEqual({
      ...NO_FAULT,
      emerBrkFault: true,
      scs1Fault: true,
    });
  });
});

describe('WING ACCU pressure indication', () => {
  it('shows the live accumulator pressure in green outside the amber arc, with MORE only', () => {
    expect(wingAccuIndication(5000, true)).toEqual({ visible: true, amber: false, needleKpsi: 5 });
    expect(wingAccuIndication(4100, true)).toEqual({ visible: true, amber: false, needleKpsi: 4.1 });
    expect(wingAccuIndication(5000, false).visible).toBe(false);
    expect(wingAccuIndication(3500, false).visible).toBe(false);
  });

  it('shows the indication in amber, also without MORE, when the pressure is in the amber arc (0-3 480 psi)', () => {
    expect(wingAccuIndication(3480, false)).toEqual({ visible: true, amber: true, needleKpsi: 3.48 });
    expect(wingAccuIndication(0, true)).toEqual({ visible: true, amber: true, needleKpsi: 0 });
  });

  it('keeps the needle on the 0-5 000 psi scale', () => {
    expect(wingAccuIndication(5250, true).needleKpsi).toBe(5);
    expect(wingAccuIndication(-20, true).needleKpsi).toBe(0);
    expect(wingAccuIndication(Number.NaN, false)).toEqual({ visible: true, amber: true, needleKpsi: 0 });
  });
});

describe('WHEEL page wiring', () => {
  const source = readFileSync(resolve(__dirname, 'WheelPage.tsx'), 'utf-8');

  it('feeds the WING ACCU gauge with the accumulator pressure instead of a fixed needle', () => {
    expect(source).toContain("useSimVar('L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS', 'number'");
    expect(source).toContain('indication={wingAccuIndication(');
    const accumulator = readFileSync(resolve(__dirname, 'elements/Accumulator.tsx'), 'utf-8');
    expect(accumulator).not.toContain('value={4.8}');
    expect(accumulator).toContain('value={indication.needleKpsi}');
  });

  it('drives the control lines and the AUTO BRAKE text from the indications, not from MORE alone', () => {
    expect(source).toContain("id=\"brk-control\" visibility={brakeControl.lineVisible ? 'visible' : 'hidden'}");
    expect(source).toContain("id=\"steering-control\" visibility={steeringControl.lineVisible ? 'visible' : 'hidden'}");
    expect(source).toContain("visibility={brakeControl.autoBrakeFailedVisible ? 'visible' : 'hidden'}");
  });

  it('passes the hottest brake arcs and the LGCIU words to the bogeys and the gears', () => {
    expect(source.match(/hottestBrakeArcs=\{arcs\}/g)).toHaveLength(5);
    expect(source.match(/lgciuWords=\{lgciuWords\}/g)).toHaveLength(5);
  });

  it('no longer reads the sim gear and door positions', () => {
    const gear = readFileSync(resolve(__dirname, 'elements/Gear.tsx'), 'utf-8');
    expect(gear).not.toContain('_POSITION`');
    expect(gear).not.toContain('FIXME');
  });
});

describe('WHEEL SD tire pressures', () => {
  const normal = () => new Array(22).fill(220);

  it('normal pressure: green, only on the WHEEL MORE page', () => {
    expect(tirePressureIndication(normal(), 3, 1, false)).toEqual({ visible: false, amber: false });
    expect(tirePressureIndication(normal(), 3, 1, true)).toEqual({ visible: true, amber: false });
  });

  it('low pressure: amber, shown without MORE', () => {
    const pressures = normal();
    pressures[2] = 150;
    expect(tirePressureIndication(pressures, 3, 1, false)).toEqual({ visible: true, amber: true });
    // its axle mate shows the excessive difference too
    expect(tirePressureIndication(pressures, 4, 1, false)).toEqual({ visible: true, amber: true });
  });

  it('reads the 22 TPIS pressures, tire 1 first', () => {
    const pressures = readTirePressures((name) => Number(name.match(/TIRE_(\d+)_/)?.[1] ?? 0));
    expect(pressures).toHaveLength(22);
    expect(pressures[0]).toBe(1);
    expect(pressures[21]).toBe(22);
  });

  it('the wheels show the TPIS values, not a fixed 220', () => {
    const wheel = readFileSync(resolve(__dirname, 'elements/Wheel.tsx'), 'utf-8');
    expect(wheel).toContain('{tirePressure}');
    expect(wheel).not.toMatch(/>\s*220\s*</);
    const bogey = readFileSync(resolve(__dirname, 'elements/WheelBogey.tsx'), 'utf-8');
    expect(bogey).toContain('tirePressureIndication(tirePressures, tire, flightPhase, moreActive)');
  });
});
