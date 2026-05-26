import { Router } from 'express';

import { confirmCheckoutById, fetchCheckout, postCheckout } from '../controllers/checkoutController.js';

export const checkoutsRouter = Router();

checkoutsRouter.post('/', postCheckout);
checkoutsRouter.get('/:checkoutId', fetchCheckout);
checkoutsRouter.post('/:checkoutId/confirm', confirmCheckoutById);