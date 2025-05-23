import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  private async analyzeVideoAndAudio(inputPath: string): Promise<{
    metadata: any;
    audioLevels?: { maxVolume: number; meanVolume: number };
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
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
          .on('end', () => {
            resolve({ metadata, audioLevels });
          })
          .on('error', (audioErr) => {
            this.logger.warn(`Audio analysis failed: ${audioErr.message}`);
            resolve({ metadata });
          })
          .save('-');
      });
    });
  }

  private generateAudioFilters(audioLevels?: {
    maxVolume: number;
    meanVolume: number;
  }): string[] {
    const filters: string[] = [];

    if (audioLevels) {
      if (audioLevels.meanVolume < -20) {
        const boostAmount = Math.min(-audioLevels.meanVolume - 12, 20);
        filters.push(`volume=${boostAmount}dB`);
        this.logger.log(`Boosting audio by ${boostAmount}dB`);
      }

      filters.push(
        // 노이즈 제거
        'afftdn=nr=20:nf=-40',
        // 다이나믹 레인지 압축 (작은 소리는 키우고 큰 소리는 제한)
        'acompressor=threshold=-18dB:ratio=3:attack=5:release=50',
        // 고음역 강화 (선명도 향상)
        'treble=g=2:f=8000:w=1',
        // 저음역 약간 강화
        'bass=g=1:f=100:w=0.5',
        // 정규화 (최종 볼륨 조절)
        'loudnorm=I=-16:TP=-1.5:LRA=11',
      );
    } else {
      filters.push(
        'afftdn=nr=15:nf=-35',
        'acompressor=threshold=-20dB:ratio=2:attack=5:release=50',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
      );
    }

    return filters;
  }

  private calculateOptimalBitrate(
    duration: number,
    targetSizeBytes: number = 10 * 1024 * 1024,
  ): number {
    const targetBitrate = Math.floor((targetSizeBytes * 8) / duration / 1000);
    return Math.min(targetBitrate, 3000); // 최대 3000kbps
  }

  async upscaleVideo(inputPath: string, outputPath: string): Promise<string> {
    try {
      this.logger.log('Starting video analysis...');

      const { metadata, audioLevels } =
        await this.analyzeVideoAndAudio(inputPath);

      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video',
      );
      const audioStream = metadata.streams.find(
        (s) => s.codec_type === 'audio',
      );

      if (!videoStream) {
        throw new Error('No video stream found');
      }

      const originalWidth = videoStream.width;
      const originalHeight = videoStream.height;
      const duration = metadata.format.duration;

      const targetWidth = Math.min(originalWidth * 2, 1920);
      const targetHeight = Math.min(originalHeight * 2, 1080);
      const targetBitrate = this.calculateOptimalBitrate(duration);

      this.logger.log(
        `Video specs: ${originalWidth}x${originalHeight} -> ${targetWidth}x${targetHeight}`,
      );
      this.logger.log(`Target bitrate: ${targetBitrate}kbps`);

      if (audioLevels) {
        this.logger.log(
          `Audio levels - Max: ${audioLevels.maxVolume}dB, Mean: ${audioLevels.meanVolume}dB`,
        );
      }

      const ffmpegCommand = ffmpeg(inputPath)
        .videoFilters([
          `scale=${targetWidth}:${targetHeight}:flags=lanczos`,
          'hqdn3d=2:1:2:1',
          'unsharp=5:5:0.8:3:3:0.4',
        ])
        .videoBitrate(targetBitrate)
        .format('mp4');

      if (audioStream) {
        const audioFilters = this.generateAudioFilters(audioLevels);
        ffmpegCommand
          .audioFilters(audioFilters)
          .audioCodec('aac')
          .audioFrequency(44100)
          .audioBitrate('128k');
      } else {
        ffmpegCommand.noAudio();
      }

      return new Promise((resolve, reject) => {
        ffmpegCommand
          .on('start', (commandLine) => {
            this.logger.log(
              `FFmpeg started: ${commandLine.substring(0, 100)}...`,
            );
          })
          .on('progress', (progress) => {
            if (progress.percent && progress.percent % 10 === 0) {
              this.logger.log(
                `Processing: ${Math.round(progress.percent)}% done`,
              );
            }
          })
          .on('end', () => {
            this.logger.log('Video processing completed successfully');
            resolve(outputPath);
          })
          .on('error', (err) => {
            this.logger.error(`FFmpeg error: ${err.message}`);
            reject(err);
          })
          .save(outputPath);
      });
    } catch (error) {
      this.logger.error(`Video processing failed: ${error.message}`);
      throw error;
    }
  }
}
