import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Video extends Document {
  @Prop({ required: true, index: true })
  serverId: string;

  @Prop({ ref: 'VideoServer' })
  serverObjectId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  uploaderId: string;

  @Prop({ required: true })
  url: string;

  @Prop({
    default: 'pending',
    enum: ['pending', 'processing', 'done', 'failed'],
    index: true,
  })
  status: 'pending' | 'processing' | 'done' | 'failed';

  @Prop()
  originalFileSize?: number;

  @Prop()
  processedFileSize?: number;

  @Prop()
  originalResolution?: string;

  @Prop()
  processedResolution?: string;

  @Prop()
  duration?: number;

  @Prop()
  processingTimeMs?: number;

  @Prop()
  errorMessage?: string;
}

export const VideoSchema = SchemaFactory.createForClass(Video);

VideoSchema.index({ serverId: 1, status: 1 });
VideoSchema.index({ uploaderId: 1, createdAt: -1 });
VideoSchema.index({ status: 1, createdAt: -1 });
