// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429OutputWord, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { EventBus, Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/SdPages';

export interface FakeDmcEvents {
  fake_dmc_light_status_275: number;
}

export enum DmcEcpLightStatus {
  MonoDisplay = 0b00,
  EngineWarning = 0b01,
  ManualStatusSystemsAdvisory = 0b10,
  AutomaticStatusSystems = 0b11,
}

/**
 * Only one ECAM display is on: set by the display unit reconfiguration (the ECAM DU transfers); 0 when nothing sets it
 */
export const ECAM_SINGLE_DISPLAY_VAR = 'L:A32NX_ECAM_SINGLE_DISPLAY';

/** The system page with an ECAM advisory (DmcSdPageLogic, SdAdvisories), -1 for none */
export const ECAM_SD_ADVISORY_PAGE_VAR = 'L:A32NX_ECAM_SD_ADVISORY_PAGE';

/**
 * The ECP system page pb to light and the DMC light code. The pbs light up when pushed for manual selection or when an
 * advisory is detected; with only one ECAM display, an advisory does not display its page automatically but its pb
 * light pulses.
 * With two displays the advisory page is selected (DmcSdPageLogic), so its pb lights as a selected page. The ECP flashes
 * the lit pb with the MonoDisplay code (Ecp.ts flashOn).
 * @param selectedPage the selected SD page (L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX), SdPages.NONE in flight phase mode
 * @param advisoryPage the page with an advisory, SdPages.NONE if none
 * @param singleDisplay only one ECAM display is on
 */
export function ecpPageLightRequest(
  selectedPage: SdPages,
  advisoryPage: SdPages,
  singleDisplay: boolean,
): { litPage: SdPages; code: DmcEcpLightStatus } {
  if (singleDisplay && advisoryPage !== SdPages.NONE) {
    return { litPage: advisoryPage, code: DmcEcpLightStatus.MonoDisplay };
  }
  return {
    litPage: selectedPage,
    code:
      selectedPage === SdPages.NONE
        ? DmcEcpLightStatus.AutomaticStatusSystems
        : DmcEcpLightStatus.ManualStatusSystemsAdvisory,
  };
}

/**
 * A fake DMC to supply the ARINC words required by the ECP.
 * To be replaced by a proper DMC simulation later.
 */
export class FakeDmc implements Instrument {
  private readonly publisher = this.bus.getPublisher<FakeDmcEvents>();

  private readonly outputWord = new Arinc429OutputWord();

  private sdPage = SdPages.NONE;

  constructor(private readonly bus: EventBus) {}

  public init(): void {}

  private readonly publishToBus = () =>
    this.publisher.pub('fake_dmc_light_status_275', this.outputWord.getRawBusValue());

  public onUpdate(): void {
    const light = ecpPageLightRequest(
      SimVar.GetSimVarValue('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SimVarValueType.Enum),
      SimVar.GetSimVarValue(ECAM_SD_ADVISORY_PAGE_VAR, SimVarValueType.Enum),
      SimVar.GetSimVarValue(ECAM_SINGLE_DISPLAY_VAR, SimVarValueType.Bool) > 0,
    );
    this.sdPage = light.litPage;
    const ecamSFail = SimVar.GetSimVarValue('L:A32NX_ECAM_SFAIL', SimVarValueType.Enum);
    const leftFailureDisplayed = SimVar.GetSimVarValue('L:A32NX_EWD_LEFT_FAILURE_ACTIVE', SimVarValueType.Bool);

    this.outputWord.setBitValue(12, this.sdPage === SdPages.ENG);
    this.outputWord.setBitValue(13, this.sdPage === SdPages.BLEED);
    this.outputWord.setBitValue(14, this.sdPage === SdPages.PRESS);
    this.outputWord.setBitValue(15, this.sdPage === SdPages.HYD);
    this.outputWord.setBitValue(16, this.sdPage === SdPages.ELEC);
    this.outputWord.setBitValue(17, this.sdPage === SdPages.FUEL);
    this.outputWord.setBitValue(18, this.sdPage === SdPages.APU);
    this.outputWord.setBitValue(19, this.sdPage === SdPages.COND);
    this.outputWord.setBitValue(20, this.sdPage === SdPages.DOOR);
    this.outputWord.setBitValue(21, this.sdPage === SdPages.FCTL);
    this.outputWord.setBitValue(22, this.sdPage === SdPages.WHEEL);
    this.outputWord.setBitValue(26, this.sdPage === SdPages.STS);
    this.outputWord.setBitValue(27, ecamSFail >= 0 || leftFailureDisplayed); // CLR
    // The DMC light code (DmcEcpLightStatus) in bits 28 (low) and 29 (high)
    this.outputWord.setBitValue(28, (light.code & 0b01) !== 0);
    this.outputWord.setBitValue(29, (light.code & 0b10) !== 0);

    this.outputWord.setSsm(Arinc429SignStatusMatrix.NormalOperation);

    this.outputWord.performActionIfDirty(this.publishToBus);
  }
}
