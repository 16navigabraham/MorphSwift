import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

dotenv.config();

export const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'morphswift-server',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiRouter);
app.use(express.static(frontendDir));

app.get('/', (_request, response) => {
  response.sendFile(path.join(frontendDir, 'onboarding.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);