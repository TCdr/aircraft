// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429OutputWord, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';

type BnrOutputWord = Pick<Arinc429OutputWord, 'setBnrValue'>;

/** null in each field means the flight plan has no destination */
export interface DestinationData {
  landingElevation: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface ElevatedLocation {
  lat: number;
  long: number;
  alt: number;
}

const finiteOrNull = (value: number) => (Number.isFinite(value) ? value : null);

/** The runway threshold is more exact than the airport reference point, so it wins when there is one. */
export const destinationDataOf = (
  runway: { thresholdLocation: ElevatedLocation } | undefined | null,
  airport: { location: ElevatedLocation } | undefined | null,
): DestinationData => {
  const location = runway?.thresholdLocation ?? airport?.location;

  if (!location) {
    return { landingElevation: null, latitude: null, longitude: null };
  }

  return {
    landingElevation: finiteOrNull(location.alt),
    latitude: finiteOrNull(location.lat),
    longitude: finiteOrNull(location.long),
  };
};

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

  /**
   * @returns true when the landing elevation for the pressurisation changed; the first update without a destination
   * does not count, as there is nothing to change yet
   */
  update(data: DestinationData): boolean {
    let elevationChanged = false;

    if (this.landingElevation !== data.landingElevation) {
      elevationChanged = this.landingElevation !== undefined || data.landingElevation !== null;
      this.landingElevation = data.landingElevation;
      this.landingElevationWord.setBnrValue(
        data.landingElevation ?? 0,
        statusOf(data.landingElevation),
        14,
        16384,
        -2048,
      );
    }

    if (this.latitude !== data.latitude) {
      this.latitude = data.latitude;
      this.latitudeWord.setBnrValue(data.latitude ?? 0, statusOf(data.latitude), 18, 180, -180);
    }

    if (this.longitude !== data.longitude) {
      this.longitude = data.longitude;
      this.longitudeWord.setBnrValue(data.longitude ?? 0, statusOf(data.longitude), 18, 180, -180);
    }

    return elevationChanged;
  }
}
