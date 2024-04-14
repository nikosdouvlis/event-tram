export interface NotifyStrategy<T extends unknown = any> {
    init(repliers: Record<any, any>): void;
    notifySubscribers(data: T): void;
    onNotifySubscribers(callback: (data: T) => void): void;
    query(query: string, ...params: any[]): any;
}

export class NotifyStrategyBase {
    protected repliers: Record<string, Function> = {};

    init(repliers: Record<any, any>) {
        this.repliers = repliers;
    }
}
