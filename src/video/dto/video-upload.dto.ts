import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VideoUploadDto {
  @IsString()
  serverId: string;

  @IsString()
  uploaderId: string;

  @IsString()
  originalVideoUrl: string;

  @IsString()
  channelId: string;

  @IsString()
  callbackQueue: string;
}
