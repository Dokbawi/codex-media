import { Module } from '@nestjs/common';
import { VideoService } from './video.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { GcpStorageModule } from 'src/gcp/gcp-storage.module';
import { VideoProcessingService } from './video-processing.service';

@Module({
  imports: [
    ConfigModule,
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        urls: [configService.get<string>('RABBITMQ_URL')],
        uri: configService.get<string>('RABBITMQ_URL'),
        exchanges: [
          {
            name: configService.get<string>('RABBITMQ_EXCHANGE'),
            type: 'topic',
          },
        ],
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: true,
      }),
    }),
    GcpStorageModule,
  ],
  providers: [VideoService, VideoProcessingService],
})
export class VideoModule {}
