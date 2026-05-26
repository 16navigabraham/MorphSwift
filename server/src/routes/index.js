import { Router } from 'express';

import { healthRouter } from './health.js';
import { configRouter } from './config.js';
import { authRouter } from './auth.js';
import { merchantsRouter } from './merchants.js';
import { quotesRouter } from './quotes.js';
import { checkoutsRouter } from './checkouts.js';
import { withdrawalsRouter } from './withdrawals.js';
import { webhooksRouter } from './webhooks.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/config', configRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/merchants', merchantsRouter);
apiRouter.use('/quotes', quotesRouter);
apiRouter.use('/checkouts', checkoutsRouter);
apiRouter.use('/withdrawals', withdrawalsRouter);
apiRouter.use('/webhooks', webhooksRouter);