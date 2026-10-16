// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  ARU_START_DURATION_MS,
  AnsuSupplies,
  AruStartup,
  LaptopNetworkConnection,
  isAnsuPowered,
  isNssAvncsAvailable,
} from './AnsuLogic';

const none: AnsuSupplies = { ac1: false, ac2: false, acEss: false, acEmer: false, dcHot1: false, dcHot2: false };
const only = (supply: keyof AnsuSupplies): AnsuSupplies => ({ ...none, [supply]: true });

describe('A380 ANSU power supplies (FCOM DSC-46-20-70)', () => {
  it('powers NSS AVNCS ANSU 1 from AC 2 or BAT 2', () => {
    expect(isAnsuPowered('nss-avncs', 1, only('ac2'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 1, only('dcHot2'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 1, only('ac1'))).toBe(false);
    expect(isAnsuPowered('nss-avncs', 1, none)).toBe(false);
  });

  it('powers NSS AVNCS ANSU 2 from AC 1, AC EMER or BAT 1', () => {
    expect(isAnsuPowered('nss-avncs', 2, only('ac1'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 2, only('acEmer'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 2, only('dcHot1'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 2, only('ac2'))).toBe(false);
    expect(isAnsuPowered('nss-avncs', 2, only('acEss'))).toBe(false);
  });

  it('powers the FLT OPS ANSU from AC ESS or BAT 1, not from AC EMER', () => {
    expect(isAnsuPowered('flt-ops', 1, only('acEss'))).toBe(true);
    expect(isAnsuPowered('flt-ops', 1, only('dcHot1'))).toBe(true);
    expect(isAnsuPowered('flt-ops', 1, only('acEmer'))).toBe(false);
  });
});

describe('A380 NSS AVNCS ANSU redundancy (FCOM DSC-46-20-30)', () => {
  it('keeps the NSS AVNCS applications with ANSU 1 failed: ANSU 2 takes over', () => {
    expect(isNssAvncsAvailable(false, true)).toBe(true);
  });

  it('keeps them with ANSU 2 failed', () => {
    expect(isNssAvncsAvailable(true, false)).toBe(true);
  });

  it('loses them with both ANSUs failed', () => {
    expect(isNssAvncsAvailable(false, false)).toBe(false);
  });
});

describe('A380 ARU start (FCOM DSC-46-20-10-20, a380_fcom.txt l.102249-102252: 2 minutes at power-up)', () => {
  it('operates 2 minutes after the aircraft power-up, not before', () => {
    const aru = new AruStartup();
    // cold and dark at the flight load, the crew powers the aircraft later
    expect(aru.update(false, AruStartup.FLIGHT_LOAD_WINDOW_MS + 1_000)).toBe(false);
    expect(aru.update(true, 100)).toBe(false);
    expect(aru.update(true, ARU_START_DURATION_MS - 1_000)).toBe(false);
    expect(aru.update(true, 1_000)).toBe(true);
  });

  it('starts again for 2 minutes after a power loss', () => {
    const aru = new AruStartup();
    aru.update(false, 0);
    aru.update(true, ARU_START_DURATION_MS);
    expect(aru.isOperating()).toBe(true);
    expect(aru.update(false, 100)).toBe(false);
    expect(aru.update(true, 60_000)).toBe(false);
    expect(aru.update(true, 60_000)).toBe(true);
  });

  it('is already operating in a flight loaded with the aircraft powered', () => {
    const aru = new AruStartup();
    // the first frame: the ANSU does not know its state yet
    expect(aru.update(false, 0)).toBe(false);
    expect(aru.update(true, 50)).toBe(true);
  });
});

describe('A380 laptop STANDALONE (FCOM DSC-46-20-40, a380_fcom.txt l.104922-104945)', () => {
  it('is connected when started with the ARU operating', () => {
    const laptop = new LaptopNetworkConnection();
    expect(laptop.update(true, true)).toBe(false);
  });

  it('started before the ARU: stays a stand-alone after the ARU start, until it is restarted', () => {
    const laptop = new LaptopNetworkConnection();
    expect(laptop.update(true, false)).toBe(true);
    expect(laptop.update(true, true)).toBe(true);
    // restart
    expect(laptop.update(false, true)).toBe(false);
    expect(laptop.update(true, true)).toBe(false);
  });

  it('is a stand-alone while not connected to the network (ARU lost), connected again when it is back', () => {
    const laptop = new LaptopNetworkConnection();
    laptop.update(true, true);
    expect(laptop.update(true, false)).toBe(true);
    expect(laptop.isStandalone()).toBe(true);
    expect(laptop.update(true, true)).toBe(false);
  });

  it('a laptop running at the flight load of a powered aircraft is connected, not a stand-alone', () => {
    const laptop = new LaptopNetworkConnection();
    // the first frame: the ARU is not known to operate yet
    expect(laptop.update(true, false, true)).toBe(true);
    expect(laptop.update(true, true, true)).toBe(false);
    expect(laptop.update(true, true, false)).toBe(false);
  });

  it('is no stand-alone while switched off', () => {
    const laptop = new LaptopNetworkConnection();
    expect(laptop.update(false, false)).toBe(false);
  });
});
