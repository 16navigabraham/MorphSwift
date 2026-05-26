import { Router } from 'express';

import { createSession } from '../controllers/authController.js';

export const authRouter = Router();

authRouter.post('/session', createSession);