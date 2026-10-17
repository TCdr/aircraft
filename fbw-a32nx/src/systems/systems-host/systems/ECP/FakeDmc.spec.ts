// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '@shared/SdPages';
import { DmcEcpLightStatus, ecpPageLightRequest } from './FakeDmc';

describe('ECP system page pb lights', () => {
  it('two ECAM displays: the pb of the selected page lights, steady (manual or advisory selection)', () => {
    expect(ecpPageLightRequest(SdPages.ENG, SdPages.ENG, false)).toEqual({
      litPage: SdPages.ENG,
      code: DmcEcpLightStatus.ManualStatusSystemsAdvisory,
    });
    expect(ecpPageLightRequest(SdPages.NONE, SdPages.NONE, false)).toEqual({
      litPage: SdPages.NONE,
      code: DmcEcpLightStatus.AutomaticStatusSystems,
    });
  });

  it('one ECAM display: the pb of the advisory page flashes', () => {
    expect(ecpPageLightRequest(SdPages.NONE, SdPages.ELEC, true)).toEqual({
      litPage: SdPages.ELEC,
      code: DmcEcpLightStatus.MonoDisplay,
    });
    expect(ecpPageLightRequest(SdPages.HYD, SdPages.NONE, true)).toEqual({
      litPage: SdPages.HYD,
      code: DmcEcpLightStatus.ManualStatusSystemsAdvisory,
    });
  });
});
