// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarPublisherEntry, SimVarValueType } from '@microsoft/msfs-sdk';

type IlsReceiverTopic =
  | 'mmr2LocValid'
  | 'mmr2GsValid'
  | 'mmr2GsDeviation'
  | 'mmr1Powered'
  | 'mmr2Powered'
  | 'ils1Failed'
  | 'ils2Failed';

/**
 * The ILS receiver of the MMR 2 and the health of both MMRs, as the systems write them. Shared by the VOR bus publishers
 * of both aircraft so the names stay identical. The ILS receiver of the MMR 1 is on the un-numbered topics.
 */
export const ILS_RECEIVER_SIMVARS: [IlsReceiverTopic, SimVarPublisherEntry<any>][] = [
  ['mmr2LocValid', { name: 'L:A32NX_MMR_2_LOC_IS_VALID', type: SimVarValueType.Bool }],
  ['mmr2GsValid', { name: 'L:A32NX_MMR_2_GS_IS_VALID', type: SimVarValueType.Bool }],
  ['mmr2GsDeviation', { name: 'L:A32NX_MMR_2_GS_DEVIATION', type: SimVarValueType.Degree }],
  ['mmr1Powered', { name: 'L:A32NX_MMR_1_IS_POWERED', type: SimVarValueType.Bool }],
  ['mmr2Powered', { name: 'L:A32NX_MMR_2_IS_POWERED', type: SimVarValueType.Bool }],
  ['ils1Failed', { name: 'L:A32NX_ILS_1_FAILED', type: SimVarValueType.Bool }],
  ['ils2Failed', { name: 'L:A32NX_ILS_2_FAILED', type: SimVarValueType.Bool }],
];
