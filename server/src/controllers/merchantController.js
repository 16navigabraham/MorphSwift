import { getMerchant, listMerchantLedger, listMerchants } from '../services/morphService.js';
import { updateMerchant } from '../lib/db.js';

export async function getMerchantById(request, response, next) {
  try {
    const merchant = await getMerchant(request.params.merchantId);
    response.status(200).json(merchant);
  } catch (error) {
    next(error);
  }
}

export async function getMerchants(request, response, next) {
  try {
    const merchants = await listMerchants();
    response.status(200).json({ merchants });
  } catch (error) {
    next(error);
  }
}

export async function getMerchantLedger(request, response, next) {
  try {
    const limit = request.query.limit ? Number(request.query.limit) : 20;
    const ledger = await listMerchantLedger(request.params.merchantId, limit);
    response.status(200).json(ledger);
  } catch (error) {
    next(error);
  }
}

export async function updateMerchantById(request, response, next) {
  try {
    const merchant = await getMerchant(request.params.merchantId);
    if (!merchant) {
      return response.status(404).json({ message: 'Merchant not found' });
    }

    const { displayName, payoutWallet } = request.body;
    if (displayName !== undefined) {
      merchant.displayName = displayName;
    }
    if (payoutWallet !== undefined) {
      merchant.payoutWallet = payoutWallet;
    }

    await updateMerchant(merchant);
    response.status(200).json(merchant);
  } catch (error) {
    next(error);
  }
}