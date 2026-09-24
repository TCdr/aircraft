// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

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
// and is reconfigured when the crew switches) and 2 per VD terrain gauge (terrain
// and water mask). The module also reserves its memory up front (build.sh): growing
// it while drawing crashes too.
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

#include "constants.h"

namespace ndwxr {

// An FsColor from its channels. The SDK's FsColor is a struct around a union around an array,
// which brace-initialised in place trips -Wmissing-braces everywhere it is used.
constexpr FsColor rgba(float r, float g, float b, float a = 1.0f) {
  return FsColor{{{r, g, b, a}}};
}

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

#ifdef A380X
// One straight piece of the vertical cut, relative to the aircraft (see buildVdPlanCut).
struct VdCutSegment {
  float startEastNm;   // where the piece starts, east ...
  float startNorthNm;  // ... and north of the aircraft
  float trackDeg;      // its true track
  float lengthNm;
  float startNm;       // its distance along the cut (the aircraft is at 0)
};
#endif

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
  // Tells water from land along the cut (configureWaterMaskView), drawn in the ND's water colour.
  FsTextureId mapViewVdWater = 0;
  bool mapViewVdWaterReady = false;
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

// A module can have at most 8 map views: a ninth (and any later) one is created without complaint, but crashes
// the module's gauge draw as soon as it is drawn (measured in-sim 2026-09-20; hiding views does not help, only
// the number that exist counts). The A320 has 4 per ND (precipitation, hot, terrain, water); the A380X has 2 per
// ND (a pair that is either the weather pair or the terrain pair, never both at once) and 2 per VD terrain gauge
// (terrain and water mask, see drawVdTerrain).

// The `L:` variables shared by the gauges (defined and registered in simvars.cpp).
extern NamedVar g_attHdgKnob;
extern NamedVar g_adirsLat[3];
extern NamedVar g_adirsLon[3];
extern NamedVar g_adirsTrueHeading[3];
extern NamedVar g_egpwcGearDown;
extern NamedVar g_adirsVerticalSpeed[3];
#ifdef A380X
extern NamedVar g_wxrTawsSelected;
extern NamedVar g_wxrFailed[2];
extern NamedVar g_terrFailed[2];
extern NamedVar g_terrSysOff;
extern NamedVar g_airDataKnob;
extern NamedVar g_adrBaroAlt1[3];
extern NamedVar g_adrBaroAlt2[3];
extern NamedVar g_wxrOff;
extern NamedVar g_wxrTurbOff;
extern NamedVar g_wxrModeMap;
extern NamedVar g_wxrVdOff;
extern NamedVar g_vdCutMode;
extern NamedVar g_vdCutCount;
extern NamedVar g_vdCutTrackChangeNm;
extern ID g_vdCutLatVars[kVdCutMaxVertices];
extern ID g_vdCutLonVars[kVdCutMaxVertices];
extern NamedVar g_adirsTrueTrack[3];
#endif
#ifndef A380X
extern NamedVar g_wxrSys;
extern NamedVar g_wxrMode;
#endif

extern NamedVar g_egpwcPresentLat;
extern NamedVar g_egpwcPresentLon;
extern NamedVar g_egpwcPresentAltitude;
extern NamedVar g_egpwcPresentHeading;
extern NamedVar g_egpwcPresentVerticalSpeed;
extern NamedVar g_egpwcDestLat;
extern NamedVar g_egpwcDestLon;
extern NamedVar g_egpwcRenderingMode;
extern NamedVar g_egpwcNdRange[2];
extern NamedVar g_efisNdMode[2];
extern NamedVar g_egpwcTerrainActive[2];
#ifdef A380X
extern NamedVar g_efisOverlay[2];
#endif

extern NamedVar g_peaksVars[2][4];

// Registers every shared `L:` variable (once per module; a second registration returns the same id).
void registerSimVars();

// The functions the translation units share; each file keeps its other helpers static.

// gauge.cpp: the gauge instances.
Instance* findInstance(FsContext ctx);
Instance* allocInstance();

// simvars.cpp: the readers of the shared variables.
int inertialSource(bool isRight, int attHdgKnob);
bool isMapPage(double ndMode);
bool isPowered(const Instance& instance);
bool radarSelected(const Instance& instance);
double radarMode();
bool terrainSelected(const Instance& instance);
double planeAltitudeFeet();
double planeCoordinateDegrees(const char* name);
#ifdef A380X
bool isArcOrRoseNav(double ndMode);
int airDataSource(bool isRight, int airDataKnob);
bool terrainSystemUp();
#endif

// render.cpp: the shared NanoVG helpers.
float encodeSrgb(float linear);
void clearLayer(NVGcontext* vg, float width, float height);
void sharpenRect(NVGcontext* vg, float x, float y, float w, float h, int passes = kSharpenPasses);
void colorizeRect(NVGcontext* vg, float x, float y, float w, float h);

// weather.cpp: the radar views and the weather picture.
bool configurePrecipView(FsContext ctx, FsTextureId id);
bool configureHotView(FsContext ctx, FsTextureId id);
void arcAreaPath(NVGcontext* vg, float cx, float cy, float radius, float sweepFraction);
void drawWeatherRect(NVGcontext* vg, FsTextureId mapView, bool isRose, float rangeFraction, WeatherPass pass,
                     Channels channels = kAllChannels, float sweepFraction = 1.0f);

// terrain.cpp: the terrain views and the terrain / MAP mode pictures.
bool configureTerrainView(FsContext ctx, FsTextureId id);
bool configureWaterMaskView(FsContext ctx, FsTextureId id);
void setTerrainColors(FsContext ctx, FsTextureId id, bool gearDown);
void setMapColors(FsContext ctx, FsTextureId id);
void setPeaksColors(FsContext ctx, FsTextureId id);
int createTerrainPattern(NVGcontext* vg);
void drawTerrain(NVGcontext* vg, FsTextureId view, FsTextureId waterView, int patternImage, bool isRose, float headingDegrees);
void drawMapMode(NVGcontext* vg, FsTextureId view, bool isRose, float headingDegrees);

#ifdef A380X
// vd.cpp: the vertical display.
bool configureVdTerrainView(FsContext ctx, FsTextureId id);
int buildVdPlanCut(float aircraftLat, float aircraftLon, float rangeNm, VdCutSegment* out);
void drawVdWeather(NVGcontext* vg, FsTextureId precipView, FsTextureId hotView, bool hotReady, float ndRadiusNm, float vdRangeNm,
                   const VdCutSegment* cut, int cutCount, float headingDeg, double baroAltFeet, double lowerFeet, double upperFeet);
void drawVdTerrainGauge(FsContext ctx, Instance& instance, const sGaugeDrawData* drawData);
#endif

// simbridge.cpp: the SimBridge terrain service client; the first ND gauge to draw becomes its owner.
void simBridgeOnGaugeDraw(FsContext ctx, double now);
void simBridgeOnGaugeKill(FsContext ctx);

}  // namespace ndwxr
