// @ts-strict-ignore
import { DisplayComponent, FSComponent, Subscription, VNode } from '@microsoft/msfs-sdk';

export abstract class DestroyableComponent<T> extends DisplayComponent<T> {
  /** Make sure to collect all subscriptions (Consumer, MappedSubjects, ...) here, so we can destroy them when destroying the page */
  protected readonly subscriptions: Subscription[] = [];

  /**
   * Child DestroyableComponents rendered by this component (e.g. via refs in render()). pauseSubscriptions()/
   * resumeSubscriptions() recurse into these, so a parent's own subscriptions array does not need to duplicate them.
   */
  protected readonly childComponents: DestroyableComponent<any>[] = [];

  destroy(): void {
    for (const s of this.subscriptions) {
      s.destroy();
    }

    super.destroy();
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  render(): VNode | null {
    return <></>;
  }

  public pauseSubscriptions() {
    for (const s of this.subscriptions) {
      s.pause();
    }

    for (const c of this.childComponents) {
      c.pauseSubscriptions();
    }
  }

  public resumeSubscriptions() {
    for (const s of this.subscriptions) {
      s.resume();
    }

    for (const c of this.childComponents) {
      c.resumeSubscriptions();
    }
  }
}

export function isSubscription(object: any): object is Subscription {
  return (
    object !== undefined &&
    object.isAlive !== undefined &&
    object.isPaused !== undefined &&
    object.canInitialNotify !== undefined &&
    object.pause !== undefined &&
    object.resume !== undefined &&
    object.destroy !== undefined &&
    typeof object.isAlive === 'boolean' &&
    typeof object.isPaused === 'boolean' &&
    typeof object.canInitialNotify === 'boolean' &&
    typeof object.pause === 'function' &&
    typeof object.resume === 'function' &&
    typeof object.destroy === 'function'
  );
}
