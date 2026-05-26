import { Router } from 'express';

import { postPaymentReceived } from '../controllers/webhookController.js';

export const webhooksRouter = Router();

webhooksRouter.post('/payment-received', postPaymentReceived);