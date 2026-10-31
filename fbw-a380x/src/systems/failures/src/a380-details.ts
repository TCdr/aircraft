// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { AtaChapterNumber, FailureDetailTable } from '@flybywiresim/fbw-sdk';
import { Ata21AvionicsEntries, Ata21AvionicsFamilies } from './details/ata21Avionics';
import { Ata21CabinEntries, Ata21CabinFamilies } from './details/ata21Cabin';
import { Ata21ComputersFamilies } from './details/ata21Computers';
import { Ata21PacksPressureEntries, Ata21PacksPressureFamilies } from './details/ata21PacksPressure';
import { Ata24BusesEntries, Ata24BusesFamilies } from './details/ata24Buses';
import { Ata24DistributionEntries, Ata24DistributionFamilies } from './details/ata24Distribution';
import { Ata24SourcesEntries, Ata24SourcesFamilies } from './details/ata24Sources';
import { Ata26FireEntries, Ata26FireFamilies } from './details/ata26Fire';
import { Ata26SmokeBaysEntries, Ata26SmokeBaysFamilies } from './details/ata26SmokeBays';
import { Ata26SmokeCabinEntries, Ata26SmokeCabinFamilies } from './details/ata26SmokeCabin';
import { Ata27HighLiftEntries, Ata27HighLiftFamilies } from './details/ata27HighLift';
import { Ata27ComputersEntries, Ata27ComputersFamilies } from './details/ata27Computers';
import { Ata27InputsEntries, Ata27InputsFamilies } from './details/ata27Inputs';
import { Ata27SurfacesEntries } from './details/ata27Surfaces';
import { Ata27RudderStabilizerEntries, Ata27RudderStabilizerFamilies } from './details/ata27RudderStabilizer';
import { Ata27SpoilersEntries, Ata27SpoilersFamilies } from './details/ata27Spoilers';
import { Ata27AccelGyroFamilies } from './details/ata27AccelGyro';
import { Ata28GaugingEntries, Ata28GaugingFamilies } from './details/ata28Gauging';
import { Ata28PumpsFamilies } from './details/ata28Pumps';
import { Ata28ValvesEntries, Ata28ValvesFamilies } from './details/ata28Valves';
import { Ata29HeatExchangersFamilies } from './details/ata29HeatExchangers';
import { Ata29PumpsEntries, Ata29PumpsFamilies } from './details/ata29Pumps';
import { Ata32GearSystemEntries } from './details/ata32GearSystem';
import { Ata32GearSensorsEntries, Ata32GearSensorsFamilies } from './details/ata32GearSensors';
import { Ata32BrakesSystemEntries, Ata32BrakesSystemFamilies } from './details/ata32BrakesSystem';
import { Ata32BrakesWheelsFamilies } from './details/ata32BrakesWheels';
import { Ata32SteeringEntries, Ata32SteeringFamilies } from './details/ata32Steering';
import { Ata32TiresFamilies } from './details/ata32Tires';
import { Ata36ValvesEntries, Ata36ValvesFamilies } from './details/ata36Valves';
import { Ata36LeaksEntries, Ata36LeaksFamilies } from './details/ata36Leaks';
import { Ata36LeakDetectionEntries, Ata36LeakDetectionFamilies } from './details/ata36LeakDetection';
import { Ata30AntiIceEntries, Ata30AntiIceFamilies } from './details/ata30AntiIce';
import { Ata30ProbesWindowsEntries, Ata30ProbesWindowsFamilies } from './details/ata30ProbesWindows';
import { Ata34AirDataFamilies } from './details/ata34AirData';
import { Ata34NavSensorsFamilies } from './details/ata34NavSensors';
import { Ata34SurveillanceEntries, Ata34SurveillanceFamilies } from './details/ata34Surveillance';
import { Ata42NetworkFamilies } from './details/ata42Network';
import { Ata42IomFamilies } from './details/ata42Iom';
import { Ata42CpiomEntries, Ata42CpiomFamilies } from './details/ata42Cpiom';

/** Chapters whose failures all have a detail; the coverage spec only demands these. */
export const A380_DETAIL_CHAPTERS_DONE: readonly AtaChapterNumber[] = [21, 24, 26, 27, 28, 29, 30, 32, 34, 36, 42];

export const A380FailureDetails: FailureDetailTable = {
  entries: {
    ...Ata21CabinEntries,
    ...Ata21PacksPressureEntries,
    ...Ata21AvionicsEntries,
    ...Ata24SourcesEntries,
    ...Ata24BusesEntries,
    ...Ata24DistributionEntries,
    ...Ata26FireEntries,
    ...Ata26SmokeBaysEntries,
    ...Ata26SmokeCabinEntries,
    ...Ata27HighLiftEntries,
    ...Ata27ComputersEntries,
    ...Ata27InputsEntries,
    ...Ata27SurfacesEntries,
    ...Ata27RudderStabilizerEntries,
    ...Ata27SpoilersEntries,
    ...Ata28ValvesEntries,
    ...Ata28GaugingEntries,
    ...Ata29PumpsEntries,
    ...Ata32GearSystemEntries,
    ...Ata32GearSensorsEntries,
    ...Ata32BrakesSystemEntries,
    ...Ata32SteeringEntries,
    ...Ata36ValvesEntries,
    ...Ata36LeaksEntries,
    ...Ata36LeakDetectionEntries,
    ...Ata30AntiIceEntries,
    ...Ata30ProbesWindowsEntries,
    ...Ata34SurveillanceEntries,
    ...Ata42CpiomEntries,
  },
  families: [
    ...Ata21CabinFamilies,
    ...Ata21ComputersFamilies,
    ...Ata21PacksPressureFamilies,
    ...Ata21AvionicsFamilies,
    ...Ata24SourcesFamilies,
    ...Ata24BusesFamilies,
    ...Ata24DistributionFamilies,
    ...Ata26FireFamilies,
    ...Ata26SmokeBaysFamilies,
    ...Ata26SmokeCabinFamilies,
    ...Ata27HighLiftFamilies,
    ...Ata27ComputersFamilies,
    ...Ata27InputsFamilies,
    ...Ata27RudderStabilizerFamilies,
    ...Ata27SpoilersFamilies,
    ...Ata27AccelGyroFamilies,
    ...Ata28ValvesFamilies,
    ...Ata28PumpsFamilies,
    ...Ata28GaugingFamilies,
    ...Ata29PumpsFamilies,
    ...Ata29HeatExchangersFamilies,
    ...Ata32GearSensorsFamilies,
    ...Ata32BrakesSystemFamilies,
    ...Ata32BrakesWheelsFamilies,
    ...Ata32SteeringFamilies,
    ...Ata32TiresFamilies,
    ...Ata36ValvesFamilies,
    ...Ata36LeaksFamilies,
    ...Ata36LeakDetectionFamilies,
    ...Ata30AntiIceFamilies,
    ...Ata30ProbesWindowsFamilies,
    ...Ata34AirDataFamilies,
    ...Ata34NavSensorsFamilies,
    ...Ata34SurveillanceFamilies,
    ...Ata42NetworkFamilies,
    ...Ata42IomFamilies,
    ...Ata42CpiomFamilies,
  ],
};
