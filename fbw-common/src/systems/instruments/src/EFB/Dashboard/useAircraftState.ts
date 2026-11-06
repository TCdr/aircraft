// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useMemo, useState } from 'react';
import { AirframeType, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '@flybywiresim/flypad';
import { A380_SERVICE_DOORS } from '../Ground/Pages/Services/A380_842/A380ServiceDoors';
import { AFT_CARGO_DOOR_POSITION_VAR, FWD_CARGO_DOOR_POSITION_VAR } from '../Ground/Pages/Services/cargoDoor';
import {
  AdirsState,
  adirsSummary,
  AircraftStateChip,
  aircraftStateChip,
  DoorReading,
  openDoors,
  PowerSource,
  powerSource,
} from './logic/aircraftState';
import { isStructurallyEqual } from './logic/structuralEquality';
import { booleanReader, numberReader } from './registeredReads';

const POLL_MS = 1_000;

/** The doors of the A32NX Services page, by their interactive points */
const A32NX_DOORS = [
  { name: '1L', point: 0 },
  { name: '1R', point: 1 },
  { name: '2L', point: 2 },
  { name: '2R', point: 3 },
  { name: 'CARGO', point: 5 },
];

export interface AircraftState {
  power: PowerSource;
  /** External power units online / available (A380X has four) */
  extPwrOnline: number;
  extPwrAvailable: number;
  openDoors: string[];
  parkBrakeOn: boolean;
  chocksPlaced: boolean;
  adirs: AdirsState;
  adirsMinutesLeft: number | null;
  chip: AircraftStateChip;
  acPowered: boolean;
}

/** Reads the doors through registered ids, created once for the aircraft variant */
const createDoorsReader = (isA380: boolean): (() => DoorReading[]) => {
  const pointReader = (index: number) => numberReader(`A:INTERACTIVE POINT OPEN:${index}`, 'Percent over 100');
  if (!isA380) {
    const doors = A32NX_DOORS.map((door) => ({ name: door.name, readOpenFraction: pointReader(door.point) }));
    return () => doors.map((door) => ({ name: door.name, openFraction: door.readOpenFraction() }));
  }
  const doors = Object.keys(A380_SERVICE_DOORS).map((key) => {
    const door = A380_SERVICE_DOORS[key as keyof typeof A380_SERVICE_DOORS];
    return { name: door.door, readOpenFraction: pointReader(door.interactivePoint) };
  });
  // The cargo doors are hydraulic: the systems' position, not the ground crew request of the interactive point
  const readFwdCargoPosition = numberReader(FWD_CARGO_DOOR_POSITION_VAR, 'number');
  const readAftCargoPosition = numberReader(AFT_CARGO_DOOR_POSITION_VAR, 'number');
  return () => {
    const readings: DoorReading[] = doors.map((door) => ({
      name: door.name,
      openFraction: door.readOpenFraction(),
    }));
    readings.push({ name: 'FWD CARGO', openFraction: Math.max(readFwdCargoPosition() / 100, 0) });
    readings.push({ name: 'AFT CARGO', openFraction: Math.max(readAftCargoPosition() / 100, 0) });
    return readings;
  };
};

/** Reads the power state through registered ids, created once for the aircraft variant */
const createPowerReader = (isA380: boolean) => {
  const units = isA380 ? [1, 2, 3, 4] : [1];
  const extPwrUnits = units.map((unit) => ({
    isAvailable: booleanReader(`L:A32NX_EXT_PWR_AVAIL:${unit}`),
    isOnline: booleanReader(
      isA380 ? `L:A32NX_OVHD_ELEC_EXT_PWR_${unit}_PB_IS_ON` : 'L:A32NX_OVHD_ELEC_EXT_PWR_PB_IS_ON',
    ),
  }));
  const apuGenerators = (isA380 ? [1, 2] : [1]).map((gen) =>
    booleanReader(`L:A32NX_ELEC_APU_GEN_${gen}_POTENTIAL_NORMAL`),
  );
  const isAcPowered = booleanReader('L:A32NX_ELEC_AC_1_BUS_IS_POWERED');
  const isBatteryBusPowered = booleanReader('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED');

  return () => {
    const available = extPwrUnits.filter((unit) => unit.isAvailable());
    return {
      acPowered: isAcPowered(),
      extPwrOnline: available.filter((unit) => unit.isOnline()).length,
      extPwrAvailable: available.length,
      apuGenOnline: apuGenerators.some((isOnline) => isOnline()),
      batteryBusPowered: isBatteryBusPowered(),
    };
  };
};

export const useAircraftState = (): AircraftState => {
  const isA380 = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;

  const [parkBrake] = useSimVar('L:A32NX_PARK_BRAKE_LEVER_POS', 'bool', 500);
  const [chocksEnabled] = useSimVar('L:A32NX_MODEL_WHEELCHOCKS_ENABLED', 'bool', 500);
  const [groundEquipmentVisible] = useSimVar('L:A32NX_GND_EQP_IS_VISIBLE', 'bool', 500);
  const [adiru1] = useSimVar('L:A32NX_ADIRS_ADIRU_1_STATE', 'enum', 1_000);
  const [adiru2] = useSimVar('L:A32NX_ADIRS_ADIRU_2_STATE', 'enum', 1_000);
  const [adiru3] = useSimVar('L:A32NX_ADIRS_ADIRU_3_STATE', 'enum', 1_000);
  const [irMode1] = useSimVar('L:A32NX_OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB', 'enum', 1_000);
  const [irMode2] = useSimVar('L:A32NX_OVHD_ADIRS_IR_2_MODE_SELECTOR_KNOB', 'enum', 1_000);
  const [irMode3] = useSimVar('L:A32NX_OVHD_ADIRS_IR_3_MODE_SELECTOR_KNOB', 'enum', 1_000);
  const [alignSeconds] = useSimVar('L:A32NX_ADIRS_REMAINING_IR_ALIGNMENT_TIME', 'seconds', 1_000);
  const [engine1] = useSimVar('ENG COMBUSTION:1', 'bool', 1_000);
  const [engine2] = useSimVar('ENG COMBUSTION:2', 'bool', 1_000);
  const [engine3] = useSimVar('ENG COMBUSTION:3', 'bool', 1_000);
  const [engine4] = useSimVar('ENG COMBUSTION:4', 'bool', 1_000);
  const engineRunning = engine1 > 0 || engine2 > 0 || engine3 > 0 || engine4 > 0;

  // Doors and power are several vars per aircraft variant, read together instead of one hook each
  const readAircraft = useMemo(() => {
    const readDoors = createDoorsReader(isA380);
    const readPower = createPowerReader(isA380);
    return () => ({ doors: readDoors(), power: readPower() });
  }, [isA380]);
  const [readings, setReadings] = useState(readAircraft);
  useEffect(() => {
    // The same readings keep the previous object, so an unchanged poll does not render the dashboard
    const read = () =>
      setReadings((previous) => {
        const next = readAircraft();
        return isStructurallyEqual(previous, next) ? previous : next;
      });
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => window.clearInterval(timer);
  }, [readAircraft]);

  const adirs = adirsSummary([adiru1, adiru2, adiru3], [irMode1, irMode2, irMode3], alignSeconds);
  return {
    power: powerSource({ ...readings.power, engineRunning }),
    extPwrOnline: readings.power.extPwrOnline,
    extPwrAvailable: readings.power.extPwrAvailable,
    openDoors: openDoors(readings.doors),
    parkBrakeOn: parkBrake > 0,
    chocksPlaced: chocksEnabled > 0 && groundEquipmentVisible > 0,
    adirs: adirs.state,
    adirsMinutesLeft: adirs.minutesLeft,
    chip: aircraftStateChip(readings.power.acPowered, engineRunning),
    acPowered: readings.power.acPowered,
  };
};
