import { Module } from '@nestjs/common';
import { BotMessageBuilderController, MessageBuilderController } from './message-builder.controller';
import { MessageBuilderService } from './message-builder.service';
import { MessageBuilderSendService } from './message-builder-send.service';
import { WebhookClient } from './webhook-client';
import { MessageBuilderMessagesService } from './message-builder-messages.service';

/** Embed Builder (Discohook-artiger Editor): Entwürfe, Vorlagen, JSON, Versand über den Bot, optional Webhooks, Historie, gesendete Nachrichten bearbeiten. */
@Module({ controllers: [MessageBuilderController, BotMessageBuilderController], providers: [MessageBuilderService, MessageBuilderSendService, MessageBuilderMessagesService, WebhookClient], exports: [MessageBuilderSendService] })
export class MessageBuilderModule {}
