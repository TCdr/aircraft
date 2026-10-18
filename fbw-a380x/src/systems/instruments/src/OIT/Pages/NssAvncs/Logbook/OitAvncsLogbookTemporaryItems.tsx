//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  canRecordData,
  changeTemporaryComment,
  deleteTemporaryItem,
  itemsIn,
  storeTemporaryInOpen,
} from '../../../System/TechLogbook';
import { LogbookField, LogbookSelectionList } from './LogbookWidgets';
import { PILOT_COMMENT_LENGTH } from './LogbookDefectStorePanel';
import { LOGBOOK_URI } from './LogbookFlows';
import { selectionIndex } from './LogbookDrafts';

interface OitAvncsLogbookTemporaryItemsProps extends AbstractOitAvncsPageProps {}

/**
 * The TEMPORARY ITEMS page: the defects stored as temporary, which the flight crew can change, delete or store in the
 * open items. Those left are deleted when the flight is closed.
 */
export class OitAvncsLogbookTemporaryItems extends DestroyableComponent<OitAvncsLogbookTemporaryItemsProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly items = this.store.state.map((s) => itemsIn(s, 'temporary'));
  private readonly titles = this.items.map((items) => items.map((i) => i.title));

  /** The item selected stays until the LOGBOOK application closes, kept by its reference: the list can change */
  private readonly selectedItemRef = this.props.container.ansu.pageDrafts.field<string | null>(
    LOGBOOK_URI.temporaryItems,
    'selectedItemRef',
    null,
  );
  private readonly selectedIndex = Subject.create<number | null>(
    selectionIndex(
      this.items.get().map((i) => i.ref),
      this.selectedItemRef.get(),
    ),
  );

  private readonly selected = MappedSubject.create(
    ([items, index]) => (index !== null ? items[index] ?? null : null),
    this.items,
    this.selectedIndex,
  );

  private readonly pilotComment = this.selected.map((i) => (i?.pilotComment ? i.pilotComment : null));

  private readonly disabled = MappedSubject.create(
    ([state, selected]) => !canRecordData(state) || selected === null,
    this.store.state,
    this.selected,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.items,
      this.titles,
      this.selected,
      this.pilotComment,
      this.disabled,
      this.selected.sub((item) => this.selectedItemRef.set(item?.ref ?? null)),
    );
  }

  private selectedRef(): string | null {
    return this.selected.get()?.ref ?? null;
  }

  private deleteItem(): void {
    const ref = this.selectedRef();
    if (ref === null) {
      return;
    }
    this.store.dialog.set({
      kind: 'Caution',
      lines: ['Delete the selected item?'],
      buttons: [
        {
          label: 'YES',
          action: () => {
            this.selectedIndex.set(null);
            this.store.change((s) => deleteTemporaryItem(s, ref));
          },
        },
        { label: 'NO' },
      ],
    });
  }

  private storeInOpen(): void {
    const ref = this.selectedRef();
    if (ref === null) {
      return;
    }
    const comment = this.selected.get()?.pilotComment ?? '';
    this.selectedIndex.set(null);
    this.store.change((s) => storeTemporaryInOpen(s, ref, comment));
  }

  render(): VNode {
    return (
      <div class="oit-logbook-frame">
        <span class="oit-logbook-frame-title">STATUS / TEMPORARY ITEMS</span>
        <div class="oit-logbook-row" style="margin-top: 30px; align-items: flex-start;">
          <div class="oit-logbook-label" style="width: 230px;">
            ITEM SELECTION
          </div>
          <LogbookSelectionList
            items={this.titles}
            selectedIndex={this.selectedIndex}
            style="width: 900px; height: 160px;"
          />
        </div>
        <div class="oit-logbook-bottom-buttons" style="margin-top: 30px;">
          <Button label="DELETE ITEM" disabled={this.disabled} onClick={() => this.deleteItem()} />
        </div>
        <div class="oit-logbook-row" style="margin-top: 90px;">
          <div class="oit-logbook-label" style="width: 230px;">
            PILOT COMMENT
          </div>
          <LogbookField<string>
            container={this.props.container}
            format={new FreeTextFormat(PILOT_COMMENT_LENGTH)}
            value={this.pilotComment}
            disabled={this.disabled}
            onModified={(text) => {
              const ref = this.selectedRef();
              if (ref !== null) {
                this.store.change((s) => changeTemporaryComment(s, ref, text ?? ''));
              }
            }}
            width={900}
            alignText="flex-start"
          />
        </div>
        <div class="oit-logbook-bottom-buttons" style="margin-top: 30px;">
          <Button label="STORE IN OPEN ITEMS" disabled={this.disabled} onClick={() => this.storeInOpen()} />
        </div>
        <div style="flex: 1;" />
        <div class="oit-logbook-bottom-buttons">
          <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
        </div>
      </div>
    );
  }
}
