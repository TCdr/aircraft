//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DOCUMENT_NOTE_MAX_LENGTH, DocumentNotes } from './DocumentNotes';
import { DocumentTextEntry } from './DocumentTextEntry';
import { DocumentFieldContainer, DocumentTextField } from './DocumentTextField';
import './document-widgets.scss';

interface DocumentNoteFieldProps extends ComponentProps {
  readonly container: DocumentFieldContainer;
  readonly notes: DocumentNotes;
  /** The displayed unit, null when none */
  readonly unitId: Subscribable<string | null>;
  /** The note was saved or deleted: the tree gets or loses the note line */
  readonly onChanged?: () => void;
}

/** The note area of a unit: a text field with Save and Delete */
export class DocumentNoteField extends DestroyableComponent<DocumentNoteFieldProps> {
  private readonly entry = new DocumentTextEntry();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.props.unitId.sub((id) => {
        this.entry.set(id === null ? null : this.props.notes.get(id));
      }, true),
    );
  }

  private save(): void {
    const id = this.props.unitId.get();
    if (id !== null) {
      this.props.notes.save(id, this.entry.current());
      this.props.onChanged?.();
    }
  }

  private delete(): void {
    const id = this.props.unitId.get();
    if (id !== null) {
      this.props.notes.delete(id);
      this.entry.set(null);
      this.props.onChanged?.();
    }
  }

  render(): VNode {
    return (
      <div class="oit-doc-note">
        <span class="oit-doc-note-label">Note Text :</span>
        <DocumentTextField
          container={this.props.container}
          entry={this.entry}
          maxLength={DOCUMENT_NOTE_MAX_LENGTH}
          width={440}
        />
        <Button label="Save" onClick={() => this.save()} />
        <Button label="Delete" onClick={() => this.delete()} />
      </div>
    );
  }
}
