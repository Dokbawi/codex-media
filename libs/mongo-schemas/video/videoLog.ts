import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class VideoLog extends Document {
  @Prop({ required: true, ref: 'Video', index: true })
  videoId: string;

  @Prop({ required: true, index: true })
  step: string;

  @Prop()
  message?: string;

  @Prop()
  durationMs?: number;

  @Prop({
    default: 'info',
    enum: ['info', 'warn', 'error'],
    index: true,
  })
  level: 'info' | 'warn' | 'error';

  @Prop({ default: () => new Date(), index: true })
  timestamp: Date;

  @Prop()
  metadata?: Record<string, any>;
}

export const VideoLogSchema = SchemaFactory.createForClass(VideoLog);

// 복합 인덱스 추가
VideoLogSchema.index({ videoId: 1, timestamp: -1 });
VideoLogSchema.index({ videoId: 1, step: 1 });
VideoLogSchema.index({ level: 1, timestamp: -1 });
VideoLogSchema.index({ step: 1, timestamp: -1 });
