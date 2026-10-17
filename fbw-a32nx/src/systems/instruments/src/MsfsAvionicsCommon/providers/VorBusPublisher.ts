// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { EventBus, SimVarPublisher, SimVarPublisherEntry, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  isSignalReceived,
  NAV_RADIO_RECEIVERS,
  NavigationReceiverIndex,
  NavigationReceiverKind,
  navigationReceiverFailedVar,
} from '@shared/navigation/NavigationReceivers';

export interface VorSimVars {
  nav1Ident: string;
  nav1Frequency: number;
  nav1HasDme: boolean;
  nav1DmeDistance: NauticalMiles;
  nav1RelativeBearing: Degrees;
  nav1Obs: Degrees;
  nav1Localizer: Degrees;
  nav1RadialError: Degrees;
  nav1Available: boolean;
  nav1StationDeclination: Degrees;
  nav1Location: LatLongAlt;

  nav2Ident: string;
  nav2Frequency: number;
  nav2HasDme: boolean;
  nav2DmeDistance: NauticalMiles;
  nav2RelativeBearing: Degrees;
  nav2Obs: Degrees;
  nav2Localizer: Degrees;
  nav2RadialError: Degrees;
  nav2Available: boolean;
  nav2StationDeclination: Degrees;
  nav2Location: LatLongAlt;

  nav3Ident: string;
  nav3Frequency: number;
  nav3HasDme: boolean;
  nav3DmeDistance: NauticalMiles;
  nav3RelativeBearing: Degrees;
  nav3Obs: Degrees;
  nav3Localizer: Degrees;
  nav3RadialError: Degrees;
  nav3Available: boolean;
  nav3StationDeclination: Degrees;
  nav3Location: LatLongAlt;

  nav4Ident: string;
  nav4Frequency: number;
  nav4HasDme: boolean;
  nav4DmeDistance: NauticalMiles;
  nav4RelativeBearing: Degrees;
  nav4Obs: Degrees;
  nav4Localizer: Degrees;
  nav4RadialError: Degrees;
  nav4Available: boolean;
  nav4StationDeclination: Degrees;
  nav4Location: LatLongAlt;

  localizerValid: boolean;
  glideSlopeValid: boolean;
  glideSlopeDeviation: number;

  adf1Ident: string;
  adf1ActiveFrequency: number;
  adf1SignalStrength: number;
  adf1Radial: number;

  adf2Ident: string;
  adf2ActiveFrequency: number;
  adf2SignalStrength: number;
  adf2Radial: number;
}

/**
 * A radio navigation receiver is failed (flyPad ATA 34 failures, published by NavigationReceiverFailures in the
 * systems host).
 * @param kind the receiver
 * @param index receiver 1 or 2
 * @returns whether it is failed
 */
function isReceiverFailed(kind: NavigationReceiverKind, index: NavigationReceiverIndex): boolean {
  return SimVar.GetSimVarValue(navigationReceiverFailedVar(kind, index), 'bool') > 0;
}

/**
 * The bearing signal (NAV HAS NAV) of a sim NAV radio, lost while its VOR or ILS receiver is failed: the ND then shows
 * no bearing pointer and no deviation for it. A320 FCOM DSC-34-NAV-30-10 (a320_fcom.txt l.53399-53408): the flags
 * appear when "The VOR or ADF receiver fails".
 * @param navIndex the sim NAV radio
 * @param received the sim signal
 * @returns whether the signal is received
 */
export function navAvailable(navIndex: 1 | 2 | 3 | 4, received: number | boolean): boolean {
  const [kind, index] = NAV_RADIO_RECEIVERS[navIndex].bearing;
  return isSignalReceived(received, isReceiverFailed(kind, index));
}

/**
 * The DME signal of NAV 1 or 2, lost while DME 1 or 2 is failed (NAV 3 and 4 keep the sim DME).
 * @param navIndex the sim NAV radio
 * @param received the sim signal
 * @returns whether the DME is received
 */
export function navHasDme(navIndex: 1 | 2 | 3 | 4, received: number | boolean): boolean {
  const dme = NAV_RADIO_RECEIVERS[navIndex].dme;
  return dme === undefined ? !!received : isSignalReceived(received, isReceiverFailed('DME', dme));
}

/**
 * The signal strength of ADF 1 or 2, none while the ADF receiver is failed.
 * @param index ADF 1 or 2
 * @param signal the sim signal strength
 * @returns the signal strength
 */
export function adfSignalStrength(index: NavigationReceiverIndex, signal: number): number {
  return isReceiverFailed('ADF', index) ? 0 : signal;
}

export class VorBusPublisher extends SimVarPublisher<VorSimVars> {
  constructor(bus: EventBus) {
    super(
      new Map<keyof VorSimVars, SimVarPublisherEntry<any>>([
        ['nav1Ident', { name: 'NAV IDENT:1', type: SimVarValueType.String }],
        ['nav1Frequency', { name: 'NAV ACTIVE FREQUENCY:1', type: SimVarValueType.MHz }],
        ['nav1HasDme', { name: 'NAV HAS DME:1', type: SimVarValueType.Bool, map: (v: number) => navHasDme(1, v) }],
        ['nav1DmeDistance', { name: 'NAV DME:1', type: SimVarValueType.NM }],
        ['nav1RelativeBearing', { name: 'NAV RELATIVE BEARING TO STATION:1', type: SimVarValueType.Degree }],
        ['nav1Obs', { name: 'NAV OBS:1', type: SimVarValueType.Degree }],
        ['nav1Localizer', { name: 'NAV LOCALIZER:1', type: SimVarValueType.Degree }],
        ['nav1RadialError', { name: 'NAV RADIAL ERROR:1', type: SimVarValueType.Degree }],
        // This is fine at the moment. The database does not have the necessary information to implement proper logic.
        [
          'nav1Available',
          { name: 'NAV HAS NAV:1', type: SimVarValueType.Bool, map: (v: number) => navAvailable(1, v) },
        ],
        ['nav1StationDeclination', { name: 'NAV MAGVAR:1', type: SimVarValueType.Degree }],
        ['nav1Location', { name: 'NAV VOR LATLONALT:1', type: SimVarValueType.LLA }],

        ['nav2Ident', { name: 'NAV IDENT:2', type: SimVarValueType.String }],
        ['nav2Frequency', { name: 'NAV ACTIVE FREQUENCY:2', type: SimVarValueType.MHz }],
        ['nav2HasDme', { name: 'NAV HAS DME:2', type: SimVarValueType.Bool, map: (v: number) => navHasDme(2, v) }],
        ['nav2DmeDistance', { name: 'NAV DME:2', type: SimVarValueType.NM }],
        ['nav2RelativeBearing', { name: 'NAV RELATIVE BEARING TO STATION:2', type: SimVarValueType.Degree }],
        ['nav2Obs', { name: 'NAV OBS:2', type: SimVarValueType.Degree }],
        ['nav2Localizer', { name: 'NAV LOCALIZER:2', type: SimVarValueType.Degree }],
        ['nav2RadialError', { name: 'NAV RADIAL ERROR:2', type: SimVarValueType.Degree }],
        [
          'nav2Available',
          { name: 'NAV HAS NAV:2', type: SimVarValueType.Bool, map: (v: number) => navAvailable(2, v) },
        ],
        ['nav2StationDeclination', { name: 'NAV MAGVAR:2', type: SimVarValueType.Degree }],
        ['nav2Location', { name: 'NAV VOR LATLONALT:2', type: SimVarValueType.LLA }],

        ['nav3Ident', { name: 'NAV IDENT:3', type: SimVarValueType.String }],
        ['nav3Frequency', { name: 'NAV ACTIVE FREQUENCY:3', type: SimVarValueType.MHz }],
        ['nav3HasDme', { name: 'NAV HAS DME:3', type: SimVarValueType.Bool, map: (v: number) => navHasDme(3, v) }],
        ['nav3DmeDistance', { name: 'NAV DME:3', type: SimVarValueType.NM }],
        ['nav3RelativeBearing', { name: 'NAV RELATIVE BEARING TO STATION:3', type: SimVarValueType.Degree }],
        ['nav3Obs', { name: 'NAV OBS:3', type: SimVarValueType.Degree }],
        ['nav3Localizer', { name: 'NAV LOCALIZER:3', type: SimVarValueType.Degree }],
        ['nav3RadialError', { name: 'NAV RADIAL ERROR:3', type: SimVarValueType.Degree }],
        [
          'nav3Available',
          { name: 'NAV HAS NAV:3', type: SimVarValueType.Bool, map: (v: number) => navAvailable(3, v) },
        ],
        ['nav3StationDeclination', { name: 'NAV MAGVAR:3', type: SimVarValueType.Degree }],
        ['nav3Location', { name: 'NAV VOR LATLONALT:3', type: SimVarValueType.LLA }],

        ['nav4Ident', { name: 'NAV IDENT:4', type: SimVarValueType.String }],
        ['nav4Frequency', { name: 'NAV ACTIVE FREQUENCY:4', type: SimVarValueType.MHz }],
        ['nav4HasDme', { name: 'NAV HAS DME:4', type: SimVarValueType.Bool, map: (v: number) => navHasDme(4, v) }],
        ['nav4DmeDistance', { name: 'NAV DME:4', type: SimVarValueType.NM }],
        ['nav4RelativeBearing', { name: 'NAV RELATIVE BEARING TO STATION:4', type: SimVarValueType.Degree }],
        ['nav4Obs', { name: 'NAV OBS:4', type: SimVarValueType.Degree }],
        ['nav4Localizer', { name: 'NAV LOCALIZER:4', type: SimVarValueType.Degree }],
        ['nav4RadialError', { name: 'NAV RADIAL ERROR:4', type: SimVarValueType.Degree }],
        [
          'nav4Available',
          { name: 'NAV HAS NAV:4', type: SimVarValueType.Bool, map: (v: number) => navAvailable(4, v) },
        ],
        ['nav4StationDeclination', { name: 'NAV MAGVAR:4', type: SimVarValueType.Degree }],
        ['nav4Location', { name: 'NAV VOR LATLONALT:4', type: SimVarValueType.LLA }],

        ['localizerValid', { name: 'L:A32NX_RADIO_RECEIVER_LOC_IS_VALID', type: SimVarValueType.Bool }],
        ['glideSlopeValid', { name: 'L:A32NX_RADIO_RECEIVER_GS_IS_VALID', type: SimVarValueType.Bool }],
        ['glideSlopeDeviation', { name: 'L:A32NX_RADIO_RECEIVER_GS_DEVIATION', type: SimVarValueType.Number }],

        ['adf1Ident', { name: 'ADF IDENT:1', type: SimVarValueType.String }],
        ['adf1ActiveFrequency', { name: 'ADF ACTIVE FREQUENCY:1', type: SimVarValueType.KHz }],
        [
          'adf1SignalStrength',
          { name: 'ADF SIGNAL:1', type: SimVarValueType.Number, map: (v: number) => adfSignalStrength(1, v) },
        ],
        ['adf1Radial', { name: 'ADF RADIAL:1', type: SimVarValueType.Degree }],

        ['adf2Ident', { name: 'ADF IDENT:2', type: SimVarValueType.String }],
        ['adf2ActiveFrequency', { name: 'ADF ACTIVE FREQUENCY:2', type: SimVarValueType.KHz }],
        [
          'adf2SignalStrength',
          { name: 'ADF SIGNAL:2', type: SimVarValueType.Number, map: (v: number) => adfSignalStrength(2, v) },
        ],
        ['adf2Radial', { name: 'ADF RADIAL:2', type: SimVarValueType.Degree }],
      ]),
      bus,
    );
  }
}
