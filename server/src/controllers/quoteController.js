import { createQuote } from '../services/morphService.js';

export async function postQuote(request, response, next) {
  try {
    const quote = await createQuote(request.body ?? {});
    response.status(201).json(quote);
  } catch (error) {
    next(error);
  }
}