import type { NotifyStrategy } from './notify-strategy';
import { NotifyStrategyBase } from './notify-strategy';

/**
 * Publish all events to the local tab.
 * This is the usual strategy for most applications leveraging the EventTram.
 */
export class LocalNotifyStrategy<T = any> extends NotifyStrategyBase implements NotifyStrategy<T> {
  #cb: Parameters<NotifyStrategy<T>['onNotifySubscribers']>[0] | undefined;

  onNotifySubscribers(callback: Parameters<NotifyStrategy<T>['onNotifySubscribers']>[0]) {
    this.#cb = callback;
  }

  notifySubscribers(data: T) {
    this.#cb?.(data);
  }

  query(query: string, ...params: any[]) {
    return this.repliers[query]?.(...params);
  }
}
