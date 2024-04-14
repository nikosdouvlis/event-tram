import type { ChannelMap, ChannelOptions, EventMap, QueryMap } from './channel';
import { Channel } from './channel';

export interface EventTramOptions extends ChannelOptions {}

export class EventTram<
  CM extends ChannelMap,
  EM extends EventMap = EventMap,
  RM extends QueryMap = QueryMap,
> extends Channel<'eventTram', EM, RM> {
  readonly #channels = {} as CM;
  readonly #options: EventTramOptions = {};

  constructor(options: EventTramOptions = {}) {
    super('eventTram', options);
    this.#options = options;
  }

  channel<C extends keyof CM & string>(name: C): CM[C] {
    this.#channels[name] = (this.#channels[name] as CM[C]) || new Channel(name, this.#options);
    return this.#channels[name] as CM[C];
  }

  registerChannel<C extends Channel<any, any>>() {
    return this as unknown as EventTram<CM & ChannelMap<C>, EM, RM>;
  }

  registerEvents<E extends EventMap>() {
    return this as unknown as EventTram<CM, EM & E, RM>;
  }

  registerQueries<R extends QueryMap>() {
    return this as unknown as EventTram<CM, EM, RM & R>;
  }
}
