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

/** Chapters whose failures all have a detail; the coverage spec only demands these. */
export const A380_DETAIL_CHAPTERS_DONE: readonly AtaChapterNumber[] = [21, 24, 26, 27, 28, 29];

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
  ],
};
