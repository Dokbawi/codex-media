import { Global, Module } from '@nestjs/common';
import { VideoModule } from './video/video.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { VideoService } from './video/video.service';

@Module({
  imports: [VideoModule],
})
export class AppModule {}
