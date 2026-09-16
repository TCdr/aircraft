// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native WASM ND weather radar gauge, built on MSFS_MapView.h's native weather
// radar API (which testing showed gives materially more consistent
// precipitation data across sessions than the JS/Bing map path it replaces).
//
// Draws ONLY the weather image, positioned/sized to match the ND's per-mode
// pixelRadius/centerYBias constants (arc/index.tsx, RoseNavPage.tsx).
// Everything else on the ND (compass ring, range rings, numbers, aircraft
// symbol, traffic, flight plan) stays nd.html's job.
//
// Findings this module is built around (all confirmed in-sim):
//
// - A live fsMapViewCreate texture always ends up drawn over nd.html's vector
//   content, no matter which htmlgauge slot this module occupies in
//   panel.cfg. There is no capture/readback API to turn it into an ordinary
//   image that plays by normal stacking rules.
//
// - That texture is OPAQUE: the no-return area (and everything outside the
//   cone) comes out solid black even though the background color and the
//   first color band are set fully transparent (with the radar ON and clear
//   sky, the whole rect hid nd.html's range arcs, plane symbol and GPS PRIMARY
//   box). So a normal source-over draw makes the weather rect black out the
//   ND, not just show weather cells. The fix is to draw it with an ADDITIVE
//   blend (RGB added, destination alpha untouched). The engine composites this
//   gauge's surface as premultiplied alpha, so a pixel with alpha 0 and
//   rgb = weather color acts as light added onto the ND underneath, while black
//   texels add nothing - clear sky leaves the ND exactly as it is with the
//   radar off, and nd.html's white lines/text stay readable through cells.
//
// - Big bright fills wash out toward white on the emissive ND screen (a
//   pale light-green band read as white in-sim); band colors are scaled by
//   kColorGain so they stay saturated.
//
// - MSFS's radar API has no turbulence data (rain rate only). Turbulence
//   (WX+T / TURB) is a proxy: rain rate above kTurbulenceDbz, drawn magenta
//   from a second, marker-only MapView, limited to kTurbulenceMaxRangeNm.
//
// - Whatever this gauge draws PERSISTS from frame to frame; its surface is not
//   cleared for it (terronnd's DisplayBase::render() paints a full opaque
//   background every frame for the same reason). A weather image drawn once
//   stays on screen after weather is switched off, and a moving image smears.
//   This module therefore clears its own surface explicitly (clearLayer)
//   before redrawing, and once more when it stops drawing.
//
// - A native copy of nd.html's symbology (TFDi-style) was tried and dropped:
//   nd.html draws the same ring/numbers/range arcs, so both copies showed at
//   once (double lines, overlapping unreadable numbers), and "erasing" a
//   previous frame by redrawing it in opaque black leaves an anti-aliasing
//   fringe (up to ~25% of the original brightness at every edge pixel) that
//   showed up as dotted ghost outlines of the old ring/numbers/dashes.
//
// - clearLayer() relies on NVG_COPY / NVG_DESTINATION_OUT being honoured
//   against this gauge's persistent surface, which they are (confirmed in-sim).
//   Note MSFS caches compiled WASM per package: a rebuilt module that appears
//   to have no effect may be a stale cache entry.
//
// Stacked as an extra htmlgauge on the CPT ND's existing panel.cfg block.

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-function"
#include <MSFS/MSFS.h>
#pragma clang diagnostic pop

#include <MSFS/Legacy/gauges.h>
#include <MSFS/MSFS_MapView.h>
#include <MSFS/Render/nanovg.h>

#include <cmath>
#include <utility>  // arinc429.hpp uses std::move without including this itself

#include "../../terronnd/src/types/arinc429.hpp"

namespace {

// All values below are plain `L:` local variables, readable directly via
// the in-process named-variable gauge API (register_named_variable /
// get_named_variable_value) - no SimConnect connection needed. Note the WX
// radar knobs use Asobo's own unprefixed naming (XMLVAR_A320_...), NOT FBW's
// "A32NX_" convention, so they can't go through terronnd's LVarObject helper
// (which hardcodes an "A32NX_" prefix) - reading everything directly here
// avoids that mismatch entirely.
struct NamedVar {
  const char* name;
  ID id = -1;

  double read() { return get_named_variable_value(id); }
};

NamedVar g_ndModeL{"A32NX_EFIS_L_ND_MODE"};
NamedVar g_ndRangeL{"A32NX_EFIS_L_ND_RANGE"};
NamedVar g_adirsLat{"A32NX_ADIRS_IR_1_LATITUDE"};
NamedVar g_adirsLon{"A32NX_ADIRS_IR_1_LONGITUDE"};
NamedVar g_wxrSys{"XMLVAR_A320_WeatherRadar_Sys"};
NamedVar g_wxrMode{"XMLVAR_A320_WeatherRadar_Mode"};
// CPT ND's power bus - same LVar terronnd already reads (configuration.h's
// AcEssBus) to gate its own rendering. The live-MapView-texture render pass
// bypasses whatever backlight/emissive mechanism blanks nd.html's own content
// when unpowered, so this module has to check power itself. (F/O side will
// need A32NX_ELEC_AC_2_BUS_IS_POWERED when that instance is added.)
NamedVar g_acEssBusPowered{"A32NX_ELEC_AC_ESS_BUS_IS_POWERED"};

// Mirrors EfisNdMode in fbw-common/.../NavigationDisplay.ts:33-39.
constexpr double kNdModeRoseNav = 2.0;
constexpr double kNdModeArc = 3.0;

// a320EfisRangeSettings, NavigationDisplay.ts:9,15.
constexpr float kRangeTableNm[6] = {10.0f, 20.0f, 40.0f, 80.0f, 160.0f, 320.0f};
constexpr float kNmToMetres = 1852.0f;

// Screen-space placement constants, matching arc/index.tsx:224,226 and
// RoseNavPage.tsx:148,150 exactly - these are hardcoded pixel constants on
// the JS side too, not derived from any simvar.
constexpr float kScreenCenterX = 384.0f;
constexpr float kArcCenterYBias = 242.0f;
constexpr float kArcPixelRadius = 498.0f;
constexpr float kRoseNavCenterYBias = 0.0f;
constexpr float kRoseNavPixelRadius = 250.0f;

constexpr unsigned kTextureSize = 768;  // matches the largest on-screen size (ARC) closely enough to avoid visible blur
constexpr unsigned kTurbulenceTextureSize = 512;  // magenta-only, no fine detail needed

// XMLVAR_A320_WeatherRadar_Mode knob positions.
constexpr double kWxrModeWx = 0.0;
constexpr double kWxrModeWxTurb = 1.0;
constexpr double kWxrModeTurb = 2.0;

// Turbulence proxy: real WXR finds turbulence from Doppler spectral width,
// which MSFS doesn't expose - rain rate above this reflectivity (a strong
// convective core) stands in for it. Real Airbus WXR only reports turbulence
// out to ~40 NM, drawn magenta inside precipitation.
constexpr float kTurbulenceDbz = 40.0f;
constexpr float kTurbulenceMaxRangeNm = 40.0f;

// Brightness scale applied to every band color (see the header) - lower it if
// the weather still looks washed out, raise it if it looks too dim. Measured
// in-sim at 0.7: greens came out vivid, but amber read pale yellow.
constexpr float kColorGain = 0.85f;

// Weather color bands, defined by radar reflectivity like a real radar rather
// than by raw MSFS rain-rate numbers. Airbus ND colors: black = minimal/no
// precipitation, green = weak, amber = moderate, red = strong to very strong;
// magenta is reserved for turbulence (see kTurbulenceDbz), never precipitation.
// The dBZ edges come from the weatherai.world ground-radar table, collapsed
// onto those colors: green covers its green + dark green rows (20-35 dBZ),
// amber its yellow + orange rows (35-50), red everything from dark orange up
// (50+). Its light-green row (5-20 dBZ, drizzle) is below the Airbus green
// threshold and stays black. lowerDbz is where each band starts and it runs
// up to the next row; below the first row nothing is drawn (MSFS's clear-sky
// baseline measured <= 0.001 mm/h, far below 20 dBZ = 0.65 mm/h).
struct ReflectivityBand {
  float lowerDbz;
  float r, g, b;
};
constexpr ReflectivityBand kReflectivityBands[] = {
    {20.0f, 0.0f, 0.85f, 0.0f},   // green: weak precipitation
    {35.0f, 1.0f, 0.55f, 0.0f},   // amber: moderate precipitation
    {50.0f, 1.0f, 0.0f, 0.0f},    // red: strong to very strong precipitation
};
constexpr int kReflectivityBandCount = static_cast<int>(sizeof(kReflectivityBands) / sizeof(kReflectivityBands[0]));

// Upper edge of the last band - effectively unbounded so the strongest cells
// keep the last color instead of dropping out.
constexpr float kTopBandRate = 1000000.0f;

NVGcontext* g_nvg = nullptr;
FsContext g_ctx = 0;
FsTextureId g_mapView = 0;
bool g_mapViewReady = false;
FsTextureId g_mapViewTurb = 0;
bool g_mapViewTurbReady = false;

// True when the previous frame left anything on this gauge's surface that
// needs clearing before the next draw (or before going quiet).
bool g_layerDirty = false;

bool isArcOrRoseNav(double ndMode) {
  return ndMode == kNdModeArc || ndMode == kNdModeRoseNav;
}

// Reflectivity -> rain rate via the Marshall-Palmer relation Z = 200 * R^1.6,
// R = (10^(dBZ/10) / 200)^(5/8) mm/h (en.wikipedia.org/wiki/DBZ_(meteorology)).
// The SDK documents fsMapViewSetWeatherRadarRainColors' rates as mm/h (its own
// example runs 0.2 up to 100 mm/h), so no scale factor is applied. An earlier
// 1/300 "calibration" was a guess made when the palette was still hand-tuned
// and is dropped; if colors look systematically too strong or too weak in-sim,
// the band colors on screen read directly as a ladder of the real values.
float rainRateForDbz(float dbz) {
  return std::pow(std::pow(10.0f, dbz / 10.0f) / 200.0f, 0.625f);
}

// Wipes this gauge's own surface back to fully transparent so nd.html shows
// through again. Composite state is set back to source-over afterwards.
// Both operations are used since which one the engine honours against the
// persistent surface is unverified (see the header); either one alone is
// enough to clear it.
void clearLayer(NVGcontext* vg, float width, float height) {
  nvgBeginPath(vg);
  nvgRect(vg, 0.0f, 0.0f, width, height);
  nvgFillColor(vg, nvgRGBAf(0.0f, 0.0f, 0.0f, 0.0f));
  nvgGlobalCompositeOperation(vg, NVG_COPY);
  nvgFill(vg);

  nvgBeginPath(vg);
  nvgRect(vg, 0.0f, 0.0f, width, height);
  nvgFillColor(vg, nvgRGBAf(0.0f, 0.0f, 0.0f, 1.0f));
  nvgGlobalCompositeOperation(vg, NVG_DESTINATION_OUT);
  nvgFill(vg);

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

// Shared MapView setup for both the precipitation view and the turbulence view.
bool configureRadarView(FsContext ctx, FsTextureId id, FsRainRateColor* colors, unsigned colorCount) {
  if (id == 0) {
    return false;
  }
  // CONFIRMED (in-sim, 2026-09-18): fsMapViewSetVisibility is NOT an
  // independent "base layer only" toggle - it's a master switch for the whole
  // map view, weather radar included. Setting it false left the render target
  // with no real content, and our own draw call painted that as a solid white
  // square instead of weather. Keep it true whenever the view is drawn.
  fsMapViewSetVisibility(ctx, id, true);
  // Alpha in the background color / first band does NOT make the texture
  // transparent (it comes out opaque black regardless) - transparency is
  // handled by the additive blend in drawWeatherRect instead.
  fsMapViewSetBackgroundColor(ctx, id, FsColor{{0.0f, 0.0f, 0.0f, 0.0f}});
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);

  fsMapViewSetWeatherRadarVisibility(ctx, id, true);
  fsMapViewSetWeatherRadarMode(ctx, id, FS_MAP_VIEW_WEATHER_RADAR_MODE_HORIZONTAL);
  fsMapViewSetWeatherRadarConeAngleInRadians(ctx, id, 3.14159f);  // 180 deg, matches the JS radar's wxrMode.arcRadians
  fsMapViewSetWeatherRadarRainColors(ctx, id, colors, colorCount);
  return true;
}

FsColor scaledColor(float r, float g, float b) {
  return FsColor{{r * kColorGain, g * kColorGain, b * kColorGain, 1.0f}};
}

enum class WeatherPass {
  // RGB added onto what's there, destination alpha untouched - see the header:
  // the texture is opaque, so a normal draw would black out the ND.
  Additive,
  // Same, but the texture (a white marker) is tinted magenta.
  AdditiveMagenta,
  // Multiplies what's already on this surface by (1 - texture color): where the
  // white turbulence marker is, whatever precipitation was drawn is wiped to
  // black (which adds nothing), so magenta REPLACES it instead of adding onto
  // it (additive magenta over amber came out pale pink).
  Erase,
};

// Draws the weather image for one mode. rangeFraction < 1 restricts the image
// to a circle of that fraction of the full radius (used to limit turbulence to
// kTurbulenceMaxRangeNm).
void drawWeatherRect(NVGcontext* vg, FsTextureId mapView, bool isRoseNav, float rangeFraction, WeatherPass pass) {
  const float centerYBias = isRoseNav ? kRoseNavCenterYBias : kArcCenterYBias;
  const float pixelRadius = isRoseNav ? kRoseNavPixelRadius : kArcPixelRadius;
  const float cx = kScreenCenterX;
  const float cy = kScreenCenterX + centerYBias;
  const float left = cx - pixelRadius;
  const float top = cy - pixelRadius;
  const float size = pixelRadius * 2.0f;

  // CONFIRMED (in-sim, 2026-09-18): MSFS's native cone-angle clip does NOT
  // hold at ROSE_NAV's tighter zoom - it renders as an unclipped, near-
  // omnidirectional sweep instead of the forward dome ARC shows correctly.
  // Rather than trust the native clip here, restrict the draw to the top
  // (forward) half of the bounding square via a plain rectangular
  // nvgScissor - simple/safe, scoped by nvgSave/nvgRestore, unlike ARC which
  // keeps relying on the native clip since it's already correct there.
  nvgSave(vg);
  nvgScissor(vg, left, top, size, isRoseNav ? pixelRadius : size);

  if (pass == WeatherPass::Erase) {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
  } else {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  }

  nvgBeginPath(vg);
  if (rangeFraction >= 1.0f) {
    nvgRect(vg, left, top, size, size);
  } else {
    nvgCircle(vg, cx, cy, pixelRadius * rangeFraction);
  }
  NVGpaint paint = nvgImagePattern(vg, left, top, size, size, 0.0f, mapView, 1.0f);
  if (pass == WeatherPass::AdditiveMagenta) {
    // Standard NanoVG multiplies the sampled texture by the paint's inner
    // color, so a white marker texture comes out magenta.
    paint.innerColor = paint.outerColor = FsColor{{kColorGain, 0.0f, kColorGain, 1.0f}};
  }
  nvgFillPaint(vg, paint);
  nvgFill(vg);

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

}  // namespace

extern "C" {

MSFS_CALLBACK bool ndwxr_gauge_callback(FsContext ctx, int service_id, void* pData) {
  switch (service_id) {
    case PANEL_SERVICE_PRE_INSTALL: {
      g_ctx = ctx;

      g_ndModeL.id = register_named_variable(g_ndModeL.name);
      g_ndRangeL.id = register_named_variable(g_ndRangeL.name);
      g_adirsLat.id = register_named_variable(g_adirsLat.name);
      g_adirsLon.id = register_named_variable(g_adirsLon.name);
      g_wxrSys.id = register_named_variable(g_wxrSys.name);
      g_wxrMode.id = register_named_variable(g_wxrMode.name);
      g_acEssBusPowered.id = register_named_variable(g_acEssBusPowered.name);

      NVGparams params;
      params.userPtr = ctx;
      params.edgeAntiAlias = false;
      g_nvg = nvgCreateInternal(&params);

      // Precipitation view. Per the SDK, each entry's color covers the band
      // from the PREVIOUS entry's rate up to its own rate (entry 0 covers 0 up
      // to its rate), so the rate on each entry is the band's UPPER edge.
      // In-sim proof: a table whose first entry was green up to 0.01 painted
      // the whole clear-sky baseline green. Entry 0 is the transparent
      // "nothing detected" band below the first reflectivity row; entry i+1 is
      // row i, ending where row i+1 starts. The SDK allows up to 128 entries.
      FsRainRateColor colors[kReflectivityBandCount + 1];
      colors[0] = {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, rainRateForDbz(kReflectivityBands[0].lowerDbz)};
      for (int i = 0; i < kReflectivityBandCount; ++i) {
        const ReflectivityBand& band = kReflectivityBands[i];
        const float upperRate =
            i + 1 < kReflectivityBandCount ? rainRateForDbz(kReflectivityBands[i + 1].lowerDbz) : kTopBandRate;
        colors[i + 1] = {scaledColor(band.r, band.g, band.b), upperRate};
      }
      g_mapView = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      g_mapViewReady = configureRadarView(ctx, g_mapView, colors, kReflectivityBandCount + 1);

      // Turbulence view: a WHITE marker above the proxy threshold, nothing
      // below - drawn twice (erase precipitation there, then tinted magenta,
      // see WeatherPass). Kept visible for its whole life (toggling visibility
      // flashes an empty white texture) and simply not drawn when the knob
      // doesn't call for it.
      FsRainRateColor turbColors[2] = {
          {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, rainRateForDbz(kTurbulenceDbz)},
          {FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, kTopBandRate},
      };
      g_mapViewTurb = fsMapViewCreate(ctx, kTurbulenceTextureSize, kTurbulenceTextureSize, 0);
      g_mapViewTurbReady = configureRadarView(ctx, g_mapViewTurb, turbColors, 2);
      return true;
    }
    case PANEL_SERVICE_PRE_DRAW: {
      if (g_nvg == nullptr) {
        return true;
      }

      bool isRoseNav = false;
      bool showPrecip = false;
      bool showTurb = false;
      float rangeNmForMode = kRangeTableNm[0];

      if (g_acEssBusPowered.read() != 0.0) {
        const double ndMode = g_ndModeL.read();
        const double wxrSys = g_wxrSys.read();
        const double wxrMode = g_wxrMode.read();
        // The ARINC429 data field is 32 bits - matches every other usage of
        // this template in the codebase (cpp-msfs-framework/lib/arinc429.hpp),
        // <double> would read 8 bytes out of a 4-byte local (UB).
        const auto latWord = types::Arinc429Word<float>::fromSimVar(g_adirsLat.read());
        const auto lonWord = types::Arinc429Word<float>::fromSimVar(g_adirsLon.read());

        // Matches WeatherRadarLayer.tsx:143-155's gating (mapVisible/
        // mapRecomputing are JS-side debounce-only concerns with no simvar
        // backing - ADIRS word validity is the equivalent "is position usable"
        // check here). MODE: WX = precipitation, WX+T = both, TURB =
        // turbulence only, MAP = ground mapping (not implemented, draws nothing).
        const bool sysOn = wxrSys != 1.0;
        const bool positionValid = latWord.isNo() && lonWord.isNo();
        const bool active = sysOn && isArcOrRoseNav(ndMode) && positionValid;
        showPrecip = active && g_mapViewReady && (wxrMode == kWxrModeWx || wxrMode == kWxrModeWxTurb);
        showTurb = active && g_mapViewTurbReady && (wxrMode == kWxrModeWxTurb || wxrMode == kWxrModeTurb);
        isRoseNav = ndMode == kNdModeRoseNav;

        const int rangeIndex = static_cast<int>(g_ndRangeL.read());
        const float rangeNm = kRangeTableNm[rangeIndex >= 0 && rangeIndex < 6 ? rangeIndex : 0];
        rangeNmForMode = isRoseNav ? rangeNm / 2.0f : rangeNm;
      }

      const bool drawsAnything = showPrecip || showTurb;
      if (!drawsAnything && !g_layerDirty) {
        // Nothing on the surface from last frame and nothing to draw now -
        // skip opening a frame entirely.
        return true;
      }

      sGaugeDrawData* drawData = static_cast<sGaugeDrawData*>(pData);
      const float winWidth = static_cast<float>(drawData->winWidth);
      const float winHeight = static_cast<float>(drawData->winHeight);
      const float ratio = static_cast<float>(drawData->fbWidth) / static_cast<float>(drawData->fbHeight);
      nvgBeginFrame(g_nvg, winWidth, winHeight, ratio);

      if (g_layerDirty) {
        clearLayer(g_nvg, winWidth, winHeight);
      }
      if (showPrecip) {
        fsMapViewSet2DViewRadiusInMeters(g_ctx, g_mapView, rangeNmForMode * kNmToMetres);
        drawWeatherRect(g_nvg, g_mapView, isRoseNav, 1.0f, WeatherPass::Additive);
      }
      if (showTurb) {
        fsMapViewSet2DViewRadiusInMeters(g_ctx, g_mapViewTurb, rangeNmForMode * kNmToMetres);
        const float turbFraction = kTurbulenceMaxRangeNm / rangeNmForMode;
        const float turbRangeFraction = turbFraction < 1.0f ? turbFraction : 1.0f;
        if (showPrecip) {
          drawWeatherRect(g_nvg, g_mapViewTurb, isRoseNav, turbRangeFraction, WeatherPass::Erase);
        }
        drawWeatherRect(g_nvg, g_mapViewTurb, isRoseNav, turbRangeFraction, WeatherPass::AdditiveMagenta);
      }
      g_layerDirty = drawsAnything;

      nvgEndFrame(g_nvg);
      return true;
    }
    case PANEL_SERVICE_PRE_KILL: {
      if (g_mapView != 0) {
        fsMapViewDelete(g_ctx, g_mapView);
        g_mapView = 0;
      }
      if (g_mapViewTurb != 0) {
        fsMapViewDelete(g_ctx, g_mapViewTurb);
        g_mapViewTurb = 0;
      }
      if (g_nvg != nullptr) {
        nvgDeleteInternal(g_nvg);
        g_nvg = nullptr;
      }
      return true;
    }
    default:
      return true;
  }
}

}  // extern "C"
