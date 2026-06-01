import { Router } from 'express';

import { confirmCheckoutById, fetchCheckout, postCheckout, updateCheckoutById } from '../controllers/checkoutController.js';

export const checkoutsRouter = Router();

checkoutsRouter.post('/', postCheckout);
checkoutsRouter.get('/:checkoutId', fetchCheckout);
checkoutsRouter.post('/:checkoutId/confirm', confirmCheckoutById);
checkoutsRouter.patch('/:checkoutId', updateCheckoutById);