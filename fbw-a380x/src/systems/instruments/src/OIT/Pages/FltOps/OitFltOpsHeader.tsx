//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  DisplayComponent,
  FSComponent,
  Subscribable,
  SubscribableMapFunctions,
  SubscribableUtils,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { PageSelectorDropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/PageSelectorDropdownMenu';
import { OitUiService } from '../../OitUiService';
import { OitPageFunction, PageFunctionAvailability } from '../../OitPageFunctions';
import { shortcutChord } from '../../LaptopKeyboard';
import { OisMessageToolbar } from '../../System/OisMessageToolbar';
import { OitMessageToolbarView } from '../OitMessageToolbarView';
import { FLT_OPS_MENU_URI } from '../../System/XOisFunction';
import { fltOpsApplicationName, fltOpsApplicationOf } from './FltOpsApplications';

interface OitFltOpsHeaderProps {
  readonly uiService: OitUiService;
  /** The message toolbar of the laptop */
  readonly messageToolbar: OisMessageToolbar;
}

/*
 * Complete header for the OIS system, both AVNCS and FLT OPS.
 */
export abstract class OitFltOpsHeader extends DisplayComponent<OitFltOpsHeaderProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  protected readonly subs = [] as Subscription[];

  private readonly oitHeading = this.props.uiService.activeUri.map((uri) => fltOpsApplicationName(uri.uri));

  /** HOME: the home page of the displayed application, greyed on that page and on the FLT OPS MENU page */
  private readonly homeDisabled = this.props.uiService.activeUri.map((uri) => {
    const application = fltOpsApplicationOf(uri.uri);
    return application === null || application === uri.uri;
  });

  private readonly previousDisabled = this.props.uiService.backAvailable.map(SubscribableMapFunctions.not());

  private readonly nextDisabled = this.props.uiService.forwardAvailable.map(SubscribableMapFunctions.not());

  private readonly print = new PageFunctionAvailability(this.props.uiService.pageFunctions, 'print');

  private readonly store = new PageFunctionAvailability(this.props.uiService.pageFunctions, 'store');

  private readonly update = new PageFunctionAvailability(this.props.uiService.pageFunctions, 'update');

  private readonly undo = new PageFunctionAvailability(this.props.uiService.pageFunctions, 'undo');

  private readonly redo = new PageFunctionAvailability(this.props.uiService.pageFunctions, 'redo');

  /** In full screen the item shows the switching bar again */
  private readonly switchingBarLabel = this.props.uiService.fullScreen.map((fullScreen) =>
    fullScreen ? 'SHOW SWITCHING BAR' : 'HIDE SWITCHING BAR',
  );

  private readonly closeApplicationDisabled = this.props.uiService.fltOpsApplications.active.map(
    (application) => application === null,
  );

  /** The FUNCTIONS menu; the items that show a shortcut also work from the keyboard */
  private readonly functionsMenuItems = [
    { label: 'HOME', shortcut: 'Alt H', action: () => this.goHome(), disabled: this.homeDisabled },
    {
      label: 'PREVIOUS',
      shortcut: 'Alt ←',
      action: () => this.props.uiService.navigateTo('back'),
      disabled: this.previousDisabled,
    },
    {
      label: 'NEXT',
      shortcut: 'Alt →',
      action: () => this.props.uiService.navigateTo('forward'),
      disabled: this.nextDisabled,
      separatorBelow: true,
    },
    {
      label: 'PRINT',
      shortcut: 'Ctrl P',
      action: () => this.props.uiService.runPageFunction('print'),
      disabled: this.print.disabled,
    },
    {
      label: 'STORE',
      shortcut: 'Alt O',
      action: () => this.props.uiService.runPageFunction('store'),
      disabled: this.store.disabled,
    },
    {
      label: 'UPDATE',
      shortcut: 'Alt A',
      action: () => this.props.uiService.runPageFunction('update'),
      disabled: this.update.disabled,
      separatorBelow: true,
    },
    {
      label: 'UNDO',
      shortcut: 'Ctrl Z',
      action: () => this.props.uiService.runPageFunction('undo'),
      disabled: this.undo.disabled,
    },
    {
      label: 'REDO',
      shortcut: 'Ctrl Y',
      action: () => this.props.uiService.runPageFunction('redo'),
      disabled: this.redo.disabled,
      separatorBelow: true,
    },
    { label: 'HELP', shortcut: 'Alt L', action: () => {}, disabled: true, separatorBelow: true },
    {
      label: this.switchingBarLabel,
      shortcut: 'F11',
      action: () => this.props.uiService.fullScreen.set(!this.props.uiService.fullScreen.get()),
      separatorBelow: true,
    },
    {
      label: 'CLOSE APPLICATION',
      shortcut: 'Alt F4',
      action: () => this.closeApplication(),
      disabled: this.closeApplicationDisabled,
    },
  ];

  private registerShortcuts(): void {
    const shortcuts: Record<string, OitPageFunction> = {};
    for (const item of this.functionsMenuItems) {
      const disabled: Subscribable<boolean> = SubscribableUtils.toSubscribable(item.disabled ?? false, true);
      const available = disabled.map(SubscribableMapFunctions.not());
      this.subs.push(available);
      shortcuts[shortcutChord(item.shortcut)] = { run: item.action, available };
    }
    this.props.uiService.registerMenuShortcuts(shortcuts);
  }

  private goHome(): void {
    const application = fltOpsApplicationOf(this.props.uiService.activeUri.get().uri);
    if (application !== null) {
      this.props.uiService.navigateTo(application);
    }
  }

  private closeApplication(): void {
    if (this.props.uiService.fltOpsApplications.closeActive() !== null) {
      // Design choice: back to the FLT OPS MENU page, as CLOSE of the NSS AVNCS side goes to its menu page
      this.props.uiService.navigateTo(FLT_OPS_MENU_URI);
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.registerShortcuts();
    this.subs.push(
      this.oitHeading,
      this.homeDisabled,
      this.previousDisabled,
      this.nextDisabled,
      this.switchingBarLabel,
      this.closeApplicationDisabled,
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }
    for (const availability of [this.print, this.store, this.update, this.undo, this.redo]) {
      availability.destroy();
    }

    super.destroy();
  }

  render(): VNode {
    return (
      <div class="oit-header-row">
        <PageSelectorDropdownMenu
          isActive={SubscribableUtils.toSubscribable(false, true)}
          label="MENU"
          menuItems={[
            { label: 'FLT OPS MENU', action: () => this.props.uiService.navigateTo('flt-ops'), separatorBelow: true },
            {
              label: 'FLT FOLDER',
              action: () => this.props.uiService.navigateTo('flt-ops/flt-folder'),
            },
            {
              label: 'TERML CHART',
              action: () => this.props.uiService.navigateTo('flt-ops/charts'),
              separatorBelow: true,
            },
            {
              label: 'OPS LIBRARY',
              action: () => this.props.uiService.navigateTo('flt-ops/ops-library'),
              disabled: true,
              separatorBelow: true,
            },
            { label: 'T.O PERF', action: () => this.props.uiService.navigateTo('flt-ops/to-perf') },
            {
              label: 'LOADSHEET',
              action: () => this.props.uiService.navigateTo('flt-ops/loadsheet'),
            },
            { label: 'LDG PERF', action: () => this.props.uiService.navigateTo('flt-ops/ldg-perf') },
            {
              label: 'IN-FLT PERF',
              action: () => this.props.uiService.navigateTo('flt-ops/in-flt-perf'),
              separatorBelow: true,
            },
            { label: 'FLT OPS STS', action: () => this.props.uiService.navigateTo('flt-ops/sts') },
            { label: 'LOAD BOX', action: () => this.props.uiService.navigateTo('flt-ops/load-box') },
            {
              label: 'EXPORT BOX',
              action: () => this.props.uiService.navigateTo('flt-ops/export-box'),
              separatorBelow: true,
            },
            {
              label: 'EXIT SESSION',
              // Does nothing while the FLT FOLDER is open
              action: () => this.props.uiService.exitFltOpsSession(),
              disabled: false,
            },
          ]}
          idPrefix={`${this.props.uiService.captOrFo}_OIT_menu_menu`}
          dropdownMenuStyle="width: 300px;"
        />
        <div class="oit-heading">{this.oitHeading}</div>
        <div style="flex-grow: 1" />
        <PageSelectorDropdownMenu
          isActive={SubscribableUtils.toSubscribable(false, true)}
          label="FUNCTIONS"
          menuItems={this.functionsMenuItems}
          idPrefix={`${this.props.uiService.captOrFo}_OIT_menu_functions`}
          dropdownMenuStyle="width: 420px;"
        />
        <OitMessageToolbarView
          toolbar={this.props.messageToolbar}
          idPrefix={`${this.props.uiService.captOrFo}_OIT_flt_ops`}
          height={60}
        />
      </div>
    );
  }
}
