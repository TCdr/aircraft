// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../MFD';
import { fcomAt, fcomCentre } from './FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { FreeTextFormat } from './DataEntryFormats';

export interface FreeTextSendControlsProps extends Pick<AbstractMfdPageProps, 'mfd' | 'fmcService'> {
  /** The 24 character free text */
  freeText: Subject<string | null>;
  /** Label of the send button */
  sendLabel: string | Subscribable<string>;
  sendDisabled: Subscribable<boolean>;
  onSend: () => void;
  onReturn: () => void;
}

/**
 * The FREE TEXT field, the send button and the RETURN button of the company pages made of a free text and a send button
 * (A380 FCOM DSC-22-FMS-20-30: COMPANY F-PLN REPORT P 25, COMPANY WIND DATA REQUEST P 42, TRANSFER TO MAILBOX P 337),
 * at the positions of the FCOM figures, in page container coordinates.
 */
export function freeTextSendControls(props: FreeTextSendControlsProps): VNode {
  return (
    <>
      {fcomCentre(180, 382, <span class="mfd-label">FREE TEXT</span>)}
      {fcomAt(
        231,
        132,
        <InputField<string>
          dataEntryFormat={new FreeTextFormat(24)}
          value={props.freeText}
          containerStyle="width: 493px;"
          alignText="center"
          errorHandler={(e) => props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
          hEventConsumer={props.mfd.hEventConsumer}
          interactionMode={props.mfd.interactionMode}
        />,
      )}
      {fcomAt(
        312,
        289,
        <Button
          label={props.sendLabel}
          disabled={props.sendDisabled}
          onClick={props.onSend}
          buttonStyle="min-width: 187px; min-height: 60px;"
        />,
      )}
      {fcomAt(796, 2, <Button label="RETURN" onClick={props.onReturn} buttonStyle="min-width: 130px;" />)}
    </>
  );
}
