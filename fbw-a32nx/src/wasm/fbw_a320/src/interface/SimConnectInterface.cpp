#include "SimConnectInterface.h"
#include <cmath>
#include <cstdio>
#include <map>
#include <vector>

// remove when aileron events can be processed via SimConnect
bool SimConnectInterface::loggingFlightControlsEnabled = false;
// remove when aileron events can be processed via SimConnect
SimInput SimConnectInterface::simInput = {};
// remove when aileron events can be processed via SimConnect
double SimConnectInterface::flightControlsKeyChangeAileron = 0.0;

bool SimConnectInterface::connect(bool clientDataEnabled,
                                  int elacDisabled,
                                  int secDisabled,
                                  int facDisabled,
                                  int fmgcDisabled,
                                  bool fcuDisabled,
                                  const std::vector<std::shared_ptr<ThrottleAxisMapping>>& throttleAxis,
                                  std::shared_ptr<SpoilersHandler> spoilersHandler,
                                  double keyChangeAileron,
                                  double keyChangeElevator,
                                  double keyChangeRudder,
                                  bool disableXboxCompatibilityRudderPlusMinus,
                                  bool enableRudder2AxisMode,
                                  double minSimulationRate,
                                  double maxSimulationRate,
                                  bool limitSimulationRateByPerformance) {
  // info message
  std::printf("WASM: Connecting...\n");

  // connect
  HRESULT result = SimConnect_Open(&hSimConnect, "FlyByWire", nullptr, 0, 0, 0);

  if (S_OK == result) {
    // we are now connected
    isConnected = true;
    std::printf("WASM: Connected\n");
    // store throttle axis handler
    this->throttleAxis = throttleAxis;
    // store spoilers handler
    this->spoilersHandler = spoilersHandler;
    // store maximum allowed simulation rate
    this->minSimulationRate = minSimulationRate;
    this->maxSimulationRate = maxSimulationRate;
    this->limitSimulationRateByPerformance = limitSimulationRateByPerformance;
    // store is client data is enabled
    this->clientDataEnabled = clientDataEnabled;
    this->elacDisabled = elacDisabled;
    this->secDisabled = secDisabled;
    this->facDisabled = facDisabled;
    this->fmgcDisabled = fmgcDisabled;
    this->fcuDisabled = fcuDisabled;
    // store key change value for each axis
    flightControlsKeyChangeAileron = keyChangeAileron;
    flightControlsKeyChangeElevator = keyChangeElevator;
    flightControlsKeyChangeRudder = keyChangeRudder;
    // store if XBOX compatibility should be disabled for rudder axis plus/minus
    this->disableXboxCompatibilityRudderPlusMinus = disableXboxCompatibilityRudderPlusMinus;
    this->enableRudder2AxisMode = enableRudder2AxisMode;
    // register local variables
    idSyncFoEfisEnabled = std::make_unique<LocalVariable>("A32NX_FO_SYNC_EFIS_ENABLED");
    // add data to definition
    bool prepareResult = prepareSimDataSimConnectDataDefinitions();
    prepareResult &= prepareSimInputSimConnectDataDefinitions();
    prepareResult &= prepareSimOutputSimConnectDataDefinitions();
    if (clientDataEnabled) {
      prepareResult &= prepareClientDataDefinitions();
    }
    // check result
    if (!prepareResult) {
      // failed to add data definition -> disconnect
      std::printf("WASM: Failed to prepare data definitions\n");
      disconnect();
      // failed to connect
      return false;
    }
    // register key event handler
    // remove when aileron events can be processed via SimConnect
    register_key_event_handler_EX1(static_cast<GAUGE_KEY_EVENT_HANDLER_EX1>(processKeyEvent), NULL);
    // register for pause event
    SimConnect_SubscribeToSystemEvent(hSimConnect, Events::SYSTEM_EVENT_PAUSE, "Pause_EX1");
    // send initial event to FCU to force HDG mode
    execute_calculator_code("(>H:A320_Neo_FCU_HDG_PULL)", nullptr, nullptr, nullptr);
    // success
    return true;
  }
  // fallback -> failed
  return false;
}

void SimConnectInterface::disconnect() {
  if (isConnected) {
    // unregister key event handler
    // remove when aileron events can be processed via SimConnect
    unregister_key_event_handler_EX1(static_cast<GAUGE_KEY_EVENT_HANDLER_EX1>(processKeyEvent), NULL);
    // unregister from pause events
    SimConnect_UnsubscribeFromSystemEvent(hSimConnect, Events::SYSTEM_EVENT_PAUSE);
    // info message
    std::printf("WASM: Disconnecting...\n");
    // close connection
    SimConnect_Close(hSimConnect);
    // set flag
    isConnected = false;
    // reset handle
    hSimConnect = 0;
    // info message
    std::printf("WASM: Disconnected\n");
  }
}

void SimConnectInterface::setSampleTime(double sampleTime) {
  this->sampleTime = sampleTime;
}

void SimConnectInterface::updateSimulationRateLimits(double minSimulationRate, double maxSimulationRate) {
  this->minSimulationRate = minSimulationRate;
  this->maxSimulationRate = maxSimulationRate;
}

bool SimConnectInterface::isSimInAnyPause() {
  return (pauseState > 0);
}

bool SimConnectInterface::isSimInActivePause() {
  return (pauseState == 4);
}

bool SimConnectInterface::isSimInPause() {
  return (pauseState == 8);
}

bool SimConnectInterface::requestData() {
  // check if we are connected
  if (!isConnected) {
    return false;
  }

  // request data
  HRESULT result = SimConnect_RequestDataOnSimObject(hSimConnect, 0, 0, SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_PERIOD_VISUAL_FRAME);

  // check result of data request
  if (result != S_OK) {
    // request failed
    return false;
  }

  // success
  return true;
}

bool SimConnectInterface::readData() {
  // check if we are connected
  if (!isConnected) {
    return false;
  }

  // get next dispatch message(s) and process them
  DWORD cbData;
  SIMCONNECT_RECV* pData;
  while (SUCCEEDED(SimConnect_GetNextDispatch(hSimConnect, &pData, &cbData))) {
    simConnectProcessDispatchMessage(pData, &cbData);
  }

  // success
  return true;
}

bool SimConnectInterface::sendData(SimOutputZetaTrim output) {
  // write data and return result
  return sendData(3, sizeof(output), &output);
}

bool SimConnectInterface::sendData(SimOutputThrottles output) {
  // write data and return result
  return sendData(4, sizeof(output), &output);
}

bool SimConnectInterface::sendData(SimOutputSpoilers output) {
  // write data and return result
  return sendData(6, sizeof(output), &output);
}

bool SimConnectInterface::sendData(SimOutputAltimeter output) {
  // write data and return result
  return sendData(7, sizeof(output), &output);
}

bool SimConnectInterface::sendData(SimOutputAltimeter output, int altimeterIndex) {
  // write data and return result
  SIMCONNECT_DATA_DEFINITION_ID dataDefId;
  switch (altimeterIndex) {
    case 1:
      dataDefId = 8;
      break;
    case 2:
      dataDefId = 9;
      break;
    case 4:
      dataDefId = 7;
      break;
    default:
      return false;
  }
  return sendData(dataDefId, sizeof(output), &output);
}

bool SimConnectInterface::sendEvent(Events eventId) {
  return sendEvent(eventId, 0, SIMCONNECT_GROUP_PRIORITY_HIGHEST);
}

bool SimConnectInterface::sendEvent(Events eventId, DWORD data) {
  return sendEvent(eventId, data, SIMCONNECT_GROUP_PRIORITY_HIGHEST);
}

bool SimConnectInterface::sendEvent(Events eventId, DWORD data, DWORD priority) {
  // check if we are connected
  if (!isConnected) {
    return false;
  }

  // send event
  HRESULT result = SimConnect_TransmitClientEvent(hSimConnect, 0, eventId, data, priority, SIMCONNECT_EVENT_FLAG_GROUPID_IS_PRIORITY);

  // check result of data request
  if (result != S_OK) {
    // request failed
    return false;
  }

  // success
  return true;
}

bool SimConnectInterface::sendEventEx1(Events eventId, DWORD priority, DWORD data0, DWORD data1, DWORD data2, DWORD data3, DWORD data4) {
  // check if we are connected
  if (!isConnected) {
    return false;
  }

  // send event
  HRESULT result = SimConnect_TransmitClientEvent_EX1(hSimConnect, 0, eventId, priority, SIMCONNECT_EVENT_FLAG_GROUPID_IS_PRIORITY, data0,
                                                      data1, data2, data3, data4);

  // check result of data request
  if (result != S_OK) {
    // request failed
    return false;
  }

  // success
  return true;
}

SimData& SimConnectInterface::getSimData() {
  return simData;
}

SimInput& SimConnectInterface::getSimInput() {
  return simInput;
}

SimInputAutopilot& SimConnectInterface::getSimInputAutopilot() {
  return simInputAutopilot;
}

base_fcu_afs_panel_inputs& SimConnectInterface::getFcuAfsPanelInputs() {
  return fcuAfsPanelInputs;
}

base_fcu_efis_panel_inputs& SimConnectInterface::getFcuEfisPanelInputs(int side) {
  return fcuEfisPanelInputs[side];
}

SimInputRudderTrim& SimConnectInterface::getSimInputRudderTrim() {
  return simInputRudderTrim;
}

SimInputThrottles& SimConnectInterface::getSimInputThrottles() {
  return simInputThrottles;
}

void SimConnectInterface::resetSimInputAutopilot() {
  simInputAutopilot.AP_engage = 0;
  simInputAutopilot.AP_1_push = 0;
  simInputAutopilot.AP_2_push = 0;
  simInputAutopilot.AP_disconnect = 0;
  simInputAutopilot.HDG_push = 0;
  simInputAutopilot.HDG_pull = 0;
  simInputAutopilot.ALT_push = 0;
  simInputAutopilot.ALT_pull = 0;
  simInputAutopilot.VS_push = 0;
  simInputAutopilot.VS_pull = 0;
  simInputAutopilot.LOC_push = 0;
  simInputAutopilot.APPR_push = 0;
  simInputAutopilot.EXPED_push = 0;
  simInputAutopilot.DIR_TO_trigger = 0;
  simInputAutopilot.mach_mode_activate = 0;
  simInputAutopilot.spd_mode_activate = 0;
  simInputAutopilot.preset_spd_activate = 0;
  simInputAutopilot.baro_left_set = -1;
  simInputAutopilot.baro_right_set = -1;
  simInputAutopilot.SPD_MACH_set = -1;
  simInputAutopilot.HDG_TRK_set = -1;
  simInputAutopilot.ALT_set = -1;
  simInputAutopilot.VS_FPA_set = -1;
}

void SimConnectInterface::resetFcuFrontPanelInputs() {
  fcuEfisPanelInputs[0].baro_knob.pushed = false;
  fcuEfisPanelInputs[0].baro_knob.pulled = false;
  fcuEfisPanelInputs[0].baro_knob.turns = 0;
  fcuEfisPanelInputs[0].fd_button_pushed = false;
  fcuEfisPanelInputs[0].ls_button_pushed = false;
  fcuEfisPanelInputs[0].cstr_button_pushed = false;
  fcuEfisPanelInputs[0].wpt_button_pushed = false;
  fcuEfisPanelInputs[0].vord_button_pushed = false;
  fcuEfisPanelInputs[0].ndb_button_pushed = false;
  fcuEfisPanelInputs[0].arpt_button_pushed = false;
  fcuEfisPanelInputs[1].baro_knob.pushed = false;
  fcuEfisPanelInputs[1].baro_knob.pulled = false;
  fcuEfisPanelInputs[1].baro_knob.turns = 0;
  fcuEfisPanelInputs[1].fd_button_pushed = false;
  fcuEfisPanelInputs[1].ls_button_pushed = false;
  fcuEfisPanelInputs[1].cstr_button_pushed = false;
  fcuEfisPanelInputs[1].wpt_button_pushed = false;
  fcuEfisPanelInputs[1].vord_button_pushed = false;
  fcuEfisPanelInputs[1].ndb_button_pushed = false;
  fcuEfisPanelInputs[1].arpt_button_pushed = false;
  fcuAfsPanelInputs.loc_button_pressed = false;
  fcuAfsPanelInputs.exped_button_pressed = false;
  fcuAfsPanelInputs.appr_button_pressed = false;
  fcuAfsPanelInputs.spd_mach_button_pressed = false;
  fcuAfsPanelInputs.trk_fpa_button_pressed = false;
  fcuAfsPanelInputs.metric_alt_button_pressed = false;
  fcuAfsPanelInputs.spd_knob.pushed = false;
  fcuAfsPanelInputs.spd_knob.pulled = false;
  fcuAfsPanelInputs.spd_knob.turns = 0;
  fcuAfsPanelInputs.hdg_trk_knob.pushed = false;
  fcuAfsPanelInputs.hdg_trk_knob.pulled = false;
  fcuAfsPanelInputs.hdg_trk_knob.turns = 0;
  fcuAfsPanelInputs.alt_knob.pushed = false;
  fcuAfsPanelInputs.alt_knob.pulled = false;
  fcuAfsPanelInputs.alt_knob.turns = 0;
  fcuAfsPanelInputs.alt_increment_1000 = false;
  fcuAfsPanelInputs.vs_fpa_knob.pushed = false;
  fcuAfsPanelInputs.vs_fpa_knob.pulled = false;
  fcuAfsPanelInputs.vs_fpa_knob.turns = 0;
}

void SimConnectInterface::resetSimInputRudderTrim() {
  simInputRudderTrim.rudderTrimSwitchLeft = false;
  simInputRudderTrim.rudderTrimSwitchRight = false;
  simInputRudderTrim.rudderTrimReset = false;
}

void SimConnectInterface::resetSimInputThrottles() {
  simInputThrottles.ATHR_push = 0;
  simInputThrottles.ATHR_disconnect = 0;
  simInputThrottles.ATHR_reset_disable = 0;
}

void SimConnectInterface::setLoggingFlightControlsEnabled(bool enabled) {
  loggingFlightControlsEnabled = enabled;
}

bool SimConnectInterface::getLoggingFlightControlsEnabled() {
  return loggingFlightControlsEnabled;
}

void SimConnectInterface::setLoggingThrottlesEnabled(bool enabled) {
  loggingThrottlesEnabled = enabled;
}

bool SimConnectInterface::getLoggingThrottlesEnabled() {
  return loggingThrottlesEnabled;
}

// remove when aileron events can be processed via SimConnect (which also allows to mask the events)
void SimConnectInterface::processKeyEvent(ID32 event,
                                          UINT32 evdata0,
                                          UINT32 evdata1,
                                          UINT32 evdata2,
                                          UINT32 evdata3,
                                          UINT32 evdata4,
                                          PVOID userdata) {
  switch (event) {
    case KEY_AILERON_LEFT: {
      simInput.inputs[AXIS_AILERONS_SET] = std::fmin(1.0, simInput.inputs[AXIS_AILERONS_SET] + flightControlsKeyChangeAileron);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AILERONS_LEFT: (no data) -> %g\n", simInput.inputs[AXIS_AILERONS_SET]);
      }
      break;
    }
    case KEY_AILERON_RIGHT: {
      simInput.inputs[AXIS_AILERONS_SET] = std::fmax(-1.0, simInput.inputs[AXIS_AILERONS_SET] - flightControlsKeyChangeAileron);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AILERONS_RIGHT: (no data) -> %g\n", simInput.inputs[AXIS_AILERONS_SET]);
      }
      break;
    }
    default: {
      return;
    }
  }
}

void SimConnectInterface::simConnectProcessDispatchMessage(SIMCONNECT_RECV* pData, DWORD* cbData) {
  switch (pData->dwID) {
    case SIMCONNECT_RECV_ID_OPEN:
      // connection established
      std::printf("WASM: SimConnect connection established\n");
      break;

    case SIMCONNECT_RECV_ID_QUIT:
      // connection lost
      std::printf("WASM: Received SimConnect connection quit message\n");
      disconnect();
      break;

    case SIMCONNECT_RECV_ID_EVENT:
      simConnectProcessEvent(static_cast<SIMCONNECT_RECV_EVENT*>(pData));
      break;

    case SIMCONNECT_RECV_ID_EVENT_EX1:
      simConnectProcessEvent_EX1(static_cast<SIMCONNECT_RECV_EVENT_EX1*>(pData));
      break;

    case SIMCONNECT_RECV_ID_SIMOBJECT_DATA:
      // process data
      simConnectProcessSimObjectData(static_cast<SIMCONNECT_RECV_SIMOBJECT_DATA*>(pData));
      break;

    case SIMCONNECT_RECV_ID_CLIENT_DATA:
      // process data
      simConnectProcessClientData(static_cast<SIMCONNECT_RECV_CLIENT_DATA*>(pData));
      break;

    case SIMCONNECT_RECV_ID_EXCEPTION:
      // exception
      std::printf(
          "WASM: Exception in SimConnect connection: %s\n",
          getSimConnectExceptionString(static_cast<SIMCONNECT_EXCEPTION>(static_cast<SIMCONNECT_RECV_EXCEPTION*>(pData)->dwException))
              .c_str());
      break;

    default:
      break;
  }
}

void SimConnectInterface::simConnectProcessSimObjectData(const SIMCONNECT_RECV_SIMOBJECT_DATA* data) {
  // process depending on request id
  switch (data->dwRequestID) {
    case 0:
      // store aircraft data
      simData = *((SimData*)&data->dwData);
      return;

    default:
      // print unknown request id
      std::printf("WASM: Unknown request id in SimConnect connection: %ld\n", data->dwRequestID);
      return;
  }
}

bool SimConnectInterface::sendData(SIMCONNECT_DATA_DEFINITION_ID id, DWORD size, void* data) {
  // check if we are connected
  if (!isConnected) {
    return false;
  }

  // set output data
  HRESULT result = SimConnect_SetDataOnSimObject(hSimConnect, id, SIMCONNECT_OBJECT_ID_USER, 0, 0, size, data);

  // check result of data request
  if (result != S_OK) {
    // request failed
    return false;
  }

  // success
  return true;
}

