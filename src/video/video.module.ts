import { Module } from '@nestjs/common';
import { VideoService } from './video.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { GcpStorageModule } from 'src/gcp/gcp-storage.module';
import { VideoProcessingService } from './video-processing.service';
import { rabbitMQConfig } from 'src/settings/dotenv-options';
import { MongooseModule } from '@nestjs/mongoose';
import { Video, VideoSchema } from 'libs/mongo-schemas/video';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Video.name, schema: VideoSchema }]),

    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        urls: [rabbitMQConfig.url],
        uri: rabbitMQConfig.url,
        exchanges: [
          {
            name: 'video_exchange',
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
