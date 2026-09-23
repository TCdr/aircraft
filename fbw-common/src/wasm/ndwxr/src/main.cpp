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
// - The radar works on the ground as well: the FCOM has it scanning there as soon
//   as it is selected (A320 FCOM DSC-34-SURV-30-30: "on the ground, the radar is
//   scanning when the flight crew sets one radar to ON and selects a display mode";
//   the A380's WX pb is pressed before takeoff and its buffer fills there, and the
//   A320 FCTM has the crew check the radar on the ground during taxi).
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
// The A380X's VD shows the terrain profile along its vertical cut in the same
// way, see drawVdTerrain (its weather is drawn in drawVdWeather).
//
// A module can have at most 8 MapViews: a ninth crashes the module's gauge draw
// when it is drawn (hiding views does not help), so the A32NX has 4 per ND
// (precipitation, hot, terrain, water) and the A380X 2 per ND (a pair that is
// the weather pair or the terrain pair - the terrain takes the weather's place -
// and is reconfigured when the crew switches) and 1 per VD terrain gauge. The
// module also reserves its memory up front (build.sh): growing it while drawing
// crashes too.
//
// The A380X's radar shows the same picture as the A32NX's: the weather the engine's
// horizontal radar mode sees, a slice at about the aircraft's altitude. The FCOM's
// AUTO mode (DSC-34-20-30, WX display function) also shows the weather the aircraft
// will not encounter (OFF-PATH) with reduced intensity and black parallel lines; that
// is NOT modelled. It was, from a third view in the engine's TOP VIEW radar mode
// (precipitation anywhere in the column), but the engine runs one radar per
// aircraft and a view in that mode changes what the horizontal views deliver: with
// rain at the aircraft's level they return it over the whole range instead of the
// cells (in-sim, 2026-09-23, RJTT on the ground in rain, the A32NX clean next to it;
// the same views without the top view were clean too). The 30 s the real radar takes
// to fill its buffer after the crew selects it are modelled (kWxrBufferFillSeconds).
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
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wundef"
#pragma clang diagnostic ignored "-Wsign-conversion"
#include <SimConnect.h>
#include "../../terronnd/src/types/simbridge.h"  // the status block the SimBridge reads
#pragma clang diagnostic pop

#include <cmath>
#include <cstdio>
#include <cstring>
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
// ADIRS inertial vertical speed words for IR 1..3 (feet per minute): the terrain's reference
// altitude looks ahead in a fast descent, see kTerrainLookAheadSeconds.
NamedVar g_adirsVerticalSpeed[3] = {{"A32NX_ADIRS_IR_1_VERTICAL_SPEED"},
                                    {"A32NX_ADIRS_IR_2_VERTICAL_SPEED"},
                                    {"A32NX_ADIRS_IR_3_VERTICAL_SPEED"}};

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

// The vertical cut of the VD's terrain profile, published by EfisTawsBridge.ts (publishVdCut): along the
// active flight plan in the managed lateral modes (mode 1, the vertices below in degrees), along the
// aircraft's track otherwise (mode 0), as the real VD (FCOM DSC-31-20-40-10, "the vertical cut runs
// along the active flight plan ... or the current track").
constexpr int kVdCutMaxVertices = 32;
NamedVar g_vdCutMode{"A380X_VD_CUT_MODE"};
NamedVar g_vdCutCount{"A380X_VD_CUT_COUNT"};
// Distance along the cut (NM) at which the next track change exceeds 3 degrees, -1 when none: from
// there the terrain shown is no longer the one ahead of the aircraft, the VD's grey area.
NamedVar g_vdCutTrackChangeNm{"A380X_VD_CUT_TRACK_CHANGE_NM"};
ID g_vdCutLatVars[kVdCutMaxVertices];
ID g_vdCutLonVars[kVdCutMaxVertices];
// The IR true track words for IR 1..3: the cut along the track follows the track, not the heading.
NamedVar g_adirsTrueTrack[3] = {{"A32NX_ADIRS_IR_1_TRUE_TRACK"}, {"A32NX_ADIRS_IR_2_TRUE_TRACK"}, {"A32NX_ADIRS_IR_3_TRUE_TRACK"}};

constexpr float kDegToRadF = 0.01745329f;

// One straight piece of the vertical cut, relative to the aircraft (see buildVdPlanCut).
struct VdCutSegment {
  float startEastNm;   // where the piece starts, east ...
  float startNorthNm;  // ... and north of the aircraft
  float trackDeg;      // its true track
  float lengthNm;
  float startNm;       // its distance along the cut (the aircraft is at 0)
};
constexpr int kVdCutMaxSegments = kVdCutMaxVertices;

// The RDR-4000 takes about 30 s to fill its 3D buffer once the crew selects the radar (FCOM
// DSC-34-20-30, operational recommendations: "when they press the WX pb on the EFIS CP, it takes
// about 30 s to fill the buffer with radar data and have the complete display available on the
// ND and on the VD"). While it fills, the picture is revealed by one slow sweep from the left
// edge to the right one. The transmitter is shared by both NDs (see the ND draw).
constexpr double kWxrBufferFillSeconds = 30.0;
bool g_wxrTransmitting = false;
double g_wxrTransmitSince = 0.0;

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
// beam crashed the module), so the VD is built from the ND's own radar views, which
// see one slice of weather at about the aircraft's altitude (see the header of the
// module). The ND texel columns along the VD's vertical cut are rotated onto the VD's
// range axis and extruded vertically, shaped like the cells of a real VD: green and
// yellow columns from the ground up to a rounded, tapering top (kVdGreenTopSpan /
// kVdYellowTopSpan above the aircraft altitude), with the red core a block centred on
// the aircraft's altitude (+-kVdRedHalfSpan), where the ND measures it.
//  Turbulence (magenta) is not drawn on the VD: the real VD does not display it
//  either (FCOM DSC-31-20-40-10, weather display).
// All the heights are made up, and given as fractions of the altitude span of the
// VD plot (in-sim, fixed heights of thousands of feet were far above the plot at low
// altitude, where the VD only spans about 5000 ft, so no top was ever visible). The
// columns stand on the ground: from sea level up when the plot reaches below it.
//
// The rounded top is built from levels (kVdColumnDome): level 0 is the whole shape, only
// up to a fraction of the height; each further level covers the next band of height but
// only where the shape is also there depthPx to both sides along the range axis (an
// erosion: three taps, all must agree), so the shape is narrower the higher it goes. The
// levels follow the outline of a quarter ellipse (steep near the shape's edge, flat on
// top), so a column has straight sides up to about half its height and rounded shoulders.
// Each level only draws its own band of height (plus a small overlap, kVdBandOverlapPx).
//
// The cut is the VD's vertical cut (FCOM DSC-31-20-40-10: the active flight plan in the
// managed lateral modes, the track otherwise; "for the weather display, the WXR considers
// a zero-width vertical cut"), followed piece by piece as the terrain does (see
// drawVdErodedRect). The radar's beam has a width, though (about 3.5 degrees), so the
// base level shows the STRONGEST weather within the beam around the cut (half angle
// atan(kVdWedgeTan)): kVdLateralTapsPerSide columns on each side of the cut are drawn
// on top of each other (a union), each one only from the range where it enters the
// beam. The raw ND texture has single-texel specks and radial sweep streaks that the
// ND's own blur removes; here each column has to be at least 2 * kVdSpeckPx wide to
// count (two taps, both must agree), otherwise they came out as thin full-height lines.
//
// Each output color channel is driven by its own mask channel (precipitation view:
// R = yellow and above, G = green and above; hot view: G = red and above), so every
// channel can be clipped to its own altitude window without mixing channels; the red
// wipe removes the green channel inside the red core.
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
// h = h0 + (1 - h0) * sqrt(1 - (1 - t)^2), depth = t * 24 (h0 = 0.5, t = 0, 1/7 .. 1).
// A single level: the real VD draws the cells as plain vertical bars with flat tops (A380 ND photo, MALPA); the
// rounded dome of before was h = h0 + (1 - h0) * sqrt(1 - (1 - t)^2), depth = t * 24 over 8 levels.
constexpr VdDomeLevel kVdColumnDome[] = {{0.0f, 1.0f}};
constexpr int kVdColumnDomeCount = 1;
// Why the red core is a plain block and not a rounded shape: the red is made by wiping the
// green channel out of the yellow with a multiply blend, and a multiply can only be "any one
// tap sees the weather" (a dilation - the erosion taps made the outer levels WIDER than the
// inner ones, an hourglass), never "all taps agree". Additive passes (the columns) can be
// eroded properly.
// Each level's band reaches this far into the band below it. The edge of a band
// falls on a fractional pixel, where the two neighbouring bands only cover part
// of it each; the VD's sharpening passes (kVdSharpenPasses) square such a
// half-covered pixel to black, which drew a dark seam between every two levels.
// Where both levels cover the pixel the overlap just adds up to full.
constexpr float kVdBandOverlapPx = 3.0f;
constexpr float kVdWedgeTan = 0.0306f;  // tan(1.75 deg), half the beam width
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
constexpr double kWxrModeMap = 3.0;

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
  // The dither image of the terrain (created on first use), the gear state the terrain
  // color list was last set for (-1 = not yet), and which list the terrain view holds
  // (0 = the terrain's, 1 = the MAP mode's, 2 = the peaks mode's, -1 = not set by the ND draw yet).
  int terrainPatternImage = 0;
  int terrainGearState = -1;
  int terrainListMode = -1;
  // The weather radar's mode text for the JS ND (0 none, 1 WX, 2 WX+T, 3 TURB, 4 MAP): the LVar the
  // ND reads (A32NX_WXR_ND_{L,R}_MODE) and the value last written to it.
  ID wxrLabelVar = -1;
  int wxrLabelShown = -1;
  // The TERR peaks box figures of this side (A32NX_EGPWC_ND_x_TERRAIN_MIN/MAX_ELEVATION, feet, -1 = none),
  // written by the ND's TerrainThresholdsProvider from the SimBridge: the peaks mode's span.
  ID peaksMinVar = -1;
  ID peaksMaxVar = -1;
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
  // Whether this ND asked the radar to transmit last frame (see g_wxrTransmitting).
  bool wxrRequested = false;
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
// TURB = turbulence only, MAP = ground mapping (see drawMapMode).
double radarMode() {
#ifdef A380X
  // The SURV CONTROLS page has a WX/MAP button and a TURB AUTO/OFF button: TURB
  // AUTO adds turbulence to the precipitation. There is no turbulence-only mode.
  if (g_wxrModeMap.read() != 0.0) {
    return kWxrModeMap;
  }
  return g_wxrTurbOff.read() != 0.0 ? kWxrModeWx : kWxrModeWxTurb;
#else
  return g_wxrMode.read();
#endif
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
// ND (a pair that is either the weather pair or the terrain pair, never both at once) and 1 per VD terrain gauge
// (its water is coded in the terrain view's colour list, see setVdTerrainList).

// Shared MapView setup for the precipitation view and the hot view.
bool configureRadarView(FsContext ctx, FsTextureId id, FsRainRateColor* colors, unsigned colorCount, FsMapViewWeatherRadarMode mode) {
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

enum class WeatherPass {
  // A view's mask channels added onto what's there (see kPrecipGain), destination
  // alpha untouched - see the header: the texture is opaque, so a normal draw
  // would black out the ND.
  Additive,
  // Squares what's on this surface (kSharpenPasses times), the saturating step
  // of the majority filter. One plain fill, not textured.
  Sharpen,
  // Turns the two mask channels into the green / yellow band colors. One plain
  // fill, not textured.
  Colorize,
  // Hot view, turbulence mask (rate above the turbulence threshold), tinted magenta.
  AdditiveMagenta,
  // A view's mask: multiplies the selected channels of what's already on this
  // surface by (1 - mask). With the hot view's red mask on the green channel,
  // yellow becomes red and magenta is not diluted by green.
  Erase,
};

// The colour channels a pass works on (1 = the channel's mask is used, 0 = left alone).
struct Channels {
  float r;
  float g;
  float b;
};
constexpr Channels kAllChannels{1.0f, 1.0f, 1.0f};

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

// The area of the ARC page: the compass disk about the aircraft (R = kArcPixelRadius) cut to the
// shape the ND's own map uses (CanvasMap.tsx ARC_CLIP), as on the real display: the picture goes on
// below the aircraft symbol down to the message boxes (between x = 174 and 591), and both bottom
// corners stay free for the VOR/MORA fields on the left (from y = 625, the aircraft's level) and
// the TERR peaks box / radar mode text on the right (from y = 562), with a diagonal in between.
// While the radar's buffer fills (sweepFraction < 1, see drawWeatherRect) it is the sector swept
// so far instead. A circle too small to reach the right corner (the turbulence limit)
// is left round; the rectangular scissor of the caller cuts it at the message boxes.
constexpr float kArcCornerTop = 562.0f;
constexpr float kArcCornerLeft = 648.0f;
constexpr float kArcNotchRightX = 591.0f;
constexpr float kArcNotchRightY = 625.0f;
constexpr float kArcNotchLeftX = 174.0f;
constexpr float kArcNotchLeftY = 683.0f;
constexpr float kArcLeftCornerX = 122.0f;
constexpr float kArcLeftCornerY = 625.0f;
constexpr float kArcClipBottom = 768.0f;

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
  nvgLineTo(vg, kArcNotchLeftX, kArcClipBottom);
  nvgLineTo(vg, kArcNotchLeftX, kArcNotchLeftY);
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
                     Channels channels = kAllChannels, float sweepFraction = 1.0f) {
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
  const FsColor tint{{strength * channels.r, strength * channels.g, strength * channels.b, 1.0f}};

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
constexpr float kTerrainWater = 1.0f;
constexpr float kTerrainWaterBlue = 0.6f;

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

// "The reference altitude is computed based on the current aircraft altitude or, if descending
// more than 1 000 ft/min, the altitude expected in 30 s" (A320 FCOM DSC-31-45, GPWS terrain
// picture). The view colours by the aircraft's own altitude, so the bands are shifted instead by
// the altitude the aircraft loses in that time (see the ND draw).
constexpr float kTerrainLookAheadFromFpm = 1000.0f;
constexpr float kTerrainLookAheadSeconds = 30.0f;

// Ground mapping, the radar's MAP mode, from the same altitude view: "black indicates water,
// green indicates the ground, and amber indicates cities and mountains" (A320 FCOM
// DSC-34-SURV-30-30, display mode selector; the A380's SURV CONTROLS MODE button has the
// same MAP mode, FCOM: "use MAP to detect prominent terrain (mountain, city, and coastline)").
// Mountains are the terrain within kMapMountainBelowFeet below the aircraft or above it; the
// sim's terrain data has no cities. The list spans [kMapMinFeet, kMapMaxFeet] of (aircraft
// altitude - terrain height) in kTerrainBandCount bands: entry 0 is the water (which no land
// reaches, see kTerrainMinFeet), the last entry, and everything further below, the plain ground.
constexpr float kMapMinFeet = -29500.0f;
constexpr float kMapMaxFeet = 10500.0f;
constexpr float kMapMountainBelowFeet = 6000.0f;

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

// The MAP mode's list (see kMapMinFeet): amber mountains, green ground, black water.
void setMapColors(FsContext ctx, FsTextureId id) {
  FsColor colors[kTerrainBandCount];
  const float bandFeet = (kMapMaxFeet - kMapMinFeet) / static_cast<float>(kTerrainBandCount);
  colors[0] = FsColor{{0.0f, 0.0f, 0.0f, 1.0f}};
  for (int band = 1; band < kTerrainBandCount; ++band) {
    // (aircraft altitude - terrain height) in the middle of the band
    const float vMid = kMapMinFeet + bandFeet * (static_cast<float>(band) + 0.5f);
    const bool mountain = vMid <= kMapMountainBelowFeet;
    colors[band] = mountain ? FsColor{{1.0f, 1.0f, 0.0f, 1.0f}} : FsColor{{0.0f, 1.0f, 0.0f, 1.0f}};
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
void terrainPath(NVGcontext* vg, float cx, float cy, float radius, bool isRose) {
  if (isRose) {
    nvgBeginPath(vg);
    nvgCircle(vg, cx, cy, radius);
  } else {
    arcAreaPath(vg, cx, cy, radius, 1.0f);
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
  fsMapViewSetAltitudeRangeInFeet(ctx, id, static_cast<double>(kWaterMaskMinFeet), static_cast<double>(kWaterMaskMaxFeet));
  FsColor colors[2] = {FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, FsColor{{0.0f, 0.0f, 0.0f, 1.0f}}};
  fsMapViewSetAltitudeColorList(ctx, id, colors, 2);
  return true;
}

// The sim's own (true) altitude: the altitude the altitude-mode views colour by (the VD terrain view's
// range, see drawVdTerrainGauge, and the peaks mode's, see setPeaksColors).
double planeAltitudeFeet() {
  static const ENUM planeAltitude = get_aircraft_var_enum("PLANE ALTITUDE");
  static const ENUM feet = get_units_enum("feet");
  return aircraft_varget(planeAltitude, feet, 0);
}

// ---------------------------------------------------------------------------
// PEAKS mode (EGPWS): when no terrain of the range comes within 2000 ft below the aircraft, the
// standard display would be empty; the real display then shows the terrain in green by its
// elevation relative to the range's highest and lowest terrain (the figures of the TERR peaks
// box): solid green for the top 5 % of that span, dense dots down to 65 %, light dots down to
// 35 %, nothing below. The figures come from the SimBridge (the TERR peaks box LVars written by
// TerrainThresholdsProvider); without them there is no peaks mode. The view's range is set to
// [alt - max - margin, alt - min] every frame, so the list itself is fixed: the bands are
// fractions of the range. The margin above the highest terrain covers the difference between the
// SimBridge's elevations and the sim's own mesh (terrain beyond the range's top would come out
// in other entries, see kTerrainMinFeet).
// ---------------------------------------------------------------------------
constexpr float kPeaksBelowFeet = 2000.0f;    // peaks mode while the highest terrain is further below than this
constexpr float kPeaksMarginFraction = 0.25f;  // of the span, above the highest terrain
constexpr float kPeaksSolidFrom = 0.95f;       // fractions of the span (from the lowest terrain)
constexpr float kPeaksDenseFrom = 0.65f;
constexpr float kPeaksLightFrom = 0.35f;
constexpr float kPeaksMinSpanFeet = 500.0f;

void setPeaksColors(FsContext ctx, FsTextureId id) {
  FsColor colors[kTerrainBandCount];
  const float total = 1.0f + kPeaksMarginFraction;
  for (int band = 0; band < kTerrainBandCount; ++band) {
    // The band's elevation as a fraction of the span, from the top (band 0 = above the highest terrain).
    const float fraction = total - (static_cast<float>(band) + 0.5f) / static_cast<float>(kTerrainBandCount) * total;
    float g = 0.0f;
    if (fraction >= kPeaksSolidFrom) {
      g = 1.0f;
    } else if (fraction >= kPeaksDenseFrom) {
      g = kTerrainDense;
    } else if (fraction >= kPeaksLightFrom) {
      g = kTerrainLight;
    }
    colors[band] = FsColor{{0.0f, g, 0.0f, 1.0f}};
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, kTerrainBandCount);
}

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
  paint.innerColor = paint.outerColor = FsColor{{encodeSrgb(kRedLevel), encodeSrgb(kGreenLevel), 0.0f, 1.0f}};
  nvgFillPaint(vg, paint);
  nvgFill(vg);
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
  nvgRestore(vg);
}

#ifdef A380X
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
void setVdPassState(NVGcontext* vg, VdPass pass, float gain, FsColor* tint) {
  const float g = encodeSrgb(gain);
  if (pass == VdPass::Wipe) {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_ONE_MINUS_SRC_COLOR, NVG_ZERO, NVG_ONE);
    *tint = FsColor{{0.0f, encodeSrgb(1.0f - std::pow(kVdEraseRemainder, gain)), 0.0f, 1.0f}};
  } else {
    nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
    *tint = pass == VdPass::Yellow ? FsColor{{g, 0.0f, 0.0f, 1.0f}} : FsColor{{0.0f, g, 0.0f, 1.0f}};
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
void drawVdErodedRect(NVGcontext* vg, FsTextureId view, const VdColumns& c, VdPass pass, float lateralTexels, float depthPx,
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

// ---------------------------------------------------------------------------
// Terrain profile on the VD (A380X). Its own gauge instance (the "V" panel.cfg
// parameter), because it needs whole-rect passes (a compare against a ramp, then
// squaring) that would destroy the weather drawn in the same rect by the ND's
// instance; each gauge has its own surface, and both are added onto the display.
//
// The terrain along the vertical cut is read from an altitude-mode MapView whose
// color list codes ELEVATION as brightness (in the R and G channels, see
// setVdTerrainList): over the plot, entry k is I = 2 - (k + 0.5) / kVdTerrainSteps, and
// the view's range is set every frame to [baro altitude - VD upper limit - plot span,
// baro altitude - VD lower limit] (the engine colors by its true altitude MINUS the
// terrain height; see drawVdTerrainGauge for why the baro altitude goes into the
// range), so a texel's brightness is the fraction of the VD plot height that the
// terrain reaches (terrain above the plot, up to one plot height above it, is full
// brightness; the engine colours terrain beyond the top of the range with arbitrary
// entries, see kTerrainMinFeet). The texture column along the cut is stretched over
// the whole plot height (see kVdColumnTexelPx) and compared with a vertical ramp: the
// same "add half the value and half the complement of the threshold, double, square"
// compare as the terrain dots, which lights a pixel where brightness >= ramp, i.e. a
// bar from the bottom up to the terrain. Water always takes the list's first entry
// (see configureWaterMaskView), which no land reaches: it is blue in the B channel
// alone, so the compare (R and G) leaves no bar over water, and the water is drawn
// from that channel as flat blue up to sea level (the real VD's water is blue, FCOM
// DSC-31-20-40-10).
//
// The cut follows the real VD's (FCOM DSC-31-20-40-10): the active flight plan in the
// managed lateral modes, published as vertices by EfisTawsBridge.ts (see g_vdCutMode) and
// followed piece by piece from the aircraft's projection onto it, or the aircraft's track
// otherwise. The cut has a width of 2 x the TAWS RNP on the real aircraft (1 NM in the
// take-off and terminal areas, 2 NM en route, less on approach; never more than 10 NM) and
// the profile is the highest terrain across it: here kVdCutTaps columns spread over the
// width are drawn as a union, the width taken from the altitude (en route above
// kVdCutEnrouteFeet). Where the next track change exceeds 3 degrees the rest of the plot
// is greyed (the real VD's grey area).
// ---------------------------------------------------------------------------
constexpr int kVdCutTaps = 5;
constexpr float kVdCutEnrouteFeet = 18000.0f;
constexpr float kVdCutEnrouteHalfWidthNm = 2.0f;
constexpr float kVdCutTerminalHalfWidthNm = 1.0f;
// The aircraft counts as on the flight plan within this cross-track distance of it; further away
// the cut falls back to the track (the real VD's "VIEW ALONG ACFT TRK").
constexpr float kVdCutMaxCrossTrackNm = 5.0f;

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
// Bands of the colour list over the plot height; the list has twice as many entries (see
// setVdTerrainList), and the view's range spans twice the plot height accordingly.
constexpr int kVdTerrainSteps = 64;
constexpr int kVdTerrainListSize = 2 * kVdTerrainSteps;
constexpr int kVdRampRows = 256;
// The ramp never quite reaches 0, so a texel of no terrain (brightness 0) stays unlit
// in the bottom row too.
constexpr float kVdRampFloor = 1.0f / 64.0f;
constexpr int kVdTerrainSharpenPasses = 8;
constexpr float kVdWaterBlue = 0.9f;

// The color list of the VD terrain view: entry 0 is the water (blue, B channel only: the
// engine gives water the first entry whatever its height, and the range is set so that no
// land reaches that entry), entries 1 .. kVdTerrainSteps - 1 are terrain above the top of
// the plot (full brightness), the rest the plot from its top down, brightness
// 2 - (k + 0.5) / kVdTerrainSteps in R and G.
void setVdTerrainList(FsContext ctx, FsTextureId id) {
  FsColor colors[kVdTerrainListSize];
  colors[0] = FsColor{{0.0f, 0.0f, 1.0f, 1.0f}};
  for (int k = 1; k < kVdTerrainListSize; ++k) {
    const float fraction = 2.0f - (static_cast<float>(k) + 0.5f) / static_cast<float>(kVdTerrainSteps);
    const float brightness = std::fmin(fraction, 1.0f);
    colors[k] = FsColor{{brightness, brightness, 0.0f, 1.0f}};
  }
  fsMapViewSetAltitudeColorList(ctx, id, colors, static_cast<unsigned>(kVdTerrainListSize));
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
  fsMapViewSetAltitudeRangeInFeet(ctx, id, -40000.0, 20000.0);  // replaced every frame
  setVdTerrainList(ctx, id);
  return true;
}

// The complement (1 - threshold) of the ramp, top to bottom: 0 at the top of the plot,
// about 1 at the bottom.
int createVdRamp(NVGcontext* vg) {
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

void drawVdTerrain(NVGcontext* vg, FsTextureId terrainView, int rampImage, float vdRangeNm, const VdCutSegment* cut, int cutCount,
                   float cutHalfWidthNm, float greyFromNm, double lowerFeet, double upperFeet) {
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
  const FsColor halfTint{{half, half, 0.0f, 1.0f}};

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

  // 6. the water (the view's B channel, along the centre of the cut): flat blue from sea level
  // down to the bottom of the plot.
  if (lowerFeet < 0.0) {
    const float feetPerPx = static_cast<float>(upperFeet - lowerFeet) / kVdHeight;
    const float seaY = std::fmin(std::fmax(kVdTop + static_cast<float>(upperFeet) / feetPerPx, kVdTop), vdBottom);
    if (seaY < vdBottom) {
      nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ONE, NVG_ONE, NVG_ZERO, NVG_ONE);
      stripe(terrainView, FsColor{{0.0f, 0.0f, kVdWaterBlue, 1.0f}}, seaY, vdBottom - seaY, 0.0f);
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

// Frames a view is left alone after its settings were changed (the ND's role change, the VD starting to show)
// before it is drawn: it shows what it had before, or an empty texture, until the engine has rendered it again.
constexpr int kRoleWarmupFrames = 60;
constexpr int kVdWarmupFrames = 15;

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
      drawVdTerrain(vg, instance.mapViewVdTerrain, instance.vdRampImage, vdRangeNm, cut, cutCount, cutHalfWidthNm, greyFromNm, lowerFeet,
                    upperFeet);
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
  return configureRadarView(ctx, id, precipColors, 3, FS_MAP_VIEW_WEATHER_RADAR_MODE_HORIZONTAL);
}

// Hot view: G = rate >= red threshold, drawn as the red wipe; R and B = rate >= turbulence
// threshold, drawn as the magenta (R + B, also in the TURB-only mode, where no precipitation
// is drawn; see WeatherPass). Kept visible for its whole life (toggling visibility flashes an
// empty white texture) and simply not drawn when the mode doesn't call for it.
bool configureHotView(FsContext ctx, FsTextureId id) {
  FsRainRateColor hotColors[3] = {
      {FsColor{{0.0f, 0.0f, 0.0f, 0.0f}}, kRedFromMmH},
      {FsColor{{0.0f, 1.0f, 0.0f, 1.0f}}, kTurbulenceRateMmH},
      {FsColor{{1.0f, 1.0f, 1.0f, 1.0f}}, kTopBandRate},
  };
  return configureRadarView(ctx, id, hotColors, 3, FS_MAP_VIEW_WEATHER_RADAR_MODE_HORIZONTAL);
}

// ---------------------------------------------------------------------------
// The SimBridge terrain service client: the TERR peaks box figures.
//
// The figures of the TERR box (the highest and the lowest elevation of the ND range) come from
// SimBridge, which computes them for each ND from its own elevation data; a gauge cannot read
// elevations back from the simulator. SimBridge talks SimConnect, the way it did with the stock
// terronnd gauge this module replaces (in-sim, 2026-09-22: its HTTP endpoints stay empty while
// it is connected to the sim, and it only renders once a gauge takes part), so this module
// takes terronnd's place on that side, from the first ND gauge installed:
//  - it writes the aircraft status block FBW_SIMBRIDGE_EGPWC_AIRCRAFT_STATUS every 100 ms
//    (types::AircraftStatusData, the content of terronnd's collection.cpp: SimBridge takes the
//    aircraft's position from it to cache its elevation tiles, and the EFIS settings of each
//    ND when the systems host's HTTP status is not there; terrain on per side as this module
//    selects it, not terronnd's A380X quirk of reporting it on whenever the VD wanted it);
//  - it subscribes to the two threshold blocks FBW_SIMBRIDGE_TERRONND_THRESHOLDS_LEFT/RIGHT
//    (types::ThresholdData: the figures, their modes, and the range and page they were computed
//    for) and to the two frame blocks (SimBridge's own terrain picture in PNG chunks, which
//    are received and dropped: the picture is drawn natively here);
//  - it writes the figures into L:A32NX_EGPWC_ND_{L,R}_TERRAIN_{MIN,MAX}_ELEVATION(_MODE), the
//    LVars the ND's TerrainMapThresholds shows, while terrain is selected on that side and
//    SimBridge's figures are for the ND's current range and page; -1 (box hidden) otherwise
//    or when they are older than kSimBridgeFiguresMaxAgeSeconds.
// A lost connection is retried every few seconds.
// ---------------------------------------------------------------------------
NamedVar g_egpwcPresentLat{"A32NX_EGPWC_PRESENT_LAT"};
NamedVar g_egpwcPresentLon{"A32NX_EGPWC_PRESENT_LONG"};
NamedVar g_egpwcPresentAltitude{"A32NX_EGPWC_PRESENT_ALTITUDE"};
NamedVar g_egpwcPresentHeading{"A32NX_EGPWC_PRESENT_HEADING"};
NamedVar g_egpwcPresentVerticalSpeed{"A32NX_EGPWC_PRESENT_VERTICAL_SPEED"};
NamedVar g_egpwcDestLat{"A32NX_EGPWC_DEST_LAT"};
NamedVar g_egpwcDestLon{"A32NX_EGPWC_DEST_LONG"};
NamedVar g_egpwcRenderingMode{"A32NX_EGPWC_TERRONND_RENDERING_MODE"};
NamedVar g_egpwcNdRange[2] = {{"A32NX_EGPWC_ND_L_RANGE"}, {"A32NX_EGPWC_ND_R_RANGE"}};
NamedVar g_efisNdMode[2] = {{"A32NX_EFIS_L_ND_MODE"}, {"A32NX_EFIS_R_ND_MODE"}};
NamedVar g_egpwcTerrainActive[2] = {{"A32NX_EGPWC_ND_L_TERRAIN_ACTIVE"}, {"A32NX_EGPWC_ND_R_TERRAIN_ACTIVE"}};

#ifdef A380X
// The TERR overlay of each side's EFIS control panel (the terrain selection per side, see terrainSelected).
NamedVar g_efisOverlay[2] = {{"A380X_EFIS_L_ACTIVE_OVERLAY"}, {"A380X_EFIS_R_ACTIVE_OVERLAY"}};
#endif
// The peaks box LVars of each side: MIN, MIN_MODE, MAX, MAX_MODE.
NamedVar g_peaksVars[2][4] = {{{"A32NX_EGPWC_ND_L_TERRAIN_MIN_ELEVATION"},
                               {"A32NX_EGPWC_ND_L_TERRAIN_MIN_ELEVATION_MODE"},
                               {"A32NX_EGPWC_ND_L_TERRAIN_MAX_ELEVATION"},
                               {"A32NX_EGPWC_ND_L_TERRAIN_MAX_ELEVATION_MODE"}},
                              {{"A32NX_EGPWC_ND_R_TERRAIN_MIN_ELEVATION"},
                               {"A32NX_EGPWC_ND_R_TERRAIN_MIN_ELEVATION_MODE"},
                               {"A32NX_EGPWC_ND_R_TERRAIN_MAX_ELEVATION"},
                               {"A32NX_EGPWC_ND_R_TERRAIN_MAX_ELEVATION_MODE"}}};

constexpr double kSimBridgeStatusPeriodSeconds = 0.1;
constexpr double kSimBridgeConnectRetrySeconds = 5.0;
constexpr double kSimBridgeFiguresMaxAgeSeconds = 5.0;
constexpr SIMCONNECT_CLIENT_DATA_ID kSimBridgeStatusAreaId = 0;
constexpr SIMCONNECT_CLIENT_DATA_DEFINITION_ID kSimBridgeStatusDefinitionId = 0;
// The threshold and frame blocks: ids 1 + side (thresholds) and 3 + side (frames); a request's id is its area's id.
constexpr SIMCONNECT_CLIENT_DATA_ID kSimBridgeThresholdsAreaId = 1;
constexpr SIMCONNECT_CLIENT_DATA_ID kSimBridgeFramesAreaId = 3;
constexpr const char* kSimBridgeStatusAreaName = "FBW_SIMBRIDGE_EGPWC_AIRCRAFT_STATUS";
constexpr const char* kSimBridgeThresholdsAreaNames[2] = {"FBW_SIMBRIDGE_TERRONND_THRESHOLDS_LEFT",
                                                          "FBW_SIMBRIDGE_TERRONND_THRESHOLDS_RIGHT"};
constexpr const char* kSimBridgeFramesAreaNames[2] = {"FBW_SIMBRIDGE_TERRONND_FRAME_DATA_LEFT", "FBW_SIMBRIDGE_TERRONND_FRAME_DATA_RIGHT"};

struct SimBridgeSideFigures {
  types::ThresholdData data{};
  double receivedTime = -1.0e9;
  bool shown = false;  // whether this module last wrote figures (not -1) into the LVars
};

struct SimBridgeStatus {
  FsContext owner = 0;  // the gauge that talks to SimBridge (the first ND gauge installed)
  HANDLE connection = 0;
  bool areaReady = false;
  double lastSendTime = -1.0e9;
  double lastConnectTime = -1.0e9;
  SimBridgeSideFigures figures[2];
};
SimBridgeStatus g_simBridge;

// Whether the crew has the terrain selected on a side (terrainSelected() for an instance, by side here).
bool terrainSelectedOnSide(int side) {
#ifdef A380X
  return g_efisOverlay[side].read() == kOverlayTerr && terrainSystemUp();
#else
  return g_egpwcTerrainActive[side].read() != 0.0;
#endif
}

void writePeaksFigures(int side, double now) {
  SimBridgeSideFigures& figures = g_simBridge.figures[side];
  const double ndMode = g_efisNdMode[side].read();
  const int rangeNm = static_cast<int>(std::fmax(g_egpwcNdRange[side].read(), 0.0));
  const bool current = now - figures.receivedTime <= kSimBridgeFiguresMaxAgeSeconds && figures.data.displayRange == rangeNm &&
                       figures.data.displayMode == static_cast<std::uint8_t>(ndMode);
  if (terrainSelectedOnSide(side) && isMapPage(ndMode) && current) {
    set_named_variable_value(g_peaksVars[side][0].id, static_cast<double>(figures.data.lowerThreshold));
    set_named_variable_value(g_peaksVars[side][1].id, static_cast<double>(figures.data.lowerThresholdMode));
    set_named_variable_value(g_peaksVars[side][2].id, static_cast<double>(figures.data.upperThreshold));
    set_named_variable_value(g_peaksVars[side][3].id, static_cast<double>(figures.data.upperThresholdMode));
    figures.shown = true;
  } else if (figures.shown || figures.receivedTime < 0.0) {
    // Hide the box (the LVars read 0 until something writes them, which the box would show as a "0").
    set_named_variable_value(g_peaksVars[side][0].id, -1.0);
    set_named_variable_value(g_peaksVars[side][1].id, 0.0);
    set_named_variable_value(g_peaksVars[side][2].id, -1.0);
    set_named_variable_value(g_peaksVars[side][3].id, 0.0);
    figures.shown = false;
    figures.receivedTime = 0.0;
  }
}

void simBridgeDisconnect() {
  if (g_simBridge.connection != 0) {
    SimConnect_Close(g_simBridge.connection);
  }
  g_simBridge.connection = 0;
  g_simBridge.areaReady = false;
}

void simBridgeConnect() {
  if (!SUCCEEDED(SimConnect_Open(&g_simBridge.connection, "FBW_NDWXR_SIMBRIDGE_STATUS", nullptr, 0, 0, 0))) {
    g_simBridge.connection = 0;
    return;
  }
  const DWORD size = static_cast<DWORD>(sizeof(types::AircraftStatusData));
  bool ok = SUCCEEDED(SimConnect_MapClientDataNameToID(g_simBridge.connection, kSimBridgeStatusAreaName, kSimBridgeStatusAreaId));
  ok = ok && SUCCEEDED(SimConnect_AddToClientDataDefinition(g_simBridge.connection, kSimBridgeStatusDefinitionId,
                                                             SIMCONNECT_CLIENTDATAOFFSET_AUTO, size));
  ok = ok && SUCCEEDED(SimConnect_CreateClientData(g_simBridge.connection, kSimBridgeStatusAreaId, size,
                                                    SIMCONNECT_CREATE_CLIENT_DATA_FLAG_READ_ONLY));
  // SimBridge's blocks (it creates them itself): the figures, and the frames it renders for terronnd.
  for (int side = 0; side < 2 && ok; ++side) {
    const SIMCONNECT_CLIENT_DATA_ID thresholdsId = kSimBridgeThresholdsAreaId + static_cast<SIMCONNECT_CLIENT_DATA_ID>(side);
    const SIMCONNECT_CLIENT_DATA_ID framesId = kSimBridgeFramesAreaId + static_cast<SIMCONNECT_CLIENT_DATA_ID>(side);
    ok = ok && SUCCEEDED(SimConnect_MapClientDataNameToID(g_simBridge.connection, kSimBridgeThresholdsAreaNames[side], thresholdsId));
    ok = ok && SUCCEEDED(SimConnect_AddToClientDataDefinition(g_simBridge.connection, thresholdsId, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                               static_cast<DWORD>(sizeof(types::ThresholdData))));
    ok = ok && SUCCEEDED(SimConnect_RequestClientData(g_simBridge.connection, thresholdsId, thresholdsId, thresholdsId,
                                                       SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET, SIMCONNECT_CLIENT_DATA_REQUEST_FLAG_DEFAULT, 0,
                                                       0, 0));
    ok = ok && SUCCEEDED(SimConnect_MapClientDataNameToID(g_simBridge.connection, kSimBridgeFramesAreaNames[side], framesId));
    ok = ok && SUCCEEDED(SimConnect_AddToClientDataDefinition(g_simBridge.connection, framesId, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                               static_cast<DWORD>(SIMCONNECT_CLIENTDATA_MAX_SIZE)));
    ok = ok && SUCCEEDED(SimConnect_RequestClientData(g_simBridge.connection, framesId, framesId, framesId,
                                                       SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET, SIMCONNECT_CLIENT_DATA_REQUEST_FLAG_DEFAULT, 0,
                                                       0, 0));
  }
  if (!ok) {
    simBridgeDisconnect();
    return;
  }
  g_simBridge.areaReady = true;
}

double planeCoordinateDegrees(const char* name) {
  const ENUM variable = get_aircraft_var_enum(name);
  static const ENUM degrees = get_units_enum("degrees");
  return aircraft_varget(variable, degrees, 0);
}

// The EFIS part for one side: terrain requested on a map page (ROSE ILS / VOR / NAV or ARC), as terronnd sent it.
void fillSimBridgeEfis(int side, std::uint16_t* range, std::uint8_t* arc, std::uint8_t* terrainOn, std::uint8_t* mode) {
  const double ndMode = g_efisNdMode[side].read();
  const bool arcMode = ndMode == kNdModeArc;
  const bool mapPage = isMapPage(ndMode);
  *range = static_cast<std::uint16_t>(std::fmax(g_egpwcNdRange[side].read(), 0.0));
  *arc = arcMode ? 1 : 0;
  *terrainOn = terrainSelectedOnSide(side) && mapPage ? 1 : 0;
  *mode = static_cast<std::uint8_t>(ndMode);
}

void simBridgeUpdate(double now) {
  if (g_simBridge.connection != 0) {
    // Drain what the server sends (the open acknowledgement, a quit when the sim shuts SimConnect down).
    SIMCONNECT_RECV* message = nullptr;
    DWORD messageSize = 0;
    while (SUCCEEDED(SimConnect_GetNextDispatch(g_simBridge.connection, &message, &messageSize))) {
      if (message == nullptr) {
        break;
      }
      if (message->dwID == SIMCONNECT_RECV_ID_QUIT) {
        simBridgeDisconnect();
        break;
      }
      if (message->dwID == SIMCONNECT_RECV_ID_CLIENT_DATA) {
        const SIMCONNECT_RECV_CLIENT_DATA* clientData = static_cast<const SIMCONNECT_RECV_CLIENT_DATA*>(message);
        const DWORD request = clientData->dwRequestID;
        if (request == kSimBridgeThresholdsAreaId || request == kSimBridgeThresholdsAreaId + 1) {
          const int side = static_cast<int>(request - kSimBridgeThresholdsAreaId);
          std::memcpy(&g_simBridge.figures[side].data, &clientData->dwData, sizeof(types::ThresholdData));
          g_simBridge.figures[side].receivedTime = now;
        }
        // The frame chunks (the other requests) are dropped.
      }
    }
  }
  for (int side = 0; side < 2; ++side) {
    writePeaksFigures(side, now);
  }
  if (g_simBridge.connection == 0) {
    if (now - g_simBridge.lastConnectTime >= kSimBridgeConnectRetrySeconds) {
      g_simBridge.lastConnectTime = now;
      simBridgeConnect();
    }
    return;
  }
  if (!g_simBridge.areaReady || now - g_simBridge.lastSendTime < kSimBridgeStatusPeriodSeconds) {
    return;
  }
  g_simBridge.lastSendTime = now;

  const auto lat = types::Arinc429Word<float>::fromSimVar(g_egpwcPresentLat.read());
  const auto lon = types::Arinc429Word<float>::fromSimVar(g_egpwcPresentLon.read());
  const auto alt = types::Arinc429Word<float>::fromSimVar(g_egpwcPresentAltitude.read());
  const auto hdg = types::Arinc429Word<float>::fromSimVar(g_egpwcPresentHeading.read());
  const auto vs = types::Arinc429Word<float>::fromSimVar(g_egpwcPresentVerticalSpeed.read());
  const auto destLat = types::Arinc429Word<float>::fromSimVar(g_egpwcDestLat.read());
  const auto destLon = types::Arinc429Word<float>::fromSimVar(g_egpwcDestLon.read());

  types::AircraftStatusData data{};
  data.adiruValid = lat.isNo() && lon.isNo() && alt.isNo() && hdg.isNo() && vs.isNo() ? 1 : 0;
  data.latitude = lat.value();
  data.longitude = lon.value();
  data.altitude = static_cast<std::int32_t>(alt.value());
  data.heading = static_cast<std::int16_t>(hdg.value());
  data.verticalSpeed = static_cast<std::int16_t>(vs.value());
  data.gearIsDown = g_egpwcGearDown.read() != 0.0 ? 1 : 0;
  data.destinationValid = destLat.isNo() && destLon.isNo() ? 1 : 0;
  data.destinationLatitude = destLat.value();
  data.destinationLongitude = destLon.value();
  fillSimBridgeEfis(0, &data.ndRangeCapt, &data.ndArcModeCapt, &data.ndTerrainOnNdActiveCapt, &data.efisModeCapt);
  fillSimBridgeEfis(1, &data.ndRangeFO, &data.ndArcModeFO, &data.ndTerrainOnNdActiveFO, &data.efisModeFO);
  data.ndTerrainOnNdRenderingMode = static_cast<std::uint8_t>(g_egpwcRenderingMode.read());
  data.groundTruthLatitude = static_cast<float>(planeCoordinateDegrees("PLANE LATITUDE"));
  data.groundTruthLongitude = static_cast<float>(planeCoordinateDegrees("PLANE LONGITUDE"));

  if (!SUCCEEDED(SimConnect_SetClientData(g_simBridge.connection, kSimBridgeStatusAreaId, kSimBridgeStatusDefinitionId,
                                          SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT, 0, static_cast<DWORD>(sizeof(data)), &data))) {
    simBridgeDisconnect();
  }
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
      for (NamedVar* v : {&g_egpwcPresentLat, &g_egpwcPresentLon, &g_egpwcPresentAltitude, &g_egpwcPresentHeading,
                          &g_egpwcPresentVerticalSpeed, &g_egpwcDestLat, &g_egpwcDestLon, &g_egpwcRenderingMode}) {
        v->id = register_named_variable(v->name);
      }
      for (int i = 0; i < 2; ++i) {
        g_egpwcNdRange[i].id = register_named_variable(g_egpwcNdRange[i].name);
        g_efisNdMode[i].id = register_named_variable(g_efisNdMode[i].name);
        g_egpwcTerrainActive[i].id = register_named_variable(g_egpwcTerrainActive[i].name);
#ifdef A380X
        g_efisOverlay[i].id = register_named_variable(g_efisOverlay[i].name);
#endif
        for (NamedVar& peaks : g_peaksVars[i]) {
          peaks.id = register_named_variable(peaks.name);
        }
      }
      for (int i = 0; i < 3; ++i) {
        g_adirsLat[i].id = register_named_variable(g_adirsLat[i].name);
        g_adirsLon[i].id = register_named_variable(g_adirsLon[i].name);
        g_adirsTrueHeading[i].id = register_named_variable(g_adirsTrueHeading[i].name);
      }
      for (NamedVar& verticalSpeed : g_adirsVerticalSpeed) {
        verticalSpeed.id = register_named_variable(verticalSpeed.name);
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
      g_vdCutMode.id = register_named_variable(g_vdCutMode.name);
      g_vdCutCount.id = register_named_variable(g_vdCutCount.name);
      g_vdCutTrackChangeNm.id = register_named_variable(g_vdCutTrackChangeNm.name);
      for (int i = 0; i < kVdCutMaxVertices; ++i) {
        char name[40];
        std::snprintf(name, sizeof(name), "A380X_VD_CUT_%d_LAT", i);
        g_vdCutLatVars[i] = register_named_variable(name);
        std::snprintf(name, sizeof(name), "A380X_VD_CUT_%d_LON", i);
        g_vdCutLonVars[i] = register_named_variable(name);
      }
      for (NamedVar& track : g_adirsTrueTrack) {
        track.id = register_named_variable(track.name);
      }
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
      instance->peaksMinVar = register_named_variable(instance->isRight ? "A32NX_EGPWC_ND_R_TERRAIN_MIN_ELEVATION"
                                                                        : "A32NX_EGPWC_ND_L_TERRAIN_MIN_ELEVATION");
      instance->peaksMaxVar = register_named_variable(instance->isRight ? "A32NX_EGPWC_ND_R_TERRAIN_MAX_ELEVATION"
                                                                        : "A32NX_EGPWC_ND_L_TERRAIN_MAX_ELEVATION");

      NVGparams params;
      params.userPtr = ctx;
      params.edgeAntiAlias = false;
      instance->nvg = nvgCreateInternal(&params);
#ifdef A380X
      if (instance->isVdTerrain) {
        instance->mapViewVdTerrain = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
        instance->mapViewVdTerrainReady = configureVdTerrainView(ctx, instance->mapViewVdTerrain);
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
      // The first ND gauge writes the SimBridge status block (see simBridgeUpdate).
      if (g_simBridge.owner == 0) {
        g_simBridge.owner = ctx;
      }
      if (g_simBridge.owner == ctx) {
        simBridgeUpdate(static_cast<const sGaugeDrawData*>(pData)->t);
      }

      bool isRose = false;
      bool showPrecip = false;
      bool showTurb = false;
      bool showTerrain = false;
      bool showMap = false;
      float terrainLookAheadFeet = 0.0f;
      int labelMode = 0;
      float terrainHeadingDegrees = 0.0f;
      float rangeNmForMode = 10.0f;
      // How much of the picture the radar has built since it started transmitting (see g_wxrTransmitting).
      float sweepFraction = 1.0f;
#ifdef A380X
      bool vdWanted = false;
      bool showVd = false;
      float vdRangeNm = 10.0f;
      double vdLowerFeet = 0.0;
      double vdUpperFeet = 0.0;
      double vdBaroAltFeet = 0.0;
      float vdLat = 0.0f;
      float vdLon = 0.0f;
      float vdTrackDeg = 0.0f;
      float vdHeadingDeg = 0.0f;
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

#ifdef A380X
      instance->wxrRequested = false;
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
        // (not the A380X's OANS view) and the ND's position source is valid (ADIRS
        // word validity is the "is position usable" check); on the ground as well
        // (see the header). MODE: WX = precipitation, WX+T = both, TURB =
        // turbulence only, MAP = ground mapping (drawMapMode, from the terrain view).
        const bool positionValid = latWord.isNo() && lonWord.isNo();
        // Terrain on the ND is shown on the same pages and takes the place of the weather.
        // The map (and the MAP mode's picture) is rotated by the ND's own heading source, so it needs a valid one.
        const auto headingWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueHeading[ir - 1].read());
        terrainHeadingDegrees = headingWord.value();
        const bool mapPage = isMapPage(ndMode) && rangeNm > 0.0f;
        showTerrain = terrainViewsReady && terrainSelected(*instance) && mapPage && positionValid && headingWord.isNo();
        const bool active = radarSelected(*instance) && mapPage && positionValid && !showTerrain;
        showPrecip = active && instance->mapViewReady && (wxrMode == kWxrModeWx || wxrMode == kWxrModeWxTurb);
        showTurb = active && instance->mapViewHotReady && (wxrMode == kWxrModeWxTurb || wxrMode == kWxrModeTurb);
        showMap = active && terrainViewsReady && wxrMode == kWxrModeMap && headingWord.isNo();
        // The terrain's reference altitude looks ahead in a fast descent (see kTerrainLookAheadSeconds).
        const auto verticalSpeedWord = types::Arinc429Word<float>::fromSimVar(g_adirsVerticalSpeed[ir - 1].read());
        if (verticalSpeedWord.isNo() && verticalSpeedWord.value() < -kTerrainLookAheadFromFpm) {
          terrainLookAheadFeet = -verticalSpeedWord.value() * (kTerrainLookAheadSeconds / 60.0f);
        }
        // The ROSE pages show half the range of ARC around the aircraft.
        isRose = ndMode != kNdModeArc;
        rangeNmForMode = isRose ? rangeNm / 2.0f : rangeNm;
        // The mode text on the ND: shown whenever the radar is selected on a page that has it (not while the
        // terrain takes its place), on the ground too. A32NX: "WXR OFF" (mode 5) while the radar is switched
        // off, one of the ND's radar indications (A320 FCOM DSC-34-SURV-30-30).
        if (radarSelected(*instance) && mapPage && !showTerrain) {
          labelMode = 1 + static_cast<int>(wxrMode);
        }
#ifndef A380X
        else if (mapPage && !showTerrain && g_wxrSys.read() == kWxrSysOff) {
          labelMode = 5;
        }
#endif
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
        // ... and, as on the real aircraft, not while the TERR function is unavailable (a failed TAWS or
        // TERR SYS OFF): "the VD does not display the weather when the TERR function is not available,
        // because it cannot locate the weather vertically" (FCOM DSC-31-20-40-10, VD messages).
        // The VD's weather runs along the same vertical cut as its terrain (FCOM DSC-31-20-40-10: "for the
        // weather display, the WXR considers a zero-width vertical cut"), which needs the ND's heading (the
        // radar texture's up) and the aircraft's position; the cut along the track follows the IR's true
        // track, the heading stands in while it is not valid.
        const auto trackWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueTrack[ir - 1].read());
        vdWanted = showPrecip && isArcOrRoseNav(ndMode) && g_wxrVdOff.read() == 0.0 && baroAltWord.isNo() && headingWord.isNo() &&
                   terrainSystemUp() && g_terrSysOff.read() == 0.0;
        vdRangeNm = isRose ? std::fmin(std::fmax(rangeNm / 2.0f, 5.0f), 160.0f) : std::fmin(std::fmax(rangeNm, 10.0f), 160.0f);
        vdLowerFeet = get_named_variable_value(instance->vdRangeLowerVar);
        vdUpperFeet = get_named_variable_value(instance->vdRangeUpperVar);
        vdLat = latWord.value();
        vdLon = lonWord.value();
        vdHeadingDeg = headingWord.value();
        vdTrackDeg = trackWord.isNo() ? trackWord.value() : vdHeadingDeg;
        showVd = vdWanted && vdUpperFeet > vdLowerFeet;
        instance->wxrRequested = radarSelected(*instance);
#endif
      }
#ifdef A380X
      // The radar transmits while any ND asks for it (on the ground too, see the header); from the moment it
      // starts, its picture is revealed over kWxrBufferFillSeconds (both NDs share the transmitter, so both see
      // the same sweep).
      {
        bool anyRequested = false;
        for (const Instance& other : g_instances) {
          if (other.inUse && !other.isVdTerrain && other.wxrRequested) {
            anyRequested = true;
          }
        }
        const bool transmitting = anyRequested;
        const double now = static_cast<const sGaugeDrawData*>(pData)->t;
        if (transmitting && !g_wxrTransmitting) {
          g_wxrTransmitSince = now;
        }
        g_wxrTransmitting = transmitting;
        if (transmitting) {
          sweepFraction = static_cast<float>(std::fmin((now - g_wxrTransmitSince) / kWxrBufferFillSeconds, 1.0));
        }
      }
#endif

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
        if ((showTerrain || showMap) && instance->ndRole != 1) {
          configureTerrainView(ctx, instance->mapView);
          configureWaterMaskView(ctx, instance->mapViewHot);
          instance->terrainGearState = -1;
          instance->terrainListMode = -1;
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

      const bool drawsAnything = showPrecip || showTurb || showTerrain || showMap;
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
        // Peaks mode (see setPeaksColors) while the range's highest terrain, as the SimBridge knows it, is
        // more than kPeaksBelowFeet below the aircraft; the standard bands otherwise.
        const double peaksMin = get_named_variable_value(instance->peaksMinVar);
        const double peaksMax = get_named_variable_value(instance->peaksMaxVar);
        const double altitude = planeAltitudeFeet();
        const bool peaksMode = peaksMin >= 0.0 && peaksMax >= 0.0 && peaksMax <= altitude - static_cast<double>(kPeaksBelowFeet);
        if (peaksMode) {
          if (instance->terrainListMode != 2) {
            setPeaksColors(ctx, terrainViewId);
            instance->terrainListMode = 2;
          }
          const double span = std::fmax(peaksMax - peaksMin, static_cast<double>(kPeaksMinSpanFeet));
          fsMapViewSetAltitudeRangeInFeet(ctx, terrainViewId, altitude - peaksMax - static_cast<double>(kPeaksMarginFraction) * span,
                                          altitude - peaksMin);
        } else {
          const int gearState = g_egpwcGearDown.read() != 0.0 ? 1 : 0;
          if (gearState != instance->terrainGearState || instance->terrainListMode != 0) {
            setTerrainColors(ctx, terrainViewId, gearState == 1);
            instance->terrainGearState = gearState;
            instance->terrainListMode = 0;
          }
          // The bands shifted by the look-ahead (the view colours by the aircraft's own altitude, see kTerrainLookAheadSeconds).
          fsMapViewSetAltitudeRangeInFeet(ctx, terrainViewId, static_cast<double>(kTerrainMinFeet + terrainLookAheadFeet),
                                          static_cast<double>(kTerrainMaxFeet + terrainLookAheadFeet));
        }
        fsMapViewSet2DViewRadiusInMeters(ctx, terrainViewId, rangeNmForMode * kNmToMetres);
        fsMapViewSet2DViewRadiusInMeters(ctx, waterViewId, rangeNmForMode * kNmToMetres);
        if (terrainReady && instance->terrainPatternImage != 0) {
          drawTerrain(vg, terrainViewId, waterViewId, instance->terrainPatternImage, isRose, terrainHeadingDegrees);
        }
      } else if (showMap) {
        // The MAP mode borrows the terrain view with its own colour list and range (see setMapColors).
        if (instance->terrainListMode != 1) {
          setMapColors(ctx, terrainViewId);
          fsMapViewSetAltitudeRangeInFeet(ctx, terrainViewId, static_cast<double>(kMapMinFeet), static_cast<double>(kMapMaxFeet));
          instance->terrainListMode = 1;
        }
        fsMapViewSet2DViewRadiusInMeters(ctx, terrainViewId, rangeNmForMode * kNmToMetres);
        if (terrainReady) {
          drawMapMode(vg, terrainViewId, isRose, terrainHeadingDegrees);
        }
      }
      if (showPrecip) {
        fsMapViewSet2DViewRadiusInMeters(ctx, instance->mapView, rangeNmForMode * kNmToMetres);
        if (precipReady) {
          drawWeatherRect(vg, instance->mapView, isRose, 1.0f, WeatherPass::Additive, Channels{1.0f, 1.0f, 0.0f}, sweepFraction);
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
            drawWeatherRect(vg, instance->mapViewHot, isRose, 1.0f, WeatherPass::Erase, Channels{0.0f, 1.0f, 0.0f}, sweepFraction);
          }
          if (showTurb) {
            const float turbFraction = kTurbulenceMaxRangeNm / rangeNmForMode;
            const float turbRangeFraction = turbFraction < 1.0f ? turbFraction : 1.0f;
            drawWeatherRect(vg, instance->mapViewHot, isRose, turbRangeFraction, WeatherPass::AdditiveMagenta, Channels{1.0f, 0.0f, 1.0f},
                            sweepFraction);
          }
        }
      }
#ifdef A380X
      // Last, so nothing of the ND's passes above can touch it: they only affect
      // the ND's rect, where the VD area (behind the aircraft) has no weather.
      if (showVd && precipReady) {
        // The cut: along the flight plan when one is published and the aircraft is on it, else along the
        // track. While the buffer fills, the VD shows its weather once the sweep has passed the cut's direction.
        VdCutSegment cut[kVdCutMaxSegments];
        int cutCount = buildVdPlanCut(vdLat, vdLon, vdRangeNm, cut);
        if (cutCount == 0) {
          cut[0] = VdCutSegment{0.0f, 0.0f, vdTrackDeg, vdRangeNm, 0.0f};
          cutCount = 1;
        }
        float cutAngle = cut[0].trackDeg - vdHeadingDeg;
        while (cutAngle > 180.0f) {
          cutAngle -= 360.0f;
        }
        while (cutAngle < -180.0f) {
          cutAngle += 360.0f;
        }
        cutAngle = std::fmin(std::fmax(cutAngle, -90.0f), 90.0f);
        if (sweepFraction >= (cutAngle + 90.0f) / 180.0f) {
          drawVdWeather(vg, instance->mapView, instance->mapViewHot, instance->mapViewHotReady && hotReady, rangeNmForMode, vdRangeNm,
                        cut, cutCount, vdHeadingDeg, vdBaroAltFeet, vdLowerFeet, vdUpperFeet);
        }
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
      if (g_simBridge.owner == ctx) {
        simBridgeDisconnect();
        g_simBridge.owner = 0;
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
