/**
 * REST API Client Wrappers Module
 */

export async function checkStatus() {
    const res = await fetch('/api/status');
    return await res.json();
}

export async function launchLogin() {
    const res = await fetch('/api/login');
    return await res.json();
}

export async function importCookies(cookiesInput) {
    const res = await fetch('/api/cookies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookiesInput })
    });
    return await res.json();
}
