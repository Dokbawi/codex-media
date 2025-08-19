import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class VideoLog {
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

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;
}

export type VideoLogDocument = VideoLog & Document;
export const VideoLogSchema = SchemaFactory.createForClass(VideoLog);
