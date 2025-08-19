import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema()
export class VideoServer extends Document {
  @Prop({ required: true, unique: true })
  serverId: string;
}

export const VideoServerSchema = SchemaFactory.createForClass(VideoServer);
