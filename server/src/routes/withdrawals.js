import { Router } from 'express';

import { postWithdrawal } from '../controllers/withdrawalController.js';

export const withdrawalsRouter = Router();

withdrawalsRouter.post('/', postWithdrawal);