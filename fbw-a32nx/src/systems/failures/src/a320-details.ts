// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { AtaChapterNumber, FailureDetailTable } from '@flybywiresim/fbw-sdk';
import { Ata21Entries, Ata21Families } from './details/ata21';
import { Ata72Entries, Ata72Families } from './details/ata72';
import { Ata73Entries, Ata73Families } from './details/ata73';
import { Ata74Entries, Ata74Families } from './details/ata74';
import { Ata77Entries, Ata77Families } from './details/ata77';
import { Ata78Entries, Ata78Families } from './details/ata78';
import { Ata79Entries, Ata79Families } from './details/ata79';
import { Ata80Entries, Ata80Families } from './details/ata80';

/** Chapters whose failures all have a detail; the coverage spec only demands these. */
export const A320_DETAIL_CHAPTERS_DONE: readonly AtaChapterNumber[] = [21, 72, 73, 74, 77, 78, 79, 80];

export const A320FailureDetails: FailureDetailTable = {
  entries: {
    ...Ata21Entries,
    ...Ata72Entries,
    ...Ata73Entries,
    ...Ata74Entries,
    ...Ata77Entries,
    ...Ata78Entries,
    ...Ata79Entries,
    ...Ata80Entries,
  },
  families: [
    ...Ata21Families,
    ...Ata72Families,
    ...Ata73Families,
    ...Ata74Families,
    ...Ata77Families,
    ...Ata78Families,
    ...Ata79Families,
    ...Ata80Families,
  ],
};
