// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Approach, ApproachType } from '@flybywiresim/fbw-sdk';

const ApproachTypeOrder = Object.freeze({
  [ApproachType.Mls]: 0,
  [ApproachType.MlsTypeA]: 1,
  [ApproachType.MlsTypeBC]: 2,
  [ApproachType.Ils]: 3,
  [ApproachType.Gls]: 4,
  [ApproachType.Igs]: 5,
  [ApproachType.Loc]: 6,
  [ApproachType.LocBackcourse]: 7,
  [ApproachType.Lda]: 8,
  [ApproachType.Sdf]: 9,
  [ApproachType.Fms]: 10,
  [ApproachType.Gps]: 11,
  [ApproachType.Rnav]: 12,
  [ApproachType.VorDme]: 13,
  [ApproachType.Vortac]: 13, // VORTAC and VORDME are intentionally the same
  [ApproachType.Tacan]: 13,
  [ApproachType.Vor]: 14,
  [ApproachType.NdbDme]: 15,
  [ApproachType.Ndb]: 16,
  [ApproachType.Unknown]: 17,
});

/** The order of the approaches in the APPR list of the ARRIVAL page: by runway, then by approach type, then by suffix */
export function compareApproachListEntries(
  a: Pick<Approach, 'runwayIdent' | 'type' | 'multipleIndicator'>,
  b: Pick<Approach, 'runwayIdent' | 'type' | 'multipleIndicator'>,
): number {
  return (
    a.runwayIdent?.localeCompare(b.runwayIdent ?? '') ||
    ApproachTypeOrder[a.type] - ApproachTypeOrder[b.type] ||
    a.multipleIndicator.localeCompare(b.multipleIndicator)
  );
}
