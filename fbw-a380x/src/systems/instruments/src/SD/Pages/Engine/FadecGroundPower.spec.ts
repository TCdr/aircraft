// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FADEC_GND_PWR_PB_SUPPLY_S,
  FADEC_POWER_UP_SUPPLY_S,
  FadecGroundPowerInputs,
  FadecGroundPowerSupply,
  updateFadecGroundPowerSupplies,
  writeFadecGroundPowerSupplies,
} from './FadecGroundPower';

function inputs(nowS: number, overrides: Partial<FadecGroundPowerInputs> = {}): FadecGroundPowerInputs {
  return { nowS, aircraftPowered: true, groundPowerPbOn: false, onGround: true, ...overrides };
}

/* A380 FCOM DSC-70-20-10 FADEC ELECTRICAL SUPPLY (a380_fcom.txt l.111401-111403) and ENG FADEC GND PWR PANEL (l.112701-112704) */
describe('FADEC supply from the aircraft electrical network', () => {
  it('supplies the FADEC for 15 min at aircraft power-up', () => {
    const supply = new FadecGroundPowerSupply();
    expect(supply.update(inputs(0, { aircraftPowered: false }))).toBe(false);
    expect(supply.update(inputs(100))).toBe(true);
    expect(supply.update(inputs(100 + FADEC_POWER_UP_SUPPLY_S - 1))).toBe(true);
    expect(supply.update(inputs(100 + FADEC_POWER_UP_SUPPLY_S + 1))).toBe(false);
  });

  it('supplies the FADEC for 10 min when the FADEC GND PWR pb is pressed on ground', () => {
    const supply = new FadecGroundPowerSupply();
    supply.update(inputs(1));
    expect(supply.update(inputs(2000))).toBe(false);
    expect(supply.update(inputs(2000, { groundPowerPbOn: true }))).toBe(true);
    expect(supply.update(inputs(2000 + FADEC_GND_PWR_PB_SUPPLY_S - 1, { groundPowerPbOn: true }))).toBe(true);
    expect(supply.update(inputs(2000 + FADEC_GND_PWR_PB_SUPPLY_S + 1, { groundPowerPbOn: true }))).toBe(false);
    // pressed again: 10 more minutes
    supply.update(inputs(3000, { groundPowerPbOn: false }));
    expect(supply.update(inputs(3001, { groundPowerPbOn: true }))).toBe(true);
  });

  it('does not supply the FADEC from the pb in flight', () => {
    const supply = new FadecGroundPowerSupply();
    supply.update(inputs(1, { onGround: false }));
    expect(supply.update(inputs(2000, { onGround: false, groundPowerPbOn: true }))).toBe(false);
  });

  it('takes the power-up at the first valid sim time', () => {
    const supply = new FadecGroundPowerSupply();
    expect(supply.update(inputs(0))).toBe(true);
    expect(supply.update(inputs(5000))).toBe(true);
    expect(supply.update(inputs(5000 + FADEC_POWER_UP_SUPPLY_S + 1))).toBe(false);
  });

  it('restarts the 15 min after a loss of the aircraft power', () => {
    const supply = new FadecGroundPowerSupply();
    supply.update(inputs(1));
    expect(supply.update(inputs(2000))).toBe(false);
    expect(supply.update(inputs(2001, { aircraftPowered: false }))).toBe(false);
    expect(supply.update(inputs(2002))).toBe(true);
  });
});

/*
 * The timers must follow the real power-up and pb times whatever SD page is shown: the SD instrument loop updates them
 * (updateFadecGroundPowerSupplies) and writes them for the systems WASM. Recorded cold and dark A380X: EXT PWR 1
 * powers AC 1 + AC 2 at t=223 s (ENG page shown), APU GEN powers AC 3 + AC 4 at t=414 s (another page shown), the ENG
 * page is next shown at t=965 s. Timers that ran only while the ENG page is shown would count the ENG 3 + 4 15 min from
 * t=965 s.
 */
describe('FADEC supply timers with the ENG page not shown', () => {
  /** A fake sim: the SimVars the SD loop reads */
  function fakeSim() {
    const simVars = new Map<string, number>([['SIM ON GROUND', 1]]);
    const read = (name: string) => simVars.get(name) ?? 0;
    return { simVars, read };
  }

  /** Runs the SD instrument loop once per second of sim time, from fromS to toS included */
  function runSdLoop(sim: ReturnType<typeof fakeSim>, fromS: number, toS: number, supplies: FadecGroundPowerSupply[]) {
    for (let t = fromS; t <= toS; t++) {
      sim.simVars.set('E:ABSOLUTE TIME', t);
      updateFadecGroundPowerSupplies(sim.read, supplies);
    }
  }

  /** Whether the aircraft network supplies each FADEC (engines 1 to 4) */
  const engPageReads = (supplies: FadecGroundPowerSupply[]) => supplies.map((supply) => supply.isSupplied);

  it('counts the 15 min of each FADEC from the power-up of its AC bus, while another page is shown', () => {
    const sim = fakeSim();
    const supplies = [1, 2, 3, 4].map(() => new FadecGroundPowerSupply());
    const AC_1_2_POWER_UP_S = 223;
    const AC_3_4_POWER_UP_S = 414;

    runSdLoop(sim, 1, AC_1_2_POWER_UP_S - 1, supplies);
    sim.simVars.set('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 1);
    sim.simVars.set('L:A32NX_ELEC_AC_2_BUS_IS_POWERED', 1);
    runSdLoop(sim, AC_1_2_POWER_UP_S, AC_3_4_POWER_UP_S - 1, supplies);
    expect(engPageReads(supplies)).toEqual([true, true, false, false]);

    // AC 3 + AC 4 powered while another SD page is shown, ENG page shown again at t=965 s
    sim.simVars.set('L:A32NX_ELEC_AC_3_BUS_IS_POWERED', 1);
    sim.simVars.set('L:A32NX_ELEC_AC_4_BUS_IS_POWERED', 1);
    runSdLoop(sim, AC_3_4_POWER_UP_S, 965, supplies);
    expect(engPageReads(supplies)).toEqual([true, true, true, true]);

    runSdLoop(sim, 966, AC_3_4_POWER_UP_S + FADEC_POWER_UP_SUPPLY_S - 1, supplies);
    expect(engPageReads(supplies)).toEqual([false, false, true, true]);

    // 15 min after the real AC 3 + AC 4 power-up (t=1314 s), not after the ENG page was shown (t=1865 s)
    runSdLoop(sim, AC_3_4_POWER_UP_S + FADEC_POWER_UP_SUPPLY_S, 1400, supplies);
    expect(engPageReads(supplies)).toEqual([false, false, false, false]);
  });

  it('counts the 10 min of the FADEC GND PWR pb from the press, while another page is shown', () => {
    const sim = fakeSim();
    const supplies = [1, 2, 3, 4].map(() => new FadecGroundPowerSupply());
    [1, 2, 3, 4].forEach((engine) => sim.simVars.set(`L:A32NX_ELEC_AC_${engine}_BUS_IS_POWERED`, 1));
    runSdLoop(sim, 1, 1500, supplies);
    expect(engPageReads(supplies)).toEqual([false, false, false, false]);

    // ENG 3 FADEC GND PWR pb pressed at t=1501 s while another page is shown
    const PB_PRESS_S = 1501;
    sim.simVars.set('L:A32NX_OVHD_FADEC_3', 1);
    runSdLoop(sim, PB_PRESS_S, PB_PRESS_S + FADEC_GND_PWR_PB_SUPPLY_S - 1, supplies);
    expect(engPageReads(supplies)).toEqual([false, false, true, false]);
    runSdLoop(sim, PB_PRESS_S + FADEC_GND_PWR_PB_SUPPLY_S, 2200, supplies);
    expect(engPageReads(supplies)).toEqual([false, false, false, false]);
  });
});

describe('FADEC supply timers for the systems WASM', () => {
  it('writes whether the timer of each FADEC runs', () => {
    const supplies = [1, 2, 3, 4].map(() => new FadecGroundPowerSupply());
    supplies[0].update(inputs(100));
    supplies[2].update(inputs(100));
    const written = new Map<string, boolean>();
    writeFadecGroundPowerSupplies((name, value) => written.set(name, value), supplies);
    expect([...written]).toEqual([
      ['L:A32NX_ENGINE_1_FADEC_GND_SUPPLY', true],
      ['L:A32NX_ENGINE_2_FADEC_GND_SUPPLY', false],
      ['L:A32NX_ENGINE_3_FADEC_GND_SUPPLY', true],
      ['L:A32NX_ENGINE_4_FADEC_GND_SUPPLY', false],
    ]);
  });
});
