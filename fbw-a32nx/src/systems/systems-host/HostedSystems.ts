// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument } from '@microsoft/msfs-sdk';
import { TawsStatusBridge } from './systems/TawsStatusBridge';
import { RaasSystem } from './systems/Raas/RaasSystem';
import { Transponder } from './systems/Transponder/Transponder';
import { RadioCommunicationFailures } from './systems/Communications/RadioCommunicationFailures';
import { NavigationReceiverFailures } from './systems/Navigation/NavigationReceiverFailures';
import { FuelPumpsAndValves } from './systems/Fuel/FuelPumpsAndValves';
import { PaxOxygenMasks } from './systems/Oxygen/PaxOxygenMasks';
import { DoorFailures } from './systems/Doors/DoorFailures';
import { CockpitVoiceRecorder } from './systems/Recorders/CockpitVoiceRecorder';
import { FacReactiveWindshear } from './systems/Fac/FacReactiveWindshear';

/**
 * The systems the systems host runs after the clock, the ATSU, the ECP and the DMC, by backplane name, in the order
 * the backplane initialises and updates them. Built here rather than in the host so that a spec can check what the
 * host runs: the host extends BaseInstrument, which vitest cannot build.
 */
export function createHostedSystems(bus: EventBus): [name: string, instrument: Instrument][] {
  return [
    ['TawsStatusBridge', new TawsStatusBridge()],
    ['Raas', new RaasSystem(bus)],
    ['Transponder', new Transponder()],
    ['RadioCommunicationFailures', new RadioCommunicationFailures()],
    ['NavigationReceiverFailures', new NavigationReceiverFailures()],
    ['FuelPumpsAndValves', new FuelPumpsAndValves()],
    ['PaxOxygenMasks', new PaxOxygenMasks()],
    ['DoorFailures', new DoorFailures()],
    ['CockpitVoiceRecorder', new CockpitVoiceRecorder()],
    ['FacReactiveWindshear', new FacReactiveWindshear()],
  ];
}
