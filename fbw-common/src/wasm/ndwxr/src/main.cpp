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
//   (WX+T / TURB) is a proxy: rain rate above kTurbulenceRateMmH, drawn magenta
//   from a second MapView (the "hot" view), limited to kTurbulenceMaxRangeNm.
//
// - The engine's rain rate is noisy texel by texel, so where a cell sits near a
//   band threshold the colors flip at pixel scale (grain), and a plain blur of
//   those flips only gives a muddy, soft mix. Instead every threshold is its own
//   binary mask in a color channel of one of the two MapViews (see kPrecipGain):
//   each mask is blurred, saturated and squared, i.e. a majority filter, which
//   gives solid areas with fairly crisp edges; the channels are then turned into
//   the band colors by the blend passes in drawWeatherRect.
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
// - Like a real weather radar, nothing is drawn while the aircraft is on the
//   ground (the WXR does not transmit there): both main gear legs compressed on
//   either LGCIU blanks the radar, and it comes back after lift-off.
//
// - The radar antenna is stabilized in pitch and bank by the engine itself
//   (fsMapViewSetWeatherRadarStabilization defaults to true for both axes), so
//   the beam stays level in a banked turn without this module doing anything.
//
// Built twice from this file, like terronnd: for the A32NX (default) and for
// the A380X (-DA380X). They differ in the ND range table, in which power buses
// switch the ND on, in how the crew selects the radar, and in which inertial
// reference feeds each side (see the #ifdef A380X blocks).
//
// Stacked as an extra htmlgauge on each ND's existing panel.cfg block
// (A32NX: VCockpit02 = CPT, VCockpit15 = F/O; A380X: VCockpit07 = CPT,
// VCockpit08 = F/O). Like terronnd, the last gauge parameter selects the side
// ("L" or "R"; no parameter means "L"). Both gauges run inside one WASM module
// instance, so all per-ND state lives in an Instance keyed by the gauge's
// FsContext.

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

// The ATT HDG switching knob is a single selector shared by both NDs.
NamedVar g_attHdgKnob{"A32NX_ATT_HDG_SWITCHING_KNOB"};
// ADIRS inertial reference position words for IR 1..3 (index 0..2).
NamedVar g_adirsLat[3] = {{"A32NX_ADIRS_IR_1_LATITUDE"}, {"A32NX_ADIRS_IR_2_LATITUDE"}, {"A32NX_ADIRS_IR_3_LATITUDE"}};
NamedVar g_adirsLon[3] = {{"A32NX_ADIRS_IR_1_LONGITUDE"}, {"A32NX_ADIRS_IR_2_LONGITUDE"}, {"A32NX_ADIRS_IR_3_LONGITUDE"}};
// Main landing gear compression as reported by LGCIU 1 and 2 (index 0..1); an
// unpowered LGCIU reports "not compressed". Same names on both aircraft.
NamedVar g_lgciuLeftCompressed[2] = {{"A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED"}, {"A32NX_LGCIU_2_LEFT_GEAR_COMPRESSED"}};
NamedVar g_lgciuRightCompressed[2] = {{"A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED"}, {"A32NX_LGCIU_2_RIGHT_GEAR_COMPRESSED"}};

#ifdef A380X
// The A380X selects the radar on the ND with the WX overlay on the EFIS control
// panel plus one of two WXR/TAWS systems on the SURV panel; each system reports
// its own failure (EfisTawsBridge.ts).
NamedVar g_wxrTawsSelected{"A32NX_WXR_TAWS_SYS_SELECTED"};
NamedVar g_wxrFailed[2] = {{"A32NX_WXR_1_FAILED"}, {"A32NX_WXR_2_FAILED"}};

// A380X_EFIS_x_ACTIVE_OVERLAY (FcuBusPublisher.ts): 0 = none, 1 = WXR, 2 = TERR.
constexpr double kOverlayWxr = 1.0;

// The WXR / TURB / MODE buttons of the MFD SURV CONTROLS page (MfdSurvControls.tsx).
// Each is 0 by default, which is the page's default setting: WXR AUTO, TURB AUTO,
// MODE WX.
NamedVar g_wxrOff{"A380X_WXR_OFF"};
NamedVar g_wxrTurbOff{"A380X_WXR_TURB_OFF"};
NamedVar g_wxrModeMap{"A380X_WXR_MODE_MAP"};
NamedVar g_wxrVdOff{"A380X_WXR_VD_OFF"};

// The vertical display (VD) below the A380X ND (VerticalDisplay.tsx): its plot
// spans x = 150 (range 0) .. 690 (VD range) and y = 800 (upper altitude) ..
// 1000 (lower altitude) of the 768x1024 ND screen. The VD range is the ND
// range in ARC (10..160 NM) and half of it in ROSE NAV (5..160 NM); the VD
// publishes its altitude limits as L:A32NX_VD_{1,2}_RANGE_LOWER/_UPPER (feet).
constexpr float kVdLeft = 150.0f;
constexpr float kVdTop = 800.0f;
constexpr float kVdWidth = 540.0f;
constexpr float kVdHeight = 200.0f;

// The VD weather is STYLISED, not measured: MSFS's radar API has no vertical
// data (its "vertical" MapView mode is a single thin beam, and tilting that
// beam crashed the module), so the VD is built from the ND's own horizontal
// radar views, which see one slice of weather at about the aircraft's altitude.
// The ND texel columns close to the heading line are rotated onto the VD's range
// axis and extruded vertically into a closed, nested shape centred on the
// aircraft's altitude, like a real VD cell: a red core inside a yellow ring inside
// a green rim, each reaching up and down by a made-up half height (kVd*HalfHeightFt)
// with a narrower shoulder (kVdShoulderFraction) at the top and the bottom.
//
// Like the real VD (which shows the weather along the aircraft's direction only)
// the VD shows the STRONGEST weather in a narrow wedge around the heading line
// (half angle atan(kVdWedgeTan)): kVdLateralTapsPerSide columns on each side of
// the line are drawn on top of each other (a union), each one only from the range
// where it enters the wedge.
//
// Each output color channel is driven by its own mask channel (precipitation view:
// R = yellow and above, G = green and above; hot view: G = red and above, R/B =
// turbulence), so every channel can be clipped to its own altitude window without
// mixing channels: green reaches furthest, yellow less, and the red wipe (which
// removes the green channel) least.
constexpr float kVdRedHalfHeightFt = 4000.0f;
constexpr float kVdYellowHalfHeightFt = 6500.0f;
constexpr float kVdGreenHalfHeightFt = 9000.0f;
// The outer part of each half height (beyond this fraction of it) needs two
// neighbouring columns to agree, so the shape is narrower there: stepped shoulders.
constexpr float kVdShoulderFraction = 0.7f;
constexpr float kVdWedgeTan = 0.176f;  // tan(10 deg)
constexpr int kVdLateralTapsPerSide = 4;
// The heading-line columns are stretched across the whole VD height by scaling the
// ND texture this many screen pixels per texel across the path (much more than the
// VD is tall, so neighbouring columns don't leak in).
constexpr float kVdColumnTexelPx = 3000.0f;
// Measured in-sim (2026-09-19): MSFS has no usable height information for the
// horizontal radar. fsMapViewSetAltitudeRangeInFeet changes nothing on it (slabs
// 3000-5000 and 9000-11000 ft above the aircraft came out identical to each other),
// and the TOP VIEW radar mode is a composite over all altitudes that saturates
// red almost everywhere and ignores the 180 degree cone - it says weather exists
// aloft, not how high. Hence the made-up heights above.
#else
// The A32NX radar is switched by the pedestal WX SYS selector (0 = SYS 1,
// 1 = OFF, 2 = SYS 2) and its mode by the WX MODE knob, both Asobo-style
// "XMLVAR_A320_..." variables.
NamedVar g_wxrSys{"XMLVAR_A320_WeatherRadar_Sys"};
NamedVar g_wxrMode{"XMLVAR_A320_WeatherRadar_Mode"};
constexpr double kWxrSysOff = 1.0;
#endif

// Mirrors EfisNdMode in fbw-common/.../NavigationDisplay.ts:33-39.
constexpr double kNdModeRoseNav = 2.0;
constexpr double kNdModeArc = 3.0;

#ifdef A380X
// a380EfisRangeSettings, NavigationDisplay.ts:19. Range index 0 (-1) is the
// OANS airport map: the ND shows that instead of the moving map, so no radar.
constexpr float kRangeTableNm[8] = {-1.0f, 10.0f, 20.0f, 40.0f, 80.0f, 160.0f, 320.0f, 640.0f};
#else
// a320EfisRangeSettings, NavigationDisplay.ts:9,15.
constexpr float kRangeTableNm[6] = {10.0f, 20.0f, 40.0f, 80.0f, 160.0f, 320.0f};
#endif
constexpr int kRangeCount = static_cast<int>(sizeof(kRangeTableNm) / sizeof(kRangeTableNm[0]));
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

// XMLVAR_A320_WeatherRadar_Mode knob positions (the A380X derives the same values
// from its SURV page buttons, see radarMode). MAP is position 3.
constexpr double kWxrModeWx = 0.0;
constexpr double kWxrModeWxTurb = 1.0;
constexpr double kWxrModeTurb = 2.0;

// Turbulence proxy: real WXR finds turbulence from Doppler spectral width,
// which MSFS doesn't expose - a rain rate above this (mm/h; a strong convective
// core) stands in for it. It has to sit above the red band's start (see
// kRedFromMmH), otherwise the magenta would cover every red cell. Measured
// in-sim: 30 never triggered (no magenta at all under a thunderstorm), 20 does
// while leaving the red visible around the core. Real Airbus WXR only reports
// turbulence out to ~40 NM, drawn magenta inside precipitation.
constexpr float kTurbulenceRateMmH = 20.0f;
constexpr float kTurbulenceMaxRangeNm = 40.0f;

// Brightness scale applied to every band color (see the header) - lower it if
// the weather still looks washed out, raise it if it looks too dim. Measured
// in-sim at 0.7: greens came out vivid, but amber read pale yellow.
constexpr float kColorGain = 0.85f;

// The MapView texture carries per-texel noise: neighboring texels flip between
// color bands, which reads as grain (a real radar shows solid, consistent
// areas). The band colors are applied by the engine before we get the texture,
// so it can't be denoised at the source; instead every draw is repeated as a
// kSmoothingGrid x kSmoothingGrid set of copies shifted by up to
// +/-kSmoothingSpacingPx (each at 1/taps strength) and summed, i.e. a box blur.
// A grid of 1 turns smoothing off; each extra tap costs another full-image fill
// per ND.
constexpr int kSmoothingGrid = 3;
constexpr float kSmoothingSpacingPx = 2.5f;

// Fraction of the precipitation color that survives underneath fully covered
// turbulence (0 would be a clean wipe; the smoothed erase is a product of taps).
constexpr float kEraseRemainder = 0.05f;

// A partly covered turbulence marker (coverage c = the fraction of taps that see
// the marker) is boosted by this factor before it saturates, so magenta reaches
// full strength - and wipes the precipitation under it - from c = 1/gain
// upward instead of only at c = 1. Near the threshold the marker flips texel by
// texel, and a linear blend of that came out as pale pink instead of magenta.
// Magenta therefore saturates at pure magenta.
constexpr float kTurbulenceGain = 2.0f;

// Weather color bands, by rain rate like the color levels of an airborne weather
// radar (ARINC 708 style): black below 0.7 mm/h, green 0.7-4 mm/h, amber 4-12
// mm/h, red above 12 mm/h. Magenta is reserved for turbulence (see
// kTurbulenceRateMmH), never precipitation. An earlier palette used the
// weatherai.world GROUND radar reflectivity table (red from 50 dBZ, about
// 49 mm/h); MSFS's rain rates never got that high, so red never showed up, not
// even without turbulence. Below the green threshold nothing is drawn (MSFS's
// clear-sky baseline measured <= 0.001 mm/h).
constexpr float kGreenFromMmH = 0.7f;
constexpr float kYellowFromMmH = 4.0f;
constexpr float kRedFromMmH = 12.0f;

// The band colors on the ND (linear, before the paint encoding). Yellow is the
// green channel of the green band plus the red channel of the red band, so green
// and yellow share their green level.
constexpr float kRedLevel = 1.0f * kColorGain;
constexpr float kGreenLevel = 0.85f * kColorGain;

// How the band colors are built (the "precipitation" and the "hot" MapView both
// use color tables that are pure 0/1 masks, so the engine's color handling can't
// distort them):
//   precipitation view: R = rate >= kYellowFromMmH, G = rate >= kGreenFromMmH
//   hot view:           G = rate >= kRedFromMmH, R and B = rate >= kTurbulenceRateMmH
// Each mask is drawn as a kSmoothingGrid x kSmoothingGrid blur whose taps add up
// to kPrecipGain at full coverage, so it saturates once 1/kPrecipGain of the taps
// see the mask; squaring the result kSharpenPasses times then turns the ramp
// below that into a fairly sharp edge (a coverage of 1/3 comes out at ~0.2, 5/9 at
// 1). The hot view's G mask then wipes the green channel of the precipitation
// (yellow -> red), and its R/B masks add magenta.
constexpr float kPrecipGain = 2.0f;
constexpr int kSharpenPasses = 2;

// Upper edge of the last band - effectively unbounded so the strongest cells
// keep the last color instead of dropping out.
constexpr float kTopBandRate = 1000000.0f;

// Everything one ND's radar needs. The power bus, ND mode and range variables
// differ per side; the LVar ids are looked up once at install.
struct Instance {
  bool inUse = false;
  FsContext ctx = 0;
  bool isRight = false;
  NVGcontext* nvg = nullptr;

  ID ndModeVar = -1;
  ID ndRangeVar = -1;
  // The buses that switch this ND on (it is on while either is powered). The
  // live-MapView-texture render pass bypasses whatever backlight/emissive
  // mechanism blanks nd.html's own content when unpowered, so this module has
  // to check power itself. A32NX: the same LVar terronnd reads (configuration.h's
  // AcEssBus / Ac2Bus) in both slots. A380X: the DC buses of the ND's display
  // unit, as in CdsDisplayUnit's DisplayUnitToDCBus.
  ID powerBusVars[2] = {-1, -1};
#ifdef A380X
  ID overlayVar = -1;
#endif

  FsTextureId mapView = 0;
  bool mapViewReady = false;
  FsTextureId mapViewHot = 0;
  bool mapViewHotReady = false;
#ifdef A380X
  // The VD's altitude limits (see kVdLeft).
  ID vdRangeLowerVar = -1;
  ID vdRangeUpperVar = -1;
#endif

  // True when the previous frame left anything on this gauge's surface that
  // needs clearing before the next draw (or before going quiet).
  bool layerDirty = false;
};

constexpr int kMaxInstances = 2;
Instance g_instances[kMaxInstances];

Instance* findInstance(FsContext ctx) {
  for (Instance& instance : g_instances) {
    if (instance.inUse && instance.ctx == ctx) {
      return &instance;
    }
  }
  return nullptr;
}

// Instances are recycled (not just appended) so an aircraft reload, which kills
// and reinstalls the gauges, doesn't run out of slots.
Instance* allocInstance() {
  for (Instance& instance : g_instances) {
    if (!instance.inUse) {
      return &instance;
    }
  }
  return nullptr;
}

// Which inertial reference feeds this ND.
int inertialSource(bool isRight, int attHdgKnob) {
#ifdef A380X
  // NORM feeds each side from its own IR (1 for the CPT, 2 for the F/O); any
  // other knob position switches both to IR 3 - the rule EfisTawsBridge uses for
  // the A380X's ND availability.
  constexpr int kNorm = 1;
  if (attHdgKnob == kNorm) {
    return isRight ? 2 : 1;
  }
  return 3;
#else
  // IR 1 for the CPT and IR 2 for the F/O, or IR 3 when the ATT HDG switching
  // knob routes it to that side - the same rule as AdirsValueProvider's
  // getSupplier() in MsfsAvionicsCommon.
  constexpr int kAdirs3ToCaptain = 0;
  constexpr int kAdirs3ToFo = 2;
  if (isRight) {
    return attHdgKnob == kAdirs3ToFo ? 3 : 2;
  }
  return attHdgKnob == kAdirs3ToCaptain ? 3 : 1;
#endif
}

bool isArcOrRoseNav(double ndMode) {
  return ndMode == kNdModeArc || ndMode == kNdModeRoseNav;
}

bool isPowered(const Instance& instance) {
  return get_named_variable_value(instance.powerBusVars[0]) != 0.0 || get_named_variable_value(instance.powerBusVars[1]) != 0.0;
}

// Whether the crew has asked for the radar on this ND and the radar system can
// supply it (the radar mode, ND page, position source and ground inhibit are
// checked separately).
bool radarSelected(const Instance& instance) {
#ifdef A380X
  // The same rule the A380X applies to terrain on the ND (EfisTawsBridge's
  // terrOnNd), for the WXR overlay: this side's EFIS control panel has the WX
  // overlay selected and the WXR/TAWS system selected on the SURV panel is not
  // failed (no system selected, 0, counts as failed, as in the VD's WXR INOP
  // flag), plus the WXR button of the SURV CONTROLS page is not OFF.
  if (get_named_variable_value(instance.overlayVar) != kOverlayWxr) {
    return false;
  }
  const int system = static_cast<int>(g_wxrTawsSelected.read());
  if (system != 1 && system != 2) {
    return false;
  }
  return g_wxrFailed[system - 1].read() == 0.0 && g_wxrOff.read() == 0.0;
#else
  (void)instance;
  return g_wxrSys.read() != kWxrSysOff;
#endif
}

// The radar mode as a WX MODE knob position: WX = precipitation, WX+T = both,
// TURB = turbulence only, MAP = ground mapping (not implemented, draws nothing).
double radarMode() {
#ifdef A380X
  // The SURV CONTROLS page has a WX/MAP button and a TURB AUTO/OFF button: TURB
  // AUTO adds turbulence to the precipitation. There is no turbulence-only mode.
  constexpr double kWxrModeMap = 3.0;
  if (g_wxrModeMap.read() != 0.0) {
    return kWxrModeMap;
  }
  return g_wxrTurbOff.read() != 0.0 ? kWxrModeWx : kWxrModeWxTurb;
#else
  return g_wxrMode.read();
#endif
}

// A real weather radar does not transmit on the ground. The aircraft counts as
// on the ground when both main gear legs are compressed on either LGCIU.
bool isOnGround() {
  for (int lgciu = 0; lgciu < 2; ++lgciu) {
    if (g_lgciuLeftCompressed[lgciu].read() != 0.0 && g_lgciuRightCompressed[lgciu].read() != 0.0) {
      return true;
    }
  }
  return false;
}

// Wipes this gauge's own surface back to fully transparent so nd.html shows
// through again. Composite state is set back to source-over afterwards.
// Both operations are used as belt and braces: either one alone clears the
// surface.
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

// Shared MapView setup for the precipitation view and the hot view.
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
  fsMapViewSetWeatherRadarConeAngleInRadians(ctx, id, 3.14159f);  // 180 deg, matches the JS radar's wxrMode.arcRadians
  fsMapViewSetWeatherRadarRainColors(ctx, id, colors, colorCount);
  return true;
}

// The engine treats paint colors (the tint set on the image paint) as sRGB-encoded
// and decodes them to linear before multiplying them with the texture and
// blending. A weight meant as a LINEAR fraction therefore has to be passed
// encoded: in-sim, a plain 1/9 tint decoded to ~0.012 and the nine-tap blur came
// out at ~40% brightness with the turbulence erase barely working.
float encodeSrgb(float linear) {
  return linear <= 0.0031308f ? 12.92f * linear : 1.055f * std::pow(linear, 1.0f / 2.4f) - 0.055f;
}

float decodeSrgb(float encoded) {
  return encoded <= 0.04045f ? encoded / 12.92f : std::pow((encoded + 0.055f) / 1.055f, 2.4f);
}

enum class WeatherPass {
  // Precipitation view: its two mask channels added onto what's there (see
  // kPrecipGain), destination alpha untouched - see the header: the texture is
  // opaque, so a normal draw would black out the ND.
  Additive,
  // Squares what's on this surface (kSharpenPasses times), the saturating step
  // of the majority filter. One plain fill, not textured.
  Sharpen,
  // Turns the two mask channels into the green / yellow band colors. One plain
  // fill, not textured.
  Colorize,
  // Hot view, R and B masks (rate above the turbulence threshold), tinted magenta.
  AdditiveMagenta,
  // Hot view, G mask (rate above the red threshold): multiplies the green channel
  // of what's already on this surface by (1 - mask), so yellow becomes red and
  // magenta is not diluted by green.
  Erase,
};

// The two plain (untextured) fills of the mask pipeline over a rect; the caller sets
// the scissor. Sharpen squares what's on the surface (dst * dst, kSharpenPasses
// times); Colorize multiplies it by the band colors (dst * color).
void sharpenRect(NVGcontext* vg, float x, float y, float w, float h) {
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_DST_COLOR, NVG_ZERO, NVG_ONE);
  for (int i = 0; i < kSharpenPasses; ++i) {
    nvgBeginPath(vg);
    nvgRect(vg, x, y, w, h);
    nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
    nvgFill(vg);
  }
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

void colorizeRect(NVGcontext* vg, float x, float y, float w, float h) {
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_SRC_COLOR, NVG_ZERO, NVG_ONE);
  nvgBeginPath(vg);
  nvgRect(vg, x, y, w, h);
  nvgFillColor(vg, nvgRGBAf(encodeSrgb(kRedLevel), encodeSrgb(kGreenLevel), 0.0f, 1.0f));
  nvgFill(vg);
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

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

  // CONFIRMED (in-sim): MSFS's native cone-angle clip cannot be trusted. It did
  // not hold at ROSE_NAV's tighter zoom (2026-09-18: an unclipped, near-
  // omnidirectional sweep), and later it stopped holding in ARC too (2026-09-19:
  // weather behind the aircraft, showing through the TA ONLY box and the VD, with
  // nothing changed on our side). So the draw is restricted to the top (forward)
  // half of the bounding square - the aircraft is at its centre - via a plain
  // rectangular nvgScissor, in both modes; simple/safe, scoped by nvgSave/nvgRestore.
  nvgSave(vg);
  nvgScissor(vg, left, top, size, pixelRadius);

  if (pass == WeatherPass::Sharpen || pass == WeatherPass::Colorize) {
    if (pass == WeatherPass::Sharpen) {
      sharpenRect(vg, left, top, size, size);
    } else {
      colorizeRect(vg, left, top, size, size);
    }
    nvgRestore(vg);
    return;
  }

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
  const float additive = encodeSrgb(kPrecipGain * tapWeight);
  FsColor tint{{additive, additive, additive, 1.0f}};
  if (pass == WeatherPass::AdditiveMagenta) {
    // Standard NanoVG multiplies the sampled texture by the paint's inner
    // color, so the marker's R and B channels come out magenta. The taps sum to
    // kTurbulenceGain at full coverage and the blend clamps at pure magenta.
    const float magenta = encodeSrgb(kTurbulenceGain * tapWeight);
    tint = FsColor{{magenta, 0.0f, magenta, 1.0f}};
  } else if (pass == WeatherPass::Erase) {
    const float erase = encodeSrgb(1.0f - std::pow(kEraseRemainder, kTurbulenceGain * tapWeight));
    tint = FsColor{{0.0f, erase, 0.0f, 1.0f}};
  }

  for (int iy = 0; iy < kSmoothingGrid; ++iy) {
    for (int ix = 0; ix < kSmoothingGrid; ++ix) {
      const float dx = (static_cast<float>(ix) - 0.5f * static_cast<float>(kSmoothingGrid - 1)) * kSmoothingSpacingPx;
      const float dy = (static_cast<float>(iy) - 0.5f * static_cast<float>(kSmoothingGrid - 1)) * kSmoothingSpacingPx;

      nvgBeginPath(vg);
      if (rangeFraction >= 1.0f) {
        nvgRect(vg, left, top, size, size);
      } else {
        nvgCircle(vg, cx, cy, pixelRadius * rangeFraction);
      }
      NVGpaint paint = nvgImagePattern(vg, left + dx, top + dy, size, size, 0.0f, mapView, 1.0f);
      paint.innerColor = paint.outerColor = tint;
      nvgFillPaint(vg, paint);
      nvgFill(vg);
    }
  }

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

#ifdef A380X
double planeAltitudeFeet() {
  static const ENUM planeAltitude = get_aircraft_var_enum("PLANE ALTITUDE");
  static const ENUM feet = get_units_enum("feet");
  return aircraft_varget(planeAltitude, feet, 0);
}

constexpr float kHalfPi = 1.5707963f;

// Where the ND's radar texture lands on the VD (see kVdColumnTexelPx): rotated by
// 90 degrees, so "ahead" (the texture's top) points right along the range axis,
// with the aircraft (the texture's centre) at the VD's left edge.
struct VdColumns {
  float originX;
  float originY;
  float extentAcross;  // pattern extent across the path (local x), screen px
  float extentAlong;   // pattern extent along the range axis (local y), screen px
  float texelsPerNm;   // ND texels per NM (across the path)
  float vdRangeNm;
};

enum class VdPass {
  Yellow,   // precipitation view, R mask (yellow and above)
  Green,    // precipitation view, G mask (green and above)
  Wipe,     // hot view, G mask (red and above): removes the green channel
  Magenta,  // hot view, R and B masks (turbulence)
};

// One channel window: the columns of the wedge (see kVdWedgeTan) drawn on top of
// each other, each clipped to the window [top, bottom] and to the range where it
// lies inside the wedge, up to rightLimit. gain 1 = one column is enough, 0.5 =
// two neighbouring columns must agree.
void drawVdChannel(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float top, float bottom, float rightLimit,
                   float gain) {
  if (bottom <= top) {
    return;
  }
  nvgSave(vg);
  FsColor tint;
  const float g = encodeSrgb(gain);
  if (pass == VdPass::Wipe) {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
    tint = FsColor{{0.0f, encodeSrgb(1.0f - std::pow(kEraseRemainder, gain)), 0.0f, 1.0f}};
  } else {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
    tint = pass == VdPass::Yellow  ? FsColor{{g, 0.0f, 0.0f, 1.0f}}
           : pass == VdPass::Green ? FsColor{{0.0f, g, 0.0f, 1.0f}}
                                   : FsColor{{g, 0.0f, g, 1.0f}};
  }

  const float halfTexture = 0.5f * static_cast<float>(kTextureSize);
  for (int k = -kVdLateralTapsPerSide; k <= kVdLateralTapsPerSide; ++k) {
    const float lateralNm = static_cast<float>(k) * c.vdRangeNm * kVdWedgeTan / static_cast<float>(kVdLateralTapsPerSide);
    const float texels = lateralNm * c.texelsPerNm;
    if (std::fabs(texels) > 0.98f * halfTexture) {
      continue;  // outside the radar texture
    }
    const int absK = k < 0 ? -k : k;
    const float left = kVdLeft + static_cast<float>(absK) / static_cast<float>(kVdLateralTapsPerSide) * kVdWidth;
    if (rightLimit <= left) {
      continue;
    }
    nvgScissor(vg, left, top, rightLimit - left, bottom - top);
    nvgBeginPath(vg);
    nvgRect(vg, left, top, rightLimit - left, bottom - top);
    NVGpaint paint =
        nvgImagePattern(vg, c.originX, c.originY + texels * kVdColumnTexelPx, c.extentAcross, c.extentAlong, kHalfPi, view, 1.0f);
    paint.innerColor = paint.outerColor = tint;
    nvgFillPaint(vg, paint);
    nvgFill(vg);
  }
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

// Draws the stylised VD weather (see kVdRedHalfHeightFt). ndRadiusNm is the radius
// the ND's radar views were set to; vdRangeNm the VD's range.
void drawVdWeather(NVGcontext* vg, FsTextureId precipView, FsTextureId hotView, bool hotReady, bool showTurb,
                   float ndRadiusNm, float vdRangeNm, double planeAltFeet, double lowerFeet, double upperFeet) {
  VdColumns c;
  c.extentAlong = 2.0f * ndRadiusNm / vdRangeNm * kVdWidth;
  c.extentAcross = static_cast<float>(kTextureSize) * kVdColumnTexelPx;
  c.originX = kVdLeft + 0.5f * c.extentAlong;
  c.originY = kVdTop + 0.5f * kVdHeight - 0.5f * c.extentAcross;
  c.texelsPerNm = 0.5f * static_cast<float>(kTextureSize) / ndRadiusNm;
  c.vdRangeNm = vdRangeNm;

  const float bottom = kVdTop + kVdHeight;
  const float right = kVdLeft + kVdWidth;
  const float feetPerVdPx = static_cast<float>((upperFeet - lowerFeet) / kVdHeight);
  // Screen y of an altitude given relative to the aircraft's, clamped to the plot.
  auto altToY = [&](float aboveAircraftFt) {
    const float y = kVdTop + static_cast<float>(upperFeet - planeAltFeet - static_cast<double>(aboveAircraftFt)) / feetPerVdPx;
    return std::fmin(std::fmax(y, kVdTop), bottom);
  };

  // One color's closed shape: the inner part, and a shoulder above and below it
  // that is narrower (two columns must agree).
  auto drawColour = [&](FsTextureId view, VdPass pass, float halfHeightFt, float rightLimit) {
    const float inner = halfHeightFt * kVdShoulderFraction;
    drawVdChannel(vg, view, c, pass, altToY(inner), altToY(-inner), rightLimit, 1.0f);
    drawVdChannel(vg, view, c, pass, altToY(halfHeightFt), altToY(inner), rightLimit, 0.5f);
    drawVdChannel(vg, view, c, pass, altToY(-inner), altToY(-halfHeightFt), rightLimit, 0.5f);
  };

  drawColour(precipView, VdPass::Yellow, kVdYellowHalfHeightFt, right);
  drawColour(precipView, VdPass::Green, kVdGreenHalfHeightFt, right);

  nvgSave(vg);
  nvgScissor(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  sharpenRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  colorizeRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  nvgRestore(vg);

  if (hotReady) {
    drawColour(hotView, VdPass::Wipe, kVdRedHalfHeightFt, right);
    if (showTurb) {
      const float turbFraction = kTurbulenceMaxRangeNm / vdRangeNm;
      drawColour(hotView, VdPass::Magenta, kVdRedHalfHeightFt,
                 kVdLeft + (turbFraction < 1.0f ? turbFraction : 1.0f) * kVdWidth);
    }
  }
}

#endif

}  // namespace

extern "C" {

MSFS_CALLBACK bool ndwxr_gauge_callback(FsContext ctx, int service_id, void* pData) {
  switch (service_id) {
    case PANEL_SERVICE_PRE_INSTALL: {
      Instance* instance = allocInstance();
      if (instance == nullptr) {
        return false;
      }
      *instance = Instance{};
      instance->inUse = true;
      instance->ctx = ctx;

      const sGaugeInstallData* installData = static_cast<const sGaugeInstallData*>(pData);
      instance->isRight = installData != nullptr && installData->strParameters != nullptr &&
                          (installData->strParameters[0] == 'R' || installData->strParameters[0] == 'r');

      // register_named_variable returns the same id for a name that is already
      // registered, so the shared variables can simply be registered again by
      // the second instance.
      g_attHdgKnob.id = register_named_variable(g_attHdgKnob.name);
      for (int i = 0; i < 3; ++i) {
        g_adirsLat[i].id = register_named_variable(g_adirsLat[i].name);
        g_adirsLon[i].id = register_named_variable(g_adirsLon[i].name);
      }
      for (int i = 0; i < 2; ++i) {
        g_lgciuLeftCompressed[i].id = register_named_variable(g_lgciuLeftCompressed[i].name);
        g_lgciuRightCompressed[i].id = register_named_variable(g_lgciuRightCompressed[i].name);
      }
#ifdef A380X
      g_wxrTawsSelected.id = register_named_variable(g_wxrTawsSelected.name);
      for (NamedVar& failed : g_wxrFailed) {
        failed.id = register_named_variable(failed.name);
      }
      g_wxrOff.id = register_named_variable(g_wxrOff.name);
      g_wxrTurbOff.id = register_named_variable(g_wxrTurbOff.name);
      g_wxrModeMap.id = register_named_variable(g_wxrModeMap.name);
      g_wxrVdOff.id = register_named_variable(g_wxrVdOff.name);
      instance->vdRangeLowerVar = register_named_variable(instance->isRight ? "A32NX_VD_2_RANGE_LOWER" : "A32NX_VD_1_RANGE_LOWER");
      instance->vdRangeUpperVar = register_named_variable(instance->isRight ? "A32NX_VD_2_RANGE_UPPER" : "A32NX_VD_1_RANGE_UPPER");
      instance->overlayVar = register_named_variable(instance->isRight ? "A380X_EFIS_R_ACTIVE_OVERLAY" : "A380X_EFIS_L_ACTIVE_OVERLAY");
      if (instance->isRight) {
        instance->powerBusVars[0] = register_named_variable("A32NX_ELEC_DC_1_BUS_IS_POWERED");
        instance->powerBusVars[1] = register_named_variable("A32NX_ELEC_DC_2_BUS_IS_POWERED");
      } else {
        instance->powerBusVars[0] = register_named_variable("A32NX_ELEC_108PH_BUS_IS_POWERED");
        instance->powerBusVars[1] = register_named_variable("A32NX_ELEC_DC_1_BUS_IS_POWERED");
      }
#else
      g_wxrSys.id = register_named_variable(g_wxrSys.name);
      g_wxrMode.id = register_named_variable(g_wxrMode.name);
      instance->powerBusVars[0] = register_named_variable(instance->isRight ? "A32NX_ELEC_AC_2_BUS_IS_POWERED"
                                                                            : "A32NX_ELEC_AC_ESS_BUS_IS_POWERED");
      instance->powerBusVars[1] = instance->powerBusVars[0];
#endif
      instance->ndModeVar = register_named_variable(instance->isRight ? "A32NX_EFIS_R_ND_MODE" : "A32NX_EFIS_L_ND_MODE");
      instance->ndRangeVar = register_named_variable(instance->isRight ? "A32NX_EFIS_R_ND_RANGE" : "A32NX_EFIS_L_ND_RANGE");

      NVGparams params;
      params.userPtr = ctx;
      params.edgeAntiAlias = false;
      instance->nvg = nvgCreateInternal(&params);

      // Per the SDK, each entry's color covers the band from the PREVIOUS
      // entry's rate up to its own rate (entry 0 covers 0 up to its rate), so the
      // rate on each entry is the band's UPPER edge. In-sim proof: a table whose
      // first entry was green up to 0.01 painted the whole clear-sky baseline
      // green. Entry 0 is therefore the transparent "nothing detected" band below
      // the first threshold. The SDK documents the rates as mm/h and allows up to
      // 128 entries. Both tables are 0/1 channel masks (see kPrecipGain).
      //
      // Precipitation view: R = rate >= yellow threshold, G = rate >= green.
      FsRainRateColor precipColors[3] = {
          {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, kGreenFromMmH},
          {FsColor{{0.0f, 1.0f, 0.0f, 1.0f}}, kYellowFromMmH},
          {FsColor{{1.0f, 1.0f, 0.0f, 1.0f}}, kTopBandRate},
      };
      instance->mapView = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      instance->mapViewReady = configureRadarView(ctx, instance->mapView, precipColors, 3);

      // Hot view: G = rate >= red threshold, R and B = rate >= turbulence
      // threshold. Drawn as the red wipe and the magenta (see WeatherPass). Kept
      // visible for its whole life (toggling visibility flashes an empty white
      // texture) and simply not drawn when the knob doesn't call for it.
      FsRainRateColor hotColors[3] = {
          {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, kRedFromMmH},
          {FsColor{{0.0f, 1.0f, 0.0f, 1.0f}}, kTurbulenceRateMmH},
          {FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, kTopBandRate},
      };
      instance->mapViewHot = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      instance->mapViewHotReady = configureRadarView(ctx, instance->mapViewHot, hotColors, 3);
      return true;
    }
    case PANEL_SERVICE_PRE_DRAW: {
      Instance* instance = findInstance(ctx);
      if (instance == nullptr || instance->nvg == nullptr) {
        return true;
      }

      bool isRoseNav = false;
      bool showPrecip = false;
      bool showTurb = false;
      float rangeNmForMode = 10.0f;
#ifdef A380X
      bool vdWanted = false;
      bool showVd = false;
      float vdRangeNm = 10.0f;
      double vdLowerFeet = 0.0;
      double vdUpperFeet = 0.0;
#endif

      if (isPowered(*instance)) {
        const double ndMode = get_named_variable_value(instance->ndModeVar);
        const double wxrMode = radarMode();
        const int ir = inertialSource(instance->isRight, static_cast<int>(g_attHdgKnob.read()));
        // The ARINC429 data field is 32 bits - matches every other usage of
        // this template in the codebase (cpp-msfs-framework/lib/arinc429.hpp),
        // <double> would read 8 bytes out of a 4-byte local (UB).
        const auto latWord = types::Arinc429Word<float>::fromSimVar(g_adirsLat[ir - 1].read());
        const auto lonWord = types::Arinc429Word<float>::fromSimVar(g_adirsLon[ir - 1].read());

        const int rangeIndex = static_cast<int>(get_named_variable_value(instance->ndRangeVar));
        const float rangeNm = kRangeTableNm[rangeIndex >= 0 && rangeIndex < kRangeCount ? rangeIndex : 0];

        // Gating: the ND is powered (above), the crew has the radar selected
        // and its system is up (radarSelected), the ND page is ARC or ROSE NAV
        // with a real range (not the A380X's OANS view), the ND's position
        // source is valid (ADIRS word validity is the "is position usable"
        // check) and the aircraft is airborne (the radar doesn't transmit on the
        // ground). MODE: WX = precipitation, WX+T = both, TURB = turbulence
        // only, MAP = ground mapping (not implemented, draws nothing).
        const bool positionValid = latWord.isNo() && lonWord.isNo();
        const bool active = radarSelected(*instance) && isArcOrRoseNav(ndMode) && rangeNm > 0.0f && positionValid && !isOnGround();
        showPrecip = active && instance->mapViewReady && (wxrMode == kWxrModeWx || wxrMode == kWxrModeWxTurb);
        showTurb = active && instance->mapViewHotReady && (wxrMode == kWxrModeWxTurb || wxrMode == kWxrModeTurb);
        isRoseNav = ndMode == kNdModeRoseNav;
        rangeNmForMode = isRoseNav ? rangeNm / 2.0f : rangeNm;
#ifdef A380X
        // The VD shows the weather too when the WX ON VD button is not OFF. Its
        // range is the ND range in ARC (10..160 NM) and half of it in ROSE NAV
        // (5..160 NM), as VerticalDisplay.tsx's vdRange.
        vdWanted = showPrecip && g_wxrVdOff.read() == 0.0;
        vdRangeNm = isRoseNav ? std::fmin(std::fmax(rangeNm / 2.0f, 5.0f), 160.0f) : std::fmin(std::fmax(rangeNm, 10.0f), 160.0f);
        vdLowerFeet = get_named_variable_value(instance->vdRangeLowerVar);
        vdUpperFeet = get_named_variable_value(instance->vdRangeUpperVar);
        showVd = vdWanted && vdUpperFeet > vdLowerFeet;
#endif
      }

      const bool drawsAnything = showPrecip || showTurb;
      if (!drawsAnything && !instance->layerDirty) {
        // Nothing on the surface from last frame and nothing to draw now -
        // skip opening a frame entirely.
        return true;
      }

      sGaugeDrawData* drawData = static_cast<sGaugeDrawData*>(pData);
      const float winWidth = static_cast<float>(drawData->winWidth);
      const float winHeight = static_cast<float>(drawData->winHeight);
      const float ratio = static_cast<float>(drawData->fbWidth) / static_cast<float>(drawData->fbHeight);
      NVGcontext* vg = instance->nvg;
      nvgBeginFrame(vg, winWidth, winHeight, ratio);

      if (instance->layerDirty) {
        clearLayer(vg, winWidth, winHeight);
      }
      if (showPrecip) {
        fsMapViewSet2DViewRadiusInMeters(ctx, instance->mapView, rangeNmForMode * kNmToMetres);
        drawWeatherRect(vg, instance->mapView, isRoseNav, 1.0f, WeatherPass::Additive);
        drawWeatherRect(vg, instance->mapView, isRoseNav, 1.0f, WeatherPass::Sharpen);
        drawWeatherRect(vg, instance->mapView, isRoseNav, 1.0f, WeatherPass::Colorize);
      }
      // The hot view carries the red wipe (any precipitation) and the magenta
      // (turbulence modes, near the aircraft only); the wipe also clears the green
      // channel under the magenta, in the whole rect.
      if ((showPrecip || showTurb) && instance->mapViewHotReady) {
        fsMapViewSet2DViewRadiusInMeters(ctx, instance->mapViewHot, rangeNmForMode * kNmToMetres);
        if (showPrecip) {
          drawWeatherRect(vg, instance->mapViewHot, isRoseNav, 1.0f, WeatherPass::Erase);
        }
        if (showTurb) {
          const float turbFraction = kTurbulenceMaxRangeNm / rangeNmForMode;
          const float turbRangeFraction = turbFraction < 1.0f ? turbFraction : 1.0f;
          drawWeatherRect(vg, instance->mapViewHot, isRoseNav, turbRangeFraction, WeatherPass::AdditiveMagenta);
        }
      }
#ifdef A380X
      // Last, so nothing of the ND's passes above can touch it: they only affect
      // the ND's rect, where the VD area (behind the aircraft) has no weather.
      if (showVd) {
        drawVdWeather(vg, instance->mapView, instance->mapViewHot, instance->mapViewHotReady, showTurb, rangeNmForMode, vdRangeNm,
                      planeAltitudeFeet(), vdLowerFeet, vdUpperFeet);
      }
#endif
      instance->layerDirty = drawsAnything;

      nvgEndFrame(vg);
      return true;
    }
    case PANEL_SERVICE_PRE_KILL: {
      Instance* instance = findInstance(ctx);
      if (instance == nullptr) {
        return true;
      }
      if (instance->mapView != 0) {
        fsMapViewDelete(ctx, instance->mapView);
      }
      if (instance->mapViewHot != 0) {
        fsMapViewDelete(ctx, instance->mapViewHot);
      }
      if (instance->nvg != nullptr) {
        nvgDeleteInternal(instance->nvg);
      }
      *instance = Instance{};
      return true;
    }
    default:
      return true;
  }
}

}  // extern "C"
