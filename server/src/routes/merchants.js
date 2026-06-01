import { Router } from 'express';

import { getMerchantById, getMerchantLedger, getMerchants, updateMerchantById } from '../controllers/merchantController.js';

export const merchantsRouter = Router();

merchantsRouter.get('/', getMerchants);
merchantsRouter.get('/:merchantId', getMerchantById);
merchantsRouter.get('/:merchantId/ledger', getMerchantLedger);
merchantsRouter.patch('/:merchantId', updateMerchantById);