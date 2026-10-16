import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RadioWhitelistService } from './radio-whitelist.service';
/** Funk-Whitelist (externer Funkdienst). Jede Minute: abgelaufene Freigaben und Sperrfristen speichern. */
export declare class RadioModule implements OnModuleInit, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: RadioWhitelistService);
    onModuleInit(): void;
    onModuleDestroy(): void;
}
