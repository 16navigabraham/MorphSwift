import { Router } from 'express';

import { postQuote } from '../controllers/quoteController.js';

export const quotesRouter = Router();

quotesRouter.post('/', postQuote);