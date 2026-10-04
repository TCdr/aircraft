import {
  ClockEvents,
  DisplayComponent,
  EventBus,
  FSComponent,
  Subject,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdMsgList.scss';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { FmcServiceInterface } from '../../FMC/FmcServiceInterface';

interface MfdMsgListProps {
  visible: Subject<boolean>;
  bus: EventBus;
  fmcService: FmcServiceInterface;
}

export class MfdMsgList extends DisplayComponent<MfdMsgListProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly eoActive = Subject.create<boolean>(false);

  private readonly topRef = FSComponent.createRef<HTMLDivElement>();

  private readonly msgListContainer = FSComponent.createRef<HTMLDivElement>();

  protected onNewData = () => {};

  // Yeah, it's expensive, but rn I won't find a better way
  private renderMessageList() {
    const arr = this.props.fmcService.master.fmsErrors.getArray();

    if (arr && arr.length > 5) {
      console.warn('More than 5 FMS messages, truncating.');
    }

    // Clear all items
    if (this.msgListContainer.getOrDefault()) {
      while (this.msgListContainer.instance.firstChild) {
        this.msgListContainer.instance.removeChild(this.msgListContainer.instance.firstChild);
      }
    }

    // Render them
    arr?.forEach((it, idx) => {
      // FCOM DSC-22-FMS-20-30 MESSAGES LIST page: the list has a maximum of 5 messages
      if (idx < 5) {
        FSComponent.render(
          <div class="mfd-label msg-list-element">{it.messageText}</div>,
          this.msgListContainer.instance,
        );
      }
    });
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.visible.sub((vis) => {
        if (this.topRef.getOrDefault()) {
          this.topRef.instance.style.display = vis ? 'block' : 'none';
        }
      }, true),
    );

    const sub = this.props.bus.getSubscriber<ClockEvents>();
    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(1)
        .handle((_t) => this.renderMessageList()),
    );

    this.subs.push(
      this.props.fmcService.masterFmcChanged.sub(() => {
        // FIXME the previous pipe leaks...
        this.props.fmcService.master.fmgc.data.engineOut.pipe(this.eoActive);
      }),
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    return (
      <div ref={this.topRef} class="mfd-fms-fpln-dialog-outer">
        <div class="mfd-fms-fpln-dialog-inner sys-fms">
          <ActivePageTitleBar
            activePage={Subject.create('MESSAGES LIST')}
            offset={Subject.create('')}
            eoIsActive={this.eoActive}
            isFmsSubsystemPage={true}
          />
          {/* begin page content */}
          <div class="mfd-page-container">
            <div ref={this.msgListContainer} class="mfd-msg-list-element-container" />
            <div style="flex-grow: 1;" />
            {/* FCOM DSC-22-FMS-20-30 P 207: CLOSE button at display x = 3, bottom at y = 956 */}
            <div style="display: flex; justify-content: flex-start; margin: 0 0 -4px 3px;">
              <Button label="CLOSE" onClick={() => this.props.visible.set(false)} buttonStyle="min-width: 128px;" />
            </div>
          </div>
          {/* end page content */}
        </div>
      </div>
    );
  }
}
