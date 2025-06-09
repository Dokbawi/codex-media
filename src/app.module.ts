import { Module } from '@nestjs/common';
import { VideoModule } from './video/video.module';
import { mognoDBConfig } from './settings/dotenv-options';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot(
      `mongodb://${mognoDBConfig.user}:${mognoDBConfig.password}@localhost:27017`,
      {
        dbName: mognoDBConfig.dbName,
      },
    ),
    VideoModule,
  ],
})
export class AppModule {}
