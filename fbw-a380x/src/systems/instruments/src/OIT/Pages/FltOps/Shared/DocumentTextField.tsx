//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, Consumer, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { EfisSide } from '@flybywiresim/fbw-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { InputField, InteractionMode } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DataEntryFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { DocumentTextEntry } from './DocumentTextEntry';

/** What a text field needs from the container of the page: the laptop keyboard keys and the interaction mode */
export interface DocumentFieldContainer {
  readonly hEventConsumer: Consumer<[EfisSide, string]>;
  readonly interactionMode: Subscribable<InteractionMode>;
}

/** Any text up to a length, an empty entry clears the field */
class DocumentTextFormat implements DataEntryFormat<string> {
  public readonly placeholder = '';

  constructor(public readonly maxDigits: number) {}

  public format(value: string | null): [value: string | null, unitLeading: string | null, unitTrailing: string | null] {
    return [value ?? '', null, null];
  }

  public async parse(input: string): Promise<string | null> {
    const text = input.trim();
    return text === '' ? null : text;
  }
}

interface DocumentTextFieldProps extends ComponentProps {
  readonly container: DocumentFieldContainer;
  readonly entry: DocumentTextEntry;
  /** The most characters the crew can type */
  readonly maxLength: number;
  /** The CSS width of the field */
  readonly width: number;
}

/** An entry field for free text (a search word, a note) */
export class DocumentTextField extends DestroyableComponent<DocumentTextFieldProps> {
  private readonly format = new DocumentTextFormat(this.props.maxLength);

  render(): VNode {
    return (
      <InputField<string>
        dataEntryFormat={this.format}
        value={this.props.entry.value}
        onModified={this.props.entry.onModified}
        onInput={this.props.entry.onInput}
        canBeCleared={true}
        alignText="flex-start"
        containerStyle={`width: ${this.props.width}px;`}
        hEventConsumer={this.props.container.hEventConsumer}
        interactionMode={this.props.container.interactionMode}
        errorHandler={() => {}}
      />
    );
  }
}
