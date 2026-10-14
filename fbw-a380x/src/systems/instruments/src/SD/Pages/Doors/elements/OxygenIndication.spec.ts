// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { oxygenIndication, OxygenPressureInputs, oxygenPressureIndication } from './OxygenIndication';

/* A380 FCOM DSC-35-20-20 (cockpit) and DSC-35-30-20 (cabin) oxygen indications of the DOOR/OXY page. */
describe('SD DOOR/OXY oxygen indications', () => {
  it('are normal with CREW SUPPLY on', () => {
    expect(oxygenIndication(true, true, false)).toEqual({
      ckptAmber: false,
      ckptRegulPrLo: false,
      cabinAmber: false,
      cabinRegulPrLo: false,
    });
  });

  it('CREW SUPPLY OFF on ground: CKPT amber with REGUL PR LO, the cabin line stays normal', () => {
    expect(oxygenIndication(true, true, true)).toEqual({
      ckptAmber: true,
      ckptRegulPrLo: true,
      cabinAmber: false,
      cabinRegulPrLo: false,
    });
  });

  it('CREW SUPPLY OFF in flight: CKPT amber, REGUL PR LO only on ground', () => {
    const indication = oxygenIndication(true, false, true);
    expect(indication.ckptAmber).toBe(true);
    expect(indication.ckptRegulPrLo).toBe(false);
  });

  const normalCabin = { bottlePressureLow: false, bottlePressurePsi: 1850, valveClosed: false };

  it('CABIN amber with the amber pressure value when the cabin bottles are low (l.93459-93468)', () => {
    const indication = oxygenIndication(true, false, false, { ...normalCabin, bottlePressureLow: true });
    expect(indication.cabinAmber).toBe(true);
    expect(indication.cabinRegulPrLo).toBe(false);
  });

  it('CABIN amber when a regulator supply valve is closed (OXY CABIN VLV CLOSED, l.93472-93475)', () => {
    const indication = oxygenIndication(true, true, false, { ...normalCabin, valveClosed: true });
    expect(indication.cabinAmber).toBe(true);
    // the other regulators still supply the distribution manifold: no REGUL PR LO
    expect(indication.cabinRegulPrLo).toBe(false);
  });

  it('CABIN REGUL PR LO on ground below 98 PSI in the manifold (l.93523-93529), CABIN amber in flight too', () => {
    const empty = { bottlePressureLow: true, bottlePressurePsi: 90, valveClosed: false };
    expect(oxygenIndication(true, true, false, empty)).toMatchObject({ cabinAmber: true, cabinRegulPrLo: true });
    expect(oxygenIndication(true, false, false, empty)).toMatchObject({ cabinAmber: true, cabinRegulPrLo: false });
    expect(oxygenIndication(true, true, false, { ...empty, bottlePressurePsi: 98 }).cabinRegulPrLo).toBe(false);
  });

  it('the page gives the cabin bottle pressure and the cabin valve to the CABIN line', () => {
    const element = readFileSync(resolve(__dirname, 'Oxygen.tsx'), 'utf-8');
    expect(element).toMatch(/useSimVar\('L:A32NX_OXYGEN_CABIN_VALVE_CLOSED'/);
    expect(element).toContain('valveClosed: cabinValveClosedVar > 0');
    expect(element).toContain('bottlePressureLow: pressures.cabinValueAmber');
  });

  it('the page reads the CREW SUPPLY pb value (not the useSimVar tuple) and only for the CKPT line', () => {
    const element = readFileSync(resolve(__dirname, 'Oxygen.tsx'), 'utf-8');
    expect(element).toMatch(/const \[crewSupplyOffVar\] = useSimVar\('L:PUSH_OVHD_OXYGEN_CREW'/);
    expect(element.match(/L:PUSH_OVHD_OXYGEN_CREW/g)).toHaveLength(1);
  });
});

const fullBottles: OxygenPressureInputs = {
  active: true,
  onGround: true,
  oneEngineRunning: false,
  fmsPassengers: 500,
  ckptBottlePressurePsi: 1800,
  cabinBottlePressurePsi: 1850,
};

/* A380 FCOM DSC-35-30-20 cabin OXYGEN PRESSURE VALUE (a380_fcom.txt l.93477-93511) */
describe('SD DOOR/OXY cabin oxygen pressure', () => {
  it('green at or above 1 600 PSI (l.93478)', () => {
    const indication = oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 1600 });
    expect(indication.cabinValueAmber).toBe(false);
    expect(indication.cabinHalfFrame).toBe(false);
  });

  it('"On ground only, appears with the amber half-frame, if: The pressure is below 1 600 PSI" (l.93480-93481)', () => {
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 1500 }).cabinHalfFrame).toBe(true);
    expect(
      oxygenPressureIndication({ ...fullBottles, onGround: false, cabinBottlePressurePsi: 1500 }).cabinHalfFrame,
    ).toBe(false);
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 1500 }).cabinValueAmber).toBe(false);
  });

  it('before one engine starts, low (amber) below 800 PSI (l.93508-93509)', () => {
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 799 }).cabinValueAmber).toBe(true);
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 801 }).cabinValueAmber).toBe(false);
  });

  it('engines running: low below the emergency descent minimum of the cabin occupants (l.93496-93505)', () => {
    // 500 masks: 1 003 PSI (LIM-35 EMERGENCY DESCENT)
    const running = { ...fullBottles, onGround: false, oneEngineRunning: true };
    expect(oxygenPressureIndication({ ...running, cabinBottlePressurePsi: 1000 }).cabinValueAmber).toBe(true);
    expect(oxygenPressureIndication({ ...running, cabinBottlePressurePsi: 1010 }).cabinValueAmber).toBe(false);
  });
});

/* A380 FCOM DSC-35-20-20 cockpit OXYGEN PRESSURE VALUE (a380_fcom.txt l.93096-93111) */
describe('SD DOOR/OXY cockpit oxygen pressure', () => {
  it('below the 5-crew dispatch minimum on ground: amber half-frame, the value stays green (l.93101-93102)', () => {
    const indication = oxygenPressureIndication({ ...fullBottles, ckptBottlePressurePsi: 900 });
    expect(indication.ckptHalfFrame).toBe(true);
    expect(indication.ckptValueAmber).toBe(false);
    expect(
      oxygenPressureIndication({ ...fullBottles, onGround: false, ckptBottlePressurePsi: 900 }).ckptHalfFrame,
    ).toBe(false);
  });

  it('amber when "the pressure is below 350 PSI" (l.93108-93109)', () => {
    expect(oxygenPressureIndication({ ...fullBottles, ckptBottlePressurePsi: 349 }).ckptValueAmber).toBe(true);
  });

  it('XX in amber without SDAC data, no half-frame', () => {
    const indication = oxygenPressureIndication({ ...fullBottles, active: false, cabinBottlePressurePsi: 0 });
    expect(indication).toEqual({
      ckptValueAmber: true,
      ckptHalfFrame: false,
      cabinValueAmber: true,
      cabinHalfFrame: false,
    });
  });

  it('the page draws the half-frames and reads the real on-ground state', () => {
    const element = readFileSync(resolve(__dirname, 'Oxygen.tsx'), 'utf-8');
    expect(element).toContain('<HalfFrame y={0} visible={pressures.ckptHalfFrame} />');
    expect(element).toContain('<HalfFrame y={124} visible={pressures.cabinHalfFrame} />');
    const page = readFileSync(resolve(__dirname, '../DoorPage.tsx'), 'utf-8');
    expect(page).not.toContain('const onGround = true;');
  });
});
