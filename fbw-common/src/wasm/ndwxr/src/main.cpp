// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native WASM ND weather radar and terrain gauge, built on MSFS_MapView.h's
// native weather radar API (which testing showed gives materially more
// consistent precipitation data across sessions than the JS/Bing map path it
// replaces) and its altitude view mode (the terrain, see the section on the
// terrain below).
//
// Draws ONLY the weather / terrain image, on the ND's map pages (the three ROSE pages
// and ARC, not PLAN), positioned/sized to match the ND's per-mode pixelRadius/centerYBias
// constants (arc/index.tsx, RoseModeUnderlay.tsx).
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
// The terrain (TERR ON ND) needs no SimBridge: an altitude-mode MapView colors the
// terrain by the aircraft's altitude minus the terrain height (in bands, water is
// not colored but always gets the list's first entry, so a second view tells water
// from land), and the Honeywell EGPWS look (dense / medium / light dots in red,
// yellow and green) is built from those bands with blend-only passes, see drawTerrain.
// The A380X's VD shows the terrain profile along the heading line in the same
// way, see drawVdTerrain (its weather is drawn in drawVdWeather).
//
// A module can have at most 8 MapViews: a ninth crashes the module's gauge draw
// when it is drawn (hiding views does not help), so the A32NX has 4 per ND
// (precipitation, hot, terrain, water) and the A380X 2 per ND, which are the
// weather pair or the terrain pair (the terrain takes the weather's place) and are
// reconfigured when the crew switches, and 2 per VD terrain gauge. The module also
// reserves its memory up front (build.sh): growing it while drawing crashes too.
//
// Built twice from this file, like terronnd: for the A32NX (default) and for
// the A380X (-DA380X). They differ in the ND range table, in which power buses
// switch the ND on, in how the crew selects the radar, and in which inertial
// reference feeds each side (see the #ifdef A380X blocks).
//
// Stacked as an extra htmlgauge on each ND's existing panel.cfg block
// (A32NX: VCockpit02 = CPT, VCockpit15 = F/O; A380X: VCockpit07 = CPT,
// VCockpit08 = F/O). Like terronnd, the last gauge parameter selects the side
// ("L" or "R"; no parameter means "L"; on the A380X a trailing "V" makes it the
// VD terrain gauge of that side, a further gauge on the same ND because the
// weather VD's whole-rect passes would destroy terrain drawn in the same
// surface). All gauges run inside one WASM module instance, so all per-gauge
// state lives in an Instance keyed by the gauge's FsContext.

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
// ADIRS true heading words for IR 1..3 (the rotation of the ND's map, see drawTerrain).
NamedVar g_adirsTrueHeading[3] = {{"A32NX_ADIRS_IR_1_TRUE_HEADING"}, {"A32NX_ADIRS_IR_2_TRUE_HEADING"}, {"A32NX_ADIRS_IR_3_TRUE_HEADING"}};
// The EGPWC's gear-down flag (EGPWC_GEAR_IS_DOWN), which the terrain levels depend on.
NamedVar g_egpwcGearDown{"A32NX_EGPWC_GEAR_IS_DOWN"};
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
// The TERR side of the same two systems (EfisTawsBridge.ts).
NamedVar g_terrFailed[2] = {{"A32NX_TERR_1_FAILED"}, {"A32NX_TERR_2_FAILED"}};
// The TERR SYS button of the SURV page: 1 = OFF (takes the terrain off the VD).
NamedVar g_terrSysOff{"A32NX_GPWS_TERR_OFF"};

// A380X_EFIS_x_ACTIVE_OVERLAY (FcuBusPublisher.ts): 0 = none, 1 = WXR, 2 = TERR.
constexpr double kOverlayWxr = 1.0;
constexpr double kOverlayTerr = 2.0;

// The AIR DATA switching knob and the ADR baro-corrected altitude words for ADR 1..3
// (index 0..2), baro correction 1 (CPT side) and 2 (F/O side): the altitude the VD's
// scale is drawn against, see drawVdWeather.
NamedVar g_airDataKnob{"A32NX_AIR_DATA_SWITCHING_KNOB"};
NamedVar g_adrBaroAlt1[3] = {{"A32NX_ADIRS_ADR_1_BARO_CORRECTED_ALTITUDE_1"},
                             {"A32NX_ADIRS_ADR_2_BARO_CORRECTED_ALTITUDE_1"},
                             {"A32NX_ADIRS_ADR_3_BARO_CORRECTED_ALTITUDE_1"}};
NamedVar g_adrBaroAlt2[3] = {{"A32NX_ADIRS_ADR_1_BARO_CORRECTED_ALTITUDE_2"},
                             {"A32NX_ADIRS_ADR_2_BARO_CORRECTED_ALTITUDE_2"},
                             {"A32NX_ADIRS_ADR_3_BARO_CORRECTED_ALTITUDE_2"}};

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
// axis and extruded vertically, shaped like the cells of a real VD:
//  - green and yellow are columns from the bottom of the VD up to a rounded,
//    tapering top (kVdGreenTopSpan / kVdYellowTopSpan above the aircraft altitude);
//  - the red core is a block centred on the aircraft's altitude (+-kVdRedHalfSpan),
//    where the ND measures it, with a rounded magenta lens (turbulence) inside it.
// All the heights are made up, and given as fractions of the altitude span of the
// VD plot (in-sim, fixed heights of thousands of feet were far above the plot at low
// altitude, where the VD only spans about 5000 ft, so no top was ever visible).
//
// The rounded top is built from levels (kVdColumnDome / kVdLensDome): level 0 is the
// whole shape, only up to a fraction of the height; each further level covers the next
// band of height but only where the shape is also there depthPx to both sides along
// the range axis (an erosion: three taps, all must agree), so the shape is narrower
// the higher it goes. The levels follow the outline of a quarter ellipse (steep near
// the shape's edge, flat on top), so a column has straight sides up to about half its
// height and rounded shoulders, and a lens is pointed like a real red core. Each level
// only draws its own band of height (plus a small overlap, kVdBandOverlapPx).
//
// Like the real VD (which shows the weather along the aircraft's direction only)
// the base level shows the STRONGEST weather in a narrow wedge around the heading
// line (half angle atan(kVdWedgeTan)): kVdLateralTapsPerSide columns on each side
// of the line are drawn on top of each other (a union), each one only from the
// range where it enters the wedge. The raw ND texture has single-texel specks and
// radial sweep streaks that the ND's own blur removes; here each column has to be at
// least 2 * kVdSpeckPx wide to count (two taps, both must agree), otherwise they came
// out as thin full-height lines.
//
// Each output color channel is driven by its own mask channel (precipitation view:
// R = yellow and above, G = green and above; hot view: G = red and above, R/B =
// turbulence), so every channel can be clipped to its own altitude window without
// mixing channels; the red wipe removes the green channel inside the red core.
constexpr float kVdGreenTopSpan = 0.42f;
constexpr float kVdYellowTopSpan = 0.26f;
constexpr float kVdRedHalfSpan = 0.16f;
// The VD is squared harder than the ND (kSharpenPasses): the eroded levels only
// reach full strength where both taps agree, and the half values in between
// showed as dim patches and hairlines.
constexpr int kVdSharpenPasses = 4;
constexpr float kVdSpeckPx = 3.0f;
// How much of the green channel survives the red core's wipe on the VD. Much lower than
// kEraseRemainder: a band drawn once or twice (where two levels overlap) must wipe the
// same, otherwise the overlaps showed as lighter stripes through the magenta core.
constexpr float kVdEraseRemainder = 0.002f;
struct VdDomeLevel {
  float depthPx;         // how far inside the shape (along the range axis, VD pixels) this level needs to be
  float heightFraction;  // how much of the full height it reaches
};
// h = h0 + (1 - h0) * sqrt(1 - (1 - t)^2), depth = t * 24 (columns, h0 = 0.5, t = 0, 1/7 .. 1)
// or t * 24 (magenta lens, h0 = 0.35, t = 0, 1/3 .. 1; its first level is eroded by kVdSpeckPx).
constexpr VdDomeLevel kVdColumnDome[] = {{0.0f, 0.5f},   {3.4f, 0.758f},  {6.9f, 0.85f},   {10.3f, 0.91f},
                                         {13.7f, 0.952f}, {17.1f, 0.979f}, {20.6f, 0.995f}, {24.0f, 1.0f}};
constexpr VdDomeLevel kVdLensDome[] = {{kVdSpeckPx, 0.35f}, {8.0f, 0.834f}, {16.0f, 0.963f}, {24.0f, 1.0f}};
constexpr int kVdColumnDomeCount = 8;
constexpr int kVdLensDomeCount = 4;
// The magenta lens is this fraction of the red block's half height, so it sits inside it.
constexpr float kVdMagentaFraction = 0.85f;
// Why the red core is a plain block and only the magenta is a rounded lens: the red is made
// by wiping the green channel out of the yellow with a multiply blend, and a multiply can
// only be "any one tap sees the weather" (a dilation - the erosion taps made the outer levels
// WIDER than the inner ones, an hourglass), never "all taps agree". Additive passes (the
// magenta, the columns) can be eroded properly.
// Each level's band reaches this far into the band below it. The edge of a band
// falls on a fractional pixel, where the two neighbouring bands only cover part
// of it each; the VD's sharpening passes (kVdSharpenPasses) square such a
// half-covered pixel to black, which drew a dark seam between every two levels.
// Where both levels cover the pixel the overlap just adds up to full.
constexpr float kVdBandOverlapPx = 3.0f;
constexpr float kVdWedgeTan = 0.176f;  // tan(10 deg)
constexpr int kVdLateralTapsPerSide = 3;
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

// Mirrors EfisNdMode in fbw-common/.../NavigationDisplay.ts:33-39 (ROSE ILS = 0,
// ROSE VOR = 1, ROSE NAV = 2, ARC = 3, PLAN = 4).
#ifdef A380X
constexpr double kNdModeRoseNav = 2.0;
#endif
constexpr double kNdModeArc = 3.0;
constexpr double kNdModePlan = 4.0;

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
#ifndef A380X
  // EGPWC_ND_x_TERRAIN_ACTIVE: this side's TERR ON ND pb is on, the ND is powered
  // and the position data is valid (enhanced_gpwc/navigation_display.rs).
  ID terrainActiveVar = -1;
#endif
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
  // The terrain on the ND: an altitude-mode map view, coloured relative to the aircraft.
  FsTextureId mapViewTerrain = 0;
  bool mapViewTerrainReady = false;
  // Tells water from land for the terrain (see configureWaterMaskView).
  FsTextureId mapViewWater = 0;
  bool mapViewWaterReady = false;
  // The dither image of the terrain (created on first use) and the gear state the
  // color list was last set for (-1 = not yet).
  int terrainPatternImage = 0;
  int terrainGearState = -1;
  // The weather radar's mode text for the JS ND (0 none, 1 WX, 2 WX+T, 3 TURB, 4 MAP): the LVar the
  // ND reads (A32NX_WXR_ND_{L,R}_MODE) and the value last written to it.
  ID wxrLabelVar = -1;
  int wxrLabelShown = -1;
#ifdef A380X
  // The A380X's third gauge per ND (the "V" parameter) draws the terrain profile on the VD, see
  // drawVdTerrainGauge.
  bool isVdTerrain = false;
  FsTextureId mapViewVdTerrain = 0;
  bool mapViewVdTerrainReady = false;
  int vdRampImage = 0;
  // The ND's two views (mapView, mapViewHot) are the weather pair (role 0) or the terrain and water pair
  // (role 1); a change of role reconfigures them and leaves them alone for a while (see the ND draw).
  int ndRole = 0;
  int roleWarmupLeft = 0;
  // Frames the VD terrain has been showing (its views' settings only follow the aircraft while it does).
  int vdShowFrames = 0;
#endif
#ifdef A380X
  // The VD's altitude limits (see kVdLeft).
  ID vdRangeLowerVar = -1;
  ID vdRangeUpperVar = -1;
#endif

  // True when the previous frame left anything on this gauge's surface that
  // needs clearing before the next draw (or before going quiet).
  bool layerDirty = false;
};

// The A380X installs 4 gauges (L, R, LV, RV); twice that, so a gauge reinstalled by the
// sim without a PRE_KILL of the old one (an aircraft switch) still finds a free slot.
constexpr int kMaxInstances = 8;
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

// The pages with a moving map: the three ROSE pages and ARC (not PLAN). The weather
// radar and the terrain are shown on all of them, as on the real aircraft.
bool isMapPage(double ndMode) {
  return ndMode >= 0.0 && ndMode < kNdModePlan;
}

#ifdef A380X
// The pages the A380X's VD is shown under (VerticalDisplay.tsx hides it on ROSE ILS / VOR and PLAN).
bool isArcOrRoseNav(double ndMode) {
  return ndMode == kNdModeArc || ndMode == kNdModeRoseNav;
}
#endif

#ifdef A380X
// Which air data reference feeds this ND: ADR 1 for the CPT and ADR 2 for the F/O, or
// ADR 3 when the AIR DATA switching knob routes it to that side - getSupplier() in the
// A380X's Common/utils.tsx, as AdirsValueProvider applies it to the ND.
int airDataSource(bool isRight, int airDataKnob) {
  constexpr int kAdr3ToCaptain = 0;
  constexpr int kAdr3ToFo = 2;
  if (isRight) {
    return airDataKnob == kAdr3ToFo ? 3 : 2;
  }
  return airDataKnob == kAdr3ToCaptain ? 3 : 1;
}
#endif

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

// A module can have at most 8 map views: a ninth (and any later) one is created without complaint, but crashes
// the module's gauge draw as soon as it is drawn (measured in-sim 2026-09-20; hiding views does not help, only
// the number that exist counts). The A320 has 4 per ND (precipitation, hot, terrain, water); the A380X has 2 per
// ND, which are either the weather pair or the terrain pair (never both at once), and 2 per VD terrain gauge.

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
#ifdef A380X
  // The A380X's ND views switch between this and the terrain (an altitude view).
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_AERIAL);
#endif
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
void sharpenRect(NVGcontext* vg, float x, float y, float w, float h, int passes = kSharpenPasses) {
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_DST_COLOR, NVG_ZERO, NVG_ONE);
  for (int i = 0; i < passes; ++i) {
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
void drawWeatherRect(NVGcontext* vg, FsTextureId mapView, bool isRose, float rangeFraction, WeatherPass pass) {
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

// Whether the crew has TERR ON ND selected on this side and the terrain system can
// supply it (the ND page, position source and range are checked separately).
#ifdef A380X
// A TAWS system (selected on the SURV panel) that has not failed: EfisTawsBridge's terrFailed, where
// no system selected counts as failed.
bool terrainSystemUp() {
  const int system = static_cast<int>(g_wxrTawsSelected.read());
  if (system != 1 && system != 2) {
    return false;
  }
  return g_terrFailed[system - 1].read() == 0.0;
}
#endif

bool terrainSelected(const Instance& instance) {
#ifdef A380X
  // EfisTawsBridge's terrOnNd: the TERR overlay on this side's EFIS control panel and the TAWS system up.
  return get_named_variable_value(instance.overlayVar) == kOverlayTerr && terrainSystemUp();
#else
  return get_named_variable_value(instance.terrainActiveVar) != 0.0;
#endif
}

// The color list: kTerrainBandCount equal bands of kTerrainBandFeet over
// [kTerrainMinFeet, kTerrainMaxFeet] of (aircraft altitude - terrain height). The range is deliberately
// far wider on the "terrain above the aircraft" side than the 2000 ft the display cares about: terrain
// beyond the range's top is NOT drawn with the first entry (measured in-sim 2026-09-20 with a probe at
// Aspen and in the Alps: mountains 3000+ ft above the aircraft came out in a rainbow of other entries,
// no red at all), whereas terrain beyond the bottom does take the last entry. So the top has to reach
// past any terrain (Everest is 29,000 ft above sea level): the bands above +2000 ft all carry the red
// entry. 128 entries of 250 ft cover -29,500 .. +2,500 ft, band edges on multiples of 250 ft.
constexpr float kTerrainBandFeet = 250.0f;
constexpr int kTerrainBandCount = 128;
constexpr float kTerrainMinFeet = -29500.0f;
constexpr float kTerrainMaxFeet = kTerrainMinFeet + kTerrainBandFeet * static_cast<float>(kTerrainBandCount);

// The two dot styles of the terrain. ORDERED is a regular 4x4 Bayer pattern (14/16, 7/16 and
// 3/16 of the cells lit); the first in-sim version, and liked. RANDOM is white noise like the
// real display, whose dense-red area was measured on a photo of a real A320 ND at about 70%
// lit, in irregular clumps of about one ND pixel cells (medium and light are guesses).
enum class TerrainDotStyle { Ordered, Random };
constexpr TerrainDotStyle kTerrainDotStyle = TerrainDotStyle::Random;
constexpr bool kOrderedDots = kTerrainDotStyle == TerrainDotStyle::Ordered;

// Dot density of the three levels (the fraction of lit cells).
constexpr float kTerrainDense = kOrderedDots ? 14.0f / 16.0f : 0.70f;
constexpr float kTerrainMedium = kOrderedDots ? 7.0f / 16.0f : 0.40f;
constexpr float kTerrainLight = kOrderedDots ? 3.0f / 16.0f : 0.18f;
// The water is blue dots at every altitude (the look of the other addons' TERR ON ND): the dot density, and the
// blue channel's level (the green channel of the water dots is at the radar's green level, which makes cyan).
constexpr float kTerrainWater = kOrderedDots ? 9.0f / 16.0f : 0.60f;
constexpr float kTerrainWaterBlue = 1.0f;

// Size of the dither image in cells, of one cell in ND pixels, and how often the 0/1
// result is squared (2^kTerrainSharpenPasses has to crush the not-lit side to black).
constexpr int kTerrainPatternCells = kOrderedDots ? 4 : 128;
constexpr float kTerrainDotCellPx = 2.0f;
constexpr int kTerrainSharpenPasses = 8;

// Terrain elevation relative to the aircraft (feet) where the levels start; the
// gear position moves the lower ones (Honeywell: 500 ft gear up, 250 ft gear down).
constexpr float kTerrainRedFromFeet = 2000.0f;
constexpr float kTerrainDenseYellowFromFeet = 1000.0f;
constexpr float kTerrainLightGreenFromFeet = -2000.0f;

void terrainBandColor(int band, bool gearDown, float* r, float* g) {
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
    colors[band] = FsColor{{r, g, 0.0f, 1.0f}};
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, kTerrainBandCount);
}

bool configureTerrainView(FsContext ctx, FsTextureId id) {
  if (id == 0) {
    return false;
  }
  // As for the radar views: the view stays visible for its whole life.
  fsMapViewSetVisibility(ctx, id, true);
  fsMapViewSetBackgroundColor(ctx, id, FsColor{{0.0f, 0.0f, 0.0f, 1.0f}});
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);
  fsMapViewSetWeatherRadarVisibility(ctx, id, false);
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_ALTITUDE);
  fsMapViewSetAltitudeReference(ctx, id, FS_MAP_VIEW_ALTITUDE_REFERENCE_PLANE);
  fsMapViewSetAltitudeRangeInFeet(ctx, id, kTerrainMinFeet, kTerrainMaxFeet);
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

// The area the terrain covers: the compass disk in the ROSE modes, the forward half
// of it in ARC.
void terrainPath(NVGcontext* vg, float cx, float cy, float radius, bool isRose) {
  constexpr float kPi = 3.14159265f;
  nvgBeginPath(vg);
  if (isRose) {
    nvgCircle(vg, cx, cy, radius);
  } else {
    nvgMoveTo(vg, cx, cy);
    nvgArc(vg, cx, cy, radius, kPi, 2.0f * kPi, NVG_CW);
    nvgClosePath(vg);
  }
}

// Water is never coloured by the altitude list: the engine gives it the FIRST entry, the same
// one that terrain far above the aircraft ends up on (dense red in the terrain view: a red
// sea). A second view with a two-entry list and a range far below any real value tells the
// two apart: everything on land is beyond the range and lands on the last entry (black),
// water is on the first (white). The terrain drawn over water is wiped and replaced by
// what sea level really is relative to the aircraft.
constexpr float kWaterMaskMinFeet = -60000.0f;
constexpr float kWaterMaskMaxFeet = -50000.0f;

bool configureWaterMaskView(FsContext ctx, FsTextureId id) {
  if (id == 0) {
    return false;
  }
  fsMapViewSetVisibility(ctx, id, true);
  fsMapViewSetBackgroundColor(ctx, id, FsColor{{0.0f, 0.0f, 0.0f, 1.0f}});
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);
  fsMapViewSetWeatherRadarVisibility(ctx, id, false);
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_ALTITUDE);
  fsMapViewSetAltitudeReference(ctx, id, FS_MAP_VIEW_ALTITUDE_REFERENCE_PLANE);
  fsMapViewSetAltitudeRangeInFeet(ctx, id, kWaterMaskMinFeet, kWaterMaskMaxFeet);
  FsColor colors[2] = {FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, FsColor{{0.0f, 0.0f, 0.0f, 1.0f}}};
  fsMapViewSetAltitudeColorList(ctx, id, colors, 2);
  return true;
}

#ifdef A380X
// The sim's own (true) altitude, for the VD terrain view's range (see drawVdTerrainGauge).
double planeAltitudeFeet() {
  static const ENUM planeAltitude = get_aircraft_var_enum("PLANE ALTITUDE");
  static const ENUM feet = get_units_enum("feet");
  return aircraft_varget(planeAltitude, feet, 0);
}
#endif

void drawTerrain(NVGcontext* vg, FsTextureId view, FsTextureId waterView, int patternImage, bool isRose, float headingDegrees) {
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
  const FsColor halfTint{{half, half, half, 1.0f}};

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
  water.innerColor = water.outerColor = FsColor{{1.0f, 1.0f, 1.0f, 1.0f}};
  nvgFillPaint(vg, water);
  nvgFill(vg);
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  terrainPath(vg, cx, cy, radius, isRose);
  NVGpaint sea = nvgImagePattern(vg, originX, originY, radius * 2.0f, radius * 2.0f, angle, waterView, 1.0f);
  const float waterDensity = encodeSrgb(0.5f * kTerrainWater);
  sea.innerColor = sea.outerColor = FsColor{{0.0f, waterDensity, waterDensity, 1.0f}};
  nvgFillPaint(vg, sea);
  nvgFill(vg);

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

#ifdef A380X
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

// Blend mode and per-tap tint of one VD pass. gain 1 = one tap is enough, 1/2 = both
// of two taps must agree, 1/3 = all of three (a tap adds / removes that share).
void setVdPassState(NVGcontext* vg, VdPass pass, float gain, FsColor* tint) {
  const float g = encodeSrgb(gain);
  if (pass == VdPass::Wipe) {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
    *tint = FsColor{{0.0f, encodeSrgb(1.0f - std::pow(kVdEraseRemainder, gain)), 0.0f, 1.0f}};
  } else {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
    *tint = pass == VdPass::Yellow  ? FsColor{{g, 0.0f, 0.0f, 1.0f}}
            : pass == VdPass::Green ? FsColor{{0.0f, g, 0.0f, 1.0f}}
                                    : FsColor{{g, 0.0f, g, 1.0f}};
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
void drawVdErodedRect(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float lateralTexels, float depthPx,
                      int taps, float left, float rightLimit, float top, float bottom) {
  if (bottom <= top || rightLimit <= left) {
    return;
  }
  FsColor tint;
  setVdPassState(vg, pass, 1.0f / static_cast<float>(taps), &tint);
  nvgScissor(vg, left, top, rightLimit - left, bottom - top);
  for (int i = -1; i <= 1; ++i) {
    if (taps == 2 && i == 0) {
      continue;
    }
    if (taps == 1 && i != 0) {
      continue;
    }
    nvgBeginPath(vg);
    nvgRect(vg, left, top, rightLimit - left, bottom - top);
    NVGpaint paint = nvgImagePattern(vg, c.originX + static_cast<float>(i) * depthPx, c.originY + lateralTexels * kVdColumnTexelPx,
                                     c.extentAcross, c.extentAlong, kHalfPi, view, 1.0f);
    paint.innerColor = paint.outerColor = tint;
    nvgFillPaint(vg, paint);
    nvgFill(vg);
  }
}

// Level 0 of a shape: the columns of the wedge (see kVdWedgeTan) drawn on top of each other
// (a union), each clipped to the band and to the range where it lies inside the wedge.
void drawVdUnion(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float top, float bottom, float rightLimit) {
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
void drawVdEroded(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float depthPx, float top, float bottom,
                  float rightLimit) {
  if (bottom <= top) {
    return;
  }
  nvgSave(vg);
  drawVdErodedRect(vg, view, c, pass, 0.0f, depthPx, 3, kVdLeft + depthPx, rightLimit, top, bottom);
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

// Draws the stylised VD weather (see kVdGreenTopSpan). ndRadiusNm is the radius the
// ND's radar views were set to; vdRangeNm the VD's range; baroAltFeet the aircraft's
// altitude on the VD's scale (the ADR's baro-corrected altitude, like the VD's own symbol).
void drawVdWeather(NVGcontext* vg, FsTextureId precipView, FsTextureId hotView, bool hotReady, bool showTurb,
                   float ndRadiusNm, float vdRangeNm, double baroAltFeet, double lowerFeet, double upperFeet) {
  VdColumns c;
  c.extentAlong = 2.0f * ndRadiusNm / vdRangeNm * kVdWidth;
  c.extentAcross = static_cast<float>(kTextureSize) * kVdColumnTexelPx;
  c.originX = kVdLeft + 0.5f * c.extentAlong;
  c.originY = kVdTop + 0.5f * kVdHeight - 0.5f * c.extentAcross;
  c.texelsPerNm = 0.5f * static_cast<float>(kTextureSize) / ndRadiusNm;
  c.vdRangeNm = vdRangeNm;

  const float bottom = kVdTop + kVdHeight;
  const float right = kVdLeft + kVdWidth;
  const float spanFt = static_cast<float>(upperFeet - lowerFeet);
  const float feetPerVdPx = spanFt / kVdHeight;
  // Screen y of an altitude given relative to the aircraft's, clamped to the plot.
  auto altToY = [&](float aboveAircraftFt) {
    const float y = kVdTop + static_cast<float>(upperFeet - baroAltFeet - static_cast<double>(aboveAircraftFt)) / feetPerVdPx;
    return std::fmin(std::fmax(y, kVdTop), bottom);
  };

  // A column's shape, level by level (see kVdColumnDome): from the bottom of the plot up to
  // the level's height. Every level draws only the band of height between the previous
  // level's height and its own (plus the overlap).
  auto drawColumn = [&](FsTextureId view, VdPass pass, float heightFt, float rightLimit) {
    float previousFt = 0.0f;
    for (int i = 0; i < kVdColumnDomeCount; ++i) {
      const float h = heightFt * kVdColumnDome[i].heightFraction;
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

  drawColumn(precipView, VdPass::Yellow, kVdYellowTopSpan * spanFt, right);
  drawColumn(precipView, VdPass::Green, kVdGreenTopSpan * spanFt, right);

  nvgSave(vg);
  nvgScissor(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  sharpenRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight, kVdSharpenPasses);
  colorizeRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  nvgRestore(vg);

  if (hotReady) {
    // The red core: the heading-line column's hot mask wipes the green out of the yellow over
    // the block +-kVdRedHalfSpan around the aircraft's altitude (not eroded, see kVdMagentaFraction).
    const float redHalfFt = kVdRedHalfSpan * spanFt;
    if (altToY(-redHalfFt) > altToY(redHalfFt)) {
      nvgSave(vg);
      drawVdErodedRect(vg, hotView, c, VdPass::Wipe, 0.0f, 0.0f, 1, kVdLeft, right, altToY(redHalfFt), altToY(-redHalfFt));
      nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
      nvgRestore(vg);
    }

    if (showTurb) {
      // The magenta: a rounded lens inside the red block, within the turbulence range.
      const float turbFraction = kTurbulenceMaxRangeNm / vdRangeNm;
      const float magentaRight = kVdLeft + (turbFraction < 1.0f ? turbFraction : 1.0f) * kVdWidth;
      const float halfFt = kVdMagentaFraction * redHalfFt;
      float previousFt = 0.0f;
      for (int i = 0; i < kVdLensDomeCount; ++i) {
        const float h = halfFt * kVdLensDome[i].heightFraction;
        if (i == 0) {
          drawVdEroded(vg, hotView, c, VdPass::Magenta, kVdLensDome[i].depthPx, altToY(h), altToY(-h), magentaRight);
        } else {
          const float upperTop = altToY(h);
          const float upperBottom = altToY(previousFt);
          if (upperBottom > upperTop) {
            drawVdEroded(vg, hotView, c, VdPass::Magenta, kVdLensDome[i].depthPx, upperTop,
                         std::fmin(upperBottom + kVdBandOverlapPx, kVdTop + kVdHeight), magentaRight);
          }
          const float lowerTop = altToY(-previousFt);
          const float lowerBottom = altToY(-h);
          if (lowerBottom > lowerTop) {
            drawVdEroded(vg, hotView, c, VdPass::Magenta, kVdLensDome[i].depthPx, std::fmax(lowerTop - kVdBandOverlapPx, kVdTop),
                         lowerBottom, magentaRight);
          }
        }
        previousFt = h;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Terrain profile on the VD (A380X). Its own gauge instance (the "V" panel.cfg
// parameter), because it needs whole-rect passes (a compare against a ramp, then
// squaring) that would destroy the weather drawn in the same rect by the ND's
// instance; each gauge has its own surface, and both are added onto the display.
//
// The terrain along the heading line is read from an altitude-mode MapView whose
// color list codes ELEVATION as brightness: entry k of kVdTerrainSteps is
// I = 1 - (k + 0.5) / kVdTerrainSteps, and the view's range is set every frame to
// [altitude - VD upper limit, altitude - VD lower limit] (the engine colors by
// altitude MINUS terrain height), so a texel's brightness is the fraction of the VD
// plot height that the terrain reaches. The texture column along the heading line is
// stretched over the whole plot height (see kVdColumnTexelPx) and compared with a
// vertical ramp: the same "add half the value and half the complement of the
// threshold, double, square" compare as the terrain dots, which lights a pixel where
// brightness >= ramp, i.e. a bar from the bottom up to the terrain. Water (see
// configureWaterMaskView) is wiped out of it and drawn as flat cyan up to sea level.
// The profile follows the heading line, not the flight plan path (which the real
// VD follows through turns).
// ---------------------------------------------------------------------------
constexpr int kVdTerrainSteps = 64;
constexpr int kVdRampRows = 256;
// The ramp never quite reaches 0, so a texel of no terrain (brightness 0) stays unlit
// in the bottom row too.
constexpr float kVdRampFloor = 1.0f / 64.0f;
constexpr int kVdTerrainSharpenPasses = 8;

// The color list of the VD terrain view: steps entries of brightness 1 - (k + 0.5) / steps.
void setVdTerrainList(FsContext ctx, FsTextureId id, int steps) {
  FsColor colors[kVdTerrainSteps];
  for (int k = 0; k < steps; ++k) {
    const float brightness = 1.0f - (static_cast<float>(k) + 0.5f) / static_cast<float>(steps);
    colors[k] = FsColor{{brightness, brightness, brightness, 1.0f}};
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, static_cast<unsigned>(steps));
}

bool configureVdTerrainView(FsContext ctx, FsTextureId id) {
  if (id == 0) {
    return false;
  }
  fsMapViewSetVisibility(ctx, id, true);
  fsMapViewSetBackgroundColor(ctx, id, FsColor{{0.0f, 0.0f, 0.0f, 1.0f}});
  fsMapViewSet2DViewFollowMode(ctx, id, true);
  fsMapViewSetMapIsolinesVisibility(ctx, id, false);
  fsMapViewSetWeatherRadarVisibility(ctx, id, false);
  fsMapViewSetViewMode(ctx, id, FS_MAP_VIEW_MODE_ALTITUDE);
  fsMapViewSetAltitudeReference(ctx, id, FS_MAP_VIEW_ALTITUDE_REFERENCE_PLANE);
  fsMapViewSetAltitudeRangeInFeet(ctx, id, -20000.0, 20000.0);  // replaced every frame
  setVdTerrainList(ctx, id, kVdTerrainSteps);
  return true;
}

// The complement (1 - threshold) of the ramp, top to bottom: 0 at the top of the plot,
// about 1 at the bottom.
int createVdRamp(NVGcontext* vg) {
  constexpr int kRampWidth = 4;
  static unsigned char data[kRampWidth * kVdRampRows * 4];
  for (int row = 0; row < kVdRampRows; ++row) {
    const float complement = (1.0f - kVdRampFloor) * static_cast<float>(row) / static_cast<float>(kVdRampRows - 1);
    const unsigned char value = static_cast<unsigned char>(complement * 255.0f + 0.5f);
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

void drawVdTerrain(NVGcontext* vg, FsTextureId terrainView, FsTextureId waterView, int rampImage, float vdRangeNm, float headingDegrees,
                   double lowerFeet, double upperFeet) {
  constexpr float kDegToRad = 0.01745329f;
  const float vdBottom = kVdTop + kVdHeight;
  const float centerY = kVdTop + 0.5f * kVdHeight;

  // The views' north-up texture (768 texels across 2 * vdRangeNm), rotated by minus the
  // heading about the aircraft (nvgImagePattern rotates about the image's top-left corner,
  // so that corner is moved to where it lands): pattern units are texels, the origin is
  // the aircraft, and "ahead" is -y.
  const float angle = -headingDegrees * kDegToRad;
  const float sinA = std::sin(angle);
  const float cosA = std::cos(angle);
  const float halfTexels = 0.5f * static_cast<float>(kTextureSize);
  const float originX = -halfTexels * cosA + halfTexels * sinA;
  const float originY = -halfTexels * sinA - halfTexels * cosA;
  const float texelsPerNm = halfTexels / vdRangeNm;
  const float pxPerTexel = (kVdWidth / vdRangeNm) / texelsPerNm;  // along the range axis

  // One view's heading-line column, stretched over the plot height: screen x = kVdLeft -
  // pxPerTexel * y (ahead is to the right), screen y = centerY + kVdColumnTexelPx * x, so the
  // column x = 0 covers the plot and its neighbours are thousands of pixels away. Clipped to
  // [top, top + height] of the plot by a screen-space scissor.
  auto stripe = [&](FsTextureId view, const FsColor& tint, float top, float height) {
    nvgSave(vg);
    nvgScissor(vg, kVdLeft, top, kVdWidth, height);
    nvgTransform(vg, 0.0f, kVdColumnTexelPx, -pxPerTexel, 0.0f, kVdLeft, centerY);
    nvgBeginPath(vg);
    nvgRect(vg, -0.05f, -kVdWidth / pxPerTexel - 2.0f, 0.1f, kVdWidth / pxPerTexel + 4.0f);
    NVGpaint paint = nvgImagePattern(vg, originX, originY, static_cast<float>(kTextureSize), static_cast<float>(kTextureSize), angle, view, 1.0f);
    paint.innerColor = paint.outerColor = tint;
    nvgFillPaint(vg, paint);
    nvgFill(vg);
    nvgRestore(vg);
  };

  const float half = encodeSrgb(0.5f);
  const FsColor halfTint{{half, half, half, 1.0f}};

  // 1. the elevation-coded column at half strength, 2. with the water wiped out of it.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  stripe(terrainView, halfTint, kVdTop, kVdHeight);
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
  stripe(waterView, FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, kVdTop, kVdHeight);

  nvgSave(vg);
  nvgScissor(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);

  // 3. the ramp's complement at half strength: the sum passes 1 where brightness >= ramp.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
  nvgBeginPath(vg);
  nvgRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  NVGpaint ramp = nvgImagePattern(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight, 0.0f, rampImage, 1.0f);
  ramp.innerColor = ramp.outerColor = halfTint;
  nvgFillPaint(vg, ramp);
  nvgFill(vg);

  // 4. doubling, 5. squaring (as for the terrain dots).
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_DST_COLOR, NVG_ONE, NVG_ZERO, NVG_ONE);
  nvgBeginPath(vg);
  nvgRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
  nvgFill(vg);
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_DST_COLOR, NVG_ZERO, NVG_ONE);
  for (int i = 0; i < kVdTerrainSharpenPasses; ++i) {
    nvgBeginPath(vg);
    nvgRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
    nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
    nvgFill(vg);
  }

  // 6. the brown of the real VD's terrain, a little lighter at the top.
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_SRC_COLOR, NVG_ZERO, NVG_ONE);
  nvgBeginPath(vg);
  nvgRect(vg, kVdLeft, kVdTop, kVdWidth, kVdHeight);
  nvgFillPaint(vg, nvgLinearGradient(vg, 0.0f, kVdTop, 0.0f, vdBottom, nvgRGBAf(0.62f, 0.29f, 0.10f, 1.0f), nvgRGBAf(0.42f, 0.19f, 0.06f, 1.0f)));
  nvgFill(vg);
  nvgRestore(vg);

  // 7. the water: flat cyan from sea level down to the bottom of the plot.
  if (lowerFeet < 0.0) {
    const float feetPerPx = static_cast<float>(upperFeet - lowerFeet) / kVdHeight;
    const float seaY = std::fmin(std::fmax(kVdTop + static_cast<float>(upperFeet) / feetPerPx, kVdTop), vdBottom);
    if (seaY < vdBottom) {
      nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
      stripe(waterView, FsColor{{0.0f, 0.9f, 0.9f, 1.0f}}, seaY, vdBottom - seaY);
    }
  }

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

// Frames a view is left alone after its settings were changed (the ND's role change, the VD starting to show)
// before it is drawn: it shows what it had before, or an empty texture, until the engine has rendered it again.
constexpr int kRoleWarmupFrames = 60;
constexpr int kVdWarmupFrames = 15;

// One frame of a VD terrain gauge instance.
void drawVdTerrainGauge(FsContext ctx, Instance& instance, const sGaugeDrawData* drawData) {
  bool show = false;
  float vdRangeNm = 10.0f;
  float headingDegrees = 0.0f;
  double lowerFeet = 0.0;
  double upperFeet = 0.0;

  if (isPowered(instance)) {
    const double ndMode = get_named_variable_value(instance.ndModeVar);
    const int ir = inertialSource(instance.isRight, static_cast<int>(g_attHdgKnob.read()));
    const auto latWord = types::Arinc429Word<float>::fromSimVar(g_adirsLat[ir - 1].read());
    const auto lonWord = types::Arinc429Word<float>::fromSimVar(g_adirsLon[ir - 1].read());
    const auto headingWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueHeading[ir - 1].read());
    const int rangeIndex = static_cast<int>(get_named_variable_value(instance.ndRangeVar));
    const float rangeNm = kRangeTableNm[rangeIndex >= 0 && rangeIndex < kRangeCount ? rangeIndex : 0];
    const bool isRoseNav = ndMode == kNdModeRoseNav;
    vdRangeNm = isRoseNav ? std::fmin(std::fmax(rangeNm / 2.0f, 5.0f), 160.0f) : std::fmin(std::fmax(rangeNm, 10.0f), 160.0f);
    headingDegrees = headingWord.value();
    lowerFeet = get_named_variable_value(instance.vdRangeLowerVar);
    upperFeet = get_named_variable_value(instance.vdRangeUpperVar);

    // The VD is there on the ARC and ROSE NAV pages; its terrain needs a TAWS system that has not
    // failed and the TERR SYS button of the SURV page not to be OFF (EfisTawsBridge, VerticalDisplay.tsx).
    show = instance.mapViewVdTerrainReady && instance.mapViewWaterReady && isArcOrRoseNav(ndMode) && rangeNm > 0.0f && latWord.isNo() &&
           lonWord.isNo() && headingWord.isNo() && upperFeet > lowerFeet && terrainSystemUp() && g_terrSysOff.read() == 0.0;
  }

  // The views run all the time; their settings only follow the aircraft while the VD shows, so its first frames are not drawn.
  instance.vdShowFrames = show ? instance.vdShowFrames + 1 : 0;
  const bool draw = show && instance.vdShowFrames > kVdWarmupFrames;

  if (show) {
    // The engine colors by ITS OWN (true) altitude minus the terrain height, so the range is given
    // relative to the sim's true altitude, on purpose not the ADR's baro altitude: the two cancel and
    // the profile lands at the terrain's real elevation on the VD's scale (the plot's top is a value of
    // altitude - upper, its bottom altitude - lower).
    const double altitudeFeet = planeAltitudeFeet();
    fsMapViewSetAltitudeRangeInFeet(ctx, instance.mapViewVdTerrain, altitudeFeet - upperFeet, altitudeFeet - lowerFeet);
    fsMapViewSet2DViewRadiusInMeters(ctx, instance.mapViewVdTerrain, vdRangeNm * kNmToMetres);
    fsMapViewSet2DViewRadiusInMeters(ctx, instance.mapViewWater, vdRangeNm * kNmToMetres);
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
      drawVdTerrain(vg, instance.mapViewVdTerrain, instance.mapViewWater, instance.vdRampImage, vdRangeNm, headingDegrees, lowerFeet, upperFeet);
    }
  }
  instance.layerDirty = draw;
  nvgEndFrame(vg);
}
#endif

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
      {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, kGreenFromMmH},
      {FsColor{{0.0f, 1.0f, 0.0f, 1.0f}}, kYellowFromMmH},
      {FsColor{{1.0f, 1.0f, 0.0f, 1.0f}}, kTopBandRate},
  };
  return configureRadarView(ctx, id, precipColors, 3);
}

// Hot view: G = rate >= red threshold, R and B = rate >= turbulence threshold. Drawn as the red
// wipe and the magenta (see WeatherPass). Kept visible for its whole life (toggling visibility
// flashes an empty white texture) and simply not drawn when the knob doesn't call for it.
bool configureHotView(FsContext ctx, FsTextureId id) {
  FsRainRateColor hotColors[3] = {
      {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, kRedFromMmH},
      {FsColor{{0.0f, 1.0f, 0.0f, 1.0f}}, kTurbulenceRateMmH},
      {FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, kTopBandRate},
  };
  return configureRadarView(ctx, id, hotColors, 3);
}

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
#ifdef A380X
      // "LV" / "RV": this instance only draws the terrain profile on the VD.
      instance->isVdTerrain = installData != nullptr && installData->strParameters != nullptr && installData->strParameters[0] != '\0' &&
                              (installData->strParameters[1] == 'V' || installData->strParameters[1] == 'v');
#endif

      // register_named_variable returns the same id for a name that is already
      // registered, so the shared variables can simply be registered again by
      // the second instance.
      g_attHdgKnob.id = register_named_variable(g_attHdgKnob.name);
      g_egpwcGearDown.id = register_named_variable(g_egpwcGearDown.name);
      for (int i = 0; i < 3; ++i) {
        g_adirsLat[i].id = register_named_variable(g_adirsLat[i].name);
        g_adirsLon[i].id = register_named_variable(g_adirsLon[i].name);
        g_adirsTrueHeading[i].id = register_named_variable(g_adirsTrueHeading[i].name);
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
      for (NamedVar& failed : g_terrFailed) {
        failed.id = register_named_variable(failed.name);
      }
      g_terrSysOff.id = register_named_variable(g_terrSysOff.name);
      g_airDataKnob.id = register_named_variable(g_airDataKnob.name);
      for (int i = 0; i < 3; ++i) {
        g_adrBaroAlt1[i].id = register_named_variable(g_adrBaroAlt1[i].name);
        g_adrBaroAlt2[i].id = register_named_variable(g_adrBaroAlt2[i].name);
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
      instance->terrainActiveVar =
          register_named_variable(instance->isRight ? "A32NX_EGPWC_ND_R_TERRAIN_ACTIVE" : "A32NX_EGPWC_ND_L_TERRAIN_ACTIVE");
      instance->powerBusVars[0] = register_named_variable(instance->isRight ? "A32NX_ELEC_AC_2_BUS_IS_POWERED"
                                                                            : "A32NX_ELEC_AC_ESS_BUS_IS_POWERED");
      instance->powerBusVars[1] = instance->powerBusVars[0];
#endif
      instance->wxrLabelVar = register_named_variable(instance->isRight ? "A32NX_WXR_ND_R_MODE" : "A32NX_WXR_ND_L_MODE");
      instance->ndModeVar = register_named_variable(instance->isRight ? "A32NX_EFIS_R_ND_MODE" : "A32NX_EFIS_L_ND_MODE");
      instance->ndRangeVar = register_named_variable(instance->isRight ? "A32NX_EFIS_R_ND_RANGE" : "A32NX_EFIS_L_ND_RANGE");

      NVGparams params;
      params.userPtr = ctx;
      params.edgeAntiAlias = false;
      instance->nvg = nvgCreateInternal(&params);
#ifdef A380X
      if (instance->isVdTerrain) {
        instance->mapViewVdTerrain = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
        instance->mapViewVdTerrainReady = configureVdTerrainView(ctx, instance->mapViewVdTerrain);
        instance->mapViewWater = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
        instance->mapViewWaterReady = configureWaterMaskView(ctx, instance->mapViewWater);
        return true;
      }
#endif

      instance->mapView = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      instance->mapViewReady = configurePrecipView(ctx, instance->mapView);
      instance->mapViewHot = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      instance->mapViewHotReady = configureHotView(ctx, instance->mapViewHot);
#ifndef A380X
      // (the A380X ND's two views double as the terrain and water views, see the ND draw)
      instance->mapViewTerrain = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      instance->mapViewTerrainReady = configureTerrainView(ctx, instance->mapViewTerrain);
      instance->mapViewWater = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
      instance->mapViewWaterReady = configureWaterMaskView(ctx, instance->mapViewWater);
#endif
      return true;
    }
    case PANEL_SERVICE_PRE_DRAW: {
      Instance* instance = findInstance(ctx);
      if (instance == nullptr || instance->nvg == nullptr) {
        return true;
      }
#ifdef A380X
      if (instance->isVdTerrain) {
        drawVdTerrainGauge(ctx, *instance, static_cast<const sGaugeDrawData*>(pData));
        return true;
      }
#endif

      bool isRose = false;
      bool showPrecip = false;
      bool showTurb = false;
      bool showTerrain = false;
      int labelMode = 0;
      float terrainHeadingDegrees = 0.0f;
      float rangeNmForMode = 10.0f;
#ifdef A380X
      bool vdWanted = false;
      bool showVd = false;
      float vdRangeNm = 10.0f;
      double vdLowerFeet = 0.0;
      double vdUpperFeet = 0.0;
      double vdBaroAltFeet = 0.0;
#endif

#ifdef A380X
      // The ND's two views are the weather pair or the terrain pair (see the header of the module about the 8 views).
      const FsTextureId terrainViewId = instance->mapView;
      const FsTextureId waterViewId = instance->mapViewHot;
      const bool terrainViewsReady = instance->mapViewReady && instance->mapViewHotReady;
#else
      const FsTextureId terrainViewId = instance->mapViewTerrain;
      const FsTextureId waterViewId = instance->mapViewWater;
      const bool terrainViewsReady = instance->mapViewTerrainReady && instance->mapViewWaterReady;
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
        // and its system is up (radarSelected), the ND page has a map (the three
        // ROSE pages and ARC, not PLAN, as on the real aircraft) with a real range
        // (not the A380X's OANS view), the ND's position source is valid (ADIRS
        // word validity is the "is position usable" check) and the aircraft is
        // airborne (the radar doesn't transmit on the ground). MODE: WX =
        // precipitation, WX+T = both, TURB = turbulence only, MAP = ground
        // mapping (not implemented, draws nothing).
        const bool positionValid = latWord.isNo() && lonWord.isNo();
        // Terrain on the ND is shown on the same pages, also on the ground, and takes
        // the place of the weather.
        // The map is rotated by the ND's own heading source, so it needs a valid one.
        const auto headingWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueHeading[ir - 1].read());
        terrainHeadingDegrees = headingWord.value();
        const bool mapPage = isMapPage(ndMode) && rangeNm > 0.0f;
        showTerrain = terrainViewsReady && terrainSelected(*instance) && mapPage && positionValid && headingWord.isNo();
        const bool active = radarSelected(*instance) && mapPage && positionValid && !isOnGround() && !showTerrain;
        showPrecip = active && instance->mapViewReady && (wxrMode == kWxrModeWx || wxrMode == kWxrModeWxTurb);
        showTurb = active && instance->mapViewHotReady && (wxrMode == kWxrModeWxTurb || wxrMode == kWxrModeTurb);
        // The ROSE pages show half the range of ARC around the aircraft.
        isRose = ndMode != kNdModeArc;
        rangeNmForMode = isRose ? rangeNm / 2.0f : rangeNm;
        // The mode text on the ND: shown whenever the radar is selected on a page that has it (not while the
        // terrain takes its place), on the ground too.
        if (radarSelected(*instance) && mapPage && !showTerrain) {
          labelMode = 1 + static_cast<int>(wxrMode);
        }
#ifdef A380X
        // The VD shows the weather too when the WX ON VD button is not OFF, on the pages
        // the VD exists on. Its range is the ND range in ARC (10..160 NM) and half of it
        // in ROSE NAV (5..160 NM), as VerticalDisplay.tsx's vdRange. The VD's altitude
        // scale is the ADR's baro-corrected altitude (VerticalDisplay.tsx), so the weather
        // cells are placed by the same word, not the sim's true altitude, which differs
        // from it by the baro error (up to ~1000 ft with STD set); the ND takes its ADR
        // from the AIR DATA switching knob as AdirsValueProvider does, and reads the
        // baro correction of its own side (1 = CPT, 2 = F/O).
        const int adr = airDataSource(instance->isRight, static_cast<int>(g_airDataKnob.read()));
        const auto baroAltWord = types::Arinc429Word<float>::fromSimVar(instance->isRight ? g_adrBaroAlt2[adr - 1].read() : g_adrBaroAlt1[adr - 1].read());
        vdBaroAltFeet = static_cast<double>(baroAltWord.value());
        vdWanted = showPrecip && isArcOrRoseNav(ndMode) && g_wxrVdOff.read() == 0.0 && baroAltWord.isNo();
        vdRangeNm = isRose ? std::fmin(std::fmax(rangeNm / 2.0f, 5.0f), 160.0f) : std::fmin(std::fmax(rangeNm, 10.0f), 160.0f);
        vdLowerFeet = get_named_variable_value(instance->vdRangeLowerVar);
        vdUpperFeet = get_named_variable_value(instance->vdRangeUpperVar);
        showVd = vdWanted && vdUpperFeet > vdLowerFeet;
#endif
      }

      if (labelMode != instance->wxrLabelShown) {
        set_named_variable_value(instance->wxrLabelVar, static_cast<double>(labelMode));
        instance->wxrLabelShown = labelMode;
      }

      // Which views are ready to be drawn. On the A380X the ND's two views change roles when the crew switches
      // between the weather and the terrain: they are reconfigured (the terrain takes the weather's place, the
      // two are never wanted together) and left alone for a while.
      bool precipReady = true;
      bool hotReady = true;
      bool terrainReady = true;
#ifdef A380X
      {
        const bool weatherWanted = showPrecip || showTurb;
        if (showTerrain && instance->ndRole != 1) {
          configureTerrainView(ctx, instance->mapView);
          configureWaterMaskView(ctx, instance->mapViewHot);
          instance->terrainGearState = -1;
          instance->ndRole = 1;
          instance->roleWarmupLeft = kRoleWarmupFrames;
        } else if (weatherWanted && instance->ndRole != 0) {
          configurePrecipView(ctx, instance->mapView);
          configureHotView(ctx, instance->mapViewHot);
          instance->ndRole = 0;
          instance->roleWarmupLeft = kRoleWarmupFrames;
        }
        if (instance->roleWarmupLeft > 0) {
          --instance->roleWarmupLeft;
        }
        const bool settled = instance->roleWarmupLeft == 0;
        precipReady = settled && instance->ndRole == 0;
        hotReady = precipReady;
        terrainReady = settled && instance->ndRole == 1;
      }
#endif

      const bool drawsAnything = showPrecip || showTurb || showTerrain;
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
      if (showTerrain) {
        if (instance->terrainPatternImage == 0) {
          instance->terrainPatternImage = createTerrainPattern(vg);
        }
        const int gearState = g_egpwcGearDown.read() != 0.0 ? 1 : 0;
        if (gearState != instance->terrainGearState) {
          setTerrainColors(ctx, terrainViewId, gearState == 1);
          instance->terrainGearState = gearState;
        }
        fsMapViewSet2DViewRadiusInMeters(ctx, terrainViewId, rangeNmForMode * kNmToMetres);
        fsMapViewSet2DViewRadiusInMeters(ctx, waterViewId, rangeNmForMode * kNmToMetres);
        if (terrainReady && instance->terrainPatternImage != 0) {
          drawTerrain(vg, terrainViewId, waterViewId, instance->terrainPatternImage, isRose, terrainHeadingDegrees);
        }
      }
      if (showPrecip) {
        fsMapViewSet2DViewRadiusInMeters(ctx, instance->mapView, rangeNmForMode * kNmToMetres);
        if (precipReady) {
          drawWeatherRect(vg, instance->mapView, isRose, 1.0f, WeatherPass::Additive);
          drawWeatherRect(vg, instance->mapView, isRose, 1.0f, WeatherPass::Sharpen);
          drawWeatherRect(vg, instance->mapView, isRose, 1.0f, WeatherPass::Colorize);
        }
      }
      // The hot view carries the red wipe (any precipitation) and the magenta
      // (turbulence modes, near the aircraft only); the wipe also clears the green
      // channel under the magenta, in the whole rect.
      if ((showPrecip || showTurb) && instance->mapViewHotReady) {
        fsMapViewSet2DViewRadiusInMeters(ctx, instance->mapViewHot, rangeNmForMode * kNmToMetres);
        if (hotReady) {
          if (showPrecip) {
            drawWeatherRect(vg, instance->mapViewHot, isRose, 1.0f, WeatherPass::Erase);
          }
          if (showTurb) {
            const float turbFraction = kTurbulenceMaxRangeNm / rangeNmForMode;
            const float turbRangeFraction = turbFraction < 1.0f ? turbFraction : 1.0f;
            drawWeatherRect(vg, instance->mapViewHot, isRose, turbRangeFraction, WeatherPass::AdditiveMagenta);
          }
        }
      }
#ifdef A380X
      // Last, so nothing of the ND's passes above can touch it: they only affect
      // the ND's rect, where the VD area (behind the aircraft) has no weather.
      if (showVd && precipReady) {
        drawVdWeather(vg, instance->mapView, instance->mapViewHot, instance->mapViewHotReady && hotReady, showTurb, rangeNmForMode, vdRangeNm,
                      vdBaroAltFeet, vdLowerFeet, vdUpperFeet);
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
      if (instance->mapViewTerrain != 0) {
        fsMapViewDelete(ctx, instance->mapViewTerrain);
      }
      if (instance->mapViewWater != 0) {
        fsMapViewDelete(ctx, instance->mapViewWater);
      }
#ifdef A380X
      if (instance->mapViewVdTerrain != 0) {
        fsMapViewDelete(ctx, instance->mapViewVdTerrain);
      }
#endif
      if (instance->nvg != nullptr) {
        if (instance->terrainPatternImage != 0) {
          nvgDeleteImage(instance->nvg, instance->terrainPatternImage);
        }
#ifdef A380X
        if (instance->vdRampImage != 0) {
          nvgDeleteImage(instance->nvg, instance->vdRampImage);
        }
#endif
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
