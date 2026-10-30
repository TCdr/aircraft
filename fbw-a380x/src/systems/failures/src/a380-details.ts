// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { AtaChapterNumber, FailureDetailTable } from '@flybywiresim/fbw-sdk';
import { Ata21AvionicsEntries, Ata21AvionicsFamilies } from './details/ata21Avionics';
import { Ata21CabinEntries, Ata21CabinFamilies } from './details/ata21Cabin';
import { Ata21ComputersFamilies } from './details/ata21Computers';
import { Ata21PacksPressureEntries, Ata21PacksPressureFamilies } from './details/ata21PacksPressure';

/** Chapters whose failures all have a detail; the coverage spec only demands these. */
export const A380_DETAIL_CHAPTERS_DONE: readonly AtaChapterNumber[] = [21];

export const A380FailureDetails: FailureDetailTable = {
  entries: {
    ...Ata21CabinEntries,
    ...Ata21PacksPressureEntries,
    ...Ata21AvionicsEntries,
  },
  families: [...Ata21CabinFamilies, ...Ata21ComputersFamilies, ...Ata21PacksPressureFamilies, ...Ata21AvionicsFamilies],
};
