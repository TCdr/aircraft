// @ts-strict-ignore
// Copyright (c) 2023-2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useCallback, useEffect } from 'react';
import { round } from 'lodash';
import { CloudArrowDown, FuelPumpFill } from 'react-bootstrap-icons';
import {
  useSimVar,
  Units,
  usePersistentNumberProperty,
  usePersistentProperty,
  GsxServiceStates,
} from '@flybywiresim/fbw-sdk-react';
import { useAppDispatch, useAppSelector, t, setFuelImported } from '@flybywiresim/flypad';
import { M3Chip, M3Tone } from '../../../../UtilComponents/Material/Material';
import {
  FuelHeadline,
  FuelLayout,
  FuelRail,
  FuelTank,
  FuelTankTile,
  formatFuel,
  RefuelRateSetting,
} from '../FuelLayout';
import { A320FuelPlanform } from './A320FuelPlanform';

interface FuelProps {
  simbriefDataLoaded: boolean;
  simbriefPlanRamp: number;
  simbriefUnits: string;
  massUnitForDisplay: string;
  convertUnit: number;
  isOnGround: boolean;
}
export const A320Fuel: React.FC<FuelProps> = ({
  simbriefDataLoaded,
  simbriefPlanRamp,
  simbriefUnits,
  massUnitForDisplay,
  convertUnit,
  isOnGround,
}) => {
  const TOTAL_FUEL_GALLONS = 6267;
  const OUTER_CELL_GALLONS = 228;
  const INNER_CELL_GALLONS = 1816;
  const CENTER_TANK_GALLONS = 2179;
  const wingTotalRefuelTimeSeconds = 1020;
  const CenterTotalRefuelTimeSeconds = 1200;

  const [galToKg] = useSimVar('FUEL WEIGHT PER GALLON', 'kilograms', 1_000);
  const outerCell = () => OUTER_CELL_GALLONS * galToKg * convertUnit;
  const outerCells = () => outerCell() * 2;
  const innerCell = () => INNER_CELL_GALLONS * galToKg * convertUnit;
  const innerCells = () => innerCell() * 2;
  const centerTank = () => CENTER_TANK_GALLONS * galToKg * convertUnit;
  const totalFuel = () => centerTank() + innerCells() + outerCells();
  const [eng1Running] = useSimVar('ENG COMBUSTION:1', 'Bool', 1_000);
  const [eng2Running] = useSimVar('ENG COMBUSTION:2', 'Bool', 1_000);
  const [refuelRate, setRefuelRate] = usePersistentProperty('REFUEL_RATE_SETTING');
  const [sliderValue, setSliderValue] = useSimVar('L:A32NX_FUEL_DESIRED_PERCENT', 'Number');
  const [inputValue, setInputValue] = useSimVar('L:A32NX_FUEL_DESIRED', 'Number');
  const [totalTarget, setTotalTarget] = useSimVar('L:A32NX_FUEL_TOTAL_DESIRED', 'Number');
  const [refuelStartedByUser, setRefuelStartedByUser] = useSimVar('L:A32NX_REFUEL_STARTED_BY_USR', 'Bool');
  const [centerTarget, setCenterTarget] = useSimVar('L:A32NX_FUEL_CENTER_DESIRED', 'Number');
  const [LInnTarget, setLInnTarget] = useSimVar('L:A32NX_FUEL_LEFT_MAIN_DESIRED', 'Number');
  const [LOutTarget, setLOutTarget] = useSimVar('L:A32NX_FUEL_LEFT_AUX_DESIRED', 'Number');
  const [RInnTarget, setRInnTarget] = useSimVar('L:A32NX_FUEL_RIGHT_MAIN_DESIRED', 'Number');
  const [ROutTarget, setROutTarget] = useSimVar('L:A32NX_FUEL_RIGHT_AUX_DESIRED', 'Number');
  const [centerCurrent] = useSimVar('FUEL TANK CENTER QUANTITY', 'Gallons', 1_000);
  const [LInnCurrent] = useSimVar('FUEL TANK LEFT MAIN QUANTITY', 'Gallons', 1_000);
  const [LOutCurrent] = useSimVar('FUEL TANK LEFT AUX QUANTITY', 'Gallons', 1_000);
  const [RInnCurrent] = useSimVar('FUEL TANK RIGHT MAIN QUANTITY', 'Gallons', 1_000);
  const [ROutCurrent] = useSimVar('FUEL TANK RIGHT AUX QUANTITY', 'Gallons', 1_000);

  // GSX
  const [gsxFuelSyncEnabled] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [gsxFuelHoseConnected] = useSimVar('L:FSDT_GSX_FUELHOSE_CONNECTED', 'Number');
  const [gsxRefuelState] = useSimVar('L:FSDT_GSX_REFUELING_STATE', 'Number');

  const dispatch = useAppDispatch();
  const fuelImported = useAppSelector((state) => state.simbrief.fuelImported);

  useEffect(() => {
    if (simbriefDataLoaded === true && fuelImported === false) {
      handleFuelAutoFill();
      dispatch(setFuelImported(true));
    }
  }, []);

  const showSimbriefButton = useCallback(() => {
    return simbriefDataLoaded && !(isDesiredEqualTo(getSimbriefPlanRamp()) || refuelStartedByUser);
  }, [simbriefDataLoaded, simbriefPlanRamp, totalTarget, refuelStartedByUser]);

  const gsxRefuelActive = () =>
    gsxRefuelState === GsxServiceStates.REQUESTED || gsxRefuelState === GsxServiceStates.ACTIVE;

  const gsxRefuelCallable = () => gsxRefuelState === GsxServiceStates.CALLABLE;

  const onlyInstantRefuelAllowed = useCallback(
    () => eng1Running || eng2Running || !isOnGround,
    [eng1Running, eng2Running, isOnGround],
  );

  const isRefuelAllowed = useCallback(() => {
    if (gsxFuelSyncEnabled === 1) {
      return refuelStartedByUser || gsxFuelHoseConnected === 1 || refuelRate === RefuelRateSetting.INSTANT;
    } else {
      return (
        refuelStartedByUser ||
        !onlyInstantRefuelAllowed() ||
        (onlyInstantRefuelAllowed() && refuelRate === RefuelRateSetting.INSTANT)
      );
    }
  }, [eng1Running, eng2Running, isOnGround, refuelRate, refuelStartedByUser, gsxFuelSyncEnabled, gsxFuelHoseConnected]);

  const isFuelEqualTo = (fuel: number, targetFuel: number): boolean => {
    return Math.abs(fuel - targetFuel) < 10;
  };

  const isDesiredEqualTo = (targetFuel: number): boolean => {
    return isFuelEqualTo(totalTarget, targetFuel);
  };

  const currentWingFuel = () => round(Math.max(LInnCurrent + LOutCurrent + RInnCurrent + ROutCurrent, 0));
  const targetWingFuel = () => round(Math.max(LInnTarget + LOutTarget + RInnTarget + ROutTarget, 0));
  const convertToGallon = (curr: number) => curr * (1 / convertUnit) * (1 / galToKg);
  const totalCurrentGallon = () =>
    round(Math.max(LInnCurrent + LOutCurrent + RInnCurrent + ROutCurrent + centerCurrent, 0));

  const totalCurrent = () => {
    if (round(totalTarget) === totalCurrentGallon()) {
      return inputValue;
    }
    const val = round(totalCurrentGallon() * getFuelMultiplier());
    if (centerCurrent > 0 && centerCurrent < CENTER_TANK_GALLONS) {
      return round(val + convertUnit);
    }
    return val;
  };

  /** What the refuel does now, and its tone */
  const refuelStatus = (): { text: string; tone: M3Tone } => {
    if (!isRefuelAllowed()) {
      return { text: t('Ground.Fuel.Unavailable'), tone: 'idle' };
    }
    if (refuelStartedByUser) {
      return {
        text: totalTarget > totalCurrentGallon() ? t('Ground.Fuel.Refueling') : t('Ground.Fuel.Defueling'),
        tone: 'busy',
      };
    }
    if (isDesiredEqualTo(totalCurrentGallon())) {
      return { text: t('Ground.Fuel.Completed'), tone: 'active' };
    }
    if (gsxFuelSyncEnabled === 1) {
      if (gsxRefuelActive()) {
        return { text: t('Ground.Fuel.GSXFuelRequested'), tone: 'busy' };
      }
      if (gsxRefuelCallable() && refuelRate !== RefuelRateSetting.INSTANT) {
        return { text: t('Ground.Fuel.GSXFuelSyncEnabled'), tone: 'idle' };
      }
    }
    return { text: t('Ground.Fuel.ReadyToStart'), tone: 'active' };
  };

  const getFuelMultiplier = () => galToKg * convertUnit;

  const convertFuelValue = (curr: number) => round(round(Math.max(curr, 0)) * getFuelMultiplier());

  const convertFuelValueCenter = (curr: number) => {
    if (curr < 1) {
      return 0;
    }
    if (curr === CENTER_TANK_GALLONS) {
      return convertFuelValue(curr);
    }
    return round(convertFuelValue(curr) + convertUnit);
  };

  const setDesiredFuel = (fuel: number) => {
    fuel -= OUTER_CELL_GALLONS * 2;
    const outerTank = (OUTER_CELL_GALLONS * 2 + Math.min(fuel, 0)) / 2;
    setLOutTarget(outerTank);
    setROutTarget(outerTank);
    if (fuel <= 0) {
      setLInnTarget(0);
      setRInnTarget(0);
      setCenterTarget(0);
      return;
    }
    fuel -= INNER_CELL_GALLONS * 2;
    const innerTank = (INNER_CELL_GALLONS * 2 + Math.min(fuel, 0)) / 2;
    setLInnTarget(innerTank);
    setRInnTarget(innerTank);
    if (fuel <= 0) {
      setCenterTarget(0);
      return;
    }
    setCenterTarget(fuel);
  };

  const updateDesiredFuel = (value: string) => {
    let fuel = 0;
    let originalFuel = 0;
    if (value.length > 0) {
      originalFuel = parseInt(value);
      fuel = convertToGallon(originalFuel);
      if (originalFuel > totalFuel()) {
        originalFuel = round(totalFuel());
      }
      setInputValue(originalFuel);
    }
    if (fuel > TOTAL_FUEL_GALLONS) {
      fuel = TOTAL_FUEL_GALLONS + 2;
    }
    setTotalTarget(fuel);
    setSliderValue((fuel / TOTAL_FUEL_GALLONS) * 100);
    setDesiredFuel(fuel);
  };

  const updateSlider = (value: number) => {
    if (value < 2) {
      value = 0;
    }
    setSliderValue(value);
    const fuel = Math.round(totalFuel() * (value / 100));
    updateDesiredFuel(fuel.toString());
  };

  const calculateEta = () => {
    if (round(totalTarget) === totalCurrentGallon() || refuelRate === RefuelRateSetting.INSTANT) {
      // instant
      return ' 0';
    }
    let estimatedTimeSeconds = 0;
    const totalWingFuel = TOTAL_FUEL_GALLONS - CENTER_TANK_GALLONS;
    const differentialFuelWings = Math.abs(currentWingFuel() - targetWingFuel());
    const differentialFuelCenter = Math.abs(centerTarget - centerCurrent);
    const estimatedTimeSecondsWing = (differentialFuelWings / totalWingFuel) * wingTotalRefuelTimeSeconds;
    const estimatedTimeSecondsCenter = (differentialFuelCenter / CENTER_TANK_GALLONS) * CenterTotalRefuelTimeSeconds;
    estimatedTimeSeconds = Math.max(estimatedTimeSecondsWing, estimatedTimeSecondsCenter);
    if (refuelRate === RefuelRateSetting.FAST) {
      // fast
      estimatedTimeSeconds /= 5;
    }
    if (estimatedTimeSeconds < 35) {
      return ' 0.5';
    }
    return ` ${Math.round(estimatedTimeSeconds / 60)}`;
  };

  const switchRefuelState = () => {
    if (refuelStartedByUser || isRefuelAllowed()) {
      setRefuelStartedByUser(!refuelStartedByUser);
    }
  };

  const getSimbriefPlanRamp = () => {
    if (Units.usingMetric) {
      if (simbriefUnits === 'kgs') {
        return roundUpNearest100(simbriefPlanRamp);
      } else {
        return roundUpNearest100(Units.poundToKilogram(simbriefPlanRamp));
      }
    } else if (simbriefUnits === 'kgs') {
      return roundUpNearest100(Units.kilogramToPound(simbriefPlanRamp));
    } else {
      return roundUpNearest100(simbriefPlanRamp);
    }
  };

  const handleFuelAutoFill = () => {
    updateDesiredFuel(getSimbriefPlanRamp().toString());
  };

  const roundUpNearest100 = (plannedFuel: number) => Math.ceil(plannedFuel / 100) * 100;

  const status = refuelStatus();
  const onBoard = totalCurrent();
  const target = Number(inputValue) || 0;
  const level = (gallons: number, capacityGallons: number) => (Math.max(gallons, 0) / capacityGallons) * 100;
  /** The tanks as on the aircraft, from the left wing tip to the right wing tip */
  const tanks: FuelTank[] = [
    { name: t('Ground.Fuel.LeftOuterTank'), quantity: convertFuelValueCenter(LOutCurrent), capacity: outerCell() },
    { name: t('Ground.Fuel.LeftInnerTank'), quantity: convertFuelValue(LInnCurrent), capacity: innerCell() },
    { name: t('Ground.Fuel.CenterTank'), quantity: convertFuelValueCenter(centerCurrent), capacity: centerTank() },
    { name: t('Ground.Fuel.RightInnerTank'), quantity: convertFuelValueCenter(RInnCurrent), capacity: innerCell() },
    { name: t('Ground.Fuel.RightOuterTank'), quantity: convertFuelValueCenter(ROutCurrent), capacity: outerCell() },
  ];

  return (
    <FuelLayout
      className="p-4"
      chips={
        <>
          <M3Chip tone={status.tone} icon={<FuelPumpFill size={16} />}>
            {status.text}
          </M3Chip>
          {simbriefDataLoaded && (
            <M3Chip tone="idle" icon={<CloudArrowDown size={16} />}>
              {`${t('Ground.Fuel.SimbriefBlock')} ${formatFuel(getSimbriefPlanRamp())} ${massUnitForDisplay}`}
            </M3Chip>
          )}
          {gsxFuelSyncEnabled === 1 && <M3Chip tone="active">{t('Ground.Fuel.GsxSync')}</M3Chip>}
        </>
      }
      rail={
        <FuelRail
          status={status}
          etaMinutes={calculateEta()}
          unit={massUnitForDisplay}
          target={inputValue}
          targetMax={round(totalFuel())}
          onTargetChange={(x) => updateDesiredFuel(x)}
          sliderPercent={sliderValue}
          onBoardPercent={(totalCurrentGallon() / TOTAL_FUEL_GALLONS) * 100}
          onSlider={updateSlider}
          started={!!refuelStartedByUser}
          allowed={!!isRefuelAllowed()}
          showStartStop={!gsxFuelSyncEnabled || (refuelRate === RefuelRateSetting.INSTANT && !gsxRefuelActive())}
          onStartStop={switchRefuelState}
          delta={target - onBoard}
          simbriefBlock={simbriefDataLoaded ? getSimbriefPlanRamp() : null}
          showSimbrief={showSimbriefButton()}
          onSimbrief={handleFuelAutoFill}
          onBoard={onBoard}
          rate={refuelRate}
          setRate={setRefuelRate}
          onlyInstant={!!onlyInstantRefuelAllowed()}
        />
      }
    >
      <FuelHeadline className="mb-4 shrink-0" quantity={onBoard} capacity={totalFuel()} unit={massUnitForDisplay} />
      <div className="flex shrink-0 flex-row space-x-2">
        {tanks.map((tank) => (
          <FuelTankTile key={tank.name} tank={tank} unit={massUnitForDisplay} />
        ))}
      </div>
      {/* the wings from above, the tanks filled to their level */}
      <A320FuelPlanform
        className="mt-4 min-h-0 flex-1"
        levels={{
          centre: level(centerCurrent, CENTER_TANK_GALLONS),
          leftInner: level(LInnCurrent, INNER_CELL_GALLONS),
          leftOuter: level(LOutCurrent, OUTER_CELL_GALLONS),
          rightInner: level(RInnCurrent, INNER_CELL_GALLONS),
          rightOuter: level(ROutCurrent, OUTER_CELL_GALLONS),
        }}
      />
    </FuelLayout>
  );
};
