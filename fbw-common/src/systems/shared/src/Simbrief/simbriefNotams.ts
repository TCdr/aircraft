// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** One NOTAM of the OFP */
export interface IOfpNotam {
  /** The NOTAM text as the airport publishes it */
  text: string;
  /** The ICAO of the airport (or FIR) the NOTAM is for, empty when the OFP does not say */
  location: string;
}

/** The NOTAMs of the OFP, sorted by where they apply */
export interface IOfpNotams {
  departure: IOfpNotam[];
  destination: IOfpNotam[];
  alternate: IOfpNotam[];
  /** Every other NOTAM of the plan (en-route, take-off and en-route alternates) */
  enroute: IOfpNotam[];
}

/** SimBrief gives a list as a plain object when it holds a single entry */
const asList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  return value && typeof value === 'object' ? [value] : [];
};

const readNotam = (record: unknown): IOfpNotam | null => {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const fields = record as Record<string, unknown>;
  const raw = typeof fields.notam_text === 'string' && fields.notam_text.trim() ? fields.notam_text : fields.notam_raw;
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const location = typeof fields.location_icao === 'string' ? fields.location_icao.trim().toUpperCase() : '';
  return { text: raw.trim(), location };
};

/**
 * The NOTAMs of a SimBrief OFP. The plan lists every NOTAM in one list, each with the airport it is for: the ones of
 * the departure, destination and first alternate go to their own list, all the others to the en-route list. The
 * NOTAMs of an airport block (origin, destination, alternate) count too when the main list lacks them.
 * @param json the SimBrief OFP as JSON
 * @param departure the ICAO of the departure
 * @param destination the ICAO of the destination
 * @param alternate the ICAO of the first alternate
 * @returns the NOTAMs, each list empty when the OFP has none
 */
export const ofpNotams = (json: any, departure: string, destination: string, alternate: string): IOfpNotams => {
  const notams: IOfpNotams = { departure: [], destination: [], alternate: [], enroute: [] };
  const seen: Record<string, boolean> = {};

  const add = (list: IOfpNotam[], notam: IOfpNotam | null): void => {
    if (notam === null || seen[`${notam.location}|${notam.text}`]) {
      return;
    }
    seen[`${notam.location}|${notam.text}`] = true;
    list.push(notam);
  };

  asList(json?.notams?.notamdrec).forEach((record) => {
    const notam = readNotam(record);
    if (notam === null) {
      return;
    }
    if (notam.location === departure) {
      add(notams.departure, notam);
    } else if (notam.location === destination) {
      add(notams.destination, notam);
    } else if (notam.location === alternate) {
      add(notams.alternate, notam);
    } else {
      add(notams.enroute, notam);
    }
  });

  const fromBlock = (block: unknown, list: IOfpNotam[], icao: string): void => {
    asList((block as { notam?: unknown } | undefined)?.notam).forEach((record) => {
      const notam = readNotam(record);
      if (notam !== null) {
        add(list, { text: notam.text, location: notam.location || icao });
      }
    });
  };
  fromBlock(json?.origin, notams.departure, departure);
  fromBlock(json?.destination, notams.destination, destination);
  fromBlock(Array.isArray(json?.alternate) ? json.alternate[0] : json?.alternate, notams.alternate, alternate);
  return notams;
};
