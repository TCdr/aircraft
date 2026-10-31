// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
// SdSpecSupport before EngineColumn: it creates the mount point the React framework looks up when it loads
import { withRenderedSdElement } from '../../SdSpecSupport';
import EngineColumn from './elements/EngineColumn';

/** The L:vars of a FADEC-supplied engine 1 whose parameters are shown (not XX). */
const POWERED_ENGINE_1_SIM_VARS = {
  'L:A32NX_FADEC_POWERED_ENG1': 1,
  'L:A32NX_ENGINE_1_EMU_SUPPLIED': 1,
};

/**
 * Renders the SD ENGINE column of engine 1 at the origin.
 * @param simVars the L:vars the column reads (a FADEC-supplied engine 1 is added)
 * @param inspect reads what it needs out of the rendered SVG
 * @returns what inspect returns
 */
export function withRenderedEngineColumn<T>(
  simVars: Record<string, number>,
  inspect: (container: SVGSVGElement) => T,
): T {
  return withRenderedSdElement(
    <EngineColumn x={0} y={0} engine={1} ignition={false} useMetric />,
    { ...POWERED_ENGINE_1_SIM_VARS, ...simVars },
    inspect,
  );
}
