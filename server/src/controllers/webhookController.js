import { confirmCheckoutByReference } from '../services/morphService.js';

export async function postPaymentReceived(request, response, next) {
  try {
    const result = await confirmCheckoutByReference(request.body ?? {});
    response.status(200).json({
      event: 'payment.received',
      ...result,
    });
  } catch (error) {
    next(error);
  }
}