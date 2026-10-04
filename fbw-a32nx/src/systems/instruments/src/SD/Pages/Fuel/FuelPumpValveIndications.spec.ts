// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isCentreTankQuantityBoxed,
  isCrossFeedValveGreen,
  WingPumpIndication,
  wingPumpIndication,
} from './FuelPumpValveIndications';

describe('SD FUEL wing pump indication (FCOM DSC-28-20-F WING PUMP INDICATIONS)', () => {
  it('is inline green with the pump ON and its pressure normal', () => {
    expect(wingPumpIndication(true, false, true)).toBe(WingPumpIndication.InlineGreen);
  });

  it('is LO amber with the pump ON and its pressure low (failed pump)', () => {
    expect(wingPumpIndication(true, true, true)).toBe(WingPumpIndication.LoAmber);
  });

  it('is LO amber with the pump ON and its bus not powered', () => {
    expect(wingPumpIndication(true, false, false)).toBe(WingPumpIndication.LoAmber);
  });

  it('is crossline amber with the pump OFF, failed or not', () => {
    expect(wingPumpIndication(false, false, true)).toBe(WingPumpIndication.CrosslineAmber);
    expect(wingPumpIndication(false, true, false)).toBe(WingPumpIndication.CrosslineAmber);
  });
});

describe('SD FUEL X FEED valve colour (FCOM DSC-28-20-F X FEED INDICATIONS)', () => {
  it('is green when the valve follows the pb-sw', () => {
    expect(isCrossFeedValveGreen(100, true)).toBe(true);
    expect(isCrossFeedValveGreen(0, false)).toBe(true);
  });

  it('is amber when the valve is open with the pb-sw OFF (jammed open)', () => {
    expect(isCrossFeedValveGreen(100, false)).toBe(false);
  });

  it('is amber when the valve is closed with the pb-sw ON (jammed closed)', () => {
    expect(isCrossFeedValveGreen(0, true)).toBe(false);
  });

  it('is amber in transit', () => {
    expect(isCrossFeedValveGreen(50, true)).toBe(false);
    expect(isCrossFeedValveGreen(50, false)).toBe(false);
  });
});

describe('A320 SD FUEL centre tank quantity boxed amber (FCOM DSC-28-20-F BOXED INDICATIONS)', () => {
  it('is boxed when both centre tank transfer valves failed closed', () => {
    expect(isCentreTankQuantityBoxed(true, true)).toBe(true);
  });

  it('is not boxed with one valve failed closed, or none', () => {
    expect(isCentreTankQuantityBoxed(true, false)).toBe(false);
    expect(isCentreTankQuantityBoxed(false, true)).toBe(false);
    expect(isCentreTankQuantityBoxed(false, false)).toBe(false);
  });
});
