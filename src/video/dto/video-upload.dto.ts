import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VideoUploadDto {
  @IsString()
  serverId: string;

  @IsString()
  senderId: string;

  @IsString()
  videoUrl: string;

  @IsString()
  channelId: string;

  @IsString()
  callbackQueue: string;
}
