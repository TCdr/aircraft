// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { isA380AtcAlertInhibited } from '@datalink/atc';

/**
 * Half period of the ATC MSG light flashing, ms: the pb flashes at 2 Hz after an ATC message is received, so 250 ms
 * on, 250 ms off.
 */
const FLASH_HALF_PERIOD_MS = 250;

/** Set by the ATC function (datalink SimVarHandling atcMessageButtonActive) while a message waits in the mailbox */
const ATC_MSG_WAITING_VAR = 'L:A32NX_DCDU_ATC_MSG_WAITING';

/** The A380 FWS flight phase (FwcFlightPhase) */
const FWS_FLIGHT_PHASE_VAR = 'L:A32NX_FWC_FLIGHT_PHASE';

/** Read by the two ATC MSG pbs of the glareshield (glareshield.xml) */
export const ATC_MSG_LIGHT_VAR = 'L:A380X_GLARESHIELD_ATC_MSG_LIGHT';

/**
 * Whether the ATC MSG lights are lit at a time. The ATC function only says that a message waits; the lights flash at
 * 2 Hz until either pb is pressed (A380 FCOM l.101236-101237: "When the flight crew presses either of the pushbutton,
 * the ATC MSG lights of the two ATC MSG pb go off"), which resets the waiting flag.
 * The lights stay dark in takeoff and landing (A380 FCOM l.95755: "Inhibit the ATC MSG pb lighting and the aural
 * signal during taxiing, takeoff, and landing.", l.101523: "During takeoff and landing, the ATC MSG light and aural
 * alert are inhibited."; phases in AtcAlertInhibition), and flash again after it while the message still waits.
 * @param messageWaiting a message waits in the mailbox (the ATC function's attention getter)
 * @param timeMs a running time in ms
 * @param fwsFlightPhase the FWS flight phase, 0 when unknown
 * @returns whether the lights are lit at that time
 */
export function isAtcMsgLightLit(messageWaiting: boolean, timeMs: number, fwsFlightPhase = 0): boolean {
  return (
    messageWaiting && !isA380AtcAlertInhibited(fwsFlightPhase) && Math.floor(timeMs / FLASH_HALF_PERIOD_MS) % 2 === 0
  );
}

/**
 * Drives the ATC MSG lights of the captain's and first officer's glareshield. The flashing is computed here because the
 * cockpit lamp code cannot read the sim time (see AutolandLights).
 */
export class AtcMsgLights implements Instrument {
  private lit = false;

  /** @inheritdoc */
  init(): void {
    SimVar.SetSimVarValue(ATC_MSG_LIGHT_VAR, SimVarValueType.Bool, false);
  }

  /** @inheritdoc */
  onUpdate(): void {
    const waiting = SimVar.GetSimVarValue(ATC_MSG_WAITING_VAR, SimVarValueType.Bool) > 0;
    const flightPhase = SimVar.GetSimVarValue(FWS_FLIGHT_PHASE_VAR, SimVarValueType.Enum);
    const lit = isAtcMsgLightLit(waiting, Date.now(), flightPhase);
    if (lit !== this.lit) {
      this.lit = lit;
      SimVar.SetSimVarValue(ATC_MSG_LIGHT_VAR, SimVarValueType.Bool, lit);
    }
  }
}
