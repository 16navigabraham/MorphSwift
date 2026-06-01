import { ethers } from 'ethers';
import { CONFIG } from '../../config.js';

let _provider = null;

export function hasInjectedProvider() {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

export function getProvider() {
  if (!hasInjectedProvider()) return null;
  try {
    _provider = new ethers.BrowserProvider(window.ethereum);
    return _provider;
  } catch (e) {
    return null;
  }
}

export async function connectWallet() {
  if (!hasInjectedProvider()) throw new Error('No injected wallet provider');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const prov = getProvider();
  const signer = await prov.getSigner();
  const address = await signer.getAddress();
  const network = await prov.getNetwork();
  return { provider: prov, signer, address, chainId: network?.chainId, name: network?.name };
}

export async function connectAndSignMessage(message = 'MorphSwift authentication request') {
  const session = await connectWallet();
  await session.signer.signMessage(message);
  return session;
}

export async function ensureCorrectNetwork(expectedChainId) {
  if (!hasInjectedProvider()) return false;
  const normalizedChainId = Number(expectedChainId);
  const prov = getProvider();
  if (!prov) return false;

  const currentNetwork = await prov.getNetwork();
  if (Number(currentNetwork.chainId) === normalizedChainId) {
    return true;
  }

  const chainIdHex = `0x${normalizedChainId.toString(16)}`;
  const networkConfig = CONFIG.contract;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch (error) {
    if (error?.code === 4902 && networkConfig?.rpcUrls?.length) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIdHex,
          chainName: networkConfig.chainName || CONFIG.settlementNetwork,
          rpcUrls: networkConfig.rpcUrls,
          blockExplorerUrls: networkConfig.blockExplorerUrls || [],
          nativeCurrency: {
            name: networkConfig.nativeCurrency || 'ETH',
            symbol: networkConfig.nativeCurrency || 'ETH',
            decimals: 18,
          },
        }],
      });
      return true;
    }

    return false;
  }
}

export async function getSigner() {
  const prov = getProvider();
  if (!prov) return null;
  return prov.getSigner();
}

export async function getAddress() {
  try {
    const signer = await getSigner();
    if (!signer) return null;
    return signer.getAddress();
  } catch {
    return null;
  }
}

export async function isCorrectNetwork(expectedChainId) {
  const prov = getProvider();
  if (!prov) return false;
  const net = await prov.getNetwork();
  return Number(net.chainId) === Number(expectedChainId);
}
