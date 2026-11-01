//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { LogbookStoreTarget } from '../../../System/TechLogbook';
import { COCKPIT_AREAS, CockpitArea, defectsInZone } from '../../../System/TechLogbookDefects';
import {
  COCKPIT_VIEW_FRAMES,
  COCKPIT_VIEW_WINDOWS,
  COCKPIT_VIEW_SELECTION,
  CockpitSelection,
  ZoneFrame,
  canListStdDefects,
  steppedSelection,
  zoomedInto,
  zonesOfArea,
} from '../../../System/TechLogbookCockpit';
import { LogbookClickable, LogbookSelectionList } from './LogbookWidgets';
import { LogbookDefectStorePanel } from './LogbookDefectStorePanel';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookCockpitInterfaceProps extends AbstractOitAvncsPageProps {}

/**
 * @param frame a frame of a picture, in percent of the picture
 * @returns its position and size
 */
function frameStyle(frame: ZoneFrame): string {
  return `left: ${frame.x}%; top: ${frame.y}%; width: ${frame.w}%; height: ${frame.h}%;`;
}

/**
 * The COCKPIT INTERFACE assistant. The cockpit photograph of the real assistant is replaced by pictures drawn from
 * plain frames (no photograph is available): clicking an area of the cockpit view zooms into the picture of that area,
 * clicking an equipment zone selects it, which makes STD DEFECT active (it lists the standard defects of the zone).
 * COCKPIT VIEW goes back to the whole cockpit, the arrows select the previous/next zone of the picture.
 */
export class OitAvncsLogbookCockpitInterface extends DestroyableComponent<OitAvncsLogbookCockpitInterfaceProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  /** What the crew typed and selected stays until the LOGBOOK application closes */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  /** The area the picture is zoomed into, null for the cockpit view */
  private readonly view = this.drafts.field<CockpitArea | null>(LOGBOOK_URI.cockpitInterface, 'view', null);
  private readonly zone = this.drafts.field<string | null>(LOGBOOK_URI.cockpitInterface, 'zone', null);
  private readonly stdDefectMode = this.drafts.field<boolean>(LOGBOOK_URI.cockpitInterface, 'stdDefectMode', false);

  private readonly cockpitViewHidden = this.view.map((v) => v !== null);
  private readonly areaHidden = COCKPIT_AREAS.map((area) => this.view.map((v) => v !== area));
  private readonly defectsHidden = this.stdDefectMode.map((m) => !m);
  private readonly cockpitView = this.view.map((v) => v === null);
  private readonly noStdDefects = MappedSubject.create(
    ([view, zone]) => !canListStdDefects({ view, zone }),
    this.view,
    this.zone,
  );
  private readonly zoneSelected = COCKPIT_AREAS.map((area) =>
    zonesOfArea(area).map((zone) => this.zone.map((selected) => selected === zone.id)),
  );

  private readonly defects = MappedSubject.create(
    ([view, zone]) => (view === null || zone === null ? [] : defectsInZone(view, zone)),
    this.view,
    this.zone,
  );
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
      this.cockpitViewHidden,
      ...this.areaHidden,
      this.defectsHidden,
      this.cockpitView,
      this.noStdDefects,
      this.defects,
      this.defectTexts,
      this.hasDefect,
      this.zone.sub(() => this.selectedIndex.set(null)),
    );
    for (const zonesSelected of this.zoneSelected) {
      this.subscriptions.push(...zonesSelected);
    }
  }

  private selection(): CockpitSelection {
    return { view: this.view.get(), zone: this.zone.get(), stdDefectMode: this.stdDefectMode.get() };
  }

  private select(selection: CockpitSelection): void {
    this.view.set(selection.view);
    this.zone.set(selection.zone);
    this.stdDefectMode.set(selection.stdDefectMode);
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
            <div class={{ 'oit-logbook-cockpit-picture': true, hidden: this.stdDefectMode }}>
              {COCKPIT_VIEW_WINDOWS.map((pane) => (
                <div
                  class={{ 'oit-logbook-cockpit-window': true, hidden: this.cockpitViewHidden }}
                  style={frameStyle(pane)}
                />
              ))}
              {COCKPIT_VIEW_FRAMES.map((view) => (
                <LogbookClickable
                  class={{
                    'oit-logbook-cockpit-frame': true,
                    [`oit-logbook-cockpit-${view.look}`]: true,
                    hidden: this.cockpitViewHidden,
                  }}
                  style={frameStyle(view.frame)}
                  onClick={() => this.select(zoomedInto(view.area))}
                >
                  {view.area}
                </LogbookClickable>
              ))}
              {COCKPIT_AREAS.map((area, areaIndex) => (
                <div class={{ 'oit-logbook-cockpit-zoom': true, hidden: this.areaHidden[areaIndex] }}>
                  {zonesOfArea(area).map((zone, zoneIndex) => (
                    <LogbookClickable
                      class={{
                        'oit-logbook-cockpit-frame': true,
                        [`oit-logbook-cockpit-${zone.look}`]: true,
                        selected: this.zoneSelected[areaIndex][zoneIndex],
                      }}
                      style={frameStyle(zone.frame)}
                      onClick={() => this.zone.set(zone.id)}
                    >
                      {zone.id}
                    </LogbookClickable>
                  ))}
                </div>
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
                onClick={() => this.select(COCKPIT_VIEW_SELECTION)}
                buttonStyle="width: 190px;"
              />
              <div class="oit-logbook-row" style="justify-content: space-between; margin-top: 10px;">
                <IconButton
                  icon="double-left"
                  disabled={this.cockpitView}
                  onClick={() => this.select(steppedSelection(this.selection(), -1))}
                  containerStyle="width: 44px; height: 44px;"
                />
                <IconButton
                  icon="double-right"
                  disabled={this.cockpitView}
                  onClick={() => this.select(steppedSelection(this.selection(), 1))}
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
                disabled={this.noStdDefects}
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
