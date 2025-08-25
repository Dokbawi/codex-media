import { Module } from '@nestjs/common';
import { VideoModule } from './video/video.module';
import { mognoDBConfig, mongoDB } from './settings/dotenv-options';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot(mongoDB.url(), {
      dbName: mognoDBConfig.dbName,
    }),
    VideoModule,
  ],
})
export class AppModule {}
