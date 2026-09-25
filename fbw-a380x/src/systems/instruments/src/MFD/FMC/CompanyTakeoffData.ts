// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CompanyTakeoffDataLink, CompanyTakeoffDataUplink } from '@flybywiresim/fbw-sdk';

/**
 * The company takeoff data of the FMS (A380 FCOM DSC-22-FMS, company takeoff data): the request sent with SEND T.O
 * REQUEST (REQUEST PENDING... while it waits), and the takeoff data received with or without a request, kept until the
 * flight crew inserts or clears it. The company ground station is the flypad takeoff calculator.
 */
export class CompanyTakeoffData extends CompanyTakeoffDataLink {
  /** The A380 data needs the runway condition; V1 and VR may be missing (real data only mode of the calculator) */
  protected override isValid(uplink: CompanyTakeoffDataUplink): boolean {
    const finite = CompanyTakeoffDataLink.isFiniteNumber;
    return (
      super.isValid(uplink) &&
      finite(uplink.runwayCondition) &&
      (uplink.v1 === null || finite(uplink.v1)) &&
      (uplink.vr === null || finite(uplink.vr))
    );
  }
}
