// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';

import { render } from '@instruments/common/index';
import { AircraftContext, EfbWrapper, syncSettingsFromPersistentStorage } from '@flybywiresim/flypad';
import { A320FailureDefinitions } from '@failures';
import { A320251NLandingCalculator } from '@shared/performance/a32nx_landing';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { FmsDescentPerformanceCalculator } from '@fmgc/performance/FmsDescentPerformanceCalculator';
import { A320251NTakeoffPerformanceCalculator } from '@shared/performance/a32nx_takeoff';
import { AutomaticCallOutsPage } from './Pages/AutomaticCallOutsPage';
import { a32nxSyncedSettings } from './settingsSync';

import './Efb.scss';
import { EventBus } from '@microsoft/msfs-sdk';

function aircraftEfbSetup(): void {
  syncSettingsFromPersistentStorage(a32nxSyncedSettings);
}

// TODO: Hoist failures context provider up to here
// This context provider will be replaced by a PluginBinder for fpadv4
render(
  <AircraftContext.Provider
    value={{
      performanceCalculators: {
        takeoff: new A320251NTakeoffPerformanceCalculator(),
        landing: new A320251NLandingCalculator(),
        // A320 FCOM PER-DES-STD: standard descent M.78 / 300 kt / 250 kt below FL 100; LIM: MMO, VMO, max altitude
        descent: new FmsDescentPerformanceCalculator(A320AircraftConfig, {
          standardSchedule: { mach: 0.78, cas: 300, limitCas: 250, limitAltitude: 10_000 },
          mmo: 0.82,
          vmo: 350,
          maxAltitude: 39_800,
          oew: 42_500,
          mtow: 79_000,
        }),
      },
      pushbackPage: {
        turnIndicatorTuningDefault: 1.35,
      },
      settingsPages: {
        audio: {
          announcements: true,
          boardingMusic: true,
          engineVolume: true,
          masterVolume: true,
          windVolume: true,
          ptuCockpit: true,
          paxAmbience: true,
        },
        // FIXME: just inject the aircraft options page from the aircraft context (or plugin in flypadOSv4).
        pinProgram: {
          latLonExtend: true,
          paxSign: true,
          rmpVhfSpacing: true,
          satcom: true,
          raas: true,
        },
        realism: {
          mcduKeyboard: true,
          pauseOnTod: true,
          autoStepClimb: false,
          pilotAvatars: true,
          eclSoftKeys: false,
          fireTestExtend: true,
          keepPilotStoredElements: false,
          companyDatalinkReplyTime: false,
        },
        sim: {
          cones: true,
          msfsFplnSync: true,
          pilotSeat: false,
          registrationDecal: true,
          wheelChocks: true,
          cabinLighting: false,
          oansPerformanceMode: false,
        },
        throttle: {
          numberOfAircraftThrottles: 2,
          axisOptions: [1, 2],
          axisMapping: [
            [[1, 2]], // 1
            [[1], [2]], // 2
          ],
        },
        autoCalloutsPage: AutomaticCallOutsPage,
      },
      hashFile: '/Data/a32nx_hashes.json',
      hashSeed: 320,
    }}
  >
    <EfbWrapper failures={A320FailureDefinitions} aircraftSetup={aircraftEfbSetup} eventBus={new EventBus()} />
  </AircraftContext.Provider>,
  true,
  true,
);
