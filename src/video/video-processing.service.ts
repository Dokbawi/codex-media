import { Injectable, Logger } from '@nestjs/common';
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
        // 다이나믹 레인지 압축
        'acompressor=threshold=-18dB:ratio=3:attack=5:release=50',
        // 고음역 강화
        'treble=g=2:f=8000:w=1',
        // 저음역 약간 강화
        'bass=g=1:f=100:w=0.5',
        // 정규화
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
    originalWidth: number,
    originalHeight: number,
    targetWidth: number,
    targetHeight: number,
    targetSizeBytes: number = 9.4 * 1024 * 1024,
  ): { videoBitrate: number; audioBitrate: string } {
    let audioBitrate: string;
    if (duration > 600) {
      // 10분 이상
      audioBitrate = '64k';
    } else if (duration > 300) {
      // 5분 이상
      audioBitrate = '80k';
    } else {
      audioBitrate = '96k';
    }

    const audioBitrateNum = parseInt(audioBitrate) * 1000;

    // 실제 파일 크기는 비트레이트보다 5-15% 더 클 수 있으므로 안전 계수 적용
    const safetyFactor = 0.85; // 15% 여유 (스토리지 오버헤드 고려)
    const availableBytes =
      targetSizeBytes * safetyFactor - (audioBitrateNum * duration) / 8;
    const calculatedVideoBitrate = Math.floor(
      (availableBytes * 8) / duration / 1000,
    );

    // 해상도에 따른 최대 비트레이트 설정 (약간 상향 조정)
    const pixelCount = targetWidth * targetHeight;
    let maxBitrate: number;

    if (pixelCount <= 640 * 480) {
      maxBitrate = 800;
    } else if (pixelCount <= 854 * 480) {
      maxBitrate = 1000;
    } else if (pixelCount <= 1280 * 720) {
      maxBitrate = 1500;
    } else if (pixelCount <= 1920 * 1080) {
      maxBitrate = 2200;
    } else {
      maxBitrate = 1800;
    }

    // 최소 비트레이트도 설정
    const minBitrate = Math.min(250, maxBitrate * 0.3);

    const finalVideoBitrate = Math.max(
      minBitrate,
      Math.min(calculatedVideoBitrate, maxBitrate),
    );

    // 예상 파일 크기 계산 및 로깅
    const estimatedSizeMB =
      ((finalVideoBitrate * 1000 + audioBitrateNum) * duration) /
      8 /
      (1024 * 1024);
    const estimatedStorageSizeMB = estimatedSizeMB * 1.1; // 스토리지 오버헤드 10% 추가

    this.logger.log(`비트레이트 계산:`);
    this.logger.log(`- 목표: ${(targetSizeBytes / 1024 / 1024).toFixed(1)}MB`);
    this.logger.log(`- 로컬 예상: ${estimatedSizeMB.toFixed(1)}MB`);
    this.logger.log(`- 스토리지 예상: ${estimatedStorageSizeMB.toFixed(1)}MB`);
    this.logger.log(
      `- 비디오: ${finalVideoBitrate}kbps, 오디오: ${audioBitrate}`,
    );

    return {
      videoBitrate: finalVideoBitrate,
      audioBitrate,
    };
  }

  private calculateOptimalResolution(
    originalWidth: number,
    originalHeight: number,
    duration: number,
  ): { width: number; height: number; scaleFactor: number } {
    // 긴 영상일수록 해상도를 더 보수적으로 설정
    let maxWidth: number;
    let maxHeight: number;

    if (duration > 900) {
      // 15분 이상
      maxWidth = 1024;
      maxHeight = 576;
    } else if (duration > 600) {
      // 10분 이상
      maxWidth = 1280;
      maxHeight = 720;
    } else if (duration > 300) {
      // 5분 이상
      maxWidth = 1440;
      maxHeight = 810;
    } else if (duration > 120) {
      // 2분 이상
      maxWidth = 1600;
      maxHeight = 900;
    } else {
      maxWidth = 1920;
      maxHeight = 1080;
    }

    // 원본 해상도가 작으면 적당히만 업스케일
    const originalPixels = originalWidth * originalHeight;
    let scaleFactor: number;

    if (originalPixels < 480 * 360) {
      scaleFactor = Math.min(
        2.0,
        maxWidth / originalWidth,
        maxHeight / originalHeight,
      );
    } else if (originalPixels < 640 * 480) {
      scaleFactor = Math.min(
        1.8,
        maxWidth / originalWidth,
        maxHeight / originalHeight,
      );
    } else if (originalPixels < 1280 * 720) {
      scaleFactor = Math.min(
        1.5,
        maxWidth / originalWidth,
        maxHeight / originalHeight,
      );
    } else {
      scaleFactor = Math.min(
        1.2,
        maxWidth / originalWidth,
        maxHeight / originalHeight,
      );
    }

    const targetWidth = Math.floor(originalWidth * scaleFactor);
    const targetHeight = Math.floor(originalHeight * scaleFactor);

    // 최대 해상도 제한
    const finalWidth = Math.min(targetWidth, maxWidth);
    const finalHeight = Math.min(targetHeight, maxHeight);

    // 8의 배수로 맞춤 (인코딩 효율성, 16보다 더 유연하게)
    const alignedWidth = Math.floor(finalWidth / 8) * 8;
    const alignedHeight = Math.floor(finalHeight / 8) * 8;

    return {
      width: alignedWidth,
      height: alignedHeight,
      scaleFactor: alignedWidth / originalWidth,
    };
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

      // 최적 해상도 계산
      const {
        width: targetWidth,
        height: targetHeight,
        scaleFactor,
      } = this.calculateOptimalResolution(
        originalWidth,
        originalHeight,
        duration,
      );

      // 최적 비트레이트 계산
      const { videoBitrate, audioBitrate } = this.calculateOptimalBitrate(
        duration,
        originalWidth,
        originalHeight,
        targetWidth,
        targetHeight,
      );

      this.logger.log(
        `비디오 사양: ${originalWidth}x${originalHeight} -> ${targetWidth}x${targetHeight} (${scaleFactor.toFixed(2)}x)`,
      );
      this.logger.log(
        `길이: ${duration.toFixed(1)}초, 비디오 비트레이트: ${videoBitrate}kbps, 오디오 비트레이트: ${audioBitrate}`,
      );

      if (audioLevels) {
        this.logger.log(
          `오디오 레벨 - Max: ${audioLevels.maxVolume}dB, Mean: ${audioLevels.meanVolume}dB`,
        );
      }

      // FFmpeg 명령 구성 - 더 엄격한 크기 제어
      const ffmpegCommand = ffmpeg(inputPath)
        .videoCodec('libx264')
        .videoBitrate(videoBitrate)
        .format('mp4')
        .addOptions([
          '-preset',
          'fast', // 더 빠른 인코딩, 약간 큰 파일
          '-profile:v',
          'high',
          '-level',
          '4.0',
          '-crf',
          '26', // 품질을 약간 낮춰서 크기 감소 (23->26)
          '-maxrate',
          `${videoBitrate}k`, // 최대 비트레이트를 목표 비트레이트와 동일하게
          '-bufsize',
          `${Math.floor(videoBitrate * 1.5)}k`, // 버퍼 크기 감소
          '-movflags',
          '+faststart', // 웹 스트리밍 최적화
          '-pix_fmt',
          'yuv420p', // 호환성 확보
          // 2-pass 인코딩을 위한 추가 옵션들
          '-pass',
          '1',
          '-f',
          'null',
        ]);

      // 첫 번째 패스 실행 (분석)
      await new Promise((resolve, reject) => {
        ffmpegCommand.on('end', resolve).on('error', reject).save('/dev/null');
      });

      // 두 번째 패스 - 실제 인코딩
      const finalCommand = ffmpeg(inputPath)
        .videoCodec('libx264')
        .videoBitrate(videoBitrate)
        .format('mp4')
        .addOptions([
          '-preset',
          'fast',
          '-profile:v',
          'high',
          '-level',
          '4.0',
          '-crf',
          '26',
          '-maxrate',
          `${videoBitrate}k`,
          '-bufsize',
          `${Math.floor(videoBitrate * 1.5)}k`,
          '-movflags',
          '+faststart',
          '-pix_fmt',
          'yuv420p',
          '-pass',
          '2', // 두 번째 패스
        ]);

      // 비디오 필터 적용
      const videoFilters = [
        `scale=${targetWidth}:${targetHeight}:flags=lanczos`,
      ];

      // 업스케일링이 큰 경우에만 약한 샤프닝 적용
      if (scaleFactor > 1.3) {
        videoFilters.push('unsharp=3:3:0.3:3:3:0.2'); // 매우 약한 샤프닝
      }

      finalCommand.videoFilters(videoFilters);

      // 오디오 처리
      if (audioStream) {
        const audioFilters = this.generateAudioFilters(audioLevels);
        finalCommand
          .audioFilters(audioFilters)
          .audioCodec('aac')
          .audioFrequency(44100)
          .audioBitrate(audioBitrate);
      } else {
        finalCommand.noAudio();
      }

      return new Promise((resolve, reject) => {
        finalCommand
          .on('start', (commandLine) => {
            this.logger.log(
              `FFmpeg 2nd pass started: ${commandLine.substring(0, 150)}...`,
            );
          })
          .on('progress', (progress) => {
            if (progress.percent && progress.percent % 10 === 0) {
              this.logger.log(`처리 중: ${Math.round(progress.percent)}% 완료`);
            }
          })
          .on('end', () => {
            this.logger.log('비디오 처리 완료');
            resolve(outputPath);
          })
          .on('error', (err) => {
            this.logger.error(`FFmpeg 오류: ${err.message}`);
            reject(err);
          })
          .save(outputPath);
      });
    } catch (error) {
      this.logger.error(`비디오 처리 실패: ${error.message}`);
      throw error;
    }
  }
}
