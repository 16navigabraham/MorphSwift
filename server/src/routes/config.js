import { Router } from 'express';

import { getConfig } from '../controllers/configController.js';

export const configRouter = Router();

configRouter.get('/', getConfig);