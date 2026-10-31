// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { FuelJettison } from './CpiomF/FuelJettison';
import { FuelPumpsAndValves } from './CpiomF/FuelPumpsAndValves';
import { FuelEmerOuterTransfer } from './CpiomF/FuelEmerOuterTransfer';
import { FuelLeak } from './CpiomF/FuelLeak';
import { FuelAutomaticTransfers } from './CpiomF/FuelAutomaticTransfers';
import { FuelTransferFaults } from './CpiomF/FuelTransferFaults';
import { FuelCollectorCells } from './CpiomF/FuelCollectorCells';
import { FuelTemperatures } from './CpiomF/FuelTankTemperatures';
import { WeightBalanceBackup } from './CpiomF/WeightBalanceBackup';
import { FuelApuFeed } from './CpiomF/FuelApuFeed';
import { FuelOverflow } from './CpiomF/FuelOverflow';
import { FuelRefuelFaults } from './CpiomF/FuelRefuelFaults';
import { AutolandLights } from './Misc/AutolandLights';
import { WxPbAutoDeselect } from './Misc/WxPbAutoDeselect';
import { WxrSurvKnobs } from './Misc/WxrSurvKnobs';
import { AtcMsgLights } from './Misc/AtcMsgLights';
import { CabinOxygenMasks } from './Misc/CabinOxygenMasks';
import { CabinSigns } from './Misc/CabinSigns';
import { Tpis } from './Misc/Tpis';
import { DoorsAndSlidesManagementSystem } from './Misc/DoorsAndSlidesManagement';
import { CockpitDoorEmergencyAccess } from './Misc/CockpitDoorEmergencyAccess';
import { CdsReconfiguration } from './Misc/CdsReconfiguration';

/**
 * The systems the systems host runs between the legacy fuel system and the BTV, by backplane name, in the order the
 * backplane initialises and updates them. Built here rather than in the host so that a spec can check what the host
 * runs: the host extends BaseInstrument, which vitest cannot build.
 * @param host the systems host, for the time since its last update
 * @param fuelTransferFaults the transfer faults the legacy fuel system also reads
 */
export function createHostedSystems(
  host: BaseInstrument,
  bus: EventBus,
  failuresConsumer: FailuresConsumer,
  fuelTransferFaults: FuelTransferFaults,
): [name: string, instrument: Instrument][] {
  const fuelJettison = new FuelJettison(bus, host, failuresConsumer);
  const autolandLights = new AutolandLights();
  const wxPbAutoDeselect = new WxPbAutoDeselect();
  // the ELEVN and GAIN knobs of the SURV panel
  const wxrSurvKnobs = new WxrSurvKnobs(bus);
  const atcMsgLights = new AtcMsgLights();
  const cabinOxygenMasks = new CabinOxygenMasks();
  const cabinSigns = new CabinSigns();
  const tpis = new Tpis(host, failuresConsumer);
  const dsms = new DoorsAndSlidesManagementSystem(host, failuresConsumer);
  const cockpitDoorEmergencyAccess = new CockpitDoorEmergencyAccess(host, failuresConsumer);
  const cdsReconfiguration = new CdsReconfiguration(bus, failuresConsumer);
  const fuelPumpsAndValves = new FuelPumpsAndValves(host, failuresConsumer);
  const fuelEmerOuterTransfer = new FuelEmerOuterTransfer(host);
  const fuelLeak = new FuelLeak(host, failuresConsumer);
  const fuelAutomaticTransfers = new FuelAutomaticTransfers(
    host,
    failuresConsumer,
    fuelPumpsAndValves,
    fuelTransferFaults,
  );
  const fuelCollectorCells = new FuelCollectorCells(host);
  const fuelTemperatures = new FuelTemperatures(host);
  const weightBalanceBackup = new WeightBalanceBackup(failuresConsumer);
  const fuelApuFeed = new FuelApuFeed(host, failuresConsumer);
  const fuelOverflow = new FuelOverflow(host, failuresConsumer);
  const fuelRefuelFaults = new FuelRefuelFaults(failuresConsumer);

  return [
    ['FuelJettison', fuelJettison],
    ['AutolandLights', autolandLights],
    ['WxPbAutoDeselect', wxPbAutoDeselect],
    ['WxrSurvKnobs', wxrSurvKnobs],
    ['AtcMsgLights', atcMsgLights],
    ['CabinOxygenMasks', cabinOxygenMasks],
    ['CabinSigns', cabinSigns],
    ['Tpis', tpis],
    ['Dsms', dsms],
    ['CockpitDoorEmergencyAccess', cockpitDoorEmergencyAccess],
    ['CdsReconfiguration', cdsReconfiguration],
    ['FuelPumpsAndValves', fuelPumpsAndValves],
    ['FuelEmerOuterTransfer', fuelEmerOuterTransfer],
    ['FuelLeak', fuelLeak],
    ['FuelAutomaticTransfers', fuelAutomaticTransfers],
    ['FuelCollectorCells', fuelCollectorCells],
    ['FuelTemperatures', fuelTemperatures],
    ['WeightBalanceBackup', weightBalanceBackup],
    ['FuelApuFeed', fuelApuFeed],
    ['FuelOverflow', fuelOverflow],
    ['FuelRefuelFaults', fuelRefuelFaults],
  ];
}
