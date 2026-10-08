// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test stub of the MSFS SDK SimConnect.h: only the two structures interface/SimConnectData.h uses, with the SDK layout
// (three doubles each).
#pragma once

struct SIMCONNECT_DATA_XYZ {
  double x;
  double y;
  double z;
};

struct SIMCONNECT_DATA_LATLONALT {
  double Latitude;
  double Longitude;
  double Altitude;
};
