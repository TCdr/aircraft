// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include "ndwxr.h"

namespace ndwxr {

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
static bool terrainSelectedOnSide(int side) {
#ifdef A380X
  return g_efisOverlay[side].read() == kOverlayTerr && terrainSystemUp();
#else
  return g_egpwcTerrainActive[side].read() != 0.0;
#endif
}

static void writePeaksFigures(int side, double now) {
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

static void simBridgeDisconnect() {
  if (g_simBridge.connection != 0) {
    SimConnect_Close(g_simBridge.connection);
  }
  g_simBridge.connection = 0;
  g_simBridge.areaReady = false;
}

static void simBridgeConnect() {
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

// The EFIS part for one side: terrain requested on a map page (ROSE ILS / VOR / NAV or ARC), as terronnd sent it.
// The EFIS part of the status block for one side (the block is packed, so it is filled by value).
struct SimBridgeEfis {
  std::uint16_t range;
  std::uint8_t arc;
  std::uint8_t terrainOn;
  std::uint8_t mode;
};

static SimBridgeEfis simBridgeEfis(int side) {
  const double ndMode = g_efisNdMode[side].read();
  const bool arcMode = ndMode == kNdModeArc;
  const bool mapPage = isMapPage(ndMode);
  SimBridgeEfis efis;
  efis.range = static_cast<std::uint16_t>(std::fmax(g_egpwcNdRange[side].read(), 0.0));
  efis.arc = arcMode ? 1 : 0;
  efis.terrainOn = terrainSelectedOnSide(side) && mapPage ? 1 : 0;
  efis.mode = static_cast<std::uint8_t>(ndMode);
  return efis;
}

static void simBridgeUpdate(double now) {
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
  const SimBridgeEfis capt = simBridgeEfis(0);
  data.ndRangeCapt = capt.range;
  data.ndArcModeCapt = capt.arc;
  data.ndTerrainOnNdActiveCapt = capt.terrainOn;
  data.efisModeCapt = capt.mode;
  const SimBridgeEfis fo = simBridgeEfis(1);
  data.ndRangeFO = fo.range;
  data.ndArcModeFO = fo.arc;
  data.ndTerrainOnNdActiveFO = fo.terrainOn;
  data.efisModeFO = fo.mode;
  data.ndTerrainOnNdRenderingMode = static_cast<std::uint8_t>(g_egpwcRenderingMode.read());
  data.groundTruthLatitude = static_cast<float>(planeCoordinateDegrees("PLANE LATITUDE"));
  data.groundTruthLongitude = static_cast<float>(planeCoordinateDegrees("PLANE LONGITUDE"));

  if (!SUCCEEDED(SimConnect_SetClientData(g_simBridge.connection, kSimBridgeStatusAreaId, kSimBridgeStatusDefinitionId,
                                          SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT, 0, static_cast<DWORD>(sizeof(data)), &data))) {
    simBridgeDisconnect();
  }
}

// The first ND gauge to draw owns the SimBridge connection (see simBridgeUpdate); it releases it when killed.
void simBridgeOnGaugeDraw(FsContext ctx, double now) {
  if (g_simBridge.owner == 0) {
    g_simBridge.owner = ctx;
  }
  if (g_simBridge.owner == ctx) {
    simBridgeUpdate(now);
  }
}

void simBridgeOnGaugeKill(FsContext ctx) {
  if (g_simBridge.owner == ctx) {
    simBridgeDisconnect();
    g_simBridge.owner = 0;
  }
}

}  // namespace ndwxr
