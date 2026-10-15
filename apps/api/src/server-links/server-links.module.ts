import { Global, Module } from '@nestjs/common';
import { ServerLinksController } from './server-links.controller';
import { ServerLinksService } from './server-links.service';

@Global()
@Module({ controllers: [ServerLinksController], providers: [ServerLinksService], exports: [ServerLinksService] })
export class ServerLinksModule {}
