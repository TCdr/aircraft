//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { LogbookStoreTarget } from '../../../System/TechLogbook';
import { COCKPIT_AREAS, defectsInArea } from '../../../System/TechLogbookDefects';
import { LogbookClickable, LogbookSelectionList } from './LogbookWidgets';
import { LogbookDefectStorePanel } from './LogbookDefectStorePanel';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookCockpitInterfaceProps extends AbstractOitAvncsPageProps {}

/**
 * The COCKPIT INTERFACE assistant. Design choice: the cockpit picture of the real assistant is replaced by a plan of
 * the cockpit areas (no cockpit picture is available); selecting an area makes STD DEFECT active, which lists the
 * standard defects of that area. COCKPIT VIEW goes back to the whole cockpit, the arrows move to the previous/next area.
 */
export class OitAvncsLogbookCockpitInterface extends DestroyableComponent<OitAvncsLogbookCockpitInterfaceProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  /** What the crew typed and selected stays until the LOGBOOK application closes */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  private readonly area = this.drafts.field<number | null>(LOGBOOK_URI.cockpitInterface, 'area', null);
  private readonly stdDefectMode = this.drafts.field<boolean>(LOGBOOK_URI.cockpitInterface, 'stdDefectMode', false);

  private readonly areaSelected = COCKPIT_AREAS.map((_, i) => this.area.map((a) => a === i));
  private readonly defectsHidden = this.stdDefectMode.map((m) => !m);
  private readonly noAreaSelected = this.area.map((a) => a === null);

  private readonly defects = this.area.map((a) => (a === null ? [] : defectsInArea(COCKPIT_AREAS[a])));
  private readonly defectTexts = this.defects.map((d) => d.map((x) => x.title));
  private readonly selectedIndex = this.drafts.field<number | null>(
    LOGBOOK_URI.cockpitInterface,
    'selectedIndex',
    null,
  );
  private readonly hasDefect = this.selectedIndex.map((i) => i !== null);

  private readonly pilotComment = this.drafts.field<string | null>(LOGBOOK_URI.cockpitInterface, 'pilotComment', null);
  private readonly storeTarget = this.drafts.field<number | null>(LOGBOOK_URI.cockpitInterface, 'storeTarget', null);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      ...this.areaSelected,
      this.defectsHidden,
      this.noAreaSelected,
      this.defects,
      this.defectTexts,
      this.hasDefect,
      this.area.sub(() => this.selectedIndex.set(null)),
    );
  }

  private step(delta: number): void {
    const area = this.area.get();
    if (area !== null) {
      this.area.set((area + delta + COCKPIT_AREAS.length) % COCKPIT_AREAS.length);
    }
  }

  private storeDefect(target: LogbookStoreTarget): void {
    const index = this.selectedIndex.get();
    const defect = index !== null ? this.defects.get()[index] : undefined;
    if (!defect) {
      return;
    }
    this.store.recordDefect(
      { title: defect.title, ata: defect.ata, pilotComment: this.pilotComment.get() ?? '' },
      target === 'temporary' ? 'temporary' : 'open',
    );
    this.selectedIndex.set(null);
  }

  render(): VNode {
    return (
      <div class="oit-logbook-frame">
        <span class="oit-logbook-frame-title">LOGBOOK ENTRY / COCKPIT INTERFACE</span>
        <div class="oit-logbook-row" style="align-items: stretch; flex: 1;">
          <div class="oit-logbook-column" style="flex: 1;">
            <div class={{ 'oit-logbook-cockpit-areas': true, hidden: this.stdDefectMode }}>
              {COCKPIT_AREAS.map((name, index) => (
                <LogbookClickable
                  class={{ 'oit-logbook-cockpit-area': true, selected: this.areaSelected[index] }}
                  onClick={() => this.area.set(index)}
                >
                  {name}
                </LogbookClickable>
              ))}
            </div>
            <div class={{ 'oit-logbook-column': true, hidden: this.defectsHidden }}>
              <div class="oit-logbook-row" style="margin-top: 10px; align-items: flex-start;">
                <div class="oit-logbook-label" style="width: 230px;">
                  ITEM SELECTION
                </div>
                <LogbookSelectionList
                  items={this.defectTexts}
                  selectedIndex={this.selectedIndex}
                  style="width: 640px; height: 230px;"
                />
              </div>
              <LogbookDefectStorePanel
                container={this.props.container}
                idPrefix={`${this.props.uiService.captOrFo}_logbook_cockpit_store`}
                targets={['open', 'temporary']}
                target={this.storeTarget}
                pilotComment={this.pilotComment}
                hasDefect={this.hasDefect}
                onStore={(target) => this.storeDefect(target)}
                commentWidth={640}
              />
            </div>
          </div>
          <div class="oit-logbook-column" style="width: 230px; margin-left: 14px;">
            <div class="oit-logbook-section oit-logbook-column">
              <span class="oit-logbook-section-title">NAVIGATION</span>
              <Button
                label="COCKPIT VIEW"
                onClick={() => {
                  this.area.set(null);
                  this.stdDefectMode.set(false);
                }}
                buttonStyle="width: 190px;"
              />
              <div class="oit-logbook-row" style="justify-content: space-between; margin-top: 10px;">
                <IconButton
                  icon="double-left"
                  disabled={this.noAreaSelected}
                  onClick={() => this.step(-1)}
                  containerStyle="width: 44px; height: 44px;"
                />
                <IconButton
                  icon="double-right"
                  disabled={this.noAreaSelected}
                  onClick={() => this.step(1)}
                  containerStyle="width: 44px; height: 44px;"
                />
              </div>
            </div>
            <div class="oit-logbook-section oit-logbook-column">
              <span class="oit-logbook-section-title">SELECT MODE</span>
              <Button
                label="GRAPHICS"
                selected={this.defectsHidden}
                onClick={() => this.stdDefectMode.set(false)}
                buttonStyle="width: 190px;"
              />
              <Button
                label="STD DEFECT"
                disabled={this.noAreaSelected}
                selected={this.stdDefectMode}
                onClick={() => this.stdDefectMode.set(true)}
                buttonStyle="width: 190px;"
                containerStyle="margin-top: 10px;"
              />
            </div>
            <div style="flex: 1;" />
            <Button
              label="RETURN"
              onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.entry)}
              buttonStyle="width: 210px;"
            />
            <Button
              label="STATUS"
              onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)}
              buttonStyle="width: 210px;"
              containerStyle="margin-top: 10px;"
            />
          </div>
        </div>
      </div>
    );
  }
}
