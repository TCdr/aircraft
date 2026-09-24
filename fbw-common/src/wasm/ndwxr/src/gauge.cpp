// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The gauge callback: the instances (one per ND, plus one per VD on the A380X), their variables
// and MapViews, and the per-frame draw that puts the weather, the terrain and the VD together.

#include "ndwxr.h"

namespace ndwxr {

// The A380X installs 4 gauges (L, R, LV, RV); twice that, so a gauge reinstalled by the
// sim without a PRE_KILL of the old one (an aircraft switch) still finds a free slot.
constexpr int kMaxInstances = 8;

static Instance g_instances[kMaxInstances];

#ifdef A380X
// Whether the radar is transmitting (any ND asks for it) and since when: the picture is
// revealed over kWxrBufferFillSeconds from that moment (see updateRadarSweep).
static bool g_wxrTransmitting = false;
static double g_wxrTransmitSince = 0.0;
#endif

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

// ---------------------------------------------------------------------------
// Install and kill.
// ---------------------------------------------------------------------------

// The `L:` variables of one gauge instance: the ones that differ per side.
static void registerInstanceVars(Instance& instance) {
#ifdef A380X
  instance.vdRangeLowerVar = register_named_variable(instance.isRight ? "A32NX_VD_2_RANGE_LOWER" : "A32NX_VD_1_RANGE_LOWER");
  instance.vdRangeUpperVar = register_named_variable(instance.isRight ? "A32NX_VD_2_RANGE_UPPER" : "A32NX_VD_1_RANGE_UPPER");
  instance.overlayVar = register_named_variable(instance.isRight ? "A380X_EFIS_R_ACTIVE_OVERLAY" : "A380X_EFIS_L_ACTIVE_OVERLAY");
  if (instance.isRight) {
    instance.powerBusVars[0] = register_named_variable("A32NX_ELEC_DC_1_BUS_IS_POWERED");
    instance.powerBusVars[1] = register_named_variable("A32NX_ELEC_DC_2_BUS_IS_POWERED");
  } else {
    instance.powerBusVars[0] = register_named_variable("A32NX_ELEC_108PH_BUS_IS_POWERED");
    instance.powerBusVars[1] = register_named_variable("A32NX_ELEC_DC_1_BUS_IS_POWERED");
  }
#else
  instance.terrainActiveVar =
      register_named_variable(instance.isRight ? "A32NX_EGPWC_ND_R_TERRAIN_ACTIVE" : "A32NX_EGPWC_ND_L_TERRAIN_ACTIVE");
  instance.powerBusVars[0] = register_named_variable(instance.isRight ? "A32NX_ELEC_AC_2_BUS_IS_POWERED"
                                                                       : "A32NX_ELEC_AC_ESS_BUS_IS_POWERED");
  instance.powerBusVars[1] = instance.powerBusVars[0];
#endif
  instance.wxrLabelVar = register_named_variable(instance.isRight ? "A32NX_WXR_ND_R_MODE" : "A32NX_WXR_ND_L_MODE");
  instance.ndModeVar = register_named_variable(instance.isRight ? "A32NX_EFIS_R_ND_MODE" : "A32NX_EFIS_L_ND_MODE");
  instance.ndRangeVar = register_named_variable(instance.isRight ? "A32NX_EFIS_R_ND_RANGE" : "A32NX_EFIS_L_ND_RANGE");
  instance.peaksMinVar = register_named_variable(instance.isRight ? "A32NX_EGPWC_ND_R_TERRAIN_MIN_ELEVATION"
                                                                   : "A32NX_EGPWC_ND_L_TERRAIN_MIN_ELEVATION");
  instance.peaksMaxVar = register_named_variable(instance.isRight ? "A32NX_EGPWC_ND_R_TERRAIN_MAX_ELEVATION"
                                                                   : "A32NX_EGPWC_ND_L_TERRAIN_MAX_ELEVATION");
}

// The MapViews of one gauge instance (see the note on the module's budget of eight in ndwxr.h).
static void createViews(FsContext ctx, Instance& instance) {
#ifdef A380X
  if (instance.isVdTerrain) {
    instance.mapViewVdTerrain = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
    instance.mapViewVdTerrainReady = configureVdTerrainView(ctx, instance.mapViewVdTerrain);
    instance.mapViewVdWater = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
    instance.mapViewVdWaterReady = configureWaterMaskView(ctx, instance.mapViewVdWater);
    return;
  }
#endif
  instance.mapView = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
  instance.mapViewReady = configurePrecipView(ctx, instance.mapView);
  instance.mapViewHot = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
  instance.mapViewHotReady = configureHotView(ctx, instance.mapViewHot);
#ifndef A380X
  // (the A380X ND's two views double as the terrain and water views, see terrainViews)
  instance.mapViewTerrain = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
  instance.mapViewTerrainReady = configureTerrainView(ctx, instance.mapViewTerrain);
  instance.mapViewWater = fsMapViewCreate(ctx, kTextureSize, kTextureSize, 0);
  instance.mapViewWaterReady = configureWaterMaskView(ctx, instance.mapViewWater);
#endif
}

static bool installInstance(FsContext ctx, const sGaugeInstallData* installData) {
  Instance* instance = allocInstance();
  if (instance == nullptr) {
    return false;
  }
  *instance = Instance{};
  instance->inUse = true;
  instance->ctx = ctx;

  const char* parameters = installData != nullptr ? installData->strParameters : nullptr;
  instance->isRight = parameters != nullptr && (parameters[0] == 'R' || parameters[0] == 'r');
#ifdef A380X
  // "LV" / "RV": this instance only draws the terrain profile on the VD.
  instance->isVdTerrain = parameters != nullptr && parameters[0] != '\0' && (parameters[1] == 'V' || parameters[1] == 'v');
#endif

  registerSimVars();
  registerInstanceVars(*instance);

  NVGparams params;
  params.userPtr = ctx;
  params.edgeAntiAlias = false;
  instance->nvg = nvgCreateInternal(&params);
  createViews(ctx, *instance);
  return true;
}

// Releases everything a gauge instance owns and frees its slot.
static void destroyInstance(FsContext ctx, Instance& instance) {
  simBridgeOnGaugeKill(ctx);
  const FsTextureId views[] = {instance.mapView, instance.mapViewHot, instance.mapViewTerrain, instance.mapViewWater,
#ifdef A380X
                               instance.mapViewVdTerrain, instance.mapViewVdWater,
#endif
  };
  for (FsTextureId view : views) {
    if (view != 0) {
      fsMapViewDelete(ctx, view);
    }
  }
  if (instance.nvg != nullptr) {
    if (instance.terrainPatternImage != 0) {
      nvgDeleteImage(instance.nvg, instance.terrainPatternImage);
    }
#ifdef A380X
    if (instance.vdRampImage != 0) {
      nvgDeleteImage(instance.nvg, instance.vdRampImage);
    }
#endif
    nvgDeleteInternal(instance.nvg);
  }
  instance = Instance{};
}

// ---------------------------------------------------------------------------
// The ND draw.
// ---------------------------------------------------------------------------

// The terrain and water views of an ND: their own pair on the A32NX; on the A380X the radar pair,
// reconfigured when the crew switches between the weather and the terrain (see updateViewRoles).
struct TerrainViews {
  FsTextureId terrain;
  FsTextureId water;
  bool ready;
};

static TerrainViews terrainViews(const Instance& instance) {
#ifdef A380X
  return TerrainViews{instance.mapView, instance.mapViewHot, instance.mapViewReady && instance.mapViewHotReady};
#else
  return TerrainViews{instance.mapViewTerrain, instance.mapViewWater, instance.mapViewTerrainReady && instance.mapViewWaterReady};
#endif
}

// What one ND frame shows, read from the simulator at the start of the draw.
struct NdFrame {
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

  bool drawsAnything() const { return showPrecip || showTurb || showTerrain || showMap; }
};

// Reads the ND's state and decides what the frame shows: the gating of the weather, the
// terrain, the MAP mode, the mode text and (A380X) the VD weather.
static NdFrame readNdFrame(Instance& instance, bool terrainViewsReady) {
  NdFrame frame;
#ifdef A380X
  instance.wxrRequested = false;
#endif
  if (!isPowered(instance)) {
    return frame;
  }
  const double ndMode = get_named_variable_value(instance.ndModeVar);
  const double wxrMode = radarMode();
  const int ir = inertialSource(instance.isRight, static_cast<int>(g_attHdgKnob.read()));
  // The ARINC429 data field is 32 bits - matches every other usage of
  // this template in the codebase (cpp-msfs-framework/lib/arinc429.hpp),
  // <double> would read 8 bytes out of a 4-byte local (UB).
  const auto latWord = types::Arinc429Word<float>::fromSimVar(g_adirsLat[ir - 1].read());
  const auto lonWord = types::Arinc429Word<float>::fromSimVar(g_adirsLon[ir - 1].read());

  const int rangeIndex = static_cast<int>(get_named_variable_value(instance.ndRangeVar));
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
  frame.terrainHeadingDegrees = headingWord.value();
  const bool mapPage = isMapPage(ndMode) && rangeNm > 0.0f;
  frame.showTerrain = terrainViewsReady && terrainSelected(instance) && mapPage && positionValid && headingWord.isNo();
#ifdef A380X
  // "The ND can only display the weather if the selected range is below, or equal to, 320 nm"
  // (A380 FCOM DSC-31-20-50, ND range selector).
  const bool weatherRange = rangeNm <= kWxrMaxRangeNm;
#else
  const bool weatherRange = true;
#endif
  const bool active = radarSelected(instance) && mapPage && positionValid && !frame.showTerrain && weatherRange;
  frame.showPrecip = active && instance.mapViewReady && (wxrMode == kWxrModeWx || wxrMode == kWxrModeWxTurb);
  frame.showTurb = active && instance.mapViewHotReady && (wxrMode == kWxrModeWxTurb || wxrMode == kWxrModeTurb);
  frame.showMap = active && terrainViewsReady && wxrMode == kWxrModeMap && headingWord.isNo();
  // The terrain's reference altitude looks ahead in a fast descent (see kTerrainLookAheadSeconds).
  const auto verticalSpeedWord = types::Arinc429Word<float>::fromSimVar(g_adirsVerticalSpeed[ir - 1].read());
  if (verticalSpeedWord.isNo() && verticalSpeedWord.value() < -kTerrainLookAheadFromFpm) {
    frame.terrainLookAheadFeet = -verticalSpeedWord.value() * (kTerrainLookAheadSeconds / 60.0f);
  }
  // The ROSE pages show half the range of ARC around the aircraft.
  frame.isRose = ndMode != kNdModeArc;
  frame.rangeNmForMode = frame.isRose ? rangeNm / 2.0f : rangeNm;
  // The mode text on the ND: shown whenever the radar is selected on a page that has it (not while the
  // terrain takes its place), on the ground too. A32NX: the display mode selector's position (WX, WX+T,
  // TURB, MAP) and "WXR OFF" while the radar is switched off, the ND's radar indications of the
  // Honeywell-equipped A320 (A320 FCOM DSC-34-SURV-30-30).
#ifdef A380X
  // The A380's ND messages of the WXR (A380 FCOM DSC-34-20-30-20, WXR MESSAGES): "WX" for the WX
  // display function whatever the TURB button (turbulence has no message of its own while the
  // weather is displayed), "MAP" for the ground mapping function, "WXR OFF" while the WXR button
  // of the SURV CONTROLS page is OFF. (The manual GAIN / ELEVN / TILT values and the stand-alone
  // TURB alert message are not modelled: the SURV knobs are not wired and the radar cannot be
  // read back.)
  if (mapPage && !frame.showTerrain && g_wxrOff.read() != 0.0) {
    frame.labelMode = kWxrLabelOff;
  } else if (radarSelected(instance) && mapPage && !frame.showTerrain) {
    frame.labelMode = wxrMode == kWxrModeMap ? kWxrLabelMap : kWxrLabelWx;
  }
#else
  if (radarSelected(instance) && mapPage && !frame.showTerrain) {
    frame.labelMode = 1 + static_cast<int>(wxrMode);
  } else if (mapPage && !frame.showTerrain && g_wxrSys.read() == kWxrSysOff) {
    frame.labelMode = kWxrLabelOff;
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
  const int adr = airDataSource(instance.isRight, static_cast<int>(g_airDataKnob.read()));
  const auto baroAltWord =
      types::Arinc429Word<float>::fromSimVar(instance.isRight ? g_adrBaroAlt2[adr - 1].read() : g_adrBaroAlt1[adr - 1].read());
  frame.vdBaroAltFeet = static_cast<double>(baroAltWord.value());
  // ... and, as on the real aircraft, not while the TERR function is unavailable (a failed TAWS or
  // TERR SYS OFF): "the VD does not display the weather when the TERR function is not available,
  // because it cannot locate the weather vertically" (FCOM DSC-31-20-40-10, VD messages).
  // The VD's weather runs along the same vertical cut as its terrain (FCOM DSC-31-20-40-10: "for the
  // weather display, the WXR considers a zero-width vertical cut"), which needs the ND's heading (the
  // radar texture's up) and the aircraft's position; the cut along the track follows the IR's true
  // track, the heading stands in while it is not valid.
  const auto trackWord = types::Arinc429Word<float>::fromSimVar(g_adirsTrueTrack[ir - 1].read());
  const bool vdWanted = frame.showPrecip && isArcOrRoseNav(ndMode) && g_wxrVdOff.read() == 0.0 && baroAltWord.isNo() &&
                        headingWord.isNo() && terrainSystemUp() && g_terrSysOff.read() == 0.0;
  frame.vdRangeNm = frame.isRose ? std::fmin(std::fmax(rangeNm / 2.0f, 5.0f), 160.0f) : std::fmin(std::fmax(rangeNm, 10.0f), 160.0f);
  frame.vdLowerFeet = get_named_variable_value(instance.vdRangeLowerVar);
  frame.vdUpperFeet = get_named_variable_value(instance.vdRangeUpperVar);
  frame.vdLat = latWord.value();
  frame.vdLon = lonWord.value();
  frame.vdHeadingDeg = headingWord.value();
  frame.vdTrackDeg = trackWord.isNo() ? trackWord.value() : frame.vdHeadingDeg;
  frame.showVd = vdWanted && frame.vdUpperFeet > frame.vdLowerFeet;
  instance.wxrRequested = radarSelected(instance);
#endif
  return frame;
}

#ifdef A380X
// The radar transmits while any ND asks for it (on the ground too, see the header); from the moment it
// starts, its picture is revealed over kWxrBufferFillSeconds (both NDs share the transmitter, so both see
// the same sweep).
static float radarSweepFraction(double now) {
  bool anyRequested = false;
  for (const Instance& other : g_instances) {
    if (other.inUse && !other.isVdTerrain && other.wxrRequested) {
      anyRequested = true;
    }
  }
  if (anyRequested && !g_wxrTransmitting) {
    g_wxrTransmitSince = now;
  }
  g_wxrTransmitting = anyRequested;
  if (!anyRequested) {
    return 1.0f;
  }
  return static_cast<float>(std::fmin((now - g_wxrTransmitSince) / kWxrBufferFillSeconds, 1.0));
}
#endif

// Publishes the mode text the JS ND shows (A32NX_WXR_ND_{L,R}_MODE) when it changes.
static void publishWxrLabel(Instance& instance, int labelMode) {
  if (labelMode != instance.wxrLabelShown) {
    set_named_variable_value(instance.wxrLabelVar, static_cast<double>(labelMode));
    instance.wxrLabelShown = labelMode;
  }
}

// Which views are ready to be drawn this frame.
struct ViewReadiness {
  bool precip = true;
  bool hot = true;
  bool terrain = true;
};

// On the A380X the ND's two views change roles when the crew switches between the weather and the
// terrain: they are reconfigured (the terrain takes the weather's place, the two are never wanted
// together) and left alone for a while.
static ViewReadiness updateViewRoles(FsContext ctx, Instance& instance, const NdFrame& frame) {
  ViewReadiness ready;
#ifdef A380X
  const bool weatherWanted = frame.showPrecip || frame.showTurb;
  if ((frame.showTerrain || frame.showMap) && instance.ndRole != 1) {
    configureTerrainView(ctx, instance.mapView);
    configureWaterMaskView(ctx, instance.mapViewHot);
    instance.terrainGearState = -1;
    instance.terrainListMode = -1;
    instance.ndRole = 1;
    instance.roleWarmupLeft = kRoleWarmupFrames;
  } else if (weatherWanted && instance.ndRole != 0) {
    configurePrecipView(ctx, instance.mapView);
    configureHotView(ctx, instance.mapViewHot);
    instance.ndRole = 0;
    instance.roleWarmupLeft = kRoleWarmupFrames;
  }
  if (instance.roleWarmupLeft > 0) {
    --instance.roleWarmupLeft;
  }
  const bool settled = instance.roleWarmupLeft == 0;
  ready.precip = settled && instance.ndRole == 0;
  ready.hot = ready.precip;
  ready.terrain = settled && instance.ndRole == 1;
#else
  (void)ctx;
  (void)instance;
  (void)frame;
#endif
  return ready;
}

// The terrain (TERR ON ND) or the radar's MAP mode, both from the terrain view.
static void drawTerrainLayer(FsContext ctx, NVGcontext* vg, Instance& instance, const NdFrame& frame, const TerrainViews& views,
                             bool terrainReady) {
  const float radiusMetres = frame.rangeNmForMode * kNmToMetres;
  if (frame.showTerrain) {
    if (instance.terrainPatternImage == 0) {
      instance.terrainPatternImage = createTerrainPattern(vg);
    }
    // Peaks mode (see setPeaksColors) while the range's highest terrain, as the SimBridge knows it, is
    // more than kPeaksBelowFeet below the aircraft; the standard bands otherwise.
    const double peaksMin = get_named_variable_value(instance.peaksMinVar);
    const double peaksMax = get_named_variable_value(instance.peaksMaxVar);
    const double altitude = planeAltitudeFeet();
    const bool peaksMode = peaksMin >= 0.0 && peaksMax >= 0.0 && peaksMax <= altitude - static_cast<double>(kPeaksBelowFeet);
    if (peaksMode) {
      if (instance.terrainListMode != 2) {
        setPeaksColors(ctx, views.terrain);
        instance.terrainListMode = 2;
      }
      const double span = std::fmax(peaksMax - peaksMin, static_cast<double>(kPeaksMinSpanFeet));
      fsMapViewSetAltitudeRangeInFeet(ctx, views.terrain, altitude - peaksMax - static_cast<double>(kPeaksMarginFraction) * span,
                                      altitude - peaksMin);
    } else {
      const int gearState = g_egpwcGearDown.read() != 0.0 ? 1 : 0;
      if (gearState != instance.terrainGearState || instance.terrainListMode != 0) {
        setTerrainColors(ctx, views.terrain, gearState == 1);
        instance.terrainGearState = gearState;
        instance.terrainListMode = 0;
      }
      // The bands shifted by the look-ahead (the view colours by the aircraft's own altitude, see kTerrainLookAheadSeconds).
      fsMapViewSetAltitudeRangeInFeet(ctx, views.terrain, static_cast<double>(kTerrainMinFeet + frame.terrainLookAheadFeet),
                                      static_cast<double>(kTerrainMaxFeet + frame.terrainLookAheadFeet));
    }
    fsMapViewSet2DViewRadiusInMeters(ctx, views.terrain, radiusMetres);
    fsMapViewSet2DViewRadiusInMeters(ctx, views.water, radiusMetres);
    if (terrainReady && instance.terrainPatternImage != 0) {
      drawTerrain(vg, views.terrain, views.water, instance.terrainPatternImage, frame.isRose, frame.terrainHeadingDegrees);
    }
  } else if (frame.showMap) {
    // The MAP mode borrows the terrain view with its own colour list and range (see setMapColors).
    if (instance.terrainListMode != 1) {
      setMapColors(ctx, views.terrain);
      fsMapViewSetAltitudeRangeInFeet(ctx, views.terrain, static_cast<double>(kMapMinFeet), static_cast<double>(kMapMaxFeet));
      instance.terrainListMode = 1;
    }
    fsMapViewSet2DViewRadiusInMeters(ctx, views.terrain, radiusMetres);
    if (terrainReady) {
      drawMapMode(vg, views.terrain, frame.isRose, frame.terrainHeadingDegrees);
    }
  }
}

// The weather: the precipitation view's green and yellow, then the hot view's red wipe and magenta.
static void drawWeatherLayer(FsContext ctx, NVGcontext* vg, const Instance& instance, const NdFrame& frame, const ViewReadiness& ready) {
  const float radiusMetres = frame.rangeNmForMode * kNmToMetres;
  if (frame.showPrecip) {
    fsMapViewSet2DViewRadiusInMeters(ctx, instance.mapView, radiusMetres);
    if (ready.precip) {
      drawWeatherRect(vg, instance.mapView, frame.isRose, 1.0f, WeatherPass::Additive, Channels{1.0f, 1.0f, 0.0f}, frame.sweepFraction);
      drawWeatherRect(vg, instance.mapView, frame.isRose, 1.0f, WeatherPass::Sharpen);
      drawWeatherRect(vg, instance.mapView, frame.isRose, 1.0f, WeatherPass::Colorize);
    }
  }
  // The hot view carries the red wipe (any precipitation) and the magenta
  // (turbulence modes, near the aircraft only); the wipe also clears the green
  // channel under the magenta, in the whole rect.
  if ((frame.showPrecip || frame.showTurb) && instance.mapViewHotReady) {
    fsMapViewSet2DViewRadiusInMeters(ctx, instance.mapViewHot, radiusMetres);
    if (ready.hot) {
      if (frame.showPrecip) {
        drawWeatherRect(vg, instance.mapViewHot, frame.isRose, 1.0f, WeatherPass::Erase, Channels{0.0f, 1.0f, 0.0f}, frame.sweepFraction);
      }
      if (frame.showTurb) {
        const float turbFraction = kTurbulenceMaxRangeNm / frame.rangeNmForMode;
        const float turbRangeFraction = turbFraction < 1.0f ? turbFraction : 1.0f;
        drawWeatherRect(vg, instance.mapViewHot, frame.isRose, turbRangeFraction, WeatherPass::AdditiveMagenta, Channels{1.0f, 0.0f, 1.0f},
                        frame.sweepFraction);
      }
    }
  }
}

#ifdef A380X
// The weather on the VD, along the vertical cut. Drawn last, so nothing of the ND's passes above can
// touch it: they only affect the ND's rect, where the VD area (behind the aircraft) has no weather.
static void drawVdWeatherLayer(NVGcontext* vg, const Instance& instance, const NdFrame& frame, const ViewReadiness& ready) {
  if (!frame.showVd || !ready.precip) {
    return;
  }
  // The cut: along the flight plan when one is published and the aircraft is on it, else along the
  // track. While the buffer fills, the VD shows its weather once the sweep has passed the cut's direction.
  VdCutSegment cut[kVdCutMaxSegments];
  int cutCount = buildVdPlanCut(frame.vdLat, frame.vdLon, frame.vdRangeNm, cut);
  if (cutCount == 0) {
    cut[0] = VdCutSegment{0.0f, 0.0f, frame.vdTrackDeg, frame.vdRangeNm, 0.0f};
    cutCount = 1;
  }
  float cutAngle = cut[0].trackDeg - frame.vdHeadingDeg;
  while (cutAngle > 180.0f) {
    cutAngle -= 360.0f;
  }
  while (cutAngle < -180.0f) {
    cutAngle += 360.0f;
  }
  cutAngle = std::fmin(std::fmax(cutAngle, -90.0f), 90.0f);
  if (frame.sweepFraction >= (cutAngle + 90.0f) / 180.0f) {
    drawVdWeather(vg, instance.mapView, instance.mapViewHot, instance.mapViewHotReady && ready.hot, frame.rangeNmForMode, frame.vdRangeNm,
                  cut, cutCount, frame.vdHeadingDeg, frame.vdBaroAltFeet, frame.vdLowerFeet, frame.vdUpperFeet);
  }
}
#endif

// One frame of an ND gauge.
static void drawNd(FsContext ctx, Instance& instance, const sGaugeDrawData* drawData) {
  // The first ND gauge writes the SimBridge status block (see simBridgeUpdate).
  simBridgeOnGaugeDraw(ctx, drawData->t);

  const TerrainViews views = terrainViews(instance);
  NdFrame frame = readNdFrame(instance, views.ready);
#ifdef A380X
  frame.sweepFraction = radarSweepFraction(drawData->t);
#endif
  publishWxrLabel(instance, frame.labelMode);
  const ViewReadiness ready = updateViewRoles(ctx, instance, frame);

  if (!frame.drawsAnything() && !instance.layerDirty) {
    // Nothing on the surface from last frame and nothing to draw now -
    // skip opening a frame entirely.
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
  drawTerrainLayer(ctx, vg, instance, frame, views, ready.terrain);
  drawWeatherLayer(ctx, vg, instance, frame, ready);
#ifdef A380X
  drawVdWeatherLayer(vg, instance, frame, ready);
#endif
  instance.layerDirty = frame.drawsAnything();

  nvgEndFrame(vg);
}

}  // namespace ndwxr

extern "C" {

MSFS_CALLBACK bool ndwxr_gauge_callback(FsContext ctx, int service_id, void* pData) {
  using namespace ndwxr;
  switch (service_id) {
    case PANEL_SERVICE_PRE_INSTALL:
      return installInstance(ctx, static_cast<const sGaugeInstallData*>(pData));
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
      drawNd(ctx, *instance, static_cast<const sGaugeDrawData*>(pData));
      return true;
    }
    case PANEL_SERVICE_PRE_KILL: {
      Instance* instance = findInstance(ctx);
      if (instance != nullptr) {
        destroyInstance(ctx, *instance);
      }
      return true;
    }
    default:
      return true;
  }
}

}  // extern "C"
