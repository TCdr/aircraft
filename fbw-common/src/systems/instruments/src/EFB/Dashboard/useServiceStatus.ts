// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef, useState } from 'react';
import {
  AirframeType,
  GsxServiceStates,
  SeatFlags,
  usePersistentNumberProperty,
  usePersistentProperty,
  useSimVar,
} from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '@flybywiresim/flypad';
import { a320RefuelMinutes, a380RefuelMinutes } from '../Ground/Pages/Fuel/refuelMinutes';
import { boardingSeconds } from '../Ground/Pages/Payload/boardingSeconds';
import {
  RunService,
  ServiceStatus,
  fuelServiceStatus,
  fuelToleranceKg,
  markServiceRan,
  payloadServiceStatus,
  serviceRan,
} from './logic/serviceStatus';
import { useOfpKey } from './useDashboardPhase';
import { readStoredValue } from './readStoredValue';

const A380_FUEL_KG_PER_GALLON = 3.039075693483925;
const A380_DOOR_INDICES = [0, 2, 10];
const A32NX_DOOR_INDICES = [0, 1, 2];
const PAYLOAD_POLL_MS = 1_000;

export const SERVICES_RAN_KEY = 'EFB_DASHBOARD_SERVICES_RAN';

/**
 * Remembers which services ran for the loaded OFP. Run once for the whole flyPad (useDashboardLatches): a deboarding
 * run while another page is open still counts.
 */
export const useServiceRunLatch = (): void => {
  const ofpKey = useOfpKey();
  const [gsxFuelSync] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [gsxPayloadSync] = usePersistentNumberProperty('GSX_PAYLOAD_SYNC', 0);
  const [refuelStarted] = useSimVar('L:A32NX_REFUEL_STARTED_BY_USR', 'Bool', 1_000);
  const [boardingStarted] = useSimVar('L:A32NX_BOARDING_STARTED_BY_USR', 'Bool', 1_000);
  const [gsxRefuelState] = useSimVar('L:FSDT_GSX_REFUELING_STATE', 'Number', 1_000);
  const [gsxBoardingState] = useSimVar('L:FSDT_GSX_BOARDING_STATE', 'Number', 1_000);
  const [gsxDeboardingState] = useSimVar('L:FSDT_GSX_DEBOARDING_STATE', 'Number', 1_000);
  const [, setStored] = usePersistentProperty(SERVICES_RAN_KEY, '');

  const fuelRunning = refuelStarted > 0 || (gsxFuelSync === 1 && gsxRefuelState === GsxServiceStates.ACTIVE);
  const payloadRunning =
    boardingStarted > 0 ||
    (gsxPayloadSync === 1 &&
      (gsxBoardingState === GsxServiceStates.ACTIVE || gsxDeboardingState === GsxServiceStates.ACTIVE));

  useEffect(() => {
    const mark = (service: RunService) => {
      const stored = readStoredValue(SERVICES_RAN_KEY);
      if (!serviceRan(stored, ofpKey, service)) {
        setStored(markServiceRan(stored, ofpKey, service));
      }
    };
    if (ofpKey === '') {
      return;
    }
    if (fuelRunning) {
      mark('fuel');
    }
    if (payloadRunning) {
      mark('payload');
    }
  }, [ofpKey, fuelRunning, payloadRunning]);
};

/** The service ran for the loaded OFP or the OFP's figures were imported for it (the target was ordered) */
const useServiceOrdered = (service: RunService): boolean => {
  const ofpKey = useOfpKey();
  const imported = useAppSelector((state) =>
    service === 'fuel' ? state.simbrief.fuelImported : state.simbrief.payloadImported,
  );
  return (ofpKey !== '' && imported) || serviceRan(readStoredValue(SERVICES_RAN_KEY), ofpKey, service);
};

const NOT_STARTED: ServiceStatus = { kind: 'notStarted', progress: null, minutesLeft: null, done: null, total: null };

/** The value as it was when `running` last turned true, so a service shows its progress from where it began */
const useValueAtStart = (running: boolean, value: number): number => {
  const startValue = useRef(value);
  const wasRunning = useRef(false);
  if (!running || !wasRunning.current) {
    startValue.current = value;
  }
  wasRunning.current = running;
  return startValue.current;
};

export const useFuelStatus = (): ServiceStatus => {
  const isA380 = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;

  const [gsxSync] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [gsxRefuelState] = useSimVar('L:FSDT_GSX_REFUELING_STATE', 'Number', 1_000);
  const [startedByUser] = useSimVar('L:A32NX_REFUEL_STARTED_BY_USR', 'Bool', 1_000);
  const [refuelRate] = usePersistentProperty('REFUEL_RATE_SETTING', 'REAL');

  // A32NX: gallons per tank and the weight of one gallon
  const [kilogramsPerGallon] = useSimVar('FUEL WEIGHT PER GALLON', 'kilograms', 1_000);
  const [center] = useSimVar('FUEL TANK CENTER QUANTITY', 'Gallons', 1_000);
  const [leftMain] = useSimVar('FUEL TANK LEFT MAIN QUANTITY', 'Gallons', 1_000);
  const [leftAux] = useSimVar('FUEL TANK LEFT AUX QUANTITY', 'Gallons', 1_000);
  const [rightMain] = useSimVar('FUEL TANK RIGHT MAIN QUANTITY', 'Gallons', 1_000);
  const [rightAux] = useSimVar('FUEL TANK RIGHT AUX QUANTITY', 'Gallons', 1_000);
  const [totalTargetGallons] = useSimVar('L:A32NX_FUEL_TOTAL_DESIRED', 'Number', 1_000);
  const [centerTargetGallons] = useSimVar('L:A32NX_FUEL_CENTER_DESIRED', 'Number', 1_000);
  const [leftMainTarget] = useSimVar('L:A32NX_FUEL_LEFT_MAIN_DESIRED', 'Number', 1_000);
  const [leftAuxTarget] = useSimVar('L:A32NX_FUEL_LEFT_AUX_DESIRED', 'Number', 1_000);
  const [rightMainTarget] = useSimVar('L:A32NX_FUEL_RIGHT_MAIN_DESIRED', 'Number', 1_000);
  const [rightAuxTarget] = useSimVar('L:A32NX_FUEL_RIGHT_AUX_DESIRED', 'Number', 1_000);

  // A380X: kilograms
  const [a380OnBoardKg] = useSimVar('L:A32NX_TOTAL_FUEL_QUANTITY', 'Number', 1_000);
  const [a380TargetKg] = useSimVar('L:A32NX_FUEL_DESIRED', 'Kilograms', 1_000);

  const wingGallons = Math.max(leftMain + leftAux + rightMain + rightAux, 0);
  const wingTargetGallons = Math.max(leftMainTarget + leftAuxTarget + rightMainTarget + rightAuxTarget, 0);

  const currentKg = isA380 ? a380OnBoardKg : Math.max(wingGallons + center, 0) * kilogramsPerGallon;
  const targetKg = isA380 ? a380TargetKg : totalTargetGallons * kilogramsPerGallon;

  const instantOrAtTarget = Math.abs(currentKg - targetKg) < 1 || refuelRate === 'INSTANT';
  const fastRate = refuelRate === 'FAST';
  const minutesLeft = isA380
    ? a380RefuelMinutes({
        instantOrAtTarget,
        fastRate,
        differenceGallons: Math.abs(currentKg - targetKg) / A380_FUEL_KG_PER_GALLON,
      })
    : a320RefuelMinutes({
        instantOrAtTarget,
        fastRate,
        wingDifferenceGallons: Math.abs(wingGallons - wingTargetGallons),
        centerDifferenceGallons: Math.abs(centerTargetGallons - center),
      });

  const running = startedByUser > 0 || (gsxSync === 1 && gsxRefuelState === GsxServiceStates.ACTIVE);
  const startKg = useValueAtStart(running, currentKg);
  const ordered = useServiceOrdered('fuel');

  // The A32NX gallon weight reads 0 until the sim has loaded the fuel system: every weight would be 0 and on target
  if (!isA380 && !(kilogramsPerGallon > 0)) {
    return NOT_STARTED;
  }

  return fuelServiceStatus({
    gsxSync: gsxSync === 1,
    gsxRefuelState,
    startedByUser: startedByUser > 0,
    currentKg,
    targetKg,
    startKg,
    minutesLeft,
    ordered,
    toleranceKg: fuelToleranceKg(isA380, kilogramsPerGallon),
  });
};

export interface PayloadLoad {
  status: ServiceStatus;
  paxOnBoard: number;
  paxTarget: number;
  cargoKg: number;
  cargoTargetKg: number;
  openDoorCount: number;
}

/** The passengers, cargo and open boarding doors with the boarding status, read together from one poll */
export const usePayloadLoad = (): PayloadLoad => {
  const isA380 = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;
  const cabinInfo = useAppSelector((state) => state.config.cabinInfo);

  const [gsxSync] = usePersistentNumberProperty('GSX_PAYLOAD_SYNC', 0);
  const [gsxBoardingState] = useSimVar('L:FSDT_GSX_BOARDING_STATE', 'Number', 1_000);
  const [gsxDeboardingState] = useSimVar('L:FSDT_GSX_DEBOARDING_STATE', 'Number', 1_000);
  const [startedByUser] = useSimVar('L:A32NX_BOARDING_STARTED_BY_USR', 'Bool', 1_000);
  const [boardingRate] = usePersistentProperty('CONFIG_BOARDING_RATE', 'REAL');

  // The seat and cargo vars are one bit field per station, so they are read together instead of one hook each
  const [counts, setCounts] = useState({ onBoard: 0, target: 0, cargoKg: 0, cargoTargetKg: 0, doorsOpen: 0 });
  useEffect(() => {
    const countPassengers = (suffix: string) =>
      cabinInfo.seatMap.reduce((sum, station) => {
        const flags = new SeatFlags(SimVar.GetSimVarValue(`L:${station.simVar}${suffix}`, 'number'), station.capacity);
        return sum + flags.getTotalFilledSeats();
      }, 0);
    const cargoKg = (suffix: string) =>
      cabinInfo.cargoMap.reduce(
        (sum, station) => sum + SimVar.GetSimVarValue(`L:${station.simVar}${suffix}`, 'number'),
        0,
      );
    const doorIndices = isA380 ? A380_DOOR_INDICES : A32NX_DOOR_INDICES;

    const read = () => {
      setCounts({
        onBoard: countPassengers(''),
        target: countPassengers('_DESIRED'),
        cargoKg: cargoKg(''),
        cargoTargetKg: cargoKg('_DESIRED'),
        doorsOpen: doorIndices.filter(
          (index) => SimVar.GetSimVarValue(`A:INTERACTIVE POINT OPEN:${index}`, 'Percent over 100') > 0,
        ).length,
      });
    };
    read();
    const timer = window.setInterval(read, PAYLOAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [cabinInfo, isA380]);

  const ordered = useServiceOrdered('payload');
  const gsxActive =
    gsxSync === 1 && (gsxBoardingState === GsxServiceStates.ACTIVE || gsxDeboardingState === GsxServiceStates.ACTIVE);
  const paxStart = useValueAtStart(startedByUser > 0 || gsxActive, counts.onBoard);

  const status = payloadServiceStatus({
    gsxSync: gsxSync === 1,
    gsxBoardingState,
    gsxDeboardingState,
    startedByUser: startedByUser > 0,
    paxOnBoard: counts.onBoard,
    paxTarget: counts.target,
    paxStart,
    ordered,
  });

  const load = {
    paxOnBoard: counts.onBoard,
    paxTarget: counts.target,
    cargoKg: counts.cargoKg,
    cargoTargetKg: counts.cargoTargetKg,
    openDoorCount: counts.doorsOpen,
  };
  if (status.kind !== 'boarding' && status.kind !== 'deboarding' && status.kind !== 'onTheWay') {
    return { status, ...load };
  }
  const seconds = boardingSeconds({
    boardingRate,
    doorsOpen: counts.doorsOpen,
    paxDifference: Math.abs(counts.target - counts.onBoard),
    cargoDifferenceKg: Math.abs(counts.cargoTargetKg - counts.cargoKg),
  });
  return { status: { ...status, minutesLeft: Math.round(seconds / 60) }, ...load };
};
