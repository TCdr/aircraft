// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The A380X vertical display (VD): the terrain profile and the weather along the vertical cut,
// drawn by the "V" gauge instances (terrain) and the ND instances (weather).

#include "ndwxr.h"

#ifdef A380X
namespace ndwxr {

// How the ND's radar texture maps onto the VD (see kVdColumnTexelPx and drawVdErodedRect):
// along the vertical cut, piece by piece, with the aircraft at the VD's left edge.
struct VdColumns {
  const VdCutSegment* cut;
  int cutCount;
  float headingDeg;   // the radar texture's up: the ND's true heading
  float texelsPerNm;  // ND texels per NM
  float pxPerNm;      // VD pixels per NM along the range axis
  float vdRangeNm;
};

enum class VdPass {
  Yellow,  // precipitation view, R mask (yellow and above)
  Green,   // precipitation view, G mask (green and above)
  Wipe,    // hot view, G mask (red and above): removes the green channel
};

// Blend mode and per-tap tint of one VD pass. gain 1 = one tap is enough, 1/2 = both
// of two taps must agree, 1/3 = all of three (a tap adds / removes that share).
static void setVdPassState(NVGcontext* vg, VdPass pass, float gain, FsColor* tint) {
  const float g = encodeSrgb(gain);
  if (pass == VdPass::Wipe) {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
    *tint = rgba(0.0f, encodeSrgb(1.0f - std::pow(kVdEraseRemainder, gain)), 0.0f, 1.0f);
  } else {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
    *tint = pass == VdPass::Yellow ? rgba(g, 0.0f, 0.0f, 1.0f) : rgba(0.0f, g, 0.0f, 1.0f);
  }
}

// Taps of one column, shifted along the range axis by -depthPx, (0) and +depthPx: all three
// needed (gain 1/3 each) for the column eroded by depthPx to both sides. With only the two outer
// taps, the gap between two separate cells 2 * depthPx apart came out as a phantom slab (a
// "capital" on top of a thin column), so the eroded levels use all three. taps = 2 (only the
// outer two, gain 1/2: the base level, whose shifts are too small for that to matter) or
// taps = 1 (only the middle one, gain 1: no erosion, used by the red wipe). The result is
// clipped to the band [top, bottom] and x in [left, rightLimit]; left must be at least
// kVdLeft + depthPx, so the taps never read the region behind the aircraft.
//
// The column runs along the vertical cut piece by piece, mapped as drawVdTerrain's stripe
// does (a screen-space scissor to the piece's share of the range axis, then a transform
// that stretches the texel column beside the piece over the plot height): the radar
// texture is heading-up, so a piece's direction in it is its track minus the heading, and
// its start is taken forward and right of the aircraft. The image is extended beyond the
// piece's ends by the taps' shift, so a shifted tap still covers the piece.
static void drawVdErodedRect(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float lateralTexels, float depthPx,
                      int taps, float left, float rightLimit, float top, float bottom) {
  if (bottom <= top || rightLimit <= left) {
    return;
  }
  FsColor tint;
  setVdPassState(vg, pass, 1.0f / static_cast<float>(taps), &tint);
  const float centerY = kVdTop + 0.5f * kVdHeight;
  const float halfTexels = 0.5f * static_cast<float>(kTextureSize);
  const float pxPerTexel = c.pxPerNm / c.texelsPerNm;
  const float headingRad = c.headingDeg * kDegToRadF;
  const float sinH = std::sin(headingRad);
  const float cosH = std::cos(headingRad);
  const float extendTexels = depthPx / pxPerTexel + 2.0f;
  for (int p = 0; p < c.cutCount; ++p) {
    const VdCutSegment& s = c.cut[p];
    const float x0 = kVdLeft + s.startNm * c.pxPerNm;
    const float x1 = std::fmin(kVdLeft + (s.startNm + s.lengthNm) * c.pxPerNm, rightLimit);
    if (x0 >= rightLimit) {
      break;
    }
    const float clipLeft = std::fmax(x0, left);
    if (x1 <= clipLeft) {
      continue;
    }
    const float angle = -(s.trackDeg - c.headingDeg) * kDegToRadF;
    const float sinA = std::sin(angle);
    const float cosA = std::cos(angle);
    const float originX = -halfTexels * cosA + halfTexels * sinA;
    const float originY = -halfTexels * sinA - halfTexels * cosA;
    const float forwardNm = s.startNorthNm * cosH + s.startEastNm * sinH;
    const float rightNm = s.startEastNm * cosH - s.startNorthNm * sinH;
    const float ux = rightNm * c.texelsPerNm;
    const float uy = -forwardNm * c.texelsPerNm;
    const float vx = ux * cosA - uy * sinA;
    const float vy = ux * sinA + uy * cosA;
    const float lengthTexels = s.lengthNm * c.texelsPerNm;
    for (int i = -1; i <= 1; ++i) {
      if ((taps == 2 && i == 0) || (taps == 1 && i != 0)) {
        continue;
      }
      nvgSave(vg);
      nvgScissor(vg, clipLeft, top, x1 - clipLeft, bottom - top);
      nvgTransform(vg, 0.0f, kVdColumnTexelPx, -pxPerTexel, 0.0f, x0 + pxPerTexel * vy + static_cast<float>(i) * depthPx,
                   centerY - kVdColumnTexelPx * (vx + lateralTexels));
      nvgBeginPath(vg);
      nvgRect(vg, vx + lateralTexels - 0.05f, vy - lengthTexels - extendTexels, 0.1f, lengthTexels + 2.0f * extendTexels);
      NVGpaint paint =
          nvgImagePattern(vg, originX, originY, static_cast<float>(kTextureSize), static_cast<float>(kTextureSize), angle, view, 1.0f);
      paint.innerColor = paint.outerColor = tint;
      nvgFillPaint(vg, paint);
      nvgFill(vg);
      nvgRestore(vg);
    }
  }
}

// Level 0 of a shape: the columns of the wedge (see kVdWedgeTan) drawn on top of each other
// (a union), each clipped to the band and to the range where it lies inside the wedge.
static void drawVdUnion(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float top, float bottom, float rightLimit) {
  if (bottom <= top) {
    return;
  }
  nvgSave(vg);
  const float halfTexture = 0.5f * static_cast<float>(kTextureSize);
  for (int k = -kVdLateralTapsPerSide; k <= kVdLateralTapsPerSide; ++k) {
    const float lateralNm = static_cast<float>(k) * c.vdRangeNm * kVdWedgeTan / static_cast<float>(kVdLateralTapsPerSide);
    const float texels = lateralNm * c.texelsPerNm;
    if (std::fabs(texels) > 0.98f * halfTexture) {
      continue;  // outside the radar texture
    }
    const int absK = k < 0 ? -k : k;
    const float entry = kVdLeft + static_cast<float>(absK) / static_cast<float>(kVdLateralTapsPerSide) * kVdWidth;
    drawVdErodedRect(vg, view, c, pass, texels, kVdSpeckPx, 2, entry + kVdSpeckPx, rightLimit, top, bottom);
  }
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

// A further level of a shape: the heading-line column only, eroded by depthPx.
static void drawVdEroded(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float depthPx, float top, float bottom,
                  float rightLimit) {
  if (bottom <= top) {
    return;
  }
  nvgSave(vg);
  drawVdErodedRect(vg, view, c, pass, 0.0f, depthPx, 3, kVdLeft + depthPx, rightLimit, top, bottom);
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

// Draws the stylised VD weather (see kVdGreenTopSpan) along the vertical cut. ndRadiusNm is
// the radius the ND's radar views were set to; vdRangeNm the VD's range; headingDeg the radar
// texture's up (the ND's true heading); baroAltFeet the aircraft's altitude on the VD's scale
// (the ADR's baro-corrected altitude, like the VD's own symbol).
void drawVdWeather(NVGcontext* vg, FsTextureId precipView, FsTextureId hotView, bool hotReady, float ndRadiusNm, float vdRangeNm,
                   const VdCutSegment* cut, int cutCount, float headingDeg, double baroAltFeet, double lowerFeet, double upperFeet) {
  VdColumns c;
  c.cut = cut;
  c.cutCount = cutCount;
  c.headingDeg = headingDeg;
  c.texelsPerNm = 0.5f * static_cast<float>(kTextureSize) / ndRadiusNm;
  c.pxPerNm = kVdWidth / vdRangeNm;
  c.vdRangeNm = vdRangeNm;

  const float plotBottom = kVdTop + kVdHeight;
  const float right = kVdLeft + kVdWidth;
  const float spanFt = static_cast<float>(upperFeet - lowerFeet);
  const float feetPerVdPx = spanFt / kVdHeight;
  // Screen y of an altitude given relative to the aircraft's, clamped to the plot.
  auto altToY = [&](float aboveAircraftFt) {
    const float y = kVdTop + static_cast<float>(upperFeet - baroAltFeet - static_cast<double>(aboveAircraftFt)) / feetPerVdPx;
    return std::fmin(std::fmax(y, kVdTop), plotBottom);
  };
  // The columns stand on the ground: from sea level when the plot reaches below it.
  const float bottom = altToY(-static_cast<float>(baroAltFeet));

  // A column's shape, level by level (see kVdColumnDome): from the bottom up to the level's
  // height, the levels spread from baseFt to topFt (relative to the aircraft). Every level
  // draws only the band of height between the previous level's height and its own (plus the
  // overlap).
  auto drawColumn = [&](FsTextureId view, VdPass pass, float baseFt, float topFt, float rightLimit) {
    float previousFt = baseFt;
    for (int i = 0; i < kVdColumnDomeCount; ++i) {
      const float h = baseFt + (topFt - baseFt) * kVdColumnDome[i].heightFraction;
      if (i == 0) {
        drawVdUnion(vg, view, c, pass, altToY(h), bottom, rightLimit);
      } else {
        // The band above the previous level's height (skipped when it lies outside the plot).
        const float top = altToY(h);
        const float lower = altToY(previousFt);
        if (lower > top) {
          drawVdEroded(vg, view, c, pass, kVdColumnDome[i].depthPx, top, std::fmin(lower + kVdBandOverlapPx, bottom), rightLimit);
        }
      }
      previousFt = h;
    }
  };

  drawColumn(precipView, VdPass::Yellow, 0.0f, kVdYellowTopSpan * spanFt, right);
  drawColumn(precipView, VdPass::Green, 0.0f, kVdGreenTopSpan * spanFt, right);

  nvgSave(vg);
  nvgScissor(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  sharpenRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight, kVdSharpenPasses);
  colorizeRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  nvgRestore(vg);

  if (hotReady) {
    // The red core: the heading-line column's hot mask wipes the green out of the yellow over
    // the block +-kVdRedHalfSpan around the aircraft's altitude (not eroded, see the note on kVdColumnDome).
    const float redHalfFt = kVdRedHalfSpan * spanFt;
    if (altToY(-redHalfFt) > altToY(redHalfFt)) {
      nvgSave(vg);
      drawVdErodedRect(vg, hotView, c, VdPass::Wipe, 0.0f, 0.0f, 1, kVdLeft, right, altToY(redHalfFt), altToY(-redHalfFt));
      nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
      nvgRestore(vg);
    }
  }
}

// The cut along the published flight plan: from the aircraft's projection onto it forward, as far as
// rangeNm. Returns the number of pieces, 0 when the cut is not along the plan (mode 0, too few
// vertices, or the aircraft is not on the plan).
int buildVdPlanCut(float aircraftLat, float aircraftLon, float rangeNm, VdCutSegment* out) {
  if (g_vdCutMode.read() != 1.0) {
    return 0;
  }
  int count = static_cast<int>(g_vdCutCount.read());
  if (count > kVdCutMaxVertices) {
    count = kVdCutMaxVertices;
  }
  if (count < 2) {
    return 0;
  }
  // The vertices in NM east / north of the aircraft (a flat earth around it; the cut is at most 160 NM long).
  const float nmPerDegreeLon = 60.0f * std::cos(aircraftLat * kDegToRadF);
  float east[kVdCutMaxVertices];
  float north[kVdCutMaxVertices];
  for (int i = 0; i < count; ++i) {
    float dLon = static_cast<float>(get_named_variable_value(g_vdCutLonVars[i])) - aircraftLon;
    if (dLon > 180.0f) {
      dLon -= 360.0f;
    } else if (dLon < -180.0f) {
      dLon += 360.0f;
    }
    east[i] = dLon * nmPerDegreeLon;
    north[i] = (static_cast<float>(get_named_variable_value(g_vdCutLatVars[i])) - aircraftLat) * 60.0f;
  }
  // The aircraft's projection onto the plan: the first piece it is close to.
  int first = -1;
  float firstT = 0.0f;
  for (int i = 0; i + 1 < count; ++i) {
    const float dx = east[i + 1] - east[i];
    const float dy = north[i + 1] - north[i];
    const float length2 = dx * dx + dy * dy;
    if (length2 < 1e-4f) {
      continue;
    }
    float t = -(east[i] * dx + north[i] * dy) / length2;
    t = t < 0.0f ? 0.0f : (t > 1.0f ? 1.0f : t);
    const float px = east[i] + t * dx;
    const float py = north[i] + t * dy;
    if (std::sqrt(px * px + py * py) <= kVdCutMaxCrossTrackNm) {
      first = i;
      firstT = t;
      break;
    }
  }
  if (first < 0) {
    return 0;
  }
  int n = 0;
  float along = 0.0f;
  for (int i = first; i + 1 < count && n < kVdCutMaxSegments; ++i) {
    const float dx = east[i + 1] - east[i];
    const float dy = north[i + 1] - north[i];
    const float length = std::sqrt(dx * dx + dy * dy);
    if (length < 0.01f) {
      continue;
    }
    const float t0 = i == first ? firstT : 0.0f;
    VdCutSegment& s = out[n++];
    s.startEastNm = east[i] + t0 * dx;
    s.startNorthNm = north[i] + t0 * dy;
    s.trackDeg = std::atan2(dx, dy) / kDegToRadF;
    s.lengthNm = length * (1.0f - t0);
    s.startNm = along;
    along += s.lengthNm;
    if (along >= rangeNm) {
      break;
    }
  }
  return n;
}

// The color list of the VD terrain view: entry 0 is the water (B channel only, which takes
// no part in the compare: the engine gives water the first entry whatever its height, and
// the range is set so that no land reaches that entry), entries 1 .. kVdTerrainSteps - 1 are terrain above the top of
// the plot (full brightness), the rest the plot from its top down, brightness
// 2 - (k + 0.5) / kVdTerrainSteps in R and G.
static void setVdTerrainList(FsContext ctx, FsTextureId id) {
  FsColor colors[kVdTerrainListSize];
  colors[0] = rgba(0.0f, 0.0f, 1.0f, 1.0f);
  for (int k = 1; k < kVdTerrainListSize; ++k) {
    const float fraction = 2.0f - (static_cast<float>(k) + 0.5f) / static_cast<float>(kVdTerrainSteps);
    const float brightness = std::fmin(fraction, 1.0f);
    colors[k] = rgba(brightness, brightness, 0.0f, 1.0f);
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, static_cast<unsigned>(kVdTerrainListSize));
}

bool configureVdTerrainView(FsContext ctx, FsTextureId id) {
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
  fsMapViewSetAltitudeRangeInFeet(ctx, id, -40000.0, 20000.0);  // replaced every frame
  setVdTerrainList(ctx, id);
  return true;
}

// The complement (1 - threshold) of the ramp, top to bottom: 0 at the top of the plot,
// about 1 at the bottom.
static int createVdRamp(NVGcontext* vg) {
  constexpr int kRampWidth = 4;
  static unsigned char data[kRampWidth * kVdRampRows * 4];
  for (int row = 0; row < kVdRampRows; ++row) {
    const float complement = (1.0f - kVdRampFloor) * static_cast<float>(row) / static_cast<float>(kVdRampRows - 1);
    // The image is sampled as sRGB (decoded to linear), while the view's list brightness arrives linear:
    // measured in-sim (KASE, 2026-09-23) with a raw ramp the profile sat at 27 % of the plot where the
    // terrain was at 50 %, exactly the sRGB curve. So the complement is stored encoded, and the compare
    // (list brightness >= 1 - complement) is linear again.
    const unsigned char value = static_cast<unsigned char>(encodeSrgb(complement) * 255.0f + 0.5f);
    for (int x = 0; x < kRampWidth; ++x) {
      unsigned char* pixel = &data[(row * kRampWidth + x) * 4];
      pixel[0] = value;
      pixel[1] = value;
      pixel[2] = value;
      pixel[3] = 255;
    }
  }
  return nvgCreateImageRGBA(vg, kRampWidth, kVdRampRows, 0, data);
}

static void drawVdTerrain(NVGcontext* vg, FsTextureId terrainView, FsTextureId waterView, int rampImage, float vdRangeNm, const VdCutSegment* cut,
                   int cutCount, float cutHalfWidthNm, float greyFromNm, double lowerFeet, double upperFeet) {
  const float vdBottom = kVdTop + kVdHeight;
  const float vdRight = kVdLeft + kVdWidth;
  const float centerY = kVdTop + 0.5f * kVdHeight;
  // The views' north-up texture: 768 texels across 2 * vdRangeNm, the aircraft at its centre.
  const float halfTexels = 0.5f * static_cast<float>(kTextureSize);
  const float texelsPerNm = halfTexels / vdRangeNm;
  const float pxPerNm = kVdWidth / vdRangeNm;  // along the range axis
  const float pxPerTexel = pxPerNm / texelsPerNm;

  // One view's column along the cut, stretched over the plot height, piece by piece. For a
  // piece the texture is rotated by minus the piece's track about the aircraft (nvgImagePattern
  // rotates about the image's top-left corner, so that corner is moved to where it lands;
  // pattern units are texels), which makes "along the piece" -y; the piece's start S is then
  // mapped to screen x = kVdLeft + its distance along the cut, and screen y = centerY +
  // kVdColumnTexelPx * (x - S.x - lateral), so only the column lateral texels beside the piece
  // covers the plot and its neighbours are thousands of pixels away. Clipped to the piece's
  // share of the range axis and to [top, top + height] by a screen-space scissor.
  auto stripe = [&](FsTextureId view, const FsColor& tint, float top, float height, float lateralNm) {
    const float lateralTexels = lateralNm * texelsPerNm;
    for (int i = 0; i < cutCount; ++i) {
      const VdCutSegment& s = cut[i];
      const float x0 = kVdLeft + s.startNm * pxPerNm;
      const float x1 = std::fmin(kVdLeft + (s.startNm + s.lengthNm) * pxPerNm, vdRight);
      if (x0 >= vdRight) {
        break;
      }
      if (x1 <= x0) {
        continue;
      }
      const float angle = -s.trackDeg * kDegToRadF;
      const float sinA = std::sin(angle);
      const float cosA = std::cos(angle);
      const float originX = -halfTexels * cosA + halfTexels * sinA;
      const float originY = -halfTexels * sinA - halfTexels * cosA;
      // The piece's start in the rotated frame (north-up texels: x east, y south, then rotated).
      const float ux = s.startEastNm * texelsPerNm;
      const float uy = -s.startNorthNm * texelsPerNm;
      const float vx = ux * cosA - uy * sinA;
      const float vy = ux * sinA + uy * cosA;
      const float lengthTexels = s.lengthNm * texelsPerNm;
      nvgSave(vg);
      nvgScissor(vg, x0, top, x1 - x0, height);
      nvgTransform(vg, 0.0f, kVdColumnTexelPx, -pxPerTexel, 0.0f, x0 + pxPerTexel * vy, centerY - kVdColumnTexelPx * (vx + lateralTexels));
      nvgBeginPath(vg);
      nvgRect(vg, vx + lateralTexels - 0.05f, vy - lengthTexels - 2.0f, 0.1f, lengthTexels + 4.0f);
      NVGpaint paint =
          nvgImagePattern(vg, originX, originY, static_cast<float>(kTextureSize), static_cast<float>(kTextureSize), angle, view, 1.0f);
      paint.innerColor = paint.outerColor = tint;
      nvgFillPaint(vg, paint);
      nvgFill(vg);
      nvgRestore(vg);
    }
  };
  auto plotRect = [&]() {
    nvgBeginPath(vg);
    nvgRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  };

  // R and G only: the B channel is the water's (see setVdTerrainList), it takes no part in the compare.
  const float half = encodeSrgb(0.5f);
  const FsColor halfTint = rgba(half, half, 0.0f, 1.0f);

  nvgSave(vg);
  nvgScissor(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);

  // The profile is the highest terrain across the width of the cut: the union of kVdCutTaps
  // columns spread over it. Each tap runs the compare on its own - 1. its elevation-coded
  // column at half strength, 2. the ramp's complement at half strength (the sum passes 1 where
  // brightness >= ramp), 3. doubling, 4. squaring (as for the terrain dots) - which leaves 0 or
  // 1, and a pixel lit by an earlier tap saturates and stays lit. Water has no elevation in
  // R and G, so no bar.
  for (int tap = 0; tap < kVdCutTaps; ++tap) {
    const float lateralNm =
        kVdCutTaps > 1 ? (2.0f * static_cast<float>(tap) / static_cast<float>(kVdCutTaps - 1) - 1.0f) * cutHalfWidthNm : 0.0f;
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
    stripe(terrainView, halfTint, kVdTop, kVdHeight, lateralNm);
    plotRect();
    NVGpaint ramp = nvgImagePattern(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight, 0.0f, rampImage, 1.0f);
    ramp.innerColor = ramp.outerColor = halfTint;
    nvgFillPaint(vg, ramp);
    nvgFill(vg);
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_DST_COLOR, NVG_ONE, NVG_ZERO, NVG_ONE);
    plotRect();
    nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
    nvgFill(vg);
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_DST_COLOR, NVG_ZERO, NVG_ONE);
    for (int i = 0; i < kVdTerrainSharpenPasses; ++i) {
      plotRect();
      nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
      nvgFill(vg);
    }
  }

  // 5. the brown of the real VD's terrain, a little lighter at the top (no blue: the B channel is
  // the water's).
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_SRC_COLOR, NVG_ZERO, NVG_ONE);
  plotRect();
  nvgFillPaint(vg, nvgLinearGradient(vg, 0.0f, kVdTop, 0.0f, vdBottom, nvgRGBAf(0.62f, 0.29f, 0.0f, 1.0f), nvgRGBAf(0.42f, 0.19f, 0.0f, 1.0f)));
  nvgFill(vg);
  nvgRestore(vg);

  // 6. the water (the water mask view, along the centre of the cut): a flat area from sea level
  // down to the bottom of the plot, in the ND's water colour (drawTerrain: the water's density
  // through the display's green level and kTerrainWaterBlue).
  if (waterView != 0 && lowerFeet < 0.0) {
    const float feetPerPx = static_cast<float>(upperFeet - lowerFeet) / kVdHeight;
    const float seaY = std::fmin(std::fmax(kVdTop + static_cast<float>(upperFeet) / feetPerPx, kVdTop), vdBottom);
    if (seaY < vdBottom) {
      const float waterDensity = 0.5f * kTerrainWater;
      const FsColor waterTint = rgba(0.0f, encodeSrgb(waterDensity * kGreenLevel), encodeSrgb(waterDensity * kTerrainWaterBlue), 1.0f);
      nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
      stripe(waterView, waterTint, seaY, vdBottom - seaY, 0.0f);
    }
  }

  // 7. the grey area: from the next track change of more than 3 degrees to the end of the
  // range, the terrain is no longer the one ahead of the aircraft (only along the flight plan).
  if (greyFromNm >= 0.0f && greyFromNm < vdRangeNm) {
    const float greyLeft = kVdLeft + greyFromNm * pxPerNm;
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
    nvgBeginPath(vg);
    nvgRect(vg, greyLeft, kVdTop, vdRight - greyLeft, kVdHeight);
    nvgFillColor(vg, nvgRGBAf(0.22f, 0.22f, 0.22f, 1.0f));
    nvgFill(vg);
  }

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

// One frame of a VD terrain gauge instance.
void drawVdTerrainGauge(FsContext ctx, Instance& instance, const sGaugeDrawData* drawData) {
  bool show = false;
  float vdRangeNm = 10.0f;
  float aircraftLat = 0.0f;
  float aircraftLon = 0.0f;
  float trackDegrees = 0.0f;
  double lowerFeet = 0.0;
  double upperFeet = 0.0;
  double altitudeFeet = 0.0;

  if (isPowered(instance)) {
    const double ndMode = get_named_variable_value(instance.ndModeVar);
    const int ir = inertialSource(instance.isRight, static_cast<int>(g_attHdgKnob.read()));
    const auto latWord = types::Arinc429Word<float>::fromSimVar(g_adirsLat[ir - 1].read());
    const auto lonWord = types::Arinc429Word<float>::fromSimVar(g_adirsLon[ir - 1].read());
    const auto headingWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueHeading[ir - 1].read());
    // The cut along the track follows the IR's true track; the heading stands in while it is not valid (standing still).
    const auto trackWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueTrack[ir - 1].read());
    const int rangeIndex = static_cast<int>(get_named_variable_value(instance.ndRangeVar));
    const float rangeNm = kRangeTableNm[rangeIndex >= 0 && rangeIndex < kRangeCount ? rangeIndex : 0];
    const bool isRoseNav = ndMode == kNdModeRoseNav;
    vdRangeNm = isRoseNav ? std::fmin(std::fmax(rangeNm / 2.0f, 5.0f), 160.0f) : std::fmin(std::fmax(rangeNm, 10.0f), 160.0f);
    aircraftLat = latWord.value();
    aircraftLon = lonWord.value();
    trackDegrees = trackWord.isNo() ? trackWord.value() : headingWord.value();
    lowerFeet = get_named_variable_value(instance.vdRangeLowerVar);
    upperFeet = get_named_variable_value(instance.vdRangeUpperVar);

    // The VD is there on the ARC and ROSE NAV pages; its terrain needs a TAWS system that has not
    // failed and the TERR SYS button of the SURV page not to be OFF (EfisTawsBridge, VerticalDisplay.tsx).
    show = instance.mapViewVdTerrainReady && isArcOrRoseNav(ndMode) && rangeNm > 0.0f && latWord.isNo() && lonWord.isNo() &&
           headingWord.isNo() && upperFeet > lowerFeet && terrainSystemUp() && g_terrSysOff.read() == 0.0;
  }

  // The views run all the time; their settings only follow the aircraft while the VD shows, so its first frames are not drawn.
  instance.vdShowFrames = show ? instance.vdShowFrames + 1 : 0;
  const bool draw = show && instance.vdShowFrames > kVdWarmupFrames;

  if (show) {
    // The engine colors by ITS OWN (true) altitude minus the terrain height, v = true - E. The VD's
    // scale and its aircraft mock-up are the ADR's BARO altitude (VerticalDisplay.tsx), and the real VD
    // places the terrain under the mock-up by the TRUE height (FCOM DSC-31-20-40-10, terrain profile:
    // "the elevation between the terrain and the aircraft is the true height ... only the terrain
    // altitude value retrieved on the vertical scale may not be correct"). With the range set to
    // [baro - upper, baro - lower] a texel's height fraction is (E + baro - true - lower) / span: the
    // terrain is drawn at E + (baro - true) on the baro scale, i.e. the gap under the mock-up (at baro)
    // is true - E, the true height. The true altitude is only the fallback while the ADR word is not
    // valid (then the terrain lands at its real elevation on the scale instead). The range reaches one
    // plot span above the plot's top for the list's full-brightness entries (see setVdTerrainList).
    const int adr = airDataSource(instance.isRight, static_cast<int>(g_airDataKnob.read()));
    const auto baroAltWord =
        types::Arinc429Word<float>::fromSimVar(instance.isRight ? g_adrBaroAlt2[adr - 1].read() : g_adrBaroAlt1[adr - 1].read());
    altitudeFeet = baroAltWord.isNo() ? static_cast<double>(baroAltWord.value()) : planeAltitudeFeet();
    fsMapViewSetAltitudeRangeInFeet(ctx, instance.mapViewVdTerrain, altitudeFeet - upperFeet - (upperFeet - lowerFeet), altitudeFeet - lowerFeet);
    fsMapViewSet2DViewRadiusInMeters(ctx, instance.mapViewVdTerrain, vdRangeNm * kNmToMetres);
    if (instance.mapViewVdWaterReady) {
      fsMapViewSet2DViewRadiusInMeters(ctx, instance.mapViewVdWater, vdRangeNm * kNmToMetres);
    }
  }

  if (!draw && !instance.layerDirty) {
    return;
  }

  const float winWidth = static_cast<float>(drawData->winWidth);
  const float winHeight = static_cast<float>(drawData->winHeight);
  const float ratio = static_cast<float>(drawData->fbWidth) / static_cast<float>(drawData->fbHeight);
  NVGcontext* vg = instance.nvg;
  nvgBeginFrame(vg, winWidth, winHeight, ratio);
  if (instance.layerDirty) {
    clearLayer(vg, winWidth, winHeight);
  }
  if (draw) {
    if (instance.vdRampImage == 0) {
      instance.vdRampImage = createVdRamp(vg);
    }
    if (instance.vdRampImage != 0) {
      // The cut: along the flight plan when one is published and the aircraft is on it, else along the track.
      VdCutSegment cut[kVdCutMaxSegments];
      int cutCount = buildVdPlanCut(aircraftLat, aircraftLon, vdRangeNm, cut);
      float greyFromNm = -1.0f;
      if (cutCount > 0) {
        greyFromNm = static_cast<float>(g_vdCutTrackChangeNm.read());
      } else {
        cut[0] = VdCutSegment{0.0f, 0.0f, trackDegrees, vdRangeNm, 0.0f};
        cutCount = 1;
      }
      const float cutHalfWidthNm = altitudeFeet >= static_cast<double>(kVdCutEnrouteFeet) ? kVdCutEnrouteHalfWidthNm : kVdCutTerminalHalfWidthNm;
      drawVdTerrain(vg, instance.mapViewVdTerrain, instance.mapViewVdWaterReady ? instance.mapViewVdWater : 0, instance.vdRampImage, vdRangeNm,
                    cut, cutCount, cutHalfWidthNm, greyFromNm, lowerFeet, upperFeet);
    }
  }
  instance.layerDirty = draw;
  nvgEndFrame(vg);
}
}  // namespace ndwxr
#endif
