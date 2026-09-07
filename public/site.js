const statusNode = document.querySelector('#status');
const testButton = document.querySelector('#test');

async function readJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function showStatus() {
  try {
    const status = await readJson('/api/status');
    if (status.shopConnected) statusNode.textContent = `Connected to ${status.shopName || 'your Etsy shop'}.`;
    else if (status.appRegistered) statusNode.textContent = 'Etsy app registered. OAuth authorization is next.';
    else statusNode.textContent = 'Waiting for Etsy app credentials.';
  } catch (error) {
    statusNode.textContent = error.message;
  }
}

testButton.addEventListener('click', async () => {
  statusNode.textContent = 'Testing Etsy connection...';
  try {
    const result = await readJson('/api/etsy/test');
    statusNode.textContent = `Connection confirmed: ${result.shop.name} (${result.shop.activeListings ?? 0} active listings).`;
  } catch (error) {
    statusNode.textContent = error.message;
  }
});

showStatus();
