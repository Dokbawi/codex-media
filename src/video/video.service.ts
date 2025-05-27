import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { join } from 'path';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';
import { GcpStorageService } from '../gcp/gcp-storage.service';
import { VideoUploadDto } from './dto/video-upload.dto';
import axios from 'axios';
import { VideoProcessingService } from './video-processing.service';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly processingDir: string;

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly gcpStorageService: GcpStorageService,
    private readonly videoProcessingService: VideoProcessingService,
  ) {
    this.processingDir = join(process.cwd(), 'video-processing');
    fs.mkdir(this.processingDir, { recursive: true }).catch((err) => {
      this.logger.error(`처리 디렉토리 생성 실패: ${err.message}`);
    });
  }

  @RabbitSubscribe({
    exchange: 'video_exchange',
    routingKey: 'video.processing',
    queue: 'video.processing.queue',
  })
  async handleVideoProcessRequest(msg: any) {
    this.logger.log(`영상 처리 요청 수신: ${JSON.stringify(msg)}`);

    const { callbackQueue, senderId, serverId, videoUrl, channelId } =
      msg.data as VideoUploadDto;
    const response = {
      videoId: `video_${Date.now()}`,
      success: false,
      processedFilePath: '',
      thumbnailFilePath: '',
      channelId,
      error: '',
    };

    try {
      const bucketName = 'bucket-video-winter-cat';
      const tempFileName = `temp_${Date.now()}.mp4`;
      const localTempPath = path.join(this.processingDir, tempFileName);
      const localOutPutTempPath = path.join(
        this.processingDir,
        `output_${tempFileName}`,
      );

      const res = await axios.get(videoUrl.trim(), {
        responseType: 'arraybuffer',
      });
      await fs.writeFile(localTempPath, Buffer.from(res.data));

      this.logger.log(`임시 파일 다운로드 완료: ${localTempPath}`);

      const upscaledVideoPath = await this.videoProcessingService.upscaleVideo(
        localTempPath,
        localOutPutTempPath,
      );

      const signedUrl = await this.gcpStorageService.uploadVideo(
        bucketName,
        upscaledVideoPath,
      );

      try {
        await fs.unlink(upscaledVideoPath);
        await fs.unlink(localTempPath);
        this.logger.log(
          `로컬 임시 파일 삭제 완료: ${upscaledVideoPath} ${localTempPath}`,
        );
      } catch (err) {
        this.logger.error(`로컬 임시 파일 삭제 실패: ${err.message}`);
      }

      response.success = true;
      response.processedFilePath = signedUrl;

      this.amqpConnection.publish('video_exchange', callbackQueue, response);
    } catch (error) {
      this.logger.error(`영상 처리 실패: ${error.message}`, error.stack);
      response.error = error.message;
      this.amqpConnection.publish('video_exchange', callbackQueue, response);
    }
  }
}
