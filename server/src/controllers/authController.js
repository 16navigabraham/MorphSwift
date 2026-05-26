import { createAuthSession } from '../services/morphService.js';

export async function createSession(request, response, next) {
  try {
    const session = await createAuthSession(request.body ?? {});
    response.status(201).json(session);
  } catch (error) {
    next(error);
  }
}