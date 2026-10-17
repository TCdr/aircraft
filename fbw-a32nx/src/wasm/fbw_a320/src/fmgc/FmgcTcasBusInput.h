// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

#include "../model/FmgcComputer_types.h"

/// The TCAS bus the FMGCs read, under the flyPad failure of the FG TCAS mode (Failures::TcasMode, 22012).
///
/// The TCAS mode is not available when it is failed (AUTO FLT TCAS MODE FAULT: the TCAS flight guidance mode is
/// inoperative; for a TCAS alert the crew sets AP+FD OFF and flies the TCAS order manually; INOP SYS AP/FD TCAS).
///
/// The FMGCs (model/FmgcComputer.cpp, logic.tcas_mode_available) arm and engage the TCAS mode only from a valid TCAS
/// sensitivity level word in TA/RA (bits 25-27) above 900 ft RA. With the failure the guidance loses the TCAS link: both
/// words are blank (SSM failure warning), so the TCAS mode is never available. The TCAS itself keeps working: its RA on
/// the PFD and its aural are not fed by this bus, and the client data the other modules read stay the real words.
inline base_tcas_bus fmgcTcasBusInput(const base_tcas_bus& tcasBus, bool tcasModeFailed) {
  if (!tcasModeFailed) {
    return tcasBus;
  }
  return base_tcas_bus{};
}
