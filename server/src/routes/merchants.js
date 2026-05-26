import { Router } from 'express';

import { getMerchantById, getMerchantLedger, getMerchants } from '../controllers/merchantController.js';

export const merchantsRouter = Router();

merchantsRouter.get('/', getMerchants);
merchantsRouter.get('/:merchantId', getMerchantById);
merchantsRouter.get('/:merchantId/ledger', getMerchantLedger);