// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FADEC_GND_PWR_PB_SUPPLY_S,
  FADEC_POWER_UP_SUPPLY_S,
  FadecGroundPowerInputs,
  FadecGroundPowerSupply,
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
