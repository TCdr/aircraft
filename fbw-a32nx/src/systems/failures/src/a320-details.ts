// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { AtaChapterNumber, FailureDetailTable } from '@flybywiresim/fbw-sdk';
import { Ata21Entries, Ata21Families } from './details/ata21';

/** Chapters whose failures all have a detail; the coverage spec only demands these. */
export const A320_DETAIL_CHAPTERS_DONE: readonly AtaChapterNumber[] = [21];

export const A320FailureDetails: FailureDetailTable = {
  entries: { ...Ata21Entries },
  families: [...Ata21Families],
};
