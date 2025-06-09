import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as ffmpeg from 'fluent-ffmpeg';
import { Video } from 'libs/mongo-schemas/video';
import { VideoLog } from 'libs/mongo-schemas/video/videoLog';
import { Model } from 'mongoose';
import * as fs from 'fs/promises';

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    @InjectModel(VideoLog.name) private videoLogModel: Model<VideoLog>,
    @InjectModel(Video.name) private videoModel: Model<Video>,
  ) {}

  public async saveVideoLog(
    videoId: string,
    step: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
    durationMs?: number,
  ): Promise<void> {
    try {
      const importantSteps = [
        'validation_failed',
        'validation_error',
        'processing_start',
        'processing_complete',
        'processing_error',
        'encoding_error',
        'status_update',
      ];

      if (
        level === 'error' ||
        level === 'warn' ||
        importantSteps.includes(step)
      ) {
        await this.videoLogModel.create({
          videoId,
          step,
          message,
          level,
          durationMs,
          timestamp: new Date(),
        });
      }

      this.logger.log(`[${videoId}] ${step}: ${message}`);
    } catch (error) {
      this.logger.error(`로그 저장 실패: ${error.message}`);
    }
  }

  public async updateVideoStatus(
    videoId: string,
    status: 'pending' | 'processing' | 'done' | 'failed',
  ): Promise<void> {
    try {
      await this.videoModel.findByIdAndUpdate(videoId, { status });
      await this.saveVideoLog(videoId, 'status_update', `상태: ${status}`);
    } catch (error) {
      this.logger.error(`비디오 상태 업데이트 실패: ${error.message}`);
    }
  }

  private async validateVideoFile(
    inputPath: string,
    videoId: string,
  ): Promise<boolean> {
    try {
      const stats = await fs.stat(inputPath);
      if (!stats.isFile() || stats.size < 1024) {
        await this.saveVideoLog(
          videoId,
          'validation_failed',
          '파일 검증 실패',
          'error',
        );
        return false;
      }

      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > 500) {
        await this.saveVideoLog(
          videoId,
          'validation_failed',
          `파일 크기 초과: ${fileSizeMB.toFixed(1)}MB`,
          'error',
        );
        return false;
      }

      return true;
    } catch (error) {
      await this.saveVideoLog(
        videoId,
        'validation_error',
        `검증 오류: ${error.message}`,
        'error',
      );
      return false;
    }
  }

  private async analyzeVideo(
    inputPath: string,
    videoId: string,
  ): Promise<{
    metadata: any;
    audioLevels?: { maxVolume: number; meanVolume: number };
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, async (err, metadata) => {
        if (err) {
          await this.saveVideoLog(
            videoId,
            'analysis_error',
            `분석 실패: ${err.message}`,
            'error',
          );
          reject(err);
          return;
        }

        const audioStream = metadata.streams.find(
          (s) => s.codec_type === 'audio',
        );

        if (!audioStream) {
          resolve({ metadata });
          return;
        }

        const duration = metadata.format.duration;
        if (duration > 300) {
          // 5분 이상인 경우만 오디오 분석
          resolve({ metadata });
          return;
        }

        let audioLevels: { maxVolume: number; meanVolume: number } | undefined;

        ffmpeg(inputPath)
          .audioFilters('volumedetect')
          .format('null')
          .on('stderr', (stderrLine) => {
            if (stderrLine.includes('max_volume')) {
              const maxVolumeMatch = stderrLine.match(
                /max_volume: (-?\d+\.?\d*) dB/,
              );
              const meanVolumeMatch = stderrLine.match(
                /mean_volume: (-?\d+\.?\d*) dB/,
              );

              if (maxVolumeMatch && meanVolumeMatch) {
                audioLevels = {
                  maxVolume: parseFloat(maxVolumeMatch[1]),
                  meanVolume: parseFloat(meanVolumeMatch[1]),
                };
              }
            }
          })
          .on('end', () => resolve({ metadata, audioLevels }))
          .on('error', () => resolve({ metadata })) // 오디오 분석 실패해도 계속 진행
          .save('-');
      });
    });
  }

  /**
   * 간소화된 오디오 필터
   */
  private generateAudioFilters(audioLevels?: {
    maxVolume: number;
    meanVolume: number;
  }): string[] {
    if (audioLevels && audioLevels.meanVolume < -20) {
      const boostAmount = Math.min(-audioLevels.meanVolume - 12, 15); // 부스트 제한
      return [
        `volume=${boostAmount}dB`,
        'afftdn=nr=15:nf=-35', // 노이즈 제거 간소화
        'loudnorm=I=-16:TP=-1.5:LRA=11',
      ];
    }

    // 기본 필터만 적용
    return ['loudnorm=I=-16:TP=-1.5:LRA=11'];
  }

  private calculateOptimalBitrate(
    duration: number,
    targetWidth: number,
    targetHeight: number,
  ): { videoBitrate: number; audioBitrate: string } {
    const pixelCount = targetWidth * targetHeight;

    let videoBitrate: number;
    let audioBitrate: string;

    // 간단한 룩업 테이블 방식
    if (pixelCount <= 640 * 480) {
      videoBitrate = 600;
      audioBitrate = '64k';
    } else if (pixelCount <= 1280 * 720) {
      videoBitrate = duration > 600 ? 1000 : 1200;
      audioBitrate = '80k';
    } else {
      videoBitrate = duration > 600 ? 1500 : 1800;
      audioBitrate = '96k';
    }

    return { videoBitrate, audioBitrate };
  }

  /**
   * 단순화된 해상도 계산
   */
  private calculateOptimalResolution(
    originalWidth: number,
    originalHeight: number,
    duration: number,
  ): { width: number; height: number } {
    let maxWidth: number, maxHeight: number;

    // 간단한 분기
    if (duration > 600) {
      maxWidth = 1280;
      maxHeight = 720;
    } else if (duration > 300) {
      maxWidth = 1600;
      maxHeight = 900;
    } else {
      maxWidth = 1920;
      maxHeight = 1080;
    }

    const scaleX = maxWidth / originalWidth;
    const scaleY = maxHeight / originalHeight;
    const scale = Math.min(scaleX, scaleY, 2.0); // 최대 2배까지만

    const width = Math.floor((originalWidth * scale) / 8) * 8; // 8의 배수로 정렬
    const height = Math.floor((originalHeight * scale) / 8) * 8;

    return { width, height };
  }

  async upscaleVideo(
    inputPath: string,
    outputPath: string,
    videoId?: string,
  ): Promise<string> {
    const totalStartTime = Date.now();

    try {
      if (videoId) {
        await this.updateVideoStatus(videoId, 'processing');
        await this.saveVideoLog(videoId, 'processing_start', '처리 시작');
      }

      // 빠른 검증
      if (videoId && !(await this.validateVideoFile(inputPath, videoId))) {
        throw new Error('파일 검증 실패');
      }

      // 통합된 분석
      const { metadata, audioLevels } = await this.analyzeVideo(
        inputPath,
        videoId,
      );

      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video',
      );
      const audioStream = metadata.streams.find(
        (s) => s.codec_type === 'audio',
      );

      if (!videoStream) {
        throw new Error('비디오 스트림 없음');
      }

      const originalWidth = videoStream.width;
      const originalHeight = videoStream.height;
      const duration = metadata.format.duration;

      // 해상도 및 비트레이트 계산
      const { width: targetWidth, height: targetHeight } =
        this.calculateOptimalResolution(
          originalWidth,
          originalHeight,
          duration,
        );

      const { videoBitrate, audioBitrate } = this.calculateOptimalBitrate(
        duration,
        targetWidth,
        targetHeight,
      );

      // 단일 패스 인코딩
      const command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .videoBitrate(videoBitrate)
        .addOptions([
          '-preset',
          'veryfast', // 더 빠른 preset
          '-crf',
          '28', // 품질 약간 낮춤 (속도 향상)
          '-movflags',
          '+faststart',
          '-pix_fmt',
          'yuv420p',
        ]);

      // 비디오 필터 (간소화)
      const videoFilters = [
        `scale=${targetWidth}:${targetHeight}:flags=lanczos`,
      ];
      command.videoFilters(videoFilters);

      // 오디오 처리
      if (audioStream) {
        const audioFilters = this.generateAudioFilters(audioLevels);
        command
          .audioFilters(audioFilters)
          .audioCodec('aac')
          .audioBitrate(audioBitrate);
      } else {
        command.noAudio();
      }

      return new Promise((resolve, reject) => {
        command
          .on('end', async () => {
            const totalTime = Date.now() - totalStartTime;
            if (videoId) {
              await this.saveVideoLog(
                videoId,
                'processing_complete',
                `완료 (${(totalTime / 1000).toFixed(1)}s)`,
                'info',
                totalTime,
              );
              await this.updateVideoStatus(videoId, 'done');
            }
            resolve(outputPath);
          })
          .on('error', async (err) => {
            const totalTime = Date.now() - totalStartTime;
            if (videoId) {
              await this.saveVideoLog(
                videoId,
                'encoding_error',
                `실패: ${err.message}`,
                'error',
                totalTime,
              );
              await this.updateVideoStatus(videoId, 'failed');
            }
            reject(err);
          })
          .save(outputPath);
      });
    } catch (error) {
      const totalTime = Date.now() - totalStartTime;
      if (videoId) {
        await this.saveVideoLog(
          videoId,
          'processing_error',
          `오류: ${error.message}`,
          'error',
          totalTime,
        );
        await this.updateVideoStatus(videoId, 'failed');
      }
      throw error;
    }
  }
}
