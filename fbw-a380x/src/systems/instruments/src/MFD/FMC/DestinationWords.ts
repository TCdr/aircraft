// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';

export interface BnrOutputWord {
  setBnrValue(value: number, ssm: Arinc429SignStatusMatrix, bits: number, rangeMax: number, rangeMin: number): void;
}

/** null in each field means the flight plan has no destination */
export interface DestinationData {
  landingElevation: number | null;
  latitude: number | null;
  longitude: number | null;
}

const statusOf = (value: number | null) =>
  value !== null ? Arinc429SignStatusMatrix.NormalOperation : Arinc429SignStatusMatrix.NoComputedData;

export class DestinationWords {
  /** undefined: nothing sent yet, so the first update always writes */
  private landingElevation: number | null | undefined = undefined;

  private latitude: number | null | undefined = undefined;

  private longitude: number | null | undefined = undefined;

  constructor(
    private readonly landingElevationWord: BnrOutputWord,
    private readonly latitudeWord: BnrOutputWord,
    private readonly longitudeWord: BnrOutputWord,
  ) {}

  /** @returns true when the landing elevation word was written */
  update(data: DestinationData): boolean {
    let elevationWritten = false;

    if (this.landingElevation !== data.landingElevation) {
      this.landingElevation = data.landingElevation;
      this.landingElevationWord.setBnrValue(
        data.landingElevation ?? 0,
        statusOf(data.landingElevation),
        14,
        16384,
        -2048,
      );
      elevationWritten = true;
    }

    if (this.latitude !== data.latitude) {
      this.latitude = data.latitude;
      this.latitudeWord.setBnrValue(data.latitude ?? 0, statusOf(data.latitude), 18, 180, -180);
    }

    if (this.longitude !== data.longitude) {
      this.longitude = data.longitude;
      this.longitudeWord.setBnrValue(data.longitude ?? 0, statusOf(data.longitude), 18, 180, -180);
    }

    return elevationWritten;
  }
}
