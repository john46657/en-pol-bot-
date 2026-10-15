import { Module } from '@nestjs/common';
import { BotMessageBuilderController, MessageBuilderController } from './message-builder.controller';
import { MessageBuilderService } from './message-builder.service';
import { MessageBuilderSendService } from './message-builder-send.service';
import { WebhookClient } from './webhook-client';

/** Discord Message Builder (Discohook-artiger Editor): Entwürfe, Vorlagen, Versand über den Bot, optional Webhooks, Historie. */
@Module({ controllers: [MessageBuilderController, BotMessageBuilderController], providers: [MessageBuilderService, MessageBuilderSendService, WebhookClient], exports: [MessageBuilderSendService] })
export class MessageBuilderModule {}
