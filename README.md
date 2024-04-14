<p align="center" width="100%">
    <img src="https://github.com/nikosdouvlis/event-tram/blob/main/event-tram.jpg?raw=true" />
</p>

## Contents
  * [Intro](#intro)
  * [Installation](#installation)
  * [Usage](#usage)
    * [Simple event bus with standalone events (no channels)](#simple-event-bus-with-standalone-events-no-channels)
    * [Event bus with channels](#event-bus-with-channels)
    * [Readonly and writeonly channels](#readonly-and-writeonly-channels)
    * [Queries](#queries)
    * [Cross-tab communication](#cross-tab-communication)
    * [Register new channels, events or queries on the fly](#register-new-channels-events-or-queries-on-the-fly)
  * [Future improvements](#future-improvements)
  * [FAQ](#faq)
  * [Further reading](#further-reading)

## Intro
🚨 This is a pre-release version, `event-tram` is still under active development and the API might change 🚨 

EventTram is a topic-based publish/subscribe library with full Typescript support. Even though it is inspired by
`Backbone Events` and `Backbone Radio`, `EventTram` introduces some new concepts aiming to improve flexibility, predictability, maintainability and type-safety:

- **Channels**: A channel is a way to group events. This is useful when you want to namespace your events but also make sure that these events can only be published/subscribed only by the consumers that need them. Channels can be used to isolate topics and consumers from each other.
- **Readonly and writeonly channels**: By leveraging Typescript types, EventTram allows you to create channels that can only be published to or subscribed to. This is useful when you want to enforce a unidirectional data flow in your application.
- **Queries**: Queries provide uniform way for unrelated parts of the system to communicate with each other, either by requesting data or triggering actions to be performed. The different between queries and normal events is that, queries are pull-based. If a part of the codebase requires immediate access to data or an action, it can use a query instead of depending on a different module. This lets EventTram be the common dependency, decoupling modules from each other even when direct access is required. 
- **Cross-tab communication**: EventTram provides a way to communicate between tabs with the same origin. This is useful when you want to synchronize state between tabs or trigger actions in other tabs.
- **Typed contracts**: All events, payloads, channels and queries are defined on the type-level by default. There is no need to use constants as your event identifiers or use event factories.
- **Register new channels and events on the fy**: EventTram allows you to register new channels and events on the fly. This is useful when you want to dynamically add new features, eg: plugins, to your application that your main EventTram instance does not know about during the initialisation phase.
- **Synchronisation decoupling**: Even though EventTram supports synchronous publishing of events using the `publishSync` method, the default behavior is to publish events asynchronously to enable proper synchronisation decoupling. All events will be published at the end of the current event loop. This helps keep the codebase predictable as the originator of topics will not be blocked while consumers process them.

The library was written with bundle-size in mind. The final bundle-size is now approximately 600bytes in size (minified and gzipped) and another ~300bytes for the cross-tab support strategy, if required. All strict checks exist on the TS-level only so nothing ends up in the final bundle. Events, channels and queries are defined on the type level as well. Adding a new event, channel or query has minimal impact on the bundle size, especially when the final bundle is minified and gzipped.

## Installation
Simply run
```
npm i event-tram
```

## Usage
 
> 📘 Note: 
> The EventTram is a Channel that also let's you create other channels. Anything that can be used on a Channel, can also be used on the root EventTram instance, eg: `eventTram.channel('auth').on(...)` and `eventTram.on(...)`

Simply define the types, channels and queries using the type helper and instantiate an `EventTram` object. This object will usually be exported from a well-known module in your application. You can create as many EventTram instances as you need, or use a single instance and channels to namespace your events. 

For more details about the configuration options, refer to the inline JSDoc comments in the code.

### Simple event bus with standalone events (no channels)
Use `Event` to define an event - an event is described by a key and an optional payload. Use `EventMap` to define a group of events.

```ts
import type { Event, EventMap } from 'event-tram';
import { EventTram } from 'event-tram';

// Use Event and EventMap to define your events
type TokenEvents = EventMap<
  | Event<'token:fetchStart'> //
  | Event<'token:fetchEnd', { token: string }> //
>;

export const eventTram = new EventTram<never,TokenEvents>();

// Listen to an event
eventTram.on('token:fetchEnd', ({ token }) => {
  // The argument is typed based on the event payload
});

// Publish an event
// The event payload is typed based on the event definition
eventTram.publish('token:fetchEnd', { token: '123' });
```

### Event bus with channels
Similar to the above, but with channels. Use `Channel` to define a channel - a channel is described by a key, an `EventMap` and an optional `QueryMap`. Use `ChannelMap` to define a group of channels. 

```ts
import type { Event, EventMap } from 'event-tram';
import { EventTram } from 'event-tram';

// Use Event and EventMap to define your events
type TokenEvents = EventMap<
  | Event<'token:fetchStart'> //
  | Event<'token:fetchEnd', { token: string }> //
>;

type AuthEvents = EventMap<
  | Event<'auth:login'> //
  | Event<'auth:logout'> //
>;

// Use Channel and ChannelMap to define your channels
export type AllChannels = ChannelMap<
  | Channel<'token', TokenEvents> //
  | Channel<'auth', AuthEvents> //
>

export const eventTram = new EventTram<AllChannels>();

// Access a channel, TS here will only allow known channels
// Same as before, everything is typed based on the Event and Channel definitions
eventTram.channel('token').on('token:fetchEnd', ({ token }) => {});
eventTram.channel('token').publish('token:fetchEnd', { token: '123' });
```

### Readonly and writeonly channels
Most of the time, one service will be producing events and many other services will be consumers of those events. To enforce this unidirectional data flow, EventTram allows you to create channels that can only be published to or subscribed to.
Use the `ReadonlyChannel` and `WriteonlyChannel`, or the `.readonly` and `.writeonly` methods on any channels to control the access to the channel.

> 📘 Note
>
> Notice that in the examples below, the services depend on the channel interface and not the actual implementation. This allows for better decoupling and testability, as implementation can be injected at runtime. When testing, there is no need to mock the main EventTram instance of your app, simply pass your own mock implementation.

The following example expands on the previous example and shows alternative syntax for creating a channel and accessing it.

Define a `consumer-service.ts` service that can only subscribe to events:
```ts
// 
import type { ReadonlyChannel } from 'event-tram';
import type { AllChannels } from './event-bus';

class ConsumerService {
  constructor(private tokenChannel: ReadonlyChannel<AllChannels['token']>) {
    // Only allowed to subscribe to events, cannot publish
    this.tokenChannel.on('token:fetchEnd', ({ token }) => {});
  }
}
```

Define a `publisher-service.ts` service that can only publish events:
```ts
// pulisher-service.ts
import type { AllChannels } from './event-bus';

class PublisherService {
  // Alternative syntax, can also be written as WriteonlyChannel<AllChannels['token']>
  constructor(private tokenChannel: AllChannels['token']['writeonly']) {
    // Only allowed to publish events, cannot subscribe
    this.tokenChannel.publish('token:fetchEnd', { token: '123' });
  }
}
```

Finally, wire everything up:
```ts
import { eventTram } from './event-bus';
import { ConsumerService } from './consumer-service';
import { PublisherService } from './publisher-service';

// .writeonly and .readonly methods are optional here and can be skipped
// as strictness is enforced on the ctor level
const publisherService = new PublisherService(eventTram.channel('token').writeonly);
const consumerService = new ConsumerService(eventTram.channel('token').readonly);
```

### Queries
Similar to the channel example, use `Query` to define a query - a query is described by a key and a typed function. The function type is used to 1. type the `reply` method and 2. type the `query` return value. Use `QueryMap` to define a group of queries.

A `query` call can also pass parameters to the corresponding `reply` function. The parameters are typed based on the query definition.
Queries can also be async.

First, define your types and instantiate the EventTram instance:
```ts
import type { Event, EventMap } from 'event-tram';
import { EventTram } from 'event-tram';

type LifecycleEvents = EventMap<
  | Event<'tab:visible'> //
  | Event<'tab:hidden'> //
>;

// Define queries
type LifecycleQueries = QueryMap<
  | Query<'tab:isUnloading', () => boolean> //
  | Query<'tab:isFocused', () => boolean> //
  | Query<'tab:isLeader', (id: string) => Promise<boolean>> //
>;

// Pass the QueryMap as the second type argument
export type AllChannels = ChannelMap<
  | Channel<'tab', LifecycleEvents, LifecycleQueries> //
>

export const eventTram = new EventTram<AllChannels>();
```

Register the `reply` handlers in a module of the codebase that manages tabs and tab-events:
```ts
// The return of the callback is going to be the result of the query() call
eventTram.channel('tab').reply('isUnloading', () => {});
// Register a callback that  accepts parameters and is async
eventTram.channel('tab').reply('isLeader', (id) => { return Promise.resolve(id === leaderId) });
```

And finally, query from a different part of the codebase without coupling it with the above:
```ts
// Get a sync response
const isUnloading = eventTram.channel('tab').query('isUnloading');
// Get an async response, also pass a parameter
const isLeader = await eventTram.channel('tab').query('isLeader', '123');
```

### Cross-tab communication
If your application requires cross-tab communication, you can use `EventTram` and inject the `BroadcastChannelNotifyStrategy` strategy to create a strongly-typed uniform API, instead of using the low-level `BroadcastChannel` class.
All normal `EventTram` features are available in the cross-tab communication channel, including channels, queries and events.

Applications that require both in-tab and cross-tab communication, need to instantiate one `EventTram` for each use-case.

**Important notes**:
- In order to avoid infinite event loops and conform to the BroadcastChannel specification, the cross-tab EventTram cannot be used to communicate with the same tab that created it.
  - Published events will not be received by the tab that published them.
  - Queries will not be received by the tab that initiated them and will timeout if no other tab responds.
- Queries always return a promise - the handler needs to be asynchronous.
- A `query` call will timeout with an error if there is no tab that registered a handler for the query. The timeout can be customised by passing a `timeout` option to the `BroadcastChannelNotifyStrategy` constructor.

The following example shows how to create a cross-tab communication channel and use it to synchronize tokens between tabs:
```ts
import type { ChannelMap, Event, EventMap, Channel, Query, QueryMap } from 'event-tram';
import { BroadcastChannelNotifyStrategy, EventTram } from 'event-tram';

type TokenEvents = EventMap<
  Event<'tokens:emitToken', { sessionId: string; token: string }> //
>;

type TokenQueries = QueryMap<
  Query<'tokens:getToken', (sessionId: string) => Promise<string>> //
>;

export type CrossTabChannels = ChannelMap<
  Channel<'tokens', TokenEvents, TokenQueries> //
>;

// Define your events, queries and channels as normal
// Instantiate and inject the BroadcastChannelNotifyStrategy
// The crossTabEventTram can now be used to communicate with other tabs
export const crossTabEventTram = new EventTram<CrossTabChannels>({
  notifyStrategy: new BroadcastChannelNotifyStrategy('cl_tabs_event_bus'),
});
```

### Register new channels, events or queries on the fly
The following example will show how to register a new channel even after instantiating the `EventTram` instance. Registering extra events and queries can be done in the same way, using the `registerEvents` and `registerQueries` methods.

In the following example, we pretend that the `BillingPlugin` module is a plugin that is added to the application at runtime. The module will register a new channel and a new event on the main EventTram instance that will be passed in to the plugin during the initialisation phase.

```ts
import type { Event, EventMap, Channel } from 'event-tram';

const BillingPlugin = (_eventTram: ApplicationEventTram) => {
  // Define the channel's events
  type NewEvents = EventMap<
    Event<'billing:init'> //
  >;

  // Define the new Billing channel
  type BillingChannel = Channel<'billing', NewEvents>;
  
  // Register the new channel on the existing EventTram instance
  const eventTram = _eventTram.registerChannel<BillingChannel>();
  
  // This will return the same instance, but with the new channel registered
  // The new channel and its events are now available
  eventTram.channel('billing').on('billing:init', () => {});
}

```


## Future improvements
WIP

## FAQ
**Q: Why name it `EventTram` instead of `EventBus`?**

**A:** All unscoped package names were already taken. The name `EventTram` is just a bad pun on `EventBus` and `Tram`.


## Further reading
- [The many faces of publish/subscribe](https://www.cs.ru.nl/~pieter/oss/manyfaces.pdf)
- [The many faces of publish/subscribe summary](http://downloads.ohohlfeld.com/talks/hohlfeld_schroeder-publish_subscribe_systems-dsmware_eurecom2007.pdf)
- [Backbone Events](https://backbonejs.org/#Events)
- [Backbone Radio](https://marionettejs.com/docs/master/backbone.radio.html)
