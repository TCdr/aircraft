export const WIND_MAGNITUDE_ONLY_REGEX = /^(TL|HD|T|H|\+|-)?(\d{1,2}(?:\.\d)?)$/;
export const WIND_MAGNITUDE_AND_DIR_REGEX = /^(\d{1,3})\/(\d{1,2}(?:\.\d)?)$/;

export const isWindMagnitudeOnly = (input: string): boolean => {
  const magnitudeOnlyMatch = input.match(WIND_MAGNITUDE_ONLY_REGEX);
  return magnitudeOnlyMatch !== null && (magnitudeOnlyMatch[1] !== '' || input === '0');
};

export const isWindMagnitudeAndDirection = (input: string): boolean => {
  const magnitudeOnlyMatch = input.match(WIND_MAGNITUDE_AND_DIR_REGEX);
  return magnitudeOnlyMatch !== null;
};

/** What the wind field accepts while typing: a partial entry such as "80/" or "080/1" must stay editable */
export const WIND_TYPING_REGEX = /^(?:H|HD|TL|T|[-+])?\d{0,2}(?:\/\d{2})?$|^\d{1,5}$|^\d{1,3}\/\d{0,2}$/;

export const isValidIcao = (icao: string): boolean => icao?.length === 4;
