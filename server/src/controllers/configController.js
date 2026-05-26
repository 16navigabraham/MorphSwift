import { getBrandConfig } from '../services/morphService.js';

export async function getConfig(_request, response, next) {
  try {
    const config = await getBrandConfig();
    response.status(200).json(config);
  } catch (error) {
    next(error);
  }
}