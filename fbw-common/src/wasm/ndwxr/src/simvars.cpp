// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The `L:` variables the module reads and the small readers that turn them into decisions:
// which ADIRS feeds an ND, whether the radar / the terrain is selected, the radar mode.

#include "ndwxr.h"

namespace ndwxr {

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
NamedVar g_vdCutMode{"A380X_VD_CUT_MODE"};
NamedVar g_vdCutCount{"A380X_VD_CUT_COUNT"};

// Distance along the cut (NM) at which the next track change exceeds 3 degrees, -1 when none: from
// there the terrain shown is no longer the one ahead of the aircraft, the VD's grey area.
NamedVar g_vdCutTrackChangeNm{"A380X_VD_CUT_TRACK_CHANGE_NM"};
ID g_vdCutLatVars[kVdCutMaxVertices];
ID g_vdCutLonVars[kVdCutMaxVertices];

// The IR true track words for IR 1..3: the cut along the track follows the track, not the heading.
NamedVar g_adirsTrueTrack[3] = {{"A32NX_ADIRS_IR_1_TRUE_TRACK"}, {"A32NX_ADIRS_IR_2_TRUE_TRACK"}, {"A32NX_ADIRS_IR_3_TRUE_TRACK"}};
#endif
#ifndef A380X
// The A32NX radar is switched by the pedestal WX SYS selector (0 = SYS 1,
// 1 = OFF, 2 = SYS 2) and its mode by the WX MODE knob, both Asobo-style
// "XMLVAR_A320_..." variables.
NamedVar g_wxrSys{"XMLVAR_A320_WeatherRadar_Sys"};
NamedVar g_wxrMode{"XMLVAR_A320_WeatherRadar_Mode"};
#endif

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

// Whether the crew has TERR ON ND selected on this side and the terrain system can
// supply it (the ND page, position source and range are checked separately).
bool terrainSelected(const Instance& instance) {
#ifdef A380X
  // EfisTawsBridge's terrOnNd: the TERR overlay on this side's EFIS control panel and the TAWS system up.
  return get_named_variable_value(instance.overlayVar) == kOverlayTerr && terrainSystemUp();
#else
  return get_named_variable_value(instance.terrainActiveVar) != 0.0;
#endif
}

// The sim's own (true) altitude: the altitude the altitude-mode views colour by (the VD terrain view's
// range, see drawVdTerrainGauge, and the peaks mode's, see setPeaksColors).
double planeAltitudeFeet() {
  static const ENUM planeAltitude = get_aircraft_var_enum("PLANE ALTITUDE");
  static const ENUM feet = get_units_enum("feet");
  return aircraft_varget(planeAltitude, feet, 0);
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

double planeCoordinateDegrees(const char* name) {
  const ENUM variable = get_aircraft_var_enum(name);
  static const ENUM degrees = get_units_enum("degrees");
  return aircraft_varget(variable, degrees, 0);
}

// Registers the shared variables. register_named_variable returns the same id for a name that is
// already registered, so the second gauge instance simply registers them again.
void registerSimVars() {
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
#else
  g_wxrSys.id = register_named_variable(g_wxrSys.name);
  g_wxrMode.id = register_named_variable(g_wxrMode.name);
#endif
}

}  // namespace ndwxr
