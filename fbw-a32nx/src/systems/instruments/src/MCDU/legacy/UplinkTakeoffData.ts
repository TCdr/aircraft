// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import {
  CompanyTakeoffDataLink,
  CompanyTakeoffDataLinkMessage,
  CompanyTakeoffDataRequestContent,
  CompanyTakeoffDataUplink,
} from '@flybywiresim/fbw-sdk';

/**
 * The uplink takeoff data of the A320 FMS (A320 FCOM DSC-22_45 TAKEOFF DATA FUNCTION, DSC-22_20-50-10-28 UPLINK TO DATA
 * pages): a request for up to two runways (the asterisk of the prompt disappears while it is pending), and the takeoff
 * data received for up to four runways, MAX and FLEX for each. The ground station is the flypad takeoff calculator,
 * with the same events as the A380 company takeoff data.
 */
export class UplinkTakeoffData extends CompanyTakeoffDataLink {
  /**
   * @param bus the event bus
   * @param fmsData the current takeoff data of the FMS, for the takeoff data import of the flypad
   * @param onMessage shows an FMS message
   */
  constructor(
    bus: EventBus,
    fmsData: () => CompanyTakeoffDataRequestContent,
    onMessage: (message: CompanyTakeoffDataLinkMessage) => void,
  ) {
    super(bus, true, fmsData, onMessage);
  }

  /** The A320 UPLINK TO DATA pages need V1 and VR */
  protected override isValid(uplink: CompanyTakeoffDataUplink): boolean {
    return (
      super.isValid(uplink) &&
      CompanyTakeoffDataLink.isFiniteNumber(uplink.v1) &&
      CompanyTakeoffDataLink.isFiniteNumber(uplink.vr)
    );
  }
}
