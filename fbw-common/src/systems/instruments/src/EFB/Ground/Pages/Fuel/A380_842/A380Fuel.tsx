// @ts-strict-ignore
// Copyright (c) 2023-2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useCallback, useEffect, useState } from 'react';
import { round } from 'lodash';
import { CloudArrowDown, FuelPumpFill } from 'react-bootstrap-icons';
import {
  useSimVar,
  usePersistentNumberProperty,
  usePersistentProperty,
  Units,
  GsxServiceStates,
} from '@flybywiresim/fbw-sdk-react';
import { A380FuelOutline, t, useAppSelector, setFuelImported, useAppDispatch } from '@flybywiresim/flypad';
import { M3Chip, M3Tone } from '../../../../UtilComponents/Material/Material';
import {
  FuelHeadline,
  FuelLayout,
  FuelRail,
  FuelTank,
  FuelTankTable,
  formatFuel,
  RefuelRateSetting,
} from '../FuelLayout';

interface FuelProps {
  simbriefDataLoaded: boolean;
  simbriefPlanRamp: number;
  simbriefUnits: string;
  massUnitForDisplay: string;
  convertUnit: number;
  isOnGround: boolean;
}
export const A380Fuel: React.FC<FuelProps> = ({
  simbriefDataLoaded,
  simbriefPlanRamp,
  simbriefUnits,
  massUnitForDisplay,
  convertUnit,
  isOnGround,
}) => {
  const TOTAL_FUEL_GALLONS = 85471.7; // 323545.6 litres
  const FUEL_GALLONS_TO_KG = 3.039075693483925; // Check: MSFS fuel density is currently always fixed, if this changes this will need to read from the var.
  const FAST_SPEED_FACTOR = 5.0;
  const FUELRATE_TOTAL_GAL_SEC = 16.0;
  const TOTAL_MAX_FUEL_KG = TOTAL_FUEL_GALLONS * FUEL_GALLONS_TO_KG;

  const [eng1Running] = useSimVar('ENG COMBUSTION:1', 'Bool', 1_000);
  const [eng2Running] = useSimVar('ENG COMBUSTION:2', 'Bool', 1_000);
  const [eng3Running] = useSimVar('ENG COMBUSTION:3', 'Bool', 1_000);
  const [eng4Running] = useSimVar('ENG COMBUSTION:4', 'Bool', 1_000);
  const [refuelRate, setRefuelRate] = usePersistentProperty('REFUEL_RATE_SETTING', 'REAL');

  const [INNER_FEED_MAX_KG] = useState(7753.2 * FUEL_GALLONS_TO_KG); // 23562.56 kg
  const [OUTER_FEED_MAX_KG] = useState(7299.6 * FUEL_GALLONS_TO_KG); // 22184.04 kg
  const [INNER_TANK_MAX_KG] = useState(12189.4 * FUEL_GALLONS_TO_KG); // 37044.78 kg
  const [MID_TANK_MAX_KG] = useState(9632 * FUEL_GALLONS_TO_KG); // 29272.38 kg
  const [OUTER_TANK_MAX_KG] = useState(2731.5 * FUEL_GALLONS_TO_KG); // 8301.24 kg
  const [TRIM_TANK_MAX_KG] = useState(6260.3 * FUEL_GALLONS_TO_KG); // 19025.53 kg

  const [leftOuterGal] = useSimVar('FUELSYSTEM TANK QUANTITY:1', 'Gallons', 2_000);
  const [feedOneGal] = useSimVar('FUELSYSTEM TANK QUANTITY:2', 'Gallons', 2_000);
  const [leftMidGal] = useSimVar('FUELSYSTEM TANK QUANTITY:3', 'Gallons', 2_000);
  const [leftInnerGal] = useSimVar('FUELSYSTEM TANK QUANTITY:4', 'Gallons', 2_000);
  const [feedTwoGal] = useSimVar('FUELSYSTEM TANK QUANTITY:5', 'Gallons', 2_000);
  const [feedThreeGal] = useSimVar('FUELSYSTEM TANK QUANTITY:6', 'Gallons', 2_000);
  const [rightInnerGal] = useSimVar('FUELSYSTEM TANK QUANTITY:7', 'Gallons', 2_000);
  const [rightMidGal] = useSimVar('FUELSYSTEM TANK QUANTITY:8', 'Gallons', 2_000);
  const [feedFourGal] = useSimVar('FUELSYSTEM TANK QUANTITY:9', 'Gallons', 2_000);
  const [rightOuterGal] = useSimVar('FUELSYSTEM TANK QUANTITY:10', 'Gallons', 2_000);
  const [trimGal] = useSimVar('FUELSYSTEM TANK QUANTITY:11', 'Gallons', 2_000);
  const [totalFuelWeightKg] = useSimVar('L:A32NX_TOTAL_FUEL_QUANTITY', 'Number', 2_000);

  const [fuelDesiredKg, setFuelDesiredKg] = useSimVar('L:A32NX_FUEL_DESIRED', 'Kilograms', 2_000);
  const [refuelStartedByUser, setRefuelStartedByUser] = useSimVar('L:A32NX_REFUEL_STARTED_BY_USR', 'Bool', 2_000);

  // GSX
  const [gsxFuelSyncEnabled] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [gsxFuelHoseConnected] = useSimVar('L:FSDT_GSX_FUELHOSE_CONNECTED', 'Number');
  const [gsxRefuelState] = useSimVar('L:FSDT_GSX_REFUELING_STATE', 'Number');

  const dispatch = useAppDispatch();
  const fuelImported = useAppSelector((state) => state.simbrief.fuelImported);

  useEffect(() => {
    if (simbriefDataLoaded === true && fuelImported === false) {
      handleSimbriefFuelSync();
      dispatch(setFuelImported(true));
    }
  }, []);

  const showSimbriefButton = useCallback(() => {
    return simbriefDataLoaded && !(isDesiredEqualTo(getSimbriefPlanRamp()) || refuelStartedByUser);
  }, [simbriefDataLoaded, simbriefPlanRamp, fuelDesiredKg, refuelStartedByUser]);

  const gsxRefuelActive = () =>
    gsxRefuelState === GsxServiceStates.REQUESTED || gsxRefuelState === GsxServiceStates.ACTIVE;

  const gsxRefuelCallable = () => gsxRefuelState === GsxServiceStates.CALLABLE;

  const onlyInstantRefuelAllowed = useCallback(
    () => eng1Running || eng2Running || eng3Running || eng4Running || !isOnGround,
    [eng1Running, eng2Running, eng3Running, eng4Running, isOnGround],
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
  }, [
    eng1Running,
    eng2Running,
    eng3Running,
    eng4Running,
    isOnGround,
    refuelRate,
    gsxFuelSyncEnabled,
    gsxFuelHoseConnected,
  ]);

  const isFuelEqualTo = (fuel: number, targetFuel: number): boolean => {
    return Math.abs(fuel - targetFuel) < 10;
  };

  const isDesiredEqualTo = (targetFuel: number): boolean => {
    return isFuelEqualTo(fuelDesiredKg, targetFuel);
  };

  const updateDesiredFuel = (newDesiredFuelKg: number) => {
    if (newDesiredFuelKg > TOTAL_MAX_FUEL_KG) {
      newDesiredFuelKg = round(TOTAL_MAX_FUEL_KG);
    }

    setFuelDesiredKg(newDesiredFuelKg);
  };

  const updateDesiredFuelPercent = (percent: number) => {
    if (percent < 0.5) {
      percent = 0;
    }
    const fuel = Math.round(TOTAL_MAX_FUEL_KG * (percent / 100));
    updateDesiredFuel(fuel);
  };

  const convertToGallon = (curr: number) => curr * (1 / convertUnit) * (1 / FUEL_GALLONS_TO_KG);

  const calculateEta = () => {
    if (isDesiredEqualTo(totalFuelWeightKg) || refuelRate === RefuelRateSetting.INSTANT) {
      return ' 0';
    }

    const differentialFuel = Math.abs(convertToGallon(totalFuelWeightKg) - convertToGallon(fuelDesiredKg));
    const factor = refuelRate === RefuelRateSetting.FAST ? FAST_SPEED_FACTOR : 1.0;
    const estimatedTimeSeconds = differentialFuel / (FUELRATE_TOTAL_GAL_SEC * factor);

    if (estimatedTimeSeconds < 35) {
      return ' 0.5';
    }
    return ` ${Math.round(estimatedTimeSeconds / 60.0)}`;
  };

  const getSimbriefPlanRamp = () => {
    if (simbriefUnits === 'kgs') {
      return roundUpNearest100(simbriefPlanRamp);
    } else {
      return roundUpNearest100(Units.poundToKilogram(simbriefPlanRamp));
    }
  };

  const handleSimbriefFuelSync = () => {
    updateDesiredFuel(getSimbriefPlanRamp());
  };

  const roundUpNearest100 = (plannedFuel: number) => Math.ceil(plannedFuel / 100) * 100;

  const roundNearest10 = (fuel: number) => Math.round(fuel / 10) * 10;

  const switchRefuelState = () => {
    if (refuelStartedByUser || isRefuelAllowed()) {
      setRefuelStartedByUser(!refuelStartedByUser);
    }
  };

  /** What the refuel does now, and its tone */
  const refuelStatus = (): { text: string; tone: M3Tone } => {
    if (!isRefuelAllowed()) {
      return { text: t('Ground.Fuel.Unavailable'), tone: 'idle' };
    }
    if (refuelStartedByUser) {
      return {
        text: fuelDesiredKg > totalFuelWeightKg ? t('Ground.Fuel.Refueling') : t('Ground.Fuel.Defueling'),
        tone: 'busy',
      };
    }
    if (isDesiredEqualTo(totalFuelWeightKg)) {
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

  /** A tank of the tables, in the display unit */
  const tank = (name: string, gallons: number, capacityKg: number): FuelTank => ({
    name: t(`Ground.Fuel.Tanks.${name}`),
    quantity: roundNearest10(Units.kilogramToUser(Math.max(gallons, 0) * FUEL_GALLONS_TO_KG)),
    capacity: Units.kilogramToUser(capacityKg),
  });
  const percent = (gallons: number, capacityKg: number) =>
    (Math.max(gallons * FUEL_GALLONS_TO_KG, 0) / capacityKg) * 100;

  const status = refuelStatus();
  const onBoard = Units.kilogramToUser(totalFuelWeightKg);
  const target = Units.kilogramToUser(fuelDesiredKg);
  const capacity = Units.kilogramToUser(TOTAL_MAX_FUEL_KG);
  const enginesOff = !eng1Running && !eng2Running && !eng3Running && !eng4Running;

  return (
    <FuelLayout
      chips={
        <>
          <M3Chip tone={status.tone} icon={<FuelPumpFill size={16} />}>
            {status.text}
          </M3Chip>
          {simbriefDataLoaded && (
            <M3Chip tone="idle" icon={<CloudArrowDown size={16} />}>
              {`${t('Ground.Fuel.SimbriefBlock')} ${formatFuel(Units.kilogramToUser(getSimbriefPlanRamp()))} ${massUnitForDisplay}`}
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
          target={target.toFixed(0)}
          targetMax={Math.ceil(capacity)}
          onTargetBlur={(x) => {
            if (!Number.isNaN(parseInt(x))) {
              updateDesiredFuel(Units.userToKilogram(parseInt(x)));
            }
          }}
          sliderPercent={(fuelDesiredKg / TOTAL_MAX_FUEL_KG) * 100}
          onBoardPercent={(totalFuelWeightKg / TOTAL_MAX_FUEL_KG) * 100}
          onSlider={updateDesiredFuelPercent}
          started={!!refuelStartedByUser}
          allowed={!!isRefuelAllowed()}
          showStartStop={!gsxFuelSyncEnabled || (refuelRate === RefuelRateSetting.INSTANT && !gsxRefuelActive())}
          onStartStop={switchRefuelState}
          delta={target - onBoard}
          simbriefBlock={simbriefDataLoaded ? Units.kilogramToUser(getSimbriefPlanRamp()) : null}
          showSimbrief={showSimbriefButton()}
          onSimbrief={handleSimbriefFuelSync}
          onBoard={onBoard}
          rate={refuelRate}
          setRate={setRefuelRate}
          onlyInstant={!!onlyInstantRefuelAllowed()}
        />
      }
    >
      {/* the whole aircraft, its tanks filled to their level */}
      <A380FuelOutline
        className="absolute inset-0 h-full w-full text-m3-muted"
        viewBox="0 30 864 810"
        feed1Percent={percent(feedOneGal, OUTER_FEED_MAX_KG)}
        feed2Percent={percent(feedTwoGal, INNER_FEED_MAX_KG)}
        feed3Percent={percent(feedThreeGal, INNER_FEED_MAX_KG)}
        feed4Percent={percent(feedFourGal, OUTER_FEED_MAX_KG)}
        leftInnerPercent={percent(leftInnerGal, INNER_TANK_MAX_KG)}
        leftMidPercent={percent(leftMidGal, MID_TANK_MAX_KG)}
        leftOuterPercent={percent(leftOuterGal, OUTER_TANK_MAX_KG)}
        rightInnerPercent={percent(rightInnerGal, INNER_TANK_MAX_KG)}
        rightMidPercent={percent(rightMidGal, MID_TANK_MAX_KG)}
        rightOuterPercent={percent(rightOuterGal, OUTER_TANK_MAX_KG)}
        trimPercent={percent(trimGal, TRIM_TANK_MAX_KG)}
        enableDynamic={enginesOff || refuelStartedByUser}
      />
      <FuelHeadline
        className="absolute left-4 top-4"
        quantity={onBoard}
        capacity={capacity}
        unit={massUnitForDisplay}
      />
      <FuelTankTable
        className="absolute right-4 top-4"
        title={t('Ground.Fuel.Tanks.Tail')}
        unit={massUnitForDisplay}
        tanks={[tank('Trim', trimGal, TRIM_TANK_MAX_KG)]}
      />
      {/* the tanks from the tip to the root on the left, from the root to the tip on the right: as on the wings */}
      <FuelTankTable
        className="absolute bottom-4 left-4"
        title={t('Ground.Fuel.Tanks.LeftWing')}
        unit={massUnitForDisplay}
        tanks={[
          tank('LeftOuter', leftOuterGal, OUTER_TANK_MAX_KG),
          tank('Feed1', feedOneGal, OUTER_FEED_MAX_KG),
          tank('LeftMid', leftMidGal, MID_TANK_MAX_KG),
          tank('LeftInner', leftInnerGal, INNER_TANK_MAX_KG),
          tank('Feed2', feedTwoGal, INNER_FEED_MAX_KG),
        ]}
      />
      <FuelTankTable
        className="absolute bottom-4 right-4"
        title={t('Ground.Fuel.Tanks.RightWing')}
        unit={massUnitForDisplay}
        tanks={[
          tank('Feed3', feedThreeGal, INNER_FEED_MAX_KG),
          tank('RightInner', rightInnerGal, INNER_TANK_MAX_KG),
          tank('RightMid', rightMidGal, MID_TANK_MAX_KG),
          tank('Feed4', feedFourGal, OUTER_FEED_MAX_KG),
          tank('RightOuter', rightOuterGal, OUTER_TANK_MAX_KG),
        ]}
      />
    </FuelLayout>
  );
};
