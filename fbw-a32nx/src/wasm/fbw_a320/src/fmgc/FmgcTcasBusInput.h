// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

#include "../model/FmgcComputer_types.h"

/// The TCAS bus the FMGCs read, under the flyPad failure of the FG TCAS mode (Failures::TcasMode, 22012).
///
/// A320 FCOM DSC-22_30-70-85 (a320_fcom.txt l.30499-30503): "The TCAS mode is not available, when: ... The TCAS mode is
/// failed (AUTO FLT TCAS MODE FAULT)". PRO-ABN-AUTO_FLT AUTO FLT TCAS MODE FAULT (l.71942-71960): "This alert triggers
/// when the TCAS flight guidance mode is inoperative"; FOR TCAS ALERT: AP+FD OFF, FLY MANUALLY TCAS ORDER; INOP SYS
/// AP/FD TCAS.
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
