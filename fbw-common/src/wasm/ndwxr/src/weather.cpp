// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The weather radar picture: the two radar MapViews (precipitation and "hot"), the ARC page area
// and the blend passes that turn the colour-channel masks into the band colours.

#include "ndwxr.h"

namespace ndwxr {

// Shared MapView setup for the precipitation view and the hot view.
static bool configureRadarView(FsContext ctx, FsTextureId id, FsRainRateColor* colors, unsigned colorCount, FsMapViewWeatherRadarMode mode) {
  if (id == 0) {
    return false;
  }
  // CONFIRMED (in-sim, 2026-09-18): fsMapViewSetVisibility is NOT an
  // independent "base layer only" toggle - it's a master switch for the whole
  // map view, weather radar included. Setting it false left the render target
  // with no real content, and our own draw call painted that as a solid white
  // square instead of weather. Keep it true whenever the view is drawn.
  fsMapViewSetVisibility(ctx, id, true);
#ifdef A380X
  // The A380X's ND views switch between this and the terrain (an altitude view).
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_AERIAL);
#endif
  // Alpha in the background color / first band does NOT make the texture
  // transparent (it comes out opaque black regardless) - transparency is
  // handled by the additive blend in drawWeatherRect instead.
  fsMapViewSetBackgroundColor(ctx, id, rgba(0.0f, 0.0f, 0.0f, 0.0f));
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);

  fsMapViewSetWeatherRadarVisibility(ctx, id, true);
  fsMapViewSetWeatherRadarMode(ctx, id, mode);
  // The engine's radar sweeps a beam around (default 12 RPM, kept) and fills in
  // each sector as it passes, so right after a range/mode change - and between
  // the two independent MapViews - the image is briefly only partly built.
  // fsMapViewSetWeatherRadarScanRate changes that, but only exists in newer SDKs
  // than the build container's (it would need a hand-written extern "C"
  // declaration, and a game without it would fail to load this module); in-sim
  // 60 RPM was visibly far too fast.
  // fsMapViewSetWeatherRadarStabilization is not called either: per the SDK docs
  // the beam is already stabilized in pitch and bank by default (it stays level
  // in turns), so there is nothing to set.
  fsMapViewSetWeatherRadarConeAngleInRadians(ctx, id, kRadarConeDegrees * kDegToRadF);
  fsMapViewSetWeatherRadarRainColors(ctx, id, colors, colorCount);
  return true;
}

void arcAreaPath(NVGcontext* vg, float cx, float cy, float radius, float sweepFraction) {
  constexpr float kPi = 3.14159265f;
  nvgBeginPath(vg);
  if (sweepFraction < 1.0f) {
    nvgMoveTo(vg, cx, cy);
    nvgArc(vg, cx, cy, radius, kPi, kPi + kPi * std::fmax(sweepFraction, 0.0f), NVG_CW);
    nvgClosePath(vg);
    return;
  }
  const float dy = cy - kArcCornerTop;
  const bool cutCorner = radius > dy && cx + std::sqrt(radius * radius - dy * dy) > kArcCornerLeft;
  if (!cutCorner) {
    nvgCircle(vg, cx, cy, radius);
    return;
  }
  // Where the arc crosses the right corner's top edge, as an angle of the CW sweep from the left.
  const float cutAngle = 2.0f * kPi - std::asin(dy / radius);
  nvgMoveTo(vg, cx - radius, cy);
  nvgArc(vg, cx, cy, radius, kPi, cutAngle, NVG_CW);
  nvgLineTo(vg, kArcCornerLeft, kArcCornerTop);
  nvgLineTo(vg, kArcNotchRightX, kArcNotchRightY);
  nvgLineTo(vg, kArcNotchRightX, kArcClipBottom);
  if (kArcNotchLeftY > kArcClipBottom) {
    // The left notch's corner lies below the area's bottom: the diagonal up to the left corner
    // is entered where it crosses the bottom.
    const float t = (kArcNotchLeftY - kArcClipBottom) / (kArcNotchLeftY - kArcLeftCornerY);
    nvgLineTo(vg, kArcNotchLeftX + t * (kArcLeftCornerX - kArcNotchLeftX), kArcClipBottom);
  } else {
    nvgLineTo(vg, kArcNotchLeftX, kArcClipBottom);
    nvgLineTo(vg, kArcNotchLeftX, kArcNotchLeftY);
  }
  nvgLineTo(vg, kArcLeftCornerX, kArcLeftCornerY);
  nvgClosePath(vg);
}

// Draws the weather image for one mode. rangeFraction < 1 restricts the image to a
// circle of that fraction of the full radius (used to limit turbulence to
// kTurbulenceMaxRangeNm); sweepFraction < 1 restricts it to the sector swept so far
// while the radar's buffer fills (from the left edge clockwise, see
// kWxrBufferFillSeconds). channels selects which of the view's mask channels the pass
// uses.
void drawWeatherRect(NVGcontext* vg, FsTextureId mapView, bool isRose, float rangeFraction, WeatherPass pass,
                     Channels channels, float sweepFraction) {
  // The three ROSE pages share one compass rose (RoseModeUnderlay.tsx, R = 250).
  const float centerYBias = isRose ? kRoseNavCenterYBias : kArcCenterYBias;
  const float pixelRadius = isRose ? kRoseNavPixelRadius : kArcPixelRadius;
  const float cx = kScreenCenterX;
  const float cy = kScreenCenterX + centerYBias;
  const float left = cx - pixelRadius;
  const float top = cy - pixelRadius;
  const float size = pixelRadius * 2.0f;

  // CONFIRMED (in-sim): MSFS's native cone-angle clip cannot be trusted. It did
  // not hold at ROSE_NAV's tighter zoom (2026-09-18: an unclipped, near-
  // omnidirectional sweep), and later it stopped holding in ARC too (2026-09-19:
  // weather behind the aircraft, showing through the TA ONLY box and the VD, with
  // nothing changed on our side). So the draw is restricted to the top (forward)
  // half of the bounding square - the aircraft is at its centre - via a plain
  // rectangular nvgScissor, in both modes; simple/safe, scoped by nvgSave/nvgRestore.
  nvgSave(vg);
  nvgScissor(vg, left, top, size, isRose ? pixelRadius : kArcClipBottom - top);

  if (pass == WeatherPass::Sharpen || pass == WeatherPass::Colorize) {
    if (pass == WeatherPass::Sharpen) {
      sharpenRect(vg, left, top, size, size);
    } else {
      colorizeRect(vg, left, top, size, size);
    }
    nvgRestore(vg);
    return;
  }

  // The area a textured pass covers: the compass disk (the display's range circle) or a
  // smaller circle, cut down to the sector swept so far. Always a circle, never the whole
  // rect (a view that paints the corners of its texture would show as weather outside the
  // compass arc, as the former top view did in-sim, 2026-09-22).
  auto area = [&]() {
    const float radius = pixelRadius * std::fmin(rangeFraction, 1.0f);
    if (!isRose) {
      // ARC: the ND's map area (see arcAreaPath), the scissor above cuts the rest.
      arcAreaPath(vg, cx, cy, radius, sweepFraction);
      return;
    }
    nvgBeginPath(vg);
    if (sweepFraction >= 1.0f) {
      nvgCircle(vg, cx, cy, radius);
    } else {
      constexpr float kPi = 3.14159265f;
      nvgMoveTo(vg, cx, cy);
      nvgArc(vg, cx, cy, radius, kPi, kPi + kPi * std::fmax(sweepFraction, 0.0f), NVG_CW);
      nvgClosePath(vg);
    }
  };

  if (pass == WeatherPass::Erase) {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
  } else {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  }

  // Per-tap strength (see kSmoothingGrid), as a LINEAR fraction, passed to the
  // engine encoded (see encodeSrgb). Additive taps sum to kPrecipGain at full
  // coverage; erase taps multiply, so each one removes 1 - remainder^(gain/taps)
  // and a marker covering 1/gain of the taps already leaves only kEraseRemainder.
  const float tapWeight = 1.0f / static_cast<float>(kSmoothingGrid * kSmoothingGrid);
  float strength = encodeSrgb(kPrecipGain * tapWeight);
  if (pass == WeatherPass::AdditiveMagenta) {
    // Standard NanoVG multiplies the sampled texture by the paint's inner color, so
    // the marker's channels come out magenta (R and B, or B alone where R is already
    // there from the yellow mask, see configureHotView). The taps sum to
    // kTurbulenceGain at full coverage and the blend clamps at pure magenta.
    strength = encodeSrgb(kTurbulenceGain * tapWeight);
  } else if (pass == WeatherPass::Erase) {
    strength = encodeSrgb(1.0f - std::pow(kEraseRemainder, kTurbulenceGain * tapWeight));
  }
  const FsColor tint = rgba(strength * channels.r, strength * channels.g, strength * channels.b, 1.0f);

  for (int iy = 0; iy < kSmoothingGrid; ++iy) {
    for (int ix = 0; ix < kSmoothingGrid; ++ix) {
      const float dx = (static_cast<float>(ix) - 0.5f * static_cast<float>(kSmoothingGrid - 1)) * kSmoothingSpacingPx;
      const float dy = (static_cast<float>(iy) - 0.5f * static_cast<float>(kSmoothingGrid - 1)) * kSmoothingSpacingPx;

      area();
      NVGpaint paint = nvgImagePattern(vg, left + dx, top + dy, size, size, 0.0f, mapView, 1.0f);
      paint.innerColor = paint.outerColor = tint;
      nvgFillPaint(vg, paint);
      nvgFill(vg);
    }
  }

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

// Per the SDK, each entry's color covers the band from the PREVIOUS entry's rate up to its own
// rate (entry 0 covers 0 up to its rate), so the rate on each entry is the band's UPPER edge.
// In-sim proof: a table whose first entry was green up to 0.01 painted the whole clear-sky
// baseline green. Entry 0 is therefore the transparent "nothing detected" band below the first
// threshold. The SDK documents the rates as mm/h and allows up to 128 entries. Both tables are
// 0/1 channel masks (see kPrecipGain).
//
// Precipitation view: R = rate >= yellow threshold, G = rate >= green.
bool configurePrecipView(FsContext ctx, FsTextureId id) {
  FsRainRateColor precipColors[3] = {
      {rgba(0.0f, 0.0f, 0.0f, 0.0f), kGreenFromMmH},
      {rgba(0.0f, 1.0f, 0.0f, 1.0f), kYellowFromMmH},
      {rgba(1.0f, 1.0f, 0.0f, 1.0f), kTopBandRate},
  };
  return configureRadarView(ctx, id, precipColors, 3, FS_MAP_VIEW_WEATHER_RADAR_MODE_HORIZONTAL);
}

// Hot view: G = rate >= red threshold, drawn as the red wipe; R and B = rate >= turbulence
// threshold, drawn as the magenta (R + B, also in the TURB-only mode, where no precipitation
// is drawn; see WeatherPass). Kept visible for its whole life (toggling visibility flashes an
// empty white texture) and simply not drawn when the mode doesn't call for it.
bool configureHotView(FsContext ctx, FsTextureId id) {
  FsRainRateColor hotColors[3] = {
      {rgba(0.0f, 0.0f, 0.0f, 0.0f), kRedFromMmH},
      {rgba(0.0f, 1.0f, 0.0f, 1.0f), kTurbulenceRateMmH},
      {rgba(1.0f, 1.0f, 1.0f, 1.0f), kTopBandRate},
  };
  return configureRadarView(ctx, id, hotColors, 3, FS_MAP_VIEW_WEATHER_RADAR_MODE_HORIZONTAL);
}

}  // namespace ndwxr
