// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// In-flight landing distances: Quick Reference Handbook (In Flight Procedures, Landing Performance Assessment/Landing
// Distance). Dispatch required landing distances: A320 FCOM PER-LDG-DIS-RLD (CONF FULL and CONF 3, 12 APR 18) and
// PER-LDG-DIS-RLA.

import {
  isTailwindBeyondLimit,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingLimitation,
  LandingPerformanceCalculator,
  LandingPerformanceError,
  LandingPerformanceEstimate,
  LandingPerformanceInputs,
  LandingPerformanceResult,
  LandingRunwayCondition,
  landingIsaTemperature,
  landingPressureAltitude,
  landingWindIncrement,
} from '@flybywiresim/fbw-sdk';

/** The autobrake modes of the QRH data (MAX = maximum manual braking) */
enum AutobrakeMode {
  Low,
  Medium,
  Max,
}

enum LandingFlapsConfig {
  Conf3,
  Full,
}

/** The runway condition codes of the QRH data (6 DRY ... 1 POOR) */
enum LandingRunwayConditions {
  Dry,
  Good,
  GoodMedium,
  Medium,
  MediumPoor,
  Poor,
}

/**
 * Landing data for a specific aircraft configuration with a specific runway condition
 */
type LandingData = {
  refDistance: number;
  weightCorrectionAbove: number; // per 1T above 68T
  weightCorrectionBelow: number; // per 1T below 68T
  speedCorrection: number; // Per 5kt
  altitudeCorrection: number; // Per 1000ft ASL
  windCorrection: number; // Per 5KT tail wind
  tempCorrection: number; // Per 10 deg C above ISA
  slopeCorrection: number; // Per 1% down slope
  reverserCorrection: number; // Per thrust reverser operative
  overweightProcedureCorrection: number; // If overweight procedure applied
};

type FlapsConfigLandingData = {
  [flapsConfig in LandingFlapsConfig]: LandingData;
};

type AutobrakeConfigLandingData = {
  [autobrakeConfig in AutobrakeMode]: FlapsConfigLandingData;
};

type RunwayConditionLandingData = {
  [runwayCondition in LandingRunwayConditions]: AutobrakeConfigLandingData;
};

const dryRunwayLandingData: AutobrakeConfigLandingData = {
  [AutobrakeMode.Max]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1060,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -10,
      speedCorrection: 70,
      altitudeCorrection: 40,
      windCorrection: 130,
      tempCorrection: 30,
      slopeCorrection: 20,
      reverserCorrection: 0,
      overweightProcedureCorrection: 910,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 1210,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -10,
      speedCorrection: 80,
      altitudeCorrection: 50,
      windCorrection: 130,
      tempCorrection: 40,
      slopeCorrection: 30,
      reverserCorrection: -10,
      overweightProcedureCorrection: 1080,
    },
  },
  [AutobrakeMode.Medium]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1330,
      weightCorrectionAbove: 30,
      weightCorrectionBelow: -10,
      speedCorrection: 90,
      altitudeCorrection: 50,
      windCorrection: 140,
      tempCorrection: 40,
      slopeCorrection: 10,
      reverserCorrection: 0,
      overweightProcedureCorrection: 220,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 1510,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 100,
      altitudeCorrection: 50,
      windCorrection: 140,
      tempCorrection: 50,
      slopeCorrection: 10,
      reverserCorrection: 0,
      overweightProcedureCorrection: 230,
    },
  },
  [AutobrakeMode.Low]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1860,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 130,
      altitudeCorrection: 70,
      windCorrection: 200,
      tempCorrection: 70,
      slopeCorrection: 30,
      reverserCorrection: 0,
      overweightProcedureCorrection: 210,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2160,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -10,
      speedCorrection: 140,
      altitudeCorrection: 80,
      windCorrection: 220,
      tempCorrection: 70,
      slopeCorrection: 30,
      reverserCorrection: -10,
      overweightProcedureCorrection: 230,
    },
  },
};

const goodRunwayLandingData: AutobrakeConfigLandingData = {
  [AutobrakeMode.Max]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1320,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -10,
      speedCorrection: 110,
      altitudeCorrection: 70,
      windCorrection: 200,
      tempCorrection: 60,
      slopeCorrection: 50,
      reverserCorrection: -20,
      overweightProcedureCorrection: 710,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 1570,
      weightCorrectionAbove: 60,
      weightCorrectionBelow: -20,
      speedCorrection: 120,
      altitudeCorrection: 80,
      windCorrection: 230,
      tempCorrection: 70,
      slopeCorrection: 60,
      reverserCorrection: -30,
      overweightProcedureCorrection: 810,
    },
  },
  [AutobrakeMode.Medium]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1380,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -10,
      speedCorrection: 110,
      altitudeCorrection: 70,
      windCorrection: 200,
      tempCorrection: 60,
      slopeCorrection: 50,
      reverserCorrection: 0,
      overweightProcedureCorrection: 200,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 1630,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 120,
      altitudeCorrection: 80,
      windCorrection: 230,
      tempCorrection: 70,
      slopeCorrection: 60,
      reverserCorrection: -20,
      overweightProcedureCorrection: 290,
    },
  },
  [AutobrakeMode.Low]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1860,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 130,
      altitudeCorrection: 70,
      windCorrection: 200,
      tempCorrection: 70,
      slopeCorrection: 30,
      reverserCorrection: 0,
      overweightProcedureCorrection: 210,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2160,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 140,
      altitudeCorrection: 80,
      windCorrection: 220,
      tempCorrection: 70,
      slopeCorrection: 30,
      reverserCorrection: -10,
      overweightProcedureCorrection: 230,
    },
  },
};

const goodMediumRunwayLandingData: AutobrakeConfigLandingData = {
  [AutobrakeMode.Max]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1570,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 100,
      altitudeCorrection: 60,
      windCorrection: 190,
      tempCorrection: 60,
      slopeCorrection: 70,
      reverserCorrection: -50,
      overweightProcedureCorrection: 800,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 1820,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 100,
      altitudeCorrection: 70,
      windCorrection: 200,
      tempCorrection: 70,
      slopeCorrection: 80,
      reverserCorrection: -80,
      overweightProcedureCorrection: 930,
    },
  },
  [AutobrakeMode.Medium]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1620,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 100,
      altitudeCorrection: 60,
      windCorrection: 190,
      tempCorrection: 60,
      slopeCorrection: 80,
      reverserCorrection: -60,
      overweightProcedureCorrection: 200,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 1870,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -20,
      speedCorrection: 100,
      altitudeCorrection: 70,
      windCorrection: 200,
      tempCorrection: 70,
      slopeCorrection: 90,
      reverserCorrection: -90,
      overweightProcedureCorrection: 280,
    },
  },
  [AutobrakeMode.Low]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1880,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 130,
      altitudeCorrection: 70,
      windCorrection: 210,
      tempCorrection: 60,
      slopeCorrection: 50,
      reverserCorrection: -10,
      overweightProcedureCorrection: 210,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2170,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 140,
      altitudeCorrection: 80,
      windCorrection: 220,
      tempCorrection: 80,
      slopeCorrection: 60,
      reverserCorrection: -30,
      overweightProcedureCorrection: 230,
    },
  },
};

const mediumRunwayLandingData: AutobrakeConfigLandingData = {
  [AutobrakeMode.Max]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1760,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 100,
      altitudeCorrection: 70,
      windCorrection: 220,
      tempCorrection: 60,
      slopeCorrection: 110,
      reverserCorrection: -90,
      overweightProcedureCorrection: 750,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2050,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 110,
      altitudeCorrection: 80,
      windCorrection: 240,
      tempCorrection: 70,
      slopeCorrection: 120,
      reverserCorrection: -130,
      overweightProcedureCorrection: 880,
    },
  },
  [AutobrakeMode.Medium]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1810,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 110,
      altitudeCorrection: 70,
      windCorrection: 230,
      tempCorrection: 60,
      slopeCorrection: 110,
      reverserCorrection: -100,
      overweightProcedureCorrection: 200,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2100,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 110,
      altitudeCorrection: 80,
      windCorrection: 240,
      tempCorrection: 70,
      slopeCorrection: 130,
      reverserCorrection: -140,
      overweightProcedureCorrection: 300,
    },
  },
  [AutobrakeMode.Low]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1960,
      weightCorrectionAbove: 40,
      weightCorrectionBelow: -10,
      speedCorrection: 130,
      altitudeCorrection: 70,
      windCorrection: 240,
      tempCorrection: 70,
      slopeCorrection: 100,
      reverserCorrection: -40,
      overweightProcedureCorrection: 230,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2270,
      weightCorrectionAbove: 50,
      weightCorrectionBelow: -20,
      speedCorrection: 140,
      altitudeCorrection: 80,
      windCorrection: 250,
      tempCorrection: 80,
      slopeCorrection: 110,
      reverserCorrection: -70,
      overweightProcedureCorrection: 260,
    },
  },
};

const mediumPoorRunwayLandingData: AutobrakeConfigLandingData = {
  [AutobrakeMode.Max]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1930,
      weightCorrectionAbove: 70,
      weightCorrectionBelow: -10,
      speedCorrection: 170,
      altitudeCorrection: 110,
      windCorrection: 350,
      tempCorrection: 100,
      slopeCorrection: 150,
      reverserCorrection: -110,
      overweightProcedureCorrection: 480,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2380,
      weightCorrectionAbove: 80,
      weightCorrectionBelow: -30,
      speedCorrection: 170,
      altitudeCorrection: 140,
      windCorrection: 410,
      tempCorrection: 120,
      slopeCorrection: 200,
      reverserCorrection: -150,
      overweightProcedureCorrection: 580,
    },
  },
  [AutobrakeMode.Medium]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 1960,
      weightCorrectionAbove: 70,
      weightCorrectionBelow: -10,
      speedCorrection: 160,
      altitudeCorrection: 110,
      windCorrection: 360,
      tempCorrection: 90,
      slopeCorrection: 150,
      reverserCorrection: -110,
      overweightProcedureCorrection: 230,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2400,
      weightCorrectionAbove: 80,
      weightCorrectionBelow: -30,
      speedCorrection: 170,
      altitudeCorrection: 140,
      windCorrection: 410,
      tempCorrection: 120,
      slopeCorrection: 200,
      reverserCorrection: -160,
      overweightProcedureCorrection: 310,
    },
  },
  [AutobrakeMode.Low]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 2000,
      weightCorrectionAbove: 70,
      weightCorrectionBelow: -10,
      speedCorrection: 160,
      altitudeCorrection: 120,
      windCorrection: 360,
      tempCorrection: 90,
      slopeCorrection: 150,
      reverserCorrection: -40,
      overweightProcedureCorrection: 220,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 2430,
      weightCorrectionAbove: 80,
      weightCorrectionBelow: -30,
      speedCorrection: 180,
      altitudeCorrection: 140,
      windCorrection: 400,
      tempCorrection: 130,
      slopeCorrection: 210,
      reverserCorrection: -80,
      overweightProcedureCorrection: 290,
    },
  },
};

const poorRunwayLandingData: AutobrakeConfigLandingData = {
  [AutobrakeMode.Max]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 2760,
      weightCorrectionAbove: 60,
      weightCorrectionBelow: -20,
      speedCorrection: 140,
      altitudeCorrection: 110,
      windCorrection: 430,
      tempCorrection: 110,
      slopeCorrection: 460,
      reverserCorrection: -370,
      overweightProcedureCorrection: 550,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 3250,
      weightCorrectionAbove: 70,
      weightCorrectionBelow: -30,
      speedCorrection: 150,
      altitudeCorrection: 130,
      windCorrection: 470,
      tempCorrection: 130,
      slopeCorrection: 550,
      reverserCorrection: -490,
      overweightProcedureCorrection: 660,
    },
  },
  [AutobrakeMode.Medium]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 2790,
      weightCorrectionAbove: 60,
      weightCorrectionBelow: -20,
      speedCorrection: 130,
      altitudeCorrection: 110,
      windCorrection: 440,
      tempCorrection: 100,
      slopeCorrection: 470,
      reverserCorrection: -380,
      overweightProcedureCorrection: 230,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 3280,
      weightCorrectionAbove: 70,
      weightCorrectionBelow: -30,
      speedCorrection: 150,
      altitudeCorrection: 130,
      windCorrection: 470,
      tempCorrection: 120,
      slopeCorrection: 560,
      reverserCorrection: -490,
      overweightProcedureCorrection: 310,
    },
  },
  [AutobrakeMode.Low]: {
    [LandingFlapsConfig.Full]: {
      refDistance: 2830,
      weightCorrectionAbove: 60,
      weightCorrectionBelow: -20,
      speedCorrection: 140,
      altitudeCorrection: 110,
      windCorrection: 440,
      tempCorrection: 110,
      slopeCorrection: 470,
      reverserCorrection: -380,
      overweightProcedureCorrection: 220,
    },
    [LandingFlapsConfig.Conf3]: {
      refDistance: 3330,
      weightCorrectionAbove: 70,
      weightCorrectionBelow: -30,
      speedCorrection: 140,
      altitudeCorrection: 130,
      windCorrection: 470,
      tempCorrection: 120,
      slopeCorrection: 560,
      reverserCorrection: -500,
      overweightProcedureCorrection: 290,
    },
  },
};

/**
 * Stores all landing data for the aircraft.
 * Retrieve with runwayConditionLandingData[runwayCondition][autobrakeMode][flapsConfig]
 */
const runwayConditionLandingData: RunwayConditionLandingData = {
  [LandingRunwayConditions.Dry]: dryRunwayLandingData,
  [LandingRunwayConditions.Good]: goodRunwayLandingData,
  [LandingRunwayConditions.GoodMedium]: goodMediumRunwayLandingData,
  [LandingRunwayConditions.Medium]: mediumRunwayLandingData,
  [LandingRunwayConditions.MediumPoor]: mediumPoorRunwayLandingData,
  [LandingRunwayConditions.Poor]: poorRunwayLandingData,
};

/**
 * Margin of the in-flight landing distances (A320 FCOM PER-LDG-GEN, factored in-flight landing distance)
 */
const SAFETY_MARGIN = 1.15;

/**
 * VLS speed (kts) for full flap configuration
 * Index 0 = 40T, Index 8 = 80T, 5T increment
 */
const CONF_FULL_VLS = [116, 116, 116, 120, 125, 130, 135, 139, 143];

/**
 * VLS speed (kts) for conf 3 flaps
 * Index 0 = 40T, Index 8 = 80T, 5T increment
 */
const CONF3_VLS = [116, 118, 124, 130, 136, 141, 146, 151, 155];

/**
 * Gets the interpolated VLS speed (kts) for the given mass, in tonnes, and the appropriate VLS speed table.
 * @param mass
 * @param vlsSpeedTable
 */
const getInterpolatedVlsTableValue = (mass: number, vlsSpeedTable: number[]): number => {
  const index = Math.max(0, Math.ceil((Math.min(80, mass) - 40) / 5));

  if (index === 0) return vlsSpeedTable[0];
  if (index === 8) return vlsSpeedTable[8];

  const lower = vlsSpeedTable[index - 1];
  const upper = vlsSpeedTable[index];

  const oneTonSpeedIncrement = (upper - lower) / 5;

  return lower + oneTonSpeedIncrement * (mass % 5);
};

/** The runway states of the dispatch tables, in the order of their columns */
const DISPATCH_CONDITIONS = [
  LandingRunwayCondition.Dry,
  LandingRunwayCondition.WetGrooved,
  LandingRunwayCondition.Wet,
  LandingRunwayCondition.CompactedSnow,
  LandingRunwayCondition.DryWetSnow,
  LandingRunwayCondition.Slush,
  LandingRunwayCondition.StandingWater,
];

/** The runway condition codes of the in-flight landing distances (QRH), with their data */
const IN_FLIGHT_CONDITIONS: Partial<Record<LandingRunwayCondition, LandingRunwayConditions>> = {
  [LandingRunwayCondition.Dry]: LandingRunwayConditions.Dry,
  [LandingRunwayCondition.Good]: LandingRunwayConditions.Good,
  [LandingRunwayCondition.GoodToMedium]: LandingRunwayConditions.GoodMedium,
  [LandingRunwayCondition.Medium]: LandingRunwayConditions.Medium,
  [LandingRunwayCondition.MediumToPoor]: LandingRunwayConditions.MediumPoor,
  [LandingRunwayCondition.Poor]: LandingRunwayConditions.Poor,
};

/** The braking modes of the in-flight landing distances */
const IN_FLIGHT_BRAKING: Partial<Record<LandingBrakingMode, AutobrakeMode>> = {
  [LandingBrakingMode.Manual]: AutobrakeMode.Max,
  [LandingBrakingMode.Medium]: AutobrakeMode.Medium,
  [LandingBrakingMode.Low]: AutobrakeMode.Low,
};

/**
 * A320 FCOM PER-LDG-DIS-RLD: required landing distance in metres at sea level, ISA, no wind, no slope, no reverse
 * thrust, manual landing, VAPP = VLS, for the weights {@link DISPATCH_WEIGHTS} (rows) and the runway states
 * {@link DISPATCH_CONDITIONS} (columns), and the corrections: per 1000 ft above sea level, per 5 kt of speed, per 5 kt of
 * tailwind, per thrust reverser operative (contaminated runways).
 */
const DISPATCH_WEIGHTS = [46, 50, 54, 58, 62, 66];
interface DispatchTable {
  distances: number[][];
  altitude: number[];
  speed: number[];
  tailwind: number[];
  reverser: number[];
}
const DISPATCH_TABLES: Record<LandingConf.Conf3 | LandingConf.Full, DispatchTable> = {
  [LandingConf.Full]: {
    distances: [
      [1170, 1220, 1340, 1370, 1530, 1360, 1410],
      [1220, 1270, 1400, 1450, 1620, 1450, 1500],
      [1270, 1320, 1460, 1540, 1720, 1540, 1590],
      [1330, 1380, 1530, 1620, 1810, 1630, 1700],
      [1390, 1430, 1600, 1700, 1900, 1730, 1820],
      [1500, 1560, 1730, 1780, 1990, 1820, 1950],
    ],
    altitude: [60, 60, 70, 80, 90, 130, 130],
    speed: [100, 100, 110, 90, 100, 120, 180],
    tailwind: [150, 140, 170, 160, 190, 240, 330],
    reverser: [0, 0, 0, -70, -90, -70, -80],
  },
  [LandingConf.Conf3]: {
    distances: [
      [1250, 1290, 1430, 1500, 1690, 1500, 1550],
      [1300, 1350, 1500, 1590, 1790, 1600, 1650],
      [1360, 1400, 1570, 1680, 1890, 1690, 1770],
      [1430, 1460, 1640, 1770, 1990, 1800, 1910],
      [1520, 1550, 1750, 1860, 2090, 1900, 2060],
      [1670, 1710, 1920, 1950, 2200, 2030, 2220],
    ],
    altitude: [70, 60, 70, 90, 110, 160, 160],
    speed: [100, 110, 120, 100, 100, 150, 190],
    tailwind: [150, 140, 180, 170, 200, 270, 380],
    reverser: [0, 0, 0, -90, -120, -100, -100],
  },
};

/** Linear interpolation, extrapolated beyond the ends */
function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) {
    i++;
  }
  return ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);
}

/**
 * Landing performance calculator of the A320-251N: the in-flight landing distances of the QRH for each braking mode,
 * and the required landing distances of the FCOM for the dispatch. There is no go-around gradient in this data.
 */
export class A320251NLandingCalculator implements LandingPerformanceCalculator {
  /** FBW A32NX airframe.json5 */
  public readonly mlw = 67_400;

  public readonly mtow = 79_000;

  public readonly oew = 42_500;

  /** As the FBW A32NX takeoff calculator */
  public readonly maxTailwind = 15;

  public readonly maxPressureAlt = 9_200;

  public readonly minGoAroundGradient = undefined;

  public readonly features = {
    autoConf: false,
    goAround: false,
    antiIce: false,
    airConditioning: false,
    approachType: false,
    overweightProcedure: true,
    btv: false,
  };

  private static readonly MAX_SLOPE = 2;

  public runwayConditions(type: LandingComputationType): LandingRunwayCondition[] {
    return type === LandingComputationType.Dispatch
      ? DISPATCH_CONDITIONS
      : (Object.keys(IN_FLIGHT_CONDITIONS) as LandingRunwayCondition[]);
  }

  public brakingModes(): LandingBrakingMode[] {
    return [LandingBrakingMode.Manual, LandingBrakingMode.Medium, LandingBrakingMode.Low];
  }

  /**
   * Credit where the data has a correction per thrust reverser: the QRH in-flight landing distances for the runway
   * condition, configuration and braking mode (none on a dry runway in CONF FULL), the FCOM dispatch tables on the
   * contaminated runways
   */
  public reverseThrustAvailable(
    type: LandingComputationType,
    condition: LandingRunwayCondition,
    conf: LandingConf,
    brakingMode: LandingBrakingMode,
  ): boolean {
    if (type === LandingComputationType.InFlight) {
      const code = IN_FLIGHT_CONDITIONS[condition];
      const mode = IN_FLIGHT_BRAKING[brakingMode];
      if (code === undefined || mode === undefined) {
        return false;
      }
      const flaps = conf === LandingConf.Conf3 ? LandingFlapsConfig.Conf3 : LandingFlapsConfig.Full;
      return runwayConditionLandingData[code][mode][flaps].reverserCorrection < 0;
    }
    const table = DISPATCH_TABLES[conf === LandingConf.Conf3 ? LandingConf.Conf3 : LandingConf.Full];
    return table.reverser[DISPATCH_CONDITIONS.indexOf(condition)] < 0;
  }

  /** A320 FCOM PER-LDG-DIS-MAT, runway condition assessment matrix for landing (gust included) */
  public crosswindLimit(condition: LandingRunwayCondition, oat: number): number {
    switch (condition) {
      case LandingRunwayCondition.Dry:
      case LandingRunwayCondition.Good:
      case LandingRunwayCondition.Wet:
      case LandingRunwayCondition.WetGrooved:
        return 38;
      case LandingRunwayCondition.GoodToMedium:
        return 29;
      case LandingRunwayCondition.CompactedSnow:
        return oat <= -15 ? 29 : 25;
      case LandingRunwayCondition.Medium:
      case LandingRunwayCondition.DryWetSnow:
        return 25;
      case LandingRunwayCondition.MediumToPoor:
      case LandingRunwayCondition.Slush:
      case LandingRunwayCondition.StandingWater:
        return 20;
      default:
        return 15;
    }
  }

  public windIncrement(headwind: number): number {
    return landingWindIncrement(headwind);
  }

  public calculateLandingPerformance(inputs: LandingPerformanceInputs): LandingPerformanceResult {
    const pressureAlt = landingPressureAltitude(inputs.elevation, inputs.qnh);
    const isaTemp = landingIsaTemperature(pressureAlt);
    const inFlight = inputs.type === LandingComputationType.InFlight;
    const conf = inputs.conf === LandingConf.Conf3 ? LandingConf.Conf3 : LandingConf.Full;
    const windIncrement = this.windIncrement(inputs.headwind);
    const speedIncrement = inputs.speedIncrement ?? windIncrement;
    const vls = this.vls(conf, inputs.weight);

    const result: LandingPerformanceResult = {
      inputs,
      error: this.checkInputs(inputs, pressureAlt),
      conf,
      pressureAlt,
      isaTemp,
      vls,
      windIncrement,
      speedIncrement,
      vapp: vls + speedIncrement,
      brakingDistances: [],
      overweight: inFlight && inputs.weight > this.mlw,
      reverseCredit:
        inputs.reverseThrust &&
        this.reverseThrustAvailable(inputs.type, inputs.runwayCondition, conf, inputs.brakingMode),
      estimates: [],
      tailwindExtrapolated: isTailwindBeyondLimit(inputs.headwind, this.maxTailwind),
    };
    if (result.error !== LandingPerformanceError.None) {
      return result;
    }

    const distance = (weight: number) =>
      inFlight
        ? SAFETY_MARGIN * this.inFlightDistance(inputs, weight, conf, inputs.brakingMode, pressureAlt, isaTemp)
        : this.dispatchDistance(inputs, weight, conf, pressureAlt);

    if (inFlight) {
      result.actualLandingDistance = this.inFlightDistance(
        inputs,
        inputs.weight,
        conf,
        inputs.brakingMode,
        pressureAlt,
        isaTemp,
      );
      result.factoredLandingDistance = SAFETY_MARGIN * result.actualLandingDistance;
      result.landingDistance = result.factoredLandingDistance;
      result.brakingDistances = this.brakingModes().map((mode) => ({
        mode,
        distance: this.inFlightDistance(inputs, inputs.weight, conf, mode, pressureAlt, isaTemp),
      }));
    } else {
      result.landingDistance = distance(inputs.weight);
    }
    result.stopMargin = inputs.lda - result.landingDistance;
    // The QRH airborne phase: 7 s from the threshold to the touchdown
    result.airDistance = 7 * (result.vapp - Math.min(0, inputs.headwind)) * 0.514444;

    // MLW(PERF): the highest weight of the landing distance available
    let low = 30_000;
    let high = 100_000;
    if (distance(high) <= inputs.lda) {
      low = high;
    } else if (distance(low) > inputs.lda) {
      high = low;
    }
    while (high - low > 10) {
      const mid = (low + high) / 2;
      if (distance(mid) <= inputs.lda) {
        low = mid;
      } else {
        high = mid;
      }
    }
    result.mlwPerf = low;
    result.limitation = inputs.weight <= low ? LandingLimitation.Weight : LandingLimitation.Lda;

    const weightInData = inFlight
      ? inputs.weight >= 40_000 && inputs.weight <= 80_000
      : inputs.weight >= DISPATCH_WEIGHTS[0] * 1000 &&
        inputs.weight <= DISPATCH_WEIGHTS[DISPATCH_WEIGHTS.length - 1] * 1000;
    if (!weightInData) {
      result.estimates.push(LandingPerformanceEstimate.LandingDistance);
    }
    if (low > DISPATCH_WEIGHTS[DISPATCH_WEIGHTS.length - 1] * 1000 && !inFlight) {
      result.estimates.push(LandingPerformanceEstimate.MlwPerf);
    }
    return result;
  }

  private checkInputs(inputs: LandingPerformanceInputs, pressureAlt: number): LandingPerformanceError {
    if (
      ![inputs.weight, inputs.lda, inputs.elevation, inputs.oat, inputs.qnh, inputs.headwind].every(Number.isFinite)
    ) {
      return LandingPerformanceError.InvalidData;
    }
    if (!this.runwayConditions(inputs.type).includes(inputs.runwayCondition)) {
      return LandingPerformanceError.RunwayCondition;
    }
    if (inputs.weight < this.oew) {
      return LandingPerformanceError.OperatingEmptyWeight;
    }
    if (inputs.type === LandingComputationType.Dispatch && inputs.weight > this.mlw) {
      return LandingPerformanceError.MaximumLandingWeight;
    }
    if (inputs.weight > this.mtow) {
      return LandingPerformanceError.MaximumTakeoffWeight;
    }
    if (pressureAlt > this.maxPressureAlt) {
      return LandingPerformanceError.MaximumPressureAlt;
    }
    if (Math.abs(inputs.slope) > A320251NLandingCalculator.MAX_SLOPE) {
      return LandingPerformanceError.MaximumRunwaySlope;
    }
    return LandingPerformanceError.None;
  }

  private vls(conf: LandingConf.Conf3 | LandingConf.Full, weight: number): number {
    return getInterpolatedVlsTableValue(weight / 1000, conf === LandingConf.Full ? CONF_FULL_VLS : CONF3_VLS);
  }

  /**
   * The required landing distance of the FCOM tables (PER-LDG-DIS-RLD), with the correction of each input; on a
   * contaminated runway at least the one of the wet runway (EU-OPS); autoland (PER-LDG-DIS-RLA): + 240 m in CONF 3 with
   * no wind or a headwind, + 170 m in CONF FULL with a headwind, up to 70 t.
   */
  private dispatchDistance(
    inputs: LandingPerformanceInputs,
    weight: number,
    conf: LandingConf.Conf3 | LandingConf.Full,
    pressureAlt: number,
  ): number {
    const table = DISPATCH_TABLES[conf];
    const speedIncrement = inputs.speedIncrement ?? this.windIncrement(inputs.headwind);
    const rld = (column: number, reverse: boolean) => {
      const base = interpolate(
        DISPATCH_WEIGHTS,
        table.distances.map((row) => row[column]),
        weight / 1000,
      );
      return (
        base +
        (Math.max(0, pressureAlt) / 1000) * table.altitude[column] +
        (Math.max(0, speedIncrement) / 5) * table.speed[column] +
        (Math.max(0, -inputs.headwind) / 5) * table.tailwind[column] +
        (reverse ? 2 * table.reverser[column] : 0)
      );
    };
    const column = DISPATCH_CONDITIONS.indexOf(inputs.runwayCondition);
    let distance = rld(column, inputs.reverseThrust);
    if (column > DISPATCH_CONDITIONS.indexOf(LandingRunwayCondition.Wet)) {
      distance = Math.max(distance, rld(DISPATCH_CONDITIONS.indexOf(LandingRunwayCondition.Wet), false));
    }
    if (inputs.autoland && weight <= 70_000) {
      if (conf === LandingConf.Conf3 && inputs.headwind >= 0) {
        distance += 240;
      } else if (conf === LandingConf.Full && inputs.headwind > 0) {
        distance += 170;
      }
    }
    return distance;
  }

  /** The in-flight landing distance of the QRH for a braking mode, without margin */
  private inFlightDistance(
    inputs: LandingPerformanceInputs,
    weight: number,
    conf: LandingConf.Conf3 | LandingConf.Full,
    brakingMode: LandingBrakingMode,
    pressureAlt: number,
    isaTemperature: number,
  ): number {
    const flaps = conf === LandingConf.Full ? LandingFlapsConfig.Full : LandingFlapsConfig.Conf3;
    const landingData =
      runwayConditionLandingData[IN_FLIGHT_CONDITIONS[inputs.runwayCondition] ?? LandingRunwayConditions.Dry][
        IN_FLIGHT_BRAKING[brakingMode] ?? AutobrakeMode.Max
      ][flaps];

    const tailWind = Math.max(0, -inputs.headwind);
    const weightDifference = weight / 1000 - 68;
    const weightCorrection =
      weightDifference < 0
        ? landingData.weightCorrectionBelow * Math.abs(weightDifference)
        : landingData.weightCorrectionAbove * weightDifference;
    const speedIncrement = Math.max(0, inputs.speedIncrement ?? this.windIncrement(inputs.headwind));
    const speedCorrection = (speedIncrement / 5) * landingData.speedCorrection;
    const windCorrection = (tailWind / 5) * landingData.windCorrection;
    const reverserCorrection =
      inputs.reverseThrust && landingData.reverserCorrection < 0 ? landingData.reverserCorrection * 2 : 0;
    const altitudeCorrection = pressureAlt > 0 ? (pressureAlt / 1000) * landingData.altitudeCorrection : 0;
    const slopeCorrection = inputs.slope < 0 ? Math.abs(inputs.slope) * landingData.slopeCorrection : 0;
    const temperatureCorrection =
      inputs.oat > isaTemperature ? ((inputs.oat - isaTemperature) / 10) * landingData.tempCorrection : 0;
    const overweightProcCorrection = inputs.overweightProcedure ? landingData.overweightProcedureCorrection : 0;
    const autolandCorrection = inputs.autoland ? (conf === LandingConf.Full ? 280 : 250) : 0;

    return (
      landingData.refDistance +
      weightCorrection +
      speedCorrection +
      windCorrection +
      reverserCorrection +
      altitudeCorrection +
      slopeCorrection +
      temperatureCorrection +
      overweightProcCorrection +
      autolandCorrection
    );
  }
}
