import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs/promises';

@Injectable()
export class AwsS3Service {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(AwsS3Service.name);

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadVideo(bucketName: string, localTempPath: string): Promise<string> {
    const timestamp = Date.now();
    const fileName = `uploads/${timestamp}_processed_video.mp4`;
    
    try {
      const fileContent = await fs.readFile(localTempPath);
      
      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: fileContent,
        ContentType: 'video/mp4',
      });

      await this.s3Client.send(putCommand);
      this.logger.log(`S3 업로드 완료: ${fileName}`);

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: fileName,
      });

      const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 10 * 60,
      });

      setTimeout(
        async () => {
          try {
            await this.delete(bucketName, fileName);
            this.logger.log(`S3 임시 파일 삭제 완료: ${fileName}`);
          } catch (deleteError) {
            this.logger.error(`S3 임시 파일 삭제 실패: ${deleteError.message}`);
          }
        },
        10 * 60 * 1000,
      );

      return signedUrl;
    } catch (error) {
      this.logger.error(`S3 업로드 실패: ${error.message}`);
      throw error;
    }
  }

  async delete(bucketName: string, fileName: string): Promise<void> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: fileName,
      });
      
      await this.s3Client.send(deleteCommand);
    } catch (error) {
      this.logger.error(`S3 삭제 실패: ${error.message}`);
    }
  }
}