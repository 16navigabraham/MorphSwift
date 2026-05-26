import { createWithdrawal } from '../services/morphService.js';

export async function postWithdrawal(request, response, next) {
  try {
    const withdrawal = await createWithdrawal(request.body ?? {});
    response.status(201).json(withdrawal);
  } catch (error) {
    next(error);
  }
}