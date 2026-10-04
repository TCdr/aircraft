// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AnsuSupplies, isAnsuPowered, isNssAvncsAvailable } from './AnsuLogic';

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
