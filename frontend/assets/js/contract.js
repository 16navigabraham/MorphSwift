import { CONFIG } from '../../config.js';

export async function loadGatewayAbi() {
  const response = await fetch(CONFIG.contract.gatewayAbiUrl);
  if (!response.ok) {
    throw new Error(`Unable to load gateway ABI (${response.status})`);
  }

  return response.json();
}

export function getGatewayAddress() {
  return String(CONFIG.contract.gatewayAddress || '').trim();
}

export function hasGatewayDeployment() {
  return Boolean(getGatewayAddress());
}
