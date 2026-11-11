// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarPublisherEntry, SimVarValueType } from '@microsoft/msfs-sdk';

type GlsReceiverTopic =
  | 'mmr1GlsChannel'
  | 'mmr2GlsChannel'
  | 'gls1LocValid'
  | 'gls2LocValid'
  | 'gls1GsValid'
  | 'gls2GsValid'
  | 'glsLocDeviation'
  | 'glsGsDeviation'
  | 'gbasIdent';

/**
 * The GLS L:vars of the MMRs: the channel as the flight management sets it, the validity, the deviations and the station
 * ident as the fly-by-wire module (fbw.wasm) computes them. Shared by the VOR bus publishers of both aircraft so the
 * names stay identical.
 */
export const GLS_RECEIVER_SIMVARS: [GlsReceiverTopic, SimVarPublisherEntry<any>][] = [
  ['mmr1GlsChannel', { name: 'L:A32NX_MMR_1_GLS_CHANNEL', type: SimVarValueType.Number }],
  ['mmr2GlsChannel', { name: 'L:A32NX_MMR_2_GLS_CHANNEL', type: SimVarValueType.Number }],
  ['gls1LocValid', { name: 'L:A32NX_GLS_1_LOC_IS_VALID', type: SimVarValueType.Bool }],
  ['gls2LocValid', { name: 'L:A32NX_GLS_2_LOC_IS_VALID', type: SimVarValueType.Bool }],
  ['gls1GsValid', { name: 'L:A32NX_GLS_1_GS_IS_VALID', type: SimVarValueType.Bool }],
  ['gls2GsValid', { name: 'L:A32NX_GLS_2_GS_IS_VALID', type: SimVarValueType.Bool }],
  ['glsLocDeviation', { name: 'L:A32NX_GLS_LOC_DEVIATION', type: SimVarValueType.Number }],
  ['glsGsDeviation', { name: 'L:A32NX_GLS_GS_DEVIATION', type: SimVarValueType.Number }],
  ['gbasIdent', { name: 'L:A32NX_GBAS_IDENT', type: SimVarValueType.Number }],
];
