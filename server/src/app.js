import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

dotenv.config();

export const app = express();

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
app.use(notFoundHandler);
app.use(errorHandler);