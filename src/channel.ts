import type { NotifyStrategy } from './strategies';
import { LocalNotifyStrategy } from './strategies';

export interface ChannelOptions {
  /**
   * If true, errors thrown by subscribers will be thrown immediately
   * and the event bus will not continue notifying other subscribers.
   * Even though this is useful for development and debugging,
   * for production it's recommended to keep it as false as other
   * systems might be still be required to be notified.
   * @default false
   */
  throwImmediately?: boolean;
  /**
   * The strategy to use for notifying subscribers. By default, it uses
   * the LocalNotifyStrategy which notifies subscribers in the same tab.
   * If you want to notify subscribers in other tabs, you can use the
   * BroadcastChannelNotifyStrategy instead or use your own strategy
   * by implementing the NotifyStrategy interface.
   * @default LocalNotifyStrategy
   */
  notifyStrategy?: NotifyStrategy;
}

export type ReadonlyChannel<C extends Channel<any, any>> = Pick<C, 'on' | 'once' | 'off' | 'query'>;
export type WriteonlyChannel<C extends Channel<any, any>> = Pick<C, 'publish' | 'publishSync' | 'reply'>;

export type ChannelName<C extends Channel<any, any>> = C extends Channel<infer N, any> ? N : never;
export type ChannelMap<Channels extends Channel<any, any> = Channel<any, any>> = {
  [C in Channels as ChannelName<C>]: C;
};

export type Event<N extends string, P extends object | never = never> = { name: N; payload: P };
export type EventName<E extends Event<any, any>> = E['name'];
export type EventPayload<E extends Event<any, any>> = E['payload'];
export type EventMap<Events extends Event<any, any> = Event<any, any>> = {
  [E in Events as EventName<E>]: EventPayload<E>;
};
type EventCallback<EM extends EventMap, E extends keyof EM> = (payload: EM[E]) => void;

export type Query<N extends string, CB extends Function> = { request: N; callback: CB };
export type RequestName<R extends Query<any, any>> = R['request'];
export type RequestCallback<R extends Query<any, any>> = R['callback'];
export type RequestReturnType<R extends Query<any, any>> = ReturnType<RequestCallback<R>>;
export type RequestParameters<R extends Query<any, any>> = Parameters<RequestCallback<R>>;
export type QueryMap<Requests extends Query<any, any> = Query<any, any>> = {
  [R in Requests as RequestName<R>]: R;
};

export class Channel<N extends string, EM extends EventMap = EventMap, RM extends QueryMap = QueryMap> {
  readonly #options: ChannelOptions = {};
  readonly #notifyStrategy: NotifyStrategy<{ event: any; payload: any; sync: boolean }>;
  // Subscribers for events
  readonly #subscribers = {} as Partial<Record<keyof EM, EventCallback<any, any>[]>>;
  readonly #onceCallbacks = new WeakSet<EventCallback<any, any>>();
  // Subscribers for requests
  readonly #repliers = {} as Partial<Record<keyof RM, RequestCallback<any>>>;

  get readonly() {
    return this as ReadonlyChannel<typeof this>;
  }

  get writeonly() {
    return this as WriteonlyChannel<typeof this>;
  }

  constructor(
    public readonly name: N,
    options: ChannelOptions = {},
  ) {
    this.#options = options;
    this.#notifyStrategy = options.notifyStrategy || new LocalNotifyStrategy();
    this.#notifyStrategy.init(this.#repliers);
    this.#notifyStrategy.onNotifySubscribers(data => {
      this.#runCallbacks(data.event, data.payload, data.sync);
    });
  }

  on<E extends keyof EM>(event: E, callback: EventCallback<EM, E>) {
    if (!this.#subscribers[event]) {
      this.#subscribers[event] = [];
    }
    this.#subscribers[event]!.push(callback);
  }

  once<E extends keyof EM>(event: E, callback: EventCallback<EM, E>) {
    const cb = (data: any) => {
      if (!this.#onceCallbacks.has(cb)) {
        // Prevent once callbacks from being called more than once
        // even when events are published asynchronously.
        // This is going to be garbage collected eventually.
        this.#onceCallbacks.add(cb);
        this.off(event, cb);
        callback(data);
      }
    };
    this.on(event, cb);
  }

  /**
   * Removes all subscribers for the given event.
   */
  off<E extends keyof EM>(event: E): void;
  /**
   * Removes all subscribers for the given callback.
   */
  off(callback: EventCallback<any, any>): void;
  /**
   * Removes the given callback for the given event.
   */
  off<E extends keyof EM>(event: E, callback: EventCallback<EM, E>): void;
  off(event: string | EventCallback<any, any>, callback?: EventCallback<any, any>): void {
    if (typeof event === 'string' && callback) {
      // @ts-expect-error
      this.#subscribers[event] = this.#subscribers[event]?.filter(cb => cb !== callback) || [];
      return;
    }
    if (typeof event === 'string') {
      // @ts-expect-error
      this.#subscribers[event] = [];
      return;
    }
    for (const key in this.#subscribers) {
      this.#subscribers[key] = this.#subscribers[key]?.filter(cb => cb !== event) || [];
    }
  }

  publish<E extends keyof EM>(event: E, ...payload: EM[E] extends never ? [] : [EM[E]]) {
    this.#notifyStrategy.notifySubscribers({ event, payload: payload[0], sync: false });
  }

  publishSync<E extends keyof EM>(event: E, ...payload: EM[E] extends never ? [] : [EM[E]]) {
    this.#notifyStrategy.notifySubscribers({ event, payload: payload[0], sync: true });
  }

  query<R extends keyof RM>(query: R & string, ...params: RequestParameters<RM[R]>): RequestReturnType<RM[R]> {
    return this.#notifyStrategy.query(query, ...params);
  }

  reply<R extends keyof RM>(request: R, callback: RequestCallback<RM[R]>): void {
    this.#repliers[request] = callback;
  }

  #runCallbacks(event: keyof EM, payload: EM[keyof EM], sync: boolean) {
    if (!this.#subscribers[event]) {
      return;
    }

    for (const subscriber of this.#subscribers[event]!) {
      const callback = () => {
        try {
          subscriber(payload);
        } catch (error) {
          if (this.#options.throwImmediately) {
            throw error;
          }
          setTimeout(() => {
            throw error;
          }, 0);
        }
      };

      sync ? callback() : setTimeout(callback, 0);
    }
  }
}

const pushToEndOfLoop = (cb: () => unknown) => {
  // We use setTimeout with 0ms delay to push the callback to the end of the loop.
  // For node runtimes, we need to `unref()` the timer to prevent the event loop
  // from remain active even after no actions need to run
  const res = setTimeout(cb, 0) as any;
  if (res && typeof res !== 'number' && 'unref' in res) {
    res.unref();
  }
};
