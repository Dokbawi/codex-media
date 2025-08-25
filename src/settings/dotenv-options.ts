import * as path from 'path';
import * as dotenv from 'dotenv';

const env =
  process.env.NODE_ENV?.trim() === 'production' ? 'production' : 'development';
const filePath = path.join(process.cwd(), `env/${env}.env`);
console.log(`Environment ${env}`);

export const dotEnvOptions = {
  path: filePath,
};

dotenv.config(dotEnvOptions);

export const rabbitMQConfig = {
  url: process.env.RABBITMQ_URL,
};

export const mognoDBConfig = {
  user: process.env.MONGODB_ADMIN_USER,
  password: process.env.MONGODB_ADMIN_PASSWORD,
  dbName: process.env.MONGODB_NAME,
};

export const mongoDB = {
  url: () => {
    return env !== 'production'
      ? `mongodb://${mognoDBConfig.user}:${mognoDBConfig.password}@localhost:27017`
      : process.env.MONGODB_URL;
  },
};

console.log(mongoDB.url());
