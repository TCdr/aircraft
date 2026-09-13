#include "SimConnectInterface.h"
#include <cmath>
#include <cstdio>
#include <map>
#include <vector>

// Client-data-area IPC plumbing for the optional externalized-computer-process mode.

bool SimConnectInterface::prepareClientDataDefinitions() {
  struct HresultAccumulator {
    bool success = true;

    HresultAccumulator& operator=(HRESULT hr) {
      success = SUCCEEDED(hr);
      return *this;
    }

    HresultAccumulator& operator&=(HRESULT hr) {
      success = success && SUCCEEDED(hr);
      return *this;
    }

    operator bool() const { return success; }
  } result;

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_ELAC_DISCRETE_INPUT", ClientData::ELAC_DISCRETE_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::ELAC_DISCRETE_INPUTS, sizeof(base_elac_discrete_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 32; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::ELAC_DISCRETE_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_INT8);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_ELAC_ANALOG_INPUT", ClientData::ELAC_ANALOG_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::ELAC_ANALOG_INPUTS, sizeof(base_elac_analog_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 15; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::ELAC_ANALOG_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_ELAC_DISCRETES_OUTPUT", ClientData::ELAC_DISCRETE_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::ELAC_DISCRETE_OUTPUTS, sizeof(base_elac_discrete_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 12; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::ELAC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_INT8);
  }

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::ELAC_DISCRETE_OUTPUTS, ClientData::ELAC_DISCRETE_OUTPUTS,
                                         ClientData::ELAC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_ELAC_ANALOGS_OUTPUT", ClientData::ELAC_ANALOG_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::ELAC_ANALOG_OUTPUTS, sizeof(base_elac_analog_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 5; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::ELAC_ANALOG_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::ELAC_ANALOG_OUTPUTS, ClientData::ELAC_ANALOG_OUTPUTS,
                                         ClientData::ELAC_ANALOG_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::ELAC_1_BUS_OUTPUT + i;

    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_ELAC_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_elac_out_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 17; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }

    // request data to be updated when set
    if (i == elacDisabled) {
      result &= SimConnect_RequestClientData(hSimConnect, defineId, defineId, defineId, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 3; i++) {
    auto defineId = ClientData::ADR_1_INPUTS + i;

    // map client id
    result &=
        SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_ADR_" + std::to_string(i + 1) + "_INPUT").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_adr_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(base_adr_bus));
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 3; i++) {
    auto defineId = ClientData::IR_1_INPUTS + i;

    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_IR_" + std::to_string(i + 1) + "_INPUT").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_ir_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 31; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::RA_1_BUS + i;
    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_RA_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_ra_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    result &=
        SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::LGCIU_1_BUS + i;
    // map client id
    result &=
        SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_LGCIU_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_lgciu_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 4; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::SFCC_1_BUS + i;
    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_SFCC_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_sfcc_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 5; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::ILS_1_BUS + i;
    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_ILS_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_ils_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 4; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_TCAS_BUS", ClientData::TCAS_BUS);
  // create client data
  result &=
      SimConnect_CreateClientData(hSimConnect, ClientData::TCAS_BUS, sizeof(base_tcas_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  result &=
      SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::TCAS_BUS, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(base_tcas_bus));

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::FADEC_1_BUS + i;
    // map client id
    result &=
        SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_FADEC_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_ecu_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(base_ecu_bus));
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_SEC_DISCRETE_INPUT", ClientData::SEC_DISCRETE_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::SEC_DISCRETE_INPUTS, sizeof(base_sec_discrete_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 26; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::SEC_DISCRETE_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_INT8);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_SEC_ANALOG_INPUT", ClientData::SEC_ANALOG_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::SEC_ANALOG_INPUTS, sizeof(base_sec_analog_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 18; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::SEC_ANALOG_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_SEC_DISCRETES_OUTPUT", ClientData::SEC_DISCRETE_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::SEC_DISCRETE_OUTPUTS, sizeof(base_sec_discrete_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 9; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::SEC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_INT8);
  }

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::SEC_DISCRETE_OUTPUTS, ClientData::SEC_DISCRETE_OUTPUTS,
                                         ClientData::SEC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_SEC_ANALOGS_OUTPUT", ClientData::SEC_ANALOG_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::SEC_ANALOG_OUTPUTS, sizeof(base_sec_analog_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 7; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::SEC_ANALOG_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::SEC_ANALOG_OUTPUTS, ClientData::SEC_ANALOG_OUTPUTS,
                                         ClientData::SEC_ANALOG_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::SEC_1_BUS_OUTPUT + i;

    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_SEC_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_sec_out_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 17; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }

    // request data to be updated when set
    if (i == secDisabled) {
      result &= SimConnect_RequestClientData(hSimConnect, defineId, defineId, defineId, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FAC_DISCRETE_INPUT", ClientData::FAC_DISCRETE_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FAC_DISCRETE_INPUTS, sizeof(base_fac_discrete_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 22; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FAC_DISCRETE_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_INT8);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FAC_ANALOG_INPUT", ClientData::FAC_ANALOG_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FAC_ANALOG_INPUTS, sizeof(base_fac_analog_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 3; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FAC_ANALOG_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FAC_DISCRETES_OUTPUT", ClientData::FAC_DISCRETE_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FAC_DISCRETE_OUTPUTS, sizeof(base_fac_discrete_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 6; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FAC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_INT8);
  }

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::FAC_DISCRETE_OUTPUTS, ClientData::FAC_DISCRETE_OUTPUTS,
                                         ClientData::FAC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FAC_ANALOGS_OUTPUT", ClientData::FAC_ANALOG_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FAC_ANALOG_OUTPUTS, sizeof(base_fac_analog_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 3; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FAC_ANALOG_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::FAC_ANALOG_OUTPUTS, ClientData::FAC_ANALOG_OUTPUTS,
                                         ClientData::FAC_ANALOG_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::FAC_1_BUS_OUTPUT + i;

    // map client id
    result &= SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_FAC_" + std::to_string(i + 1) + "_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_fac_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 28; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }

    // request data to be updated when set
    if (i == facDisabled) {
      result &= SimConnect_RequestClientData(hSimConnect, defineId, defineId, defineId, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FCU_DISCRETE_OUTPUTS", ClientData::FCU_DISCRETE_OUTPUT);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FCU_DISCRETE_OUTPUT, sizeof(base_fcu_discrete_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definition

  result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FCU_DISCRETE_OUTPUT, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                 sizeof(base_fcu_discrete_outputs));

  // request data to be updated when set
  if (fcuDisabled) {
    result &= SimConnect_RequestClientData(hSimConnect, ClientData::FCU_DISCRETE_OUTPUT, ClientData::FCU_DISCRETE_OUTPUT,
                                           ClientData::FCU_DISCRETE_OUTPUT, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FCU_BUS", ClientData::FCU_BUS_OUTPUT);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FCU_BUS_OUTPUT, sizeof(base_fcu_bus),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  for (int i = 0; i < 21; i++) {
    result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FCU_BUS_OUTPUT, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                   SIMCONNECT_CLIENTDATATYPE_FLOAT64);
  }

  // request data to be updated when set
  if (fcuDisabled) {
    result &= SimConnect_RequestClientData(hSimConnect, ClientData::FCU_BUS_OUTPUT, ClientData::FCU_BUS_OUTPUT, ClientData::FCU_BUS_OUTPUT,
                                           SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FMGC_DISCRETE_INPUT", ClientData::FMGC_DISCRETE_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FMGC_DISCRETE_INPUTS, sizeof(base_fmgc_discrete_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FMGC_DISCRETE_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                 sizeof(base_fmgc_discrete_inputs));

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FMS_INPUT", ClientData::FMGC_FMS_INPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FMGC_FMS_INPUTS, sizeof(base_fms_inputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions

  result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FMGC_FMS_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                 sizeof(base_fms_inputs));

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FMGC_DISCRETES_OUTPUT", ClientData::FMGC_DISCRETE_OUTPUTS);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FMGC_DISCRETE_OUTPUTS, sizeof(base_fmgc_discrete_outputs),
                                        SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FMGC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO,
                                                 sizeof(base_fmgc_discrete_inputs));

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::FMGC_DISCRETE_OUTPUTS, ClientData::FMGC_DISCRETE_OUTPUTS,
                                         ClientData::FMGC_DISCRETE_OUTPUTS, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::FMGC_1_BUS_A_OUTPUT + i;
    // map client id
    result &=
        SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_FMGC_" + std::to_string(i + 1) + "_A_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_fmgc_a_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions

    result &= SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(base_fmgc_a_bus));

    // request data to be updated when set
    if (i == fmgcDisabled) {
      result &= SimConnect_RequestClientData(hSimConnect, defineId, defineId, defineId, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  for (int i = 0; i < 2; i++) {
    auto defineId = ClientData::FMGC_1_BUS_B_OUTPUT + i;
    // map client id
    result &=
        SimConnect_MapClientDataNameToID(hSimConnect, ("A32NX_CLIENT_DATA_FMGC_" + std::to_string(i + 1) + "_B_BUS").c_str(), defineId);
    // create client data
    result &= SimConnect_CreateClientData(hSimConnect, defineId, sizeof(base_fmgc_b_bus), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    // add data definitions
    for (int i = 0; i < 18; i++) {
      result &=
          SimConnect_AddToClientDataDefinition(hSimConnect, defineId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
    }

    // request data to be updated when set
    if (i == fmgcDisabled) {
      result &= SimConnect_RequestClientData(hSimConnect, defineId, defineId, defineId, SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FADEC_DATA", ClientData::FADEC_DATA);
  // create client data
  result &= SimConnect_CreateClientData(hSimConnect, ClientData::FADEC_DATA, sizeof(athr_data), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  result &= SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FADEC_DATA, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(athr_data));

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FADEC_INPUTS", ClientData::FADEC_INPUTS);
  // create client data
  result &=
      SimConnect_CreateClientData(hSimConnect, ClientData::FADEC_INPUTS, sizeof(athr_input), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  result &=
      SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FADEC_INPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(athr_input));

  // ------------------------------------------------------------------------------------------------------------------

  // map client id
  result &= SimConnect_MapClientDataNameToID(hSimConnect, "A32NX_CLIENT_DATA_FADEC_OUTPUTS", ClientData::FADEC_OUTPUTS);
  // create client data
  result &=
      SimConnect_CreateClientData(hSimConnect, ClientData::FADEC_OUTPUTS, sizeof(athr_output), SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
  // add data definitions
  result &=
      SimConnect_AddToClientDataDefinition(hSimConnect, ClientData::FADEC_OUTPUTS, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(athr_output));

  // request data to be updated when set
  result &= SimConnect_RequestClientData(hSimConnect, ClientData::FADEC_OUTPUTS, ClientData::FADEC_OUTPUTS, ClientData::FADEC_OUTPUTS,
                                         SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET);

  // ------------------------------------------------------------------------------------------------------------------

  // return result
  return result;
}

bool SimConnectInterface::setClientDataElacDiscretes(base_elac_discrete_inputs& output) {
  return sendClientData(ClientData::ELAC_DISCRETE_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataElacAnalog(base_elac_analog_inputs& output) {
  return sendClientData(ClientData::ELAC_ANALOG_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataElacBusInput(base_elac_out_bus& output, int elacIndex) {
  return sendClientData(ClientData::ELAC_1_BUS_OUTPUT + elacIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataSecDiscretes(base_sec_discrete_inputs& output) {
  return sendClientData(ClientData::SEC_DISCRETE_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataSecAnalog(base_sec_analog_inputs& output) {
  return sendClientData(ClientData::SEC_ANALOG_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataSecBus(base_sec_out_bus& output, int secIndex) {
  if (secIndex < 2) {
    return sendClientData(ClientData::SEC_1_BUS_OUTPUT + secIndex, sizeof(output), &output);
  } else {
    return false;
  }
}

bool SimConnectInterface::setClientDataFacDiscretes(base_fac_discrete_inputs& output) {
  return sendClientData(ClientData::FAC_DISCRETE_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFacAnalog(base_fac_analog_inputs& output) {
  return sendClientData(ClientData::FAC_ANALOG_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFacBus(base_fac_bus& output, int facIndex) {
  return sendClientData(ClientData::FAC_1_BUS_OUTPUT + facIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFcuBus(base_fcu_bus& output) {
  return sendClientData(ClientData::FCU_BUS_OUTPUT, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFmgcDiscretes(base_fmgc_discrete_inputs& output) {
  return sendClientData(ClientData::FMGC_DISCRETE_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFmgcFmsData(base_fms_inputs& output) {
  return sendClientData(ClientData::FMGC_FMS_INPUTS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFmgcABus(base_fmgc_a_bus& output, int fmgcIndex) {
  return sendClientData(ClientData::FMGC_1_BUS_A_OUTPUT + fmgcIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFmgcBBus(base_fmgc_b_bus& output, int fmgcIndex) {
  return sendClientData(ClientData::FMGC_1_BUS_B_OUTPUT + fmgcIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFadecData(athr_data& output) {
  return sendClientData(ClientData::FADEC_DATA, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFadecInput(athr_input& output) {
  return sendClientData(ClientData::FADEC_INPUTS, sizeof(output), &output);
}

base_elac_discrete_outputs& SimConnectInterface::getClientDataElacDiscretesOutput() {
  return clientDataElacDiscreteOutputs;
}

base_elac_analog_outputs& SimConnectInterface::getClientDataElacAnalogsOutput() {
  return clientDataElacAnalogOutputs;
}

base_elac_out_bus& SimConnectInterface::getClientDataElacBusOutput() {
  return clientDataElacBusOutputs;
}

base_sec_discrete_outputs& SimConnectInterface::getClientDataSecDiscretesOutput() {
  return clientDataSecDiscreteOutputs;
}

base_sec_analog_outputs& SimConnectInterface::getClientDataSecAnalogsOutput() {
  return clientDataSecAnalogOutputs;
}

base_sec_out_bus& SimConnectInterface::getClientDataSecBusOutput() {
  return clientDataSecBusOutputs;
}

base_fac_discrete_outputs& SimConnectInterface::getClientDataFacDiscretesOutput() {
  return clientDataFacDiscreteOutputs;
}

base_fac_analog_outputs& SimConnectInterface::getClientDataFacAnalogsOutput() {
  return clientDataFacAnalogOutputs;
}

base_fac_bus& SimConnectInterface::getClientDataFacBusOutput() {
  return clientDataFacBusOutputs;
}

base_fcu_discrete_outputs& SimConnectInterface::getClientDataFcuDiscreteOutput() {
  return clientDataFcuDiscreteOutputs;
}

base_fcu_bus& SimConnectInterface::getClientDataFcuBusOutput() {
  return clientDataFcuBusOutputs;
}

base_fmgc_discrete_outputs& SimConnectInterface::getClientDataFmgcDiscretesOutput() {
  return clientDataFmgcDiscreteOutputs;
}

base_fmgc_a_bus& SimConnectInterface::getClientDataFmgcABusOutput() {
  return clientDataFmgcABusOutputs;
}

base_fmgc_b_bus& SimConnectInterface::getClientDataFmgcBBusOutput() {
  return clientDataFmgcBBusOutputs;
}

athr_output& SimConnectInterface::getClientDataFadecOutput() {
  return clientDataFadecOutputs;
}

bool SimConnectInterface::setClientDataAdr(base_adr_bus& output, int adrIndex) {
  return sendClientData(ClientData::ADR_1_INPUTS + adrIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataIr(base_ir_bus& output, int irIndex) {
  return sendClientData(ClientData::IR_1_INPUTS + irIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataRa(base_ra_bus& output, int raIndex) {
  return sendClientData(ClientData::RA_1_BUS + raIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataLgciu(base_lgciu_bus& output, int lgciuIndex) {
  return sendClientData(ClientData::LGCIU_1_BUS + lgciuIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataSfcc(base_sfcc_bus& output, int sfccIndex) {
  return sendClientData(ClientData::SFCC_1_BUS + sfccIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataIls(base_ils_bus& output, int ilsIndex) {
  return sendClientData(ClientData::ILS_1_BUS + ilsIndex, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataTcas(base_tcas_bus& output) {
  return sendClientData(ClientData::TCAS_BUS, sizeof(output), &output);
}

bool SimConnectInterface::setClientDataFadec(base_ecu_bus& output, int fadecIndex) {
  return sendClientData(ClientData::FADEC_1_BUS + fadecIndex, sizeof(output), &output);
}

void SimConnectInterface::simConnectProcessClientData(const SIMCONNECT_RECV_CLIENT_DATA* data) {
  // process depending on request id
  switch (data->dwRequestID) {
    case ClientData::ELAC_DISCRETE_OUTPUTS:
      // store aircraft data
      clientDataElacDiscreteOutputs = *((base_elac_discrete_outputs*)&data->dwData);
      return;

    case ClientData::ELAC_ANALOG_OUTPUTS:
      // store aircraft data
      clientDataElacAnalogOutputs = *((base_elac_analog_outputs*)&data->dwData);
      return;

    case ClientData::ELAC_1_BUS_OUTPUT:
      // store aircraft data
      clientDataElacBusOutputs = *((base_elac_out_bus*)&data->dwData);
      return;

    case ClientData::ELAC_2_BUS_OUTPUT:
      // store aircraft data
      clientDataElacBusOutputs = *((base_elac_out_bus*)&data->dwData);
      return;

    case ClientData::SEC_DISCRETE_OUTPUTS:
      // store aircraft data
      clientDataSecDiscreteOutputs = *((base_sec_discrete_outputs*)&data->dwData);
      return;

    case ClientData::SEC_ANALOG_OUTPUTS:
      // store aircraft data
      clientDataSecAnalogOutputs = *((base_sec_analog_outputs*)&data->dwData);
      return;

    case ClientData::SEC_1_BUS_OUTPUT:
      // store aircraft data
      clientDataSecBusOutputs = *((base_sec_out_bus*)&data->dwData);
      return;

    case ClientData::SEC_2_BUS_OUTPUT:
      // store aircraft data
      clientDataSecBusOutputs = *((base_sec_out_bus*)&data->dwData);
      return;

    case ClientData::FAC_DISCRETE_OUTPUTS:
      // store aircraft data
      clientDataFacDiscreteOutputs = *((base_fac_discrete_outputs*)&data->dwData);
      return;

    case ClientData::FAC_ANALOG_OUTPUTS:
      // store aircraft data
      clientDataFacAnalogOutputs = *((base_fac_analog_outputs*)&data->dwData);
      return;

    case ClientData::FAC_1_BUS_OUTPUT:
      // store aircraft data
      clientDataFacBusOutputs = *((base_fac_bus*)&data->dwData);
      return;

    case ClientData::FAC_2_BUS_OUTPUT:
      // store aircraft data
      clientDataFacBusOutputs = *((base_fac_bus*)&data->dwData);
      return;

    case ClientData::FCU_DISCRETE_OUTPUT:
      // store aircraft data
      clientDataFcuDiscreteOutputs = *((base_fcu_discrete_outputs*)&data->dwData);
      return;

    case ClientData::FCU_BUS_OUTPUT:
      // store aircraft data
      clientDataFcuBusOutputs = *((base_fcu_bus*)&data->dwData);
      return;

    case ClientData::FMGC_DISCRETE_OUTPUTS:
      // store aircraft data
      clientDataFmgcDiscreteOutputs = *((base_fmgc_discrete_outputs*)&data->dwData);
      return;

    case ClientData::FMGC_1_BUS_A_OUTPUT:
      // store aircraft data
      clientDataFmgcABusOutputs = *((base_fmgc_a_bus*)&data->dwData);
      return;

    case ClientData::FMGC_2_BUS_A_OUTPUT:
      // store aircraft data
      clientDataFmgcABusOutputs = *((base_fmgc_a_bus*)&data->dwData);
      return;

    case ClientData::FMGC_1_BUS_B_OUTPUT:
      // store aircraft data
      clientDataFmgcBBusOutputs = *((base_fmgc_b_bus*)&data->dwData);
      return;

    case ClientData::FMGC_2_BUS_B_OUTPUT:
      // store aircraft data
      clientDataFmgcBBusOutputs = *((base_fmgc_b_bus*)&data->dwData);
      return;

    case ClientData::FADEC_OUTPUTS:
      // store aircraft data
      clientDataFadecOutputs = *((athr_output*)&data->dwData);
      return;

    default:
      // print unknown request id
      std::printf("WASM: Unknown request id in SimConnect connection: %ld\n", data->dwRequestID);
      return;
  }
}

bool SimConnectInterface::sendClientData(SIMCONNECT_DATA_DEFINITION_ID id, DWORD size, void* data) {
  // check if we are connected
  if (!isConnected) {
    return false;
  }

  // check if client data is enabled
  if (!clientDataEnabled) {
    std::printf("WASM: Client data is disabled but tried to write it!");
    return true;
  }

  // set output data
  HRESULT result = SimConnect_SetClientData(hSimConnect, id, id, SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT, 0, size, data);

  // check result of data request
  if (result != S_OK) {
    // request failed
    return false;
  }

  // success
  return true;
}

