// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type TranslationTree = { [key: string]: string | TranslationTree };

export function flatten(obj: TranslationTree): Record<string, string>;
export function mergeTranslations(
  english: TranslationTree,
  downloaded: TranslationTree,
  local: TranslationTree,
): TranslationTree;
