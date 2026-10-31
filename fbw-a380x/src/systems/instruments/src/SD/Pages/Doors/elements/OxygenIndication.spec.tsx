// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../../../SdSpecSupport';
import { DoorPage } from '../DoorPage';
import Oxygen from './Oxygen';
import { oxygenIndication, OxygenPressureInputs, oxygenPressureIndication } from './OxygenIndication';

const fullBottleSimVars = {
  'L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE': 1800,
  'L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE': 1850,
};

/**
 * @param simVars the L:vars the OXYGEN element reads, over full bottles
 * @param onGround the aircraft is on the ground
 * @returns what the element shows
 */
function renderedOxygen(simVars: Record<string, number>, onGround = true) {
  return withRenderedSdElement(
    <Oxygen x={0} y={0} active onGround={onGround} oneEngineRunning={false} />,
    { ...fullBottleSimVars, ...simVars },
    (container) => {
      const ckpt = container.querySelector('g#crewOxygen');
      const cabin = container.querySelector('g#cabinOxygen');
      const shown = (group: Element | null, text: string) =>
        Array.from(group?.querySelectorAll('text') ?? []).some(
          (element) => element.textContent === text && !element.classList.contains('Hide'),
        );
      const labelAmber = (group: Element | null, text: string) =>
        Array.from(group?.querySelectorAll('text') ?? [])
          .find((element) => element.textContent === text)
          ?.getAttribute('class')
          ?.includes('Amber');
      const halfFrameShown = (group: Element | null) => !group?.querySelector('path')?.classList.contains('Hide');
      return {
        ckptLabelAmber: labelAmber(ckpt, 'CKPT'),
        cabinLabelAmber: labelAmber(cabin, 'CABIN'),
        ckptRegulPrLo: shown(ckpt, 'REGUL PR LO'),
        cabinRegulPrLo: shown(cabin, 'REGUL PR LO'),
        ckptHalfFrame: halfFrameShown(ckpt),
        cabinHalfFrame: halfFrameShown(cabin),
      };
    },
  );
}

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

  it('CABIN amber with the amber pressure value when the cabin bottles are low', () => {
    const indication = oxygenIndication(true, false, false, { ...normalCabin, bottlePressureLow: true });
    expect(indication.cabinAmber).toBe(true);
    expect(indication.cabinRegulPrLo).toBe(false);
  });

  it('CABIN amber when a regulator supply valve is closed (OXY CABIN VLV CLOSED)', () => {
    const indication = oxygenIndication(true, true, false, { ...normalCabin, valveClosed: true });
    expect(indication.cabinAmber).toBe(true);
    // the other regulators still supply the distribution manifold: no REGUL PR LO
    expect(indication.cabinRegulPrLo).toBe(false);
  });

  it('CABIN REGUL PR LO on ground below 98 PSI in the manifold, CABIN amber in flight too', () => {
    const empty = { bottlePressureLow: true, bottlePressurePsi: 90, valveClosed: false };
    expect(oxygenIndication(true, true, false, empty)).toMatchObject({ cabinAmber: true, cabinRegulPrLo: true });
    expect(oxygenIndication(true, false, false, empty)).toMatchObject({ cabinAmber: true, cabinRegulPrLo: false });
    expect(oxygenIndication(true, true, false, { ...empty, bottlePressurePsi: 98 }).cabinRegulPrLo).toBe(false);
  });

  it('the page gives the cabin bottle pressure and the cabin valve to the CABIN line', () => {
    expect(renderedOxygen({ 'L:A32NX_OXYGEN_CABIN_VALVE_CLOSED': 1 })).toMatchObject({
      cabinLabelAmber: true,
      cabinRegulPrLo: false,
      ckptLabelAmber: false,
    });
    // 90 PSI in the manifold on the ground
    expect(renderedOxygen({ 'L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE': 90 })).toMatchObject({
      cabinLabelAmber: true,
      cabinRegulPrLo: true,
    });
    expect(renderedOxygen({ 'L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE': 90 }, false)).toMatchObject({
      cabinLabelAmber: true,
      cabinRegulPrLo: false,
    });
  });

  it('the page reads the CREW SUPPLY pb value and only for the CKPT line', () => {
    const rendered = renderedOxygen({ 'L:PUSH_OVHD_OXYGEN_CREW': 1 });
    expect(rendered).toMatchObject({ ckptLabelAmber: true, ckptRegulPrLo: true, cabinLabelAmber: false });
    expect(rendered.cabinRegulPrLo).toBe(false);
    expect(renderedOxygen({ 'L:PUSH_OVHD_OXYGEN_CREW': 0 }).ckptLabelAmber).toBe(false);
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

describe('SD DOOR/OXY cabin oxygen pressure', () => {
  it('green at or above 1 600 PSI', () => {
    const indication = oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 1600 });
    expect(indication.cabinValueAmber).toBe(false);
    expect(indication.cabinHalfFrame).toBe(false);
  });

  it('"On ground only, appears with the amber half-frame, if: The pressure is below 1 600 PSI"', () => {
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 1500 }).cabinHalfFrame).toBe(true);
    expect(
      oxygenPressureIndication({ ...fullBottles, onGround: false, cabinBottlePressurePsi: 1500 }).cabinHalfFrame,
    ).toBe(false);
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 1500 }).cabinValueAmber).toBe(false);
  });

  it('before one engine starts, low (amber) below 800 PSI', () => {
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 799 }).cabinValueAmber).toBe(true);
    expect(oxygenPressureIndication({ ...fullBottles, cabinBottlePressurePsi: 801 }).cabinValueAmber).toBe(false);
  });

  it('engines running: low below the emergency descent minimum of the cabin occupants', () => {
    // 500 masks: 1 003 PSI, the emergency descent oxygen limitation
    const running = { ...fullBottles, onGround: false, oneEngineRunning: true };
    expect(oxygenPressureIndication({ ...running, cabinBottlePressurePsi: 1000 }).cabinValueAmber).toBe(true);
    expect(oxygenPressureIndication({ ...running, cabinBottlePressurePsi: 1010 }).cabinValueAmber).toBe(false);
  });
});

describe('SD DOOR/OXY cockpit oxygen pressure', () => {
  it('below the 5-crew dispatch minimum on ground: amber half-frame, the value stays green', () => {
    const indication = oxygenPressureIndication({ ...fullBottles, ckptBottlePressurePsi: 900 });
    expect(indication.ckptHalfFrame).toBe(true);
    expect(indication.ckptValueAmber).toBe(false);
    expect(
      oxygenPressureIndication({ ...fullBottles, onGround: false, ckptBottlePressurePsi: 900 }).ckptHalfFrame,
    ).toBe(false);
  });

  it('amber when "the pressure is below 350 PSI"', () => {
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

  it('the page draws the half-frames, below the dispatch minimum and on the ground only', () => {
    const lowBottles = { 'L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE': 900, 'L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE': 1500 };
    expect(renderedOxygen(lowBottles)).toMatchObject({ ckptHalfFrame: true, cabinHalfFrame: true });
    expect(renderedOxygen(lowBottles, false)).toMatchObject({ ckptHalfFrame: false, cabinHalfFrame: false });
    expect(renderedOxygen({})).toMatchObject({ ckptHalfFrame: false, cabinHalfFrame: false });
  });

  it('the DOOR page reads the real on-ground state from the left main gear compression', () => {
    const halfFrames = (gearCompressed: number) =>
      withRenderedSdElement(
        <DoorPage />,
        {
          'L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE': 900,
          'L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE': 1850,
          'L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED': gearCompressed,
        },
        (container) =>
          Array.from(container.querySelectorAll('path.Amber.SW2.NoFill'))
            .filter((path) => path.getAttribute('d')?.startsWith('M24,'))
            .map((path) => !path.classList.contains('Hide')),
      );
    // [CKPT half-frame, CABIN half-frame]
    expect(halfFrames(1)).toEqual([true, false]);
    expect(halfFrames(0)).toEqual([false, false]);
  });
});
