import * as path from 'path';
import * as dotenv from 'dotenv';

const env = process.env.NODE_ENV?.trim() === 'prod' ? 'prod' : 'development';
const filePath = path.join(process.cwd(), `env/${env}.env`);
console.log(`Environment ${env}`);

export const dotEnvOptions = {
  path: filePath,
};

dotenv.config(dotEnvOptions);

export const rabbitMQConfig = {
  url: process.env.RABBITMQ_URL,
};
