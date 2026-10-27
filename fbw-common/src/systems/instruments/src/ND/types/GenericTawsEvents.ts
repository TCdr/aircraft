export enum TerrainLevelMode {
  PeaksMode = 0,
  Warning = 1,
  Caution = 2,
}

/** The look-ahead terrain alert of the GPWS, as the ND message shows it (TOO LOW TERRAIN has no ND message) */
export enum TerrainAheadAlert {
  None = 0,
  /** TERRAIN AHEAD: amber */
  Caution = 1,
  /** TERRAIN AHEAD PULL UP or AVOID TERRAIN: red */
  Warning = 2,
}

export interface GenericTawsEvents {
  'egpwc.minElevation': number;
  'egpwc.minElevationMode': TerrainLevelMode;
  'egpwc.maxElevation': number;
  'egpwc.maxElevationMode': TerrainLevelMode;
  /** The look-ahead terrain alert, for TERR AHEAD on the ND (A32NX) */
  'egpwc.terrAhead': TerrainAheadAlert;
  /** The look-ahead alert is about an obstacle: the ND shows OBST AHEAD instead of TERR AHEAD (A32NX) */
  'egpwc.obstAhead': boolean;
}
