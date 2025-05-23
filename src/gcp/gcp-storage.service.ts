import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs/promises';

@Injectable()
export class GcpStorageService {
  private readonly storage: Storage;
  private readonly logger = new Logger(GcpStorageService.name);

  constructor(private readonly configService: ConfigService) {
    this.storage = new Storage({
      keyFilename: this.configService.get('GCP_KEY_PATH'),
      projectId: this.configService.get('GCP_PROJECT_ID'),
      credentials: {
        client_email: this.configService.get('GCP_CLIENT_EMAIL'),
        private_key: this.configService
          .get('GCP_PRIVATE_KEY')
          .split(String.raw`\n`)
          .join('\n'),
      },
    });
  }

  getBucket(bucketName: string) {
    return this.storage.bucket(bucketName);
  }

  getFile(bucketName: string, filePath: string) {
    return this.getBucket(bucketName).file(filePath);
  }

  async uploadVideo(bucketName: string, localTempPath: string) {
    const timestamp = Date.now();
    const filePath = `uploads/${timestamp}_processed_video`;
    const file = this.getFile(bucketName, filePath);

    const fileContent = await fs.readFile(localTempPath);

    await file.save(fileContent, {
      resumable: false,
      metadata: {
        contentType: 'video/mp4',
      },
    });

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000,
    });

    setTimeout(
      async () => {
        try {
          await file.delete();
          this.logger.log(`GCS 임시 파일 삭제 완료: ${filePath}`);
        } catch (deleteError) {
          this.logger.error(`GCS 임시 파일 삭제 실패: ${deleteError.message}`);
        }
      },
      10 * 60 * 1000,
    );

    return signedUrl;
  }

  async download(bucketName: string, filePath: string, destination: string) {
    const file = this.getBucket(bucketName).file(filePath);
    await file.download({ destination });
  }

  async delete(bucketName: string, filePath: string) {
    const file = this.getBucket(bucketName).file(filePath);
    await file.delete().catch(() => null);
  }
}
