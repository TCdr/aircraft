// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// ---------------------------------------------------------------------------
// Terrain on the ND (TERR ON ND).
//
// The stock feature (terronnd.wasm) is only a client of the external SimBridge
// program; this draws the terrain natively from an altitude-mode MapView instead.
//
// Findings this is built around (all measured in-sim, 2026-09-20):
//
// - The MapView colors each texel by the aircraft's altitude MINUS the terrain
//   height (fsMapViewSetAltitudeReference PLANE) through the altitude color list:
//   the list is split into equal bands over [min, max], entry 0 = terrain far
//   ABOVE the aircraft, the last entry = terrain far below; values beyond the
//   BOTTOM of the range (terrain far below) take the last entry, but values beyond
//   the TOP do not take the first one (see kTerrainMinFeet). The bands are hard steps.
// - Water is never colored by the list: it always gets the FIRST entry (see configureWaterMaskView).
// - Unlike the weather radar, the texture is NORTH-UP: it has to be rotated by
//   minus the ND's true heading (the ADIRS word nd.html rotates its own map by).
// - As with the radar, the texture is opaque and can only be added onto the ND.
//
// The look follows the Honeywell EGPWS terrain display: colors and dot densities
// by the terrain elevation relative to the aircraft,
//     >= +2000 ft            dense red
//     +1000 .. +2000 ft      dense yellow
//     -500 (gear down -250) .. +1000 ft   medium yellow
//     -1000 (-500) .. -500 (-250) ft      dense green
//     -2000 .. -1000 (-500) ft            light green
//     below -2000 ft         nothing
// (the "image only within 2000 ft of the terrain" rule of the standard mode falls
// out of the last line; the peaks mode and its MIN/MAX figures need elevations
// the module cannot read back from a MapView, so they are not implemented).
//
// The dot patterns come from an ordered dither: each band's color entry is a
// per-channel density (R = red, G = green, both = yellow); the texture is added at
// half strength to the complement of a 4x4 Bayer threshold map (also half
// strength), so the sum reaches 1 exactly where density >= threshold. Doubling and
// repeated squaring then turn that into 0/1 dots, and one multiply gives the
// display colors.
// ---------------------------------------------------------------------------

#include "ndwxr.h"

namespace ndwxr {

static void terrainBandColor(int band, bool gearDown, float* r, float* g) {
  const float mediumYellowFrom = gearDown ? -250.0f : -500.0f;
  const float denseGreenFrom = gearDown ? -500.0f : -1000.0f;
  // Relative elevation of the middle of the band (v = altitude - terrain, so the
  // band [lo, lo + width) of v is the terrain range (-lo - width, -lo]).
  const float lo = kTerrainMinFeet + kTerrainBandFeet * static_cast<float>(band);
  const float relMid = -(lo + 0.5f * kTerrainBandFeet);
  *r = 0.0f;
  *g = 0.0f;
  if (relMid >= kTerrainRedFromFeet) {
    *r = kTerrainDense;
  } else if (relMid >= kTerrainDenseYellowFromFeet) {
    *r = kTerrainDense;
    *g = kTerrainDense;
  } else if (relMid >= mediumYellowFrom) {
    *r = kTerrainMedium;
    *g = kTerrainMedium;
  } else if (relMid >= denseGreenFrom) {
    *g = kTerrainDense;
  } else if (relMid >= kTerrainLightGreenFromFeet) {
    *g = kTerrainLight;
  }
}

void setTerrainColors(FsContext ctx, FsTextureId id, bool gearDown) {
  FsColor colors[kTerrainBandCount];
  for (int band = 0; band < kTerrainBandCount; ++band) {
    float r = 0.0f;
    float g = 0.0f;
    terrainBandColor(band, gearDown, &r, &g);
    colors[band] = rgba(r, g, 0.0f, 1.0f);
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, kTerrainBandCount);
}

// The MAP mode's list (see kMapMinFeet): amber mountains, green ground, black water.
void setMapColors(FsContext ctx, FsTextureId id) {
  FsColor colors[kTerrainBandCount];
  const float bandFeet = (kMapMaxFeet - kMapMinFeet) / static_cast<float>(kTerrainBandCount);
  colors[0] = rgba(0.0f, 0.0f, 0.0f, 1.0f);
  for (int band = 1; band < kTerrainBandCount; ++band) {
    // (aircraft altitude - terrain height) in the middle of the band
    const float vMid = kMapMinFeet + bandFeet * (static_cast<float>(band) + 0.5f);
    const bool mountain = vMid <= kMapMountainBelowFeet;
    colors[band] = mountain ? rgba(1.0f, 1.0f, 0.0f, 1.0f) : rgba(0.0f, 1.0f, 0.0f, 1.0f);
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, kTerrainBandCount);
}

bool configureTerrainView(FsContext ctx, FsTextureId id) {
  if (id == 0) {
    return false;
  }
  // As for the radar views: the view stays visible for its whole life.
  fsMapViewSetVisibility(ctx, id, true);
  fsMapViewSetBackgroundColor(ctx, id, rgba(0.0f, 0.0f, 0.0f, 1.0f));
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);
  fsMapViewSetWeatherRadarVisibility(ctx, id, false);
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_ALTITUDE);
  fsMapViewSetAltitudeReference(ctx, id, FS_MAP_VIEW_ALTITUDE_REFERENCE_PLANE);
  fsMapViewSetAltitudeRangeInFeet(ctx, id, static_cast<double>(kTerrainMinFeet), static_cast<double>(kTerrainMaxFeet));
  setTerrainColors(ctx, id, false);
  return true;
}

// The complement (1 - threshold) of a 4x4 Bayer threshold map, as an image that
// repeats over the whole ND.
int createTerrainPattern(NVGcontext* vg) {
  constexpr int kCells = kTerrainPatternCells;
  static unsigned char data[kCells * kCells * 4];
  if constexpr (kOrderedDots) {
    static const int kBayer[16] = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};
    for (int i = 0; i < 16; ++i) {
      const float complement = (15.5f - static_cast<float>(kBayer[i])) / 16.0f;
      const unsigned char value = static_cast<unsigned char>(complement * 255.0f + 0.5f);
      data[i * 4 + 0] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
  } else {
    // White noise: each cell's threshold n / 256 (n = 0 .. 255), stored complemented.
    unsigned int state = 0x9E3779B9u;
    for (int i = 0; i < kCells * kCells; ++i) {
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      const unsigned char value = static_cast<unsigned char>(255u - ((state >> 8) & 0xFFu));
      data[i * 4 + 0] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
  }
  return nvgCreateImageRGBA(vg, kCells, kCells, NVG_IMAGE_REPEATX | NVG_IMAGE_REPEATY | NVG_IMAGE_NEAREST, data);
}

// The area the terrain covers: the compass disk in the ROSE modes, the ND's map area in ARC
// (see arcAreaPath).
static void terrainSubpath(NVGcontext* vg, float cx, float cy, float radius, bool isRose) {
  if (isRose) {
    nvgCircle(vg, cx, cy, radius);
  } else {
    arcAreaSubpath(vg, cx, cy, radius, 1.0f);
  }
}

static void terrainPath(NVGcontext* vg, float cx, float cy, float radius, bool isRose) {
  nvgBeginPath(vg);
  terrainSubpath(vg, cx, cy, radius, isRose);
}

bool configureWaterMaskView(FsContext ctx, FsTextureId id) {
  if (id == 0) {
    return false;
  }
  fsMapViewSetVisibility(ctx, id, true);
  fsMapViewSetBackgroundColor(ctx, id, rgba(0.0f, 0.0f, 0.0f, 1.0f));
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);
  fsMapViewSetWeatherRadarVisibility(ctx, id, false);
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_ALTITUDE);
  fsMapViewSetAltitudeReference(ctx, id, FS_MAP_VIEW_ALTITUDE_REFERENCE_PLANE);
  fsMapViewSetAltitudeRangeInFeet(ctx, id, static_cast<double>(kWaterMaskMinFeet), static_cast<double>(kWaterMaskMaxFeet));
  FsColor colors[2] = {rgba(1.0f, 1.0f, 1.0f, 1.0f), rgba(0.0f, 0.0f, 0.0f, 1.0f)};
  fsMapViewSetAltitudeColorList(ctx, id, colors, 2);
  return true;
}

// The green density of a band of the peaks mode's list.
static float peaksBandGreen(int band) {
  const float total = 1.0f + kPeaksMarginFraction;
  // The band's elevation as a fraction of the span, from the top (band 0 = above the highest terrain).
  const float fraction = total - (static_cast<float>(band) + 0.5f) / static_cast<float>(kTerrainBandCount) * total;
  if (fraction >= kPeaksSolidFrom) {
    return 1.0f;
  }
  if (fraction >= kPeaksDenseFrom) {
    return kTerrainDense;
  }
  if (fraction >= kPeaksLightFrom) {
    return kTerrainLight;
  }
  return 0.0f;
}

void setPeaksColors(FsContext ctx, FsTextureId id) {
  FsColor colors[kTerrainBandCount];
  for (int band = 0; band < kTerrainBandCount; ++band) {
    colors[band] = rgba(0.0f, peaksBandGreen(band), 0.0f, 1.0f);
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, kTerrainBandCount);
}

// Nothing outside the terrain's own area: the screen with that area as a hole is cleared as clearRect does.
static void clearOutsideTerrainArea(NVGcontext* vg, float cx, float cy, float radius, bool isRose) {
  const float screen = 2.0f * kScreenCenterX;
  for (int pass = 0; pass < 2; ++pass) {
    nvgBeginPath(vg);
    nvgRect(vg, 0.0f, 0.0f, screen, screen);
    terrainSubpath(vg, cx, cy, radius, isRose);
    nvgPathWinding(vg, NVG_HOLE);
    nvgFillColor(vg, nvgRGBAf(0.0f, 0.0f, 0.0f, pass == 0 ? 0.0f : 1.0f));
    nvgGlobalCompositeOperation(vg, pass == 0 ? NVG_COPY : NVG_DESTINATION_OUT);
    nvgFill(vg);
  }
}

#ifndef A380X
// The obstacles as terrain: each obstacle cell is put into the density texture at the density of the band its top falls
// in, so the dither below turns it into the same dots as terrain at that height (and it takes that terrain's place).
// Half strength like the terrain and the water, since the texture is added at half strength.
static void drawTerrainObstacles(NVGcontext* vg,
                                 const TerrainBands& bands,
                                 float cx,
                                 float cy,
                                 float radius,
                                 bool isRose,
                                 float headingDegrees) {
  ObstacleBandColor bandColors[kTerrainBandCount];
  for (int band = 0; band < kTerrainBandCount; ++band) {
    float r = 0.0f;
    float g = 0.0f;
    if (bands.peaksMode) {
      g = peaksBandGreen(band);
    } else {
      terrainBandColor(band, bands.gearDown, &r, &g);
    }
    bandColors[band] = ObstacleBandColor{r, g};
  }

  static ThreatRun runs[kObstacleMaxRuns];
  const ObstacleView view{planeCoordinateDegrees("PLANE LATITUDE"),
                          planeCoordinateDegrees("PLANE LONGITUDE"),
                          planeAltitudeFeet(),
                          bands.rangeNm,
                          bands.minFeet,
                          bands.maxFeet,
                          bandColors,
                          kTerrainBandCount};
  const int runCount = collectObstacleRuns(view, runs, kObstacleMaxRuns);
  if (runCount == 0) {
    return;
  }

  // The colours of the bands are few (a handful of densities): one fill per colour.
  ObstacleBandColor drawn[kTerrainBandCount];
  int drawnCount = 0;
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ZERO, NVG_ZERO, NVG_ONE);
  for (int band = 0; band < kTerrainBandCount; ++band) {
    const ObstacleBandColor color = bandColors[band];
    bool seen = false;
    for (int i = 0; i < drawnCount; ++i) {
      seen = seen || (drawn[i].r == color.r && drawn[i].g == color.g);
    }
    if (seen || (color.r == 0.0f && color.g == 0.0f)) {
      continue;
    }
    drawn[drawnCount++] = color;
    nvgBeginPath(vg);
    bool any = false;
    for (int i = 0; i < runCount; ++i) {
      const ObstacleBandColor runColor = bandColors[runs[i].level];
      if (runColor.r != color.r || runColor.g != color.g) {
        continue;
      }
      const ThreatQuad quad = threatRunQuad(runs[i], 0.0, 0.0, view.aircraftLatitude, view.aircraftLongitude, headingDegrees, cx, cy,
                                            radius / bands.rangeNm);
      nvgMoveTo(vg, quad.corners[0].x, quad.corners[0].y);
      for (int corner = 1; corner < 4; ++corner) {
        nvgLineTo(vg, quad.corners[corner].x, quad.corners[corner].y);
      }
      nvgClosePath(vg);
      any = true;
    }
    if (any) {
      nvgFillColor(vg, rgba(encodeSrgb(0.5f * color.r), encodeSrgb(0.5f * color.g), 0.0f, 1.0f));
      nvgFill(vg);
    }
  }

  clearOutsideTerrainArea(vg, cx, cy, radius, isRose);
}
#endif

void drawTerrain(NVGcontext* vg,
                 FsTextureId view,
                 FsTextureId waterView,
                 int patternImage,
                 bool isRose,
                 float headingDegrees,
                 [[maybe_unused]] const TerrainBands& bands) {
  constexpr float kDegToRad = 0.01745329f;
  const float centerYBias = isRose ? kRoseNavCenterYBias : kArcCenterYBias;
  const float radius = isRose ? kRoseNavPixelRadius : kArcPixelRadius;
  const float cx = kScreenCenterX;
  const float cy = kScreenCenterX + centerYBias;

  // The texture is north-up: rotate it about the aircraft by minus the heading.
  // nvgImagePattern rotates about the image's own top-left corner, so that corner
  // is moved to where it lands after the rotation about the aircraft.
  const float angle = -headingDegrees * kDegToRad;
  const float sinA = std::sin(angle);
  const float cosA = std::cos(angle);
  const float originX = cx + (-radius * cosA + radius * sinA);
  const float originY = cy + (-radius * sinA - radius * cosA);

  const float half = encodeSrgb(0.5f);
  const FsColor halfTint = rgba(half, half, half, 1.0f);

  // 1. the density texture at half strength ...
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  NVGpaint terrain = nvgImagePattern(vg, originX, originY, radius * 2.0f, radius * 2.0f, angle, view, 1.0f);
  terrain.innerColor = terrain.outerColor = halfTint;
  nvgFillPaint(vg, terrain);
  nvgFill(vg);

  // ... with the water wiped out of it and blue water dots put in its place: the green and blue channels
  // carry the water's density, which the display colors below turn into cyan-blue.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  NVGpaint water = nvgImagePattern(vg, originX, originY, radius * 2.0f, radius * 2.0f, angle, waterView, 1.0f);
  water.innerColor = water.outerColor = rgba(1.0f, 1.0f, 1.0f, 1.0f);
  nvgFillPaint(vg, water);
  nvgFill(vg);
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  NVGpaint sea = nvgImagePattern(vg, originX, originY, radius * 2.0f, radius * 2.0f, angle, waterView, 1.0f);
  const float waterDensity = encodeSrgb(0.5f * kTerrainWater);
  sea.innerColor = sea.outerColor = rgba(0.0f, waterDensity, waterDensity, 1.0f);
  nvgFillPaint(vg, sea);
  nvgFill(vg);

#ifndef A380X
  drawTerrainObstacles(vg, bands, cx, cy, radius, isRose, headingDegrees);
#endif

  // 2. the dither complement at half strength: the sum passes 1 exactly where density >= threshold.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  const float tile = static_cast<float>(kTerrainPatternCells) * kTerrainDotCellPx;
  NVGpaint dither = nvgImagePattern(vg, 0.0f, 0.0f, tile, tile, 0.0f, patternImage, 1.0f);
  dither.innerColor = dither.outerColor = halfTint;
  nvgFillPaint(vg, dither);
  nvgFill(vg);

  // 3. doubling (dst * (1 + 1)): everything at or above 1 saturates ...
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_DST_COLOR, NVG_ONE, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
  nvgFill(vg);

  // 4. ... and squaring drives everything below 1 to 0.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_DST_COLOR, NVG_ZERO, NVG_ONE);
  for (int i = 0; i < kTerrainSharpenPasses; ++i) {
    terrainPath(vg, cx, cy, radius, isRose);
    nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
    nvgFill(vg);
  }

  // 5. the display colors: red and green channels at the radar's levels, the water's green + blue as cyan-blue.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_SRC_COLOR, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  nvgFillColor(vg, nvgRGBAf(encodeSrgb(kRedLevel), encodeSrgb(kGreenLevel), encodeSrgb(kTerrainWaterBlue), 1.0f));
  nvgFill(vg);

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

// The MAP mode picture (see setMapColors): the view's colours, north-up so rotated by minus the
// heading as the terrain is, added at the radar's levels onto the forward half of the display,
// where the radar scans (the compass disk's top half in ROSE, the arc in ARC).
void drawMapMode(NVGcontext* vg, FsTextureId view, bool isRose, float headingDegrees) {
  constexpr float kDegToRad = 0.01745329f;
  const float centerYBias = isRose ? kRoseNavCenterYBias : kArcCenterYBias;
  const float radius = isRose ? kRoseNavPixelRadius : kArcPixelRadius;
  const float cx = kScreenCenterX;
  const float cy = kScreenCenterX + centerYBias;
  const float angle = -headingDegrees * kDegToRad;
  const float sinA = std::sin(angle);
  const float cosA = std::cos(angle);
  const float originX = cx + (-radius * cosA + radius * sinA);
  const float originY = cy + (-radius * sinA - radius * cosA);

  nvgSave(vg);
  nvgScissor(vg, cx - radius, cy - radius, 2.0f * radius, isRose ? radius : kArcClipBottom - (cy - radius));
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  NVGpaint paint = nvgImagePattern(vg, originX, originY, radius * 2.0f, radius * 2.0f, angle, view, 1.0f);
  paint.innerColor = paint.outerColor = rgba(encodeSrgb(kRedLevel), encodeSrgb(kGreenLevel), 0.0f, 1.0f);
  nvgFillPaint(vg, paint);
  nvgFill(vg);
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

// Design choice: the AVOID TERRAIN crosshatch is two sets of red diagonals, 4 px wide every 16 px, on black. Finer
// lines (2 every 8 px) blended into solid red at the size the ND has in the cockpit view.
constexpr int kThreatHatchPeriodPx = 16;
constexpr int kThreatHatchLinePx = 4;

int createThreatHatchPattern(NVGcontext* vg) {
  constexpr int kSize = kThreatHatchPeriodPx;
  static unsigned char data[kSize * kSize * 4];
  for (int y = 0; y < kSize; ++y) {
    for (int x = 0; x < kSize; ++x) {
      const bool onLine = (x - y + kSize) % kSize < kThreatHatchLinePx || (x + y) % kSize < kThreatHatchLinePx;
      unsigned char* pixel = &data[(y * kSize + x) * 4];
      pixel[0] = onLine ? 255 : 0;
      pixel[1] = 0;
      pixel[2] = 0;
      pixel[3] = 255;
    }
  }
  return nvgCreateImageRGBA(vg, kSize, kSize, NVG_IMAGE_REPEATX | NVG_IMAGE_REPEATY | NVG_IMAGE_NEAREST, data);
}

// The threat areas of the terrain alerts (see threat_areas.h) over the terrain picture: solid yellow for the caution,
// solid red for the warning, the red/black crosshatch for AVOID TERRAIN, in the dense terrain's colours.
void drawThreatAreas(NVGcontext* vg,
                     const ThreatAreaSet& areas,
                     int hatchImage,
                     bool isRose,
                     float headingDegrees,
                     float rangeNm) {
  const float centerYBias = isRose ? kRoseNavCenterYBias : kArcCenterYBias;
  const float radius = isRose ? kRoseNavPixelRadius : kArcPixelRadius;
  const float cx = kScreenCenterX;
  const float cy = kScreenCenterX + centerYBias;
  // The terrain view is centred on the sim's aircraft position, so the areas are too.
  const double latitude = planeCoordinateDegrees("PLANE LATITUDE");
  const double longitude = planeCoordinateDegrees("PLANE LONGITUDE");

  const FsColor yellow = rgba(encodeSrgb(kRedLevel), encodeSrgb(kGreenLevel), 0.0f, 1.0f);
  const FsColor red = rgba(encodeSrgb(kRedLevel), 0.0f, 0.0f, 1.0f);

  // The colours replace the terrain's dots; the alpha is left as the terrain left it, since this surface is added
  // onto the ND (see ndwxr.h).
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ZERO, NVG_ZERO, NVG_ONE);
  for (int i = 0; i < areas.count; ++i) {
    const ThreatQuad quad = threatRunQuad(areas.runs[i], areas.referenceRow, areas.referenceColumn, latitude, longitude,
                                          headingDegrees, cx, cy, radius / rangeNm);
    nvgBeginPath(vg);
    nvgMoveTo(vg, quad.corners[0].x, quad.corners[0].y);
    for (int corner = 1; corner < 4; ++corner) {
      nvgLineTo(vg, quad.corners[corner].x, quad.corners[corner].y);
    }
    nvgClosePath(vg);
    if (quad.level >= 3) {
      const float size = static_cast<float>(kThreatHatchPeriodPx);
      NVGpaint hatch = nvgImagePattern(vg, 0.0f, 0.0f, size, size, 0.0f, hatchImage, 1.0f);
      hatch.innerColor = hatch.outerColor = red;
      nvgFillPaint(vg, hatch);
    } else {
      nvgFillColor(vg, quad.level == 2 ? red : yellow);
    }
    nvgFill(vg);
  }

  clearOutsideTerrainArea(vg, cx, cy, radius, isRose);

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

}  // namespace ndwxr
