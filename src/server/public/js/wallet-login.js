async function fetchNonce() {
  const res = await fetch('/auth/wallet/nonce');
  if (!res.ok) throw new Error('Failed to fetch nonce');
  return res.json();
}

function getProvider() {
  // Try common injected globals. Adjust when the official API name is confirmed.
  const candidates = [
    window.frontierWallet,
    window.eveFrontierWallet,
    window.eveVault,
    window.evevault,
    window.eveVaultProvider,
    window.ethereum // fallback if the extension piggybacks on ethereum-style APIs
  ];
  return candidates.find(Boolean) || null;
}

function getProviderName(provider) {
  if (!provider) return 'none';
  if (provider === window.frontierWallet) return 'frontierWallet';
  if (provider === window.eveFrontierWallet) return 'eveFrontierWallet';
  if (provider === window.eveVault) return 'eveVault';
  if (provider === window.evevault) return 'evevault';
  if (provider === window.eveVaultProvider) return 'eveVaultProvider';
  if (provider === window.ethereum) return 'ethereum';
  return 'unknown';
}

async function signMessage(provider, message) {
  if (!provider) {
    throw new Error('Wallet provider not available.');
  }
  if (typeof provider.signMessage === 'function') {
    // Preferred path if the provider exposes signMessage
    return provider.signMessage({ message });
  }
  if (typeof provider.request === 'function') {
    // Try EIP-191 style personal_sign as a fallback
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) || [];
    const addr = accounts[0];
    const sig = await provider.request({
      method: 'personal_sign',
      params: [message, addr]
    });
    return { signature: sig, address: addr };
  }
  throw new Error('Wallet provider does not support signing.');
}

async function verifySignature(payload) {
  const res = await fetch('/auth/wallet/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Verification failed');
  }
  return res.json();
}

async function handleWalletLogin() {
  const statusEl = document.querySelector('#wallet-status');
  const btn = document.querySelector('#connect-wallet-btn');
  const provider = getProvider();
  if (!provider) {
    statusEl.textContent = 'EVE Vault / Frontier wallet not detected. Install the extension to log in.';
    statusEl.classList.add('error');
    return;
  }
  statusEl.textContent = `Provider detected (${getProviderName(provider)}). Requesting nonce...`;
  btn.disabled = true;
  try {
    const nonce = await fetchNonce();
    statusEl.textContent = 'Requesting signature from wallet...';
    const signed = await signMessage(provider, nonce.message_to_sign);
    const signature = signed.signature || signed.sig || signed;
    const wallet_address = signed.address || signed.wallet_address || signed.account || provider.selectedAddress;
    if (!signature || !wallet_address) {
      throw new Error('Provider did not return signature or address');
    }
    const result = await verifySignature({
      nonce_id: nonce.nonce_id,
      wallet_address,
      signature
    });
    statusEl.textContent = 'Login successful. Redirecting...';
    window.location.href = result.redirect || '/';
  } catch (err) {
    statusEl.textContent = err.message || 'Login failed';
    statusEl.classList.add('error');
    btn.disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('#connect-wallet-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleWalletLogin();
    });
  }
});
