import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { join } from 'path';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GcpStorageService } from '../gcp/gcp-storage.service';
import { VideoUploadDto } from './dto/video-upload.dto';
import axios from 'axios';
import { VideoProcessingService } from './video-processing.service';
import { InjectModel } from '@nestjs/mongoose';
import { Video } from 'libs/mongo-schemas/video';
import { Model } from 'mongoose';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly processingDir: string;

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly gcpStorageService: GcpStorageService,
    private readonly videoProcessingService: VideoProcessingService,
    @InjectModel(Video.name) private videoModel: Model<Video>,
  ) {
    this.processingDir = join(process.cwd(), 'video-processing');
    this.initProcessingDir();
  }

  private async initProcessingDir() {
    try {
      await fs.mkdir(this.processingDir, { recursive: true });
    } catch (err) {
      this.logger.error(`처리 디렉토리 생성 실패: ${err.message}`);
    }
  }

  @RabbitSubscribe({
    exchange: 'video_exchange',
    routingKey: 'video.processing',
    queue: 'video.processing.queue',
  })
  async handleVideoProcessRequest(msg: any) {
    this.logger.log(`영상 처리 요청: ${JSON.stringify(msg)}`);

    const { callbackQueue, senderId, serverId, videoUrl, channelId } =
      msg.data as VideoUploadDto;
    let videoId: string | null = null;
    let localTempPath = '';
    let localOutputTempPath = '';

    const response = {
      videoId: '',
      success: false,
      processedFilePath: '',
      thumbnailFilePath: '',
      channelId,
      error: '',
    };

    try {
      if (!videoUrl?.trim() || !/^https?:\/\/.+/.test(videoUrl.trim())) {
        throw new Error('유효하지 않은 비디오 URL');
      }

      const videoRecord = await this.videoModel.create({
        serverId,
        uploaderId: senderId,
        url: videoUrl.trim(),
        status: 'pending',
      });

      videoId = videoRecord._id.toString();
      response.videoId = videoId;

      const tempFileName = `${videoId}_${Date.now()}.mp4`;
      localTempPath = path.join(this.processingDir, tempFileName);
      localOutputTempPath = path.join(
        this.processingDir,
        `out_${tempFileName}`,
      );

      const [videoResponse] = await Promise.all([
        this.downloadVideo(videoUrl.trim(), videoId),
        this.videoProcessingService.updateVideoStatus(videoId, 'processing'),
      ]);

      await fs.writeFile(localTempPath, Buffer.from(videoResponse.data));

      await this.videoProcessingService.upscaleVideo(
        localTempPath,
        localOutputTempPath,
        videoId,
      );

      const bucketName = 'bucket-video-winter-cat';
      const signedUrl = await this.gcpStorageService.uploadVideo(
        bucketName,
        localOutputTempPath,
      );

      await this.videoModel.findByIdAndUpdate(videoId, {
        url: signedUrl,
        status: 'done',
      });

      response.success = true;
      response.processedFilePath = signedUrl;

      this.logger.log(`비디오 처리 완료: ${videoId}`);
    } catch (error) {
      this.logger.error(`영상 처리 실패: ${error.message}`);

      if (videoId) {
        await this.videoProcessingService.saveVideoLog(
          videoId,
          'request_failed',
          error.message,
          'error',
        );

        try {
          await this.videoModel.findByIdAndUpdate(videoId, {
            status: 'failed',
          });
        } catch (updateError) {
          this.logger.error(`상태 업데이트 실패: ${updateError.message}`);
        }
      }

      response.error = error.message;
      response.success = false;
    } finally {
      await this.cleanupFiles([localTempPath, localOutputTempPath]);

      this.amqpConnection.publish('video_exchange', callbackQueue, response);
    }
  }

  private async downloadVideo(videoUrl: string, videoId: string) {
    try {
      const response = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 45000,
        maxContentLength: 500 * 1024 * 1024,
        maxRedirects: 3,
      });

      const size = response.data.length;

      await this.videoProcessingService.saveVideoLog(
        videoId,
        'download_complete',
        `다운로드 완료: ${(size / (1024 * 1024)).toFixed(1)}MB`,
      );

      return response;
    } catch (error) {
      let errorMsg = '다운로드 실패';

      if (error.code === 'ECONNABORTED') {
        errorMsg = '다운로드 타임아웃';
      } else if (error.response?.status === 404) {
        errorMsg = '파일을 찾을 수 없음';
      } else if (error.response?.status === 403) {
        errorMsg = '접근 권한 없음';
      } else if (error.message) {
        errorMsg = error.message;
      }

      throw new Error(errorMsg);
    }
  }

  private async cleanupFiles(filePaths: string[]) {
    const cleanupPromises = filePaths
      .filter((path) => path)
      .map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (error) {}
      });

    cleanupPromises.push(
      fs.unlink('ffmpeg2pass-0.log').catch(() => {}),
      fs.unlink('ffmpeg2pass-0.log.mbtree').catch(() => {}),
    );

    await Promise.all(cleanupPromises);
  }
}
