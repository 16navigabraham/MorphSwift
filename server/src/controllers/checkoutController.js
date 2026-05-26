import { confirmCheckout, createCheckout, getCheckout } from '../services/morphService.js';

export async function postCheckout(request, response, next) {
  try {
    const checkout = await createCheckout(request.body ?? {});
    response.status(201).json(checkout);
  } catch (error) {
    next(error);
  }
}

export async function fetchCheckout(request, response, next) {
  try {
    const checkout = await getCheckout(request.params.checkoutId);
    response.status(200).json(checkout);
  } catch (error) {
    next(error);
  }
}

export async function confirmCheckoutById(request, response, next) {
  try {
    const result = await confirmCheckout({
      checkoutId: request.params.checkoutId,
      txHash: request.body?.txHash,
    });
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}