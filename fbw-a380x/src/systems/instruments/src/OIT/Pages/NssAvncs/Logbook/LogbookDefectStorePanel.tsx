//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { OitAvncsContainer } from '../../../OitAvncsContainer';
import { LogbookStoreTarget, canRecordData } from '../../../System/TechLogbook';
import { LogbookField } from './LogbookWidgets';

/** Design choice: the length of PILOT COMMENT, one line of the field */
export const PILOT_COMMENT_LENGTH = 60;

const TARGET_LABELS: Record<LogbookStoreTarget, string> = {
  open: 'OPEN ITEMS',
  temporary: 'TEMPORARY ITEMS',
  'cabin-open': 'CABIN OPEN ITEMS',
};

interface LogbookDefectStorePanelProps extends ComponentProps {
  readonly container: OitAvncsContainer;
  readonly idPrefix: string;
  /** OPEN ITEMS and TEMPORARY ITEMS, or OPEN ITEMS and CABIN OPEN ITEMS for a cabin item */
  readonly targets: readonly LogbookStoreTarget[];
  /** The STORE IN choice, an index in the targets; the page keeps it with its other entries */
  readonly target: Subject<number | null>;
  readonly pilotComment: Subject<string | null>;
  /** Whether a defect is selected or typed */
  readonly hasDefect: Subscribable<boolean>;
  readonly onStore: (target: LogbookStoreTarget) => void;
  /** The width of the PILOT COMMENT box, px: narrower beside a column of buttons */
  readonly commentWidth?: number;
}

/**
 * The PILOT COMMENT field, the STORE IN choice and the STORE button of the assistants. STORE needs a defect, the
 * storage choice and the logbook on board. A stored defect clears the comment.
 */
export class LogbookDefectStorePanel extends DestroyableComponent<LogbookDefectStorePanelProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly storeDisabled = MappedSubject.create(
    ([state, hasDefect, target]) => !canRecordData(state) || !hasDefect || target === null,
    this.store.state,
    this.props.hasDefect,
    this.props.target,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.storeDisabled);
  }

  private storeDefect(): void {
    const index = this.props.target.get();
    if (index === null) {
      return;
    }
    const target = this.props.targets[index];
    this.props.onStore(target);
    this.props.pilotComment.set(null);
    this.props.target.set(null);
    // Design choice: a short confirmation, the assistant pages give no other sign that the defect was recorded
    this.store.dialog.set({
      kind: 'Information',
      lines: [`Defect stored in ${TARGET_LABELS[target]}`],
      buttons: [{ label: 'OK' }],
    });
  }

  render(): VNode {
    return (
      <>
        <div class="oit-logbook-row" style="margin-top: 16px;">
          <div class="oit-logbook-label" style="width: 230px;">
            PILOT COMMENT
          </div>
          <LogbookField<string>
            container={this.props.container}
            format={new FreeTextFormat(PILOT_COMMENT_LENGTH)}
            value={this.props.pilotComment}
            onModified={(v) => this.props.pilotComment.set(v)}
            width={this.props.commentWidth ?? 900}
            alignText="flex-start"
          />
        </div>
        <div class="oit-logbook-row" style="margin-top: 16px; align-items: flex-start;">
          <div class="oit-logbook-label" style="width: 230px; padding-top: 8px;">
            STORE IN
          </div>
          <RadioButtonGroup
            values={this.props.targets.map((t) => TARGET_LABELS[t])}
            selectedIndex={this.props.target}
            idPrefix={this.props.idPrefix}
          />
          <div style="flex: 1;" />
          <Button
            label="STORE"
            disabled={this.storeDisabled}
            onClick={() => this.storeDefect()}
            containerStyle="align-self: flex-end;"
          />
        </div>
      </>
    );
  }
}
