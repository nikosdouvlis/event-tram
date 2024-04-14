import { NotifyStrategy, NotifyStrategyBase } from './notify-strategy';

interface BroadcastChannelNotifyStrategyOptions {
  timeout: number;
}

/**
 * Broadcasts all events to all tabs in the same domain.
 * This is useful for applications that need to synchronize state across tabs.
 * To avoid infinite event loops and conform to the BroadcastChannel API,
 * the current tab will NOT receive the events it publishes.
 */
export class BroadcastChannelNotifyStrategy<T> extends NotifyStrategyBase implements NotifyStrategy<T> {
  #channel: BroadcastChannel;
  #cb: Parameters<NotifyStrategy<T>['onNotifySubscribers']>[0] | undefined;
  #options: BroadcastChannelNotifyStrategyOptions;

  constructor(channelName: string, options?: BroadcastChannelNotifyStrategyOptions) {
    super();
    this.#options = options || { timeout: 5000 };
    this.#channel = new BroadcastChannel(channelName);

    this.#channel.addEventListener('message', ({ data }) => {
      this.#cb?.(data);
    });

    this.#channel.addEventListener('message', ({ data }) => {
      const { query, params } = data || {};
      if (query && this.repliers[query]) {
        this.#channel.postMessage({ queryResponse: query, payload: this.repliers[query]?.(...params) });
      }
    });
  }

  onNotifySubscribers(callback: Parameters<NotifyStrategy<T>['onNotifySubscribers']>[0]) {
    this.#cb = callback;
  }

  notifySubscribers(data: unknown) {
    this.#channel.postMessage(data);
  }

  query(query: string, ...params: any[]) {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => reject(new Error(`Query timed out`)), this.#options.timeout);

      const handler = ({ data }: MessageEvent<{ queryResponse: string; payload: any }>) => {
        if (data.queryResponse === query) {
          this.#channel.removeEventListener('message', handler);
          clearTimeout(timerId);
          resolve(data.payload);
        }
      };

      this.#channel.addEventListener('message', handler);
      this.#channel.postMessage({ query, params });
    });
  }
}
