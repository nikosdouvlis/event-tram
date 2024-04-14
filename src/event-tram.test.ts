import { afterEach, beforeEach, describe, expectTypeOf, it, vi } from 'vitest';

import { Channel, ChannelMap, Event, EventMap, EventTram, EventTramOptions, Query, QueryMap } from './index';
import { BroadcastChannelNotifyStrategy, NotifyStrategy } from './strategies';

type TestEvents = EventMap<
  | Event<'scope:action', { payload: string }> //
  | Event<'scope:another-action', { payload: string }> //
>;

type StandAloneEvents = TestEvents;

type TestQueries = QueryMap<
  | Query<'scope:query', (val?: string) => string> //
  | Query<'scope:async-query', (val: string) => Promise<string>> //
>;

type StandAloneQueries = TestQueries;

type TestChannels = ChannelMap<Channel<'a-channel', TestEvents, TestQueries>>;

const createEventTram = (opts?: EventTramOptions) => {
  return new EventTram<TestChannels, StandAloneEvents, StandAloneQueries>(opts);
};

describe.concurrent('eventTram', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('stand-alone events', () => {
    it('publishes events asynchronously', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn();

      sut.on('scope:action', mock);
      sut.publish('scope:action', { payload: 'test' });
      vi.advanceTimersToNextTimer();

      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith({ payload: 'test' });
    });

    it('publishes events synchronously', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn();

      sut.on('scope:action', mock);
      sut.publishSync('scope:action', { payload: 'test' });

      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith({ payload: 'test' });
    });

    it('notifies subscribers multiple times if using `on`', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn();

      sut.on('scope:action', mock);
      sut.publish('scope:action', { payload: 'test' });
      sut.publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it('notifies subscribers only once if using `once` instead of `on`', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn();

      sut.once('scope:action', mock);
      sut.publish('scope:action', { payload: 'test' });
      sut.publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith({ payload: 'test' });
    });

    it('removes event listeners for a specific callback', async ({ expect }) => {
      const sut = createEventTram();
      const mock1 = vi.fn();
      const mock2 = vi.fn();

      sut.on('scope:action', mock1);
      sut.on('scope:action', mock2);
      sut.publish('scope:action', { payload: 'test' });
      sut.off('scope:action', mock2);
      sut.publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock1).toHaveBeenCalledTimes(2);
      expect(mock2).toHaveBeenCalledTimes(1);
    });

    it('removes all event listeners for a specific event', async ({ expect }) => {
      const sut = createEventTram();
      const mock1 = vi.fn();
      const mock2 = vi.fn();

      sut.on('scope:action', mock1);
      sut.on('scope:action', mock2);
      sut.publish('scope:action', { payload: 'test' });
      sut.off('scope:action');
      sut.publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock1).toHaveBeenCalledTimes(1);
      expect(mock2).toHaveBeenCalledTimes(1);
    });

    it('removes all event listeners for a given callback', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn();

      sut.on('scope:action', mock);
      sut.on('scope:another-action', mock);

      sut.publish('scope:action', { payload: 'action' });
      sut.publish('scope:another-action', { payload: 'another-action' });
      sut.off(mock);
      sut.publish('scope:action', { payload: 'action' });
      sut.publish('scope:another-action', { payload: 'another-action' });

      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(2);
      expect(mock).toHaveBeenNthCalledWith(1, { payload: 'action' });
      expect(mock).toHaveBeenNthCalledWith(2, { payload: 'another-action' });
    });

    it('gracefully publishes events with no active subscribers', async () => {
      const sut = createEventTram();
      sut.publish('scope:action', { payload: 'test' });
    });

    it('handles no subscribers when unsubscribing', ({ expect }) => {
      const sut = createEventTram();
      // @ts-expect-error
      expect(() => sut.off('non-existent-event')).not.toThrow();
    });

    it('can be extended by registering extra events on the fly', async ({ expect }) => {
      const _sut = createEventTram();
      type BEvent = Event<'b-event', { payload: string }>;
      const sut = _sut.registerEvents<EventMap<BEvent>>();
      const mock = vi.fn();

      sut.on('b-event', mock);
      sut.publish('b-event', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith({ payload: 'test' });
    });
  });

  describe('channels', () => {
    it('scopes events based on the chosen channel', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn();

      sut.channel('a-channel').on('scope:action', mock);
      sut.publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(0);

      sut.channel('a-channel').publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith({ payload: 'test' });
    });

    it('can be extended by registering extra channels on the fly', async ({ expect }) => {
      const _sut = createEventTram();
      const mockAChannel = vi.fn();
      const mockBCChannel = vi.fn();

      type BChannel = Channel<'b-channel', TestEvents>;
      const sut = _sut.registerChannel<BChannel>();

      sut.channel('a-channel').on('scope:action', mockAChannel);
      sut.channel('b-channel').on('scope:action', mockBCChannel);

      sut.channel('b-channel').publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mockAChannel).toHaveBeenCalledTimes(0);
      expect(mockBCChannel).toHaveBeenCalledTimes(1);
      expect(mockBCChannel).toHaveBeenCalledWith({ payload: 'test' });
    });
  });

  describe('queries and replies', () => {
    it('replies to sync queries', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn(val => `reply: ${val}`);

      sut.reply('scope:query', mock);
      const result = sut.query('scope:query', '1');
      vi.advanceTimersToNextTimer();

      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith('1');
      expect(result).toEqual('reply: 1');
    });

    it('replies to queries that have async reply callbacks', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn(val => Promise.resolve(`reply: ${val}`));

      sut.reply('scope:async-query', mock);
      const result = await sut.query('scope:async-query', '1');

      vi.advanceTimersToNextTimer();

      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith('1');
      expect(result).toEqual('reply: 1');
    });

    it('replies to a query with no arguments', async ({ expect }) => {
      const sut = createEventTram();
      const mock = vi.fn(() => 'reply');

      sut.reply('scope:query', mock);
      const result = sut.query('scope:query');
      vi.advanceTimersToNextTimer();

      expect(mock).toHaveBeenCalledTimes(1);
      expect(result).toEqual('reply');
    });

    it('can be extended by registering extra queries on the fly', async ({ expect }) => {
      const _sut = createEventTram();
      type BQuery = Query<'b-query', (val: string) => string>;
      const sut = _sut.registerQueries<QueryMap<BQuery>>();
      const mock = vi.fn(val => `reply: ${val}`);
      sut.reply('b-query', mock);
      const result = sut.query('b-query', '1');
      vi.advanceTimersToNextTimer();
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith('1');
      expect(result).toEqual('reply: 1');
    });
  });

  describe('error propagation with throwImmediately', () => {
    it('notifies all subscribers even if one of them throws an error', async ({ expect }) => {
      const sut = createEventTram();
      const mock1 = vi.fn(() => {
        throw new Error('mock1 error');
      });
      const mock2 = vi.fn();

      sut.on('scope:action', mock1);
      sut.on('scope:action', mock2);
      sut.publish('scope:action', { payload: 'test' });

      vi.advanceTimersToNextTimer();
      expect(mock1).toHaveBeenCalledTimes(1);
      expect(mock1).toThrow();

      expect(mock2).toHaveBeenCalledTimes(1);
      expect(mock2).not.toThrow();
    });

    it('throws immediately if an error is thrown from inside a callback when throwImmediately is true', ({
      expect,
    }) => {
      const sut = createEventTram({ throwImmediately: true });
      const mock1 = vi.fn(() => {
        throw new Error('mock1 error');
      });
      const mock2 = vi.fn();

      try {
        sut.on('scope:action', mock1);
        sut.on('scope:action', mock2);
        sut.publish('scope:action', { payload: 'test' });

        vi.advanceTimersToNextTimer();
      } catch (e: any) {
        expect(e.message).toEqual('mock1 error');
      }

      expect(mock1).toHaveBeenCalledTimes(1);
      expect(mock1).toThrowError();
      expect(mock2).toHaveBeenCalledTimes(0);
    });
  });

  describe('notify strategies', () => {
    it('accepts and uses an injected notify strategy', async ({ expect }) => {
      const notifyStrategy = {
        init: vi.fn(),
        onNotifySubscribers: vi.fn(),
        notifySubscribers: vi.fn(),
        query: vi.fn(),
      } satisfies NotifyStrategy;

      const sut = createEventTram({ notifyStrategy });
      expect(notifyStrategy.init).toHaveBeenCalledTimes(1);
      expect(notifyStrategy.onNotifySubscribers).toHaveBeenCalledTimes(1);

      sut.publish('scope:action', { payload: 'test' });

      expect(notifyStrategy.notifySubscribers).toHaveBeenCalledTimes(1);
      expect(notifyStrategy.notifySubscribers.mock.calls[0]?.[0]['event']).toEqual('scope:action');
      expect(notifyStrategy.notifySubscribers.mock.calls[0]?.[0]['payload']).toEqual({ payload: 'test' });
    });

    it('accepts and uses a broadcastChannel-based strategy', async ({ expect }) => {
      const strategy = new BroadcastChannelNotifyStrategy('id123');
      const notifySpy = vi.spyOn(strategy, 'notifySubscribers');
      const sut = createEventTram({ notifyStrategy: strategy });
      sut.publish('scope:action', { payload: 'test' });
      expect(notifySpy).toHaveBeenCalledWith({ event: 'scope:action', payload: { payload: 'test' }, sync: false });
    });
  });

  describe('types', () => {
    it('converts a channel or eventTram to readonly', async () => {
      const _sut = createEventTram();
      const sut = _sut.readonly;
      // @ts-expect-error - no publish
      sut.publish;
      // @ts-expect-error - no reply
      sut.reply;
    });

    it('converts a channel or eventTram to writeonly', async () => {
      const _sut = createEventTram();
      const sut = _sut.writeonly;
      // @ts-expect-error - no on
      sut.on;
      // @ts-expect-error - no query
      sut.query;
    });

    it('suggests events that are part of the event map', async () => {
      const sut = createEventTram();
      expectTypeOf(sut.on).parameter(0).toEqualTypeOf<'scope:action' | 'scope:another-action'>();
    });

    it('warns for unknown events', async () => {
      const sut = createEventTram();
      const mock = vi.fn();
      // @ts-expect-error - unknown event
      sut.on('scope:unknown', mock);
    });

    it('suggests channels that are part of the channel map', async () => {
      const sut = createEventTram();
      expectTypeOf(sut.channel).parameter(0).toEqualTypeOf<'a-channel'>();
    });

    it('warns for unknown channels', async () => {
      const sut = createEventTram();
      // @ts-expect-error - unknown channel
      sut.channel('unknown-channel');
    });

    it('suggests queries that are part of the query map', async () => {
      const sut = createEventTram();
      expectTypeOf(sut.query).parameter(0).toEqualTypeOf<'scope:query' | 'scope:async-query'>();
      expectTypeOf(sut.reply).parameter(0).toEqualTypeOf<'scope:query' | 'scope:async-query'>();
    });

    it('infers correct type for a query return', async () => {
      const sut = createEventTram();
      const mock = vi.fn();
      sut.reply('scope:query', mock);
      sut.reply('scope:async-query', mock);
      expectTypeOf(sut.query('scope:query')).toEqualTypeOf<string>();
      expectTypeOf(sut.query('scope:async-query', '1')).toEqualTypeOf<Promise<string>>();
    });

    it('infers correct type for a reply callback argument', async () => {
      const sut = createEventTram();

      sut.reply('scope:query', param => {
        expectTypeOf(param).toEqualTypeOf<string | undefined>();
        return param || '';
      });

      sut.reply('scope:async-query', param => {
        expectTypeOf(param).toEqualTypeOf<string>();
        return Promise.resolve(param);
      });
    });

    it('warns for unknown queries', async () => {
      const sut = createEventTram();
      const mock = vi.fn();
      // @ts-expect-error - unknown query
      sut.reply('scope:unknown', mock);
      // @ts-expect-error - unknown query
      sut.query('scope:unknown');
    });
  });
});
