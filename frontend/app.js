/**
 * Application Main Controller Entry Point (ES Module)
 */
import { initWebSocket } from './js/websocket.js';
import { appendLog, initTerminal } from './js/terminal.js';
import * as api from './js/api.js';

const wsDot = document.getElementById('wsDot');
const wsStatusText = document.getElementById('wsStatusText');
const sessionResult = document.getElementById('sessionResult');
const btnLogin = document.getElementById('btnLogin');
const btnStatus = document.getElementById('btnStatus');
const btnToggleImport = document.getElementById('btnToggleImport');
const importBox = document.getElementById('importBox');
const cookieInputText = document.getElementById('cookieInputText');
const btnSubmitImport = document.getElementById('btnSubmitImport');
const btnCancelImport = document.getElementById('btnCancelImport');

// Initialize Terminal listeners
initTerminal();

// Initialize WebSocket Client
initWebSocket(
    (logData) => appendLog(logData),
    (isOnline) => {
        if (isOnline) {
            wsDot.classList.add('online');
            wsStatusText.textContent = 'WS Online';
        } else {
            wsDot.classList.remove('online');
            wsStatusText.textContent = 'WS Offline (Reconnecting...)';
        }
    }
);

// Function to check and render Facebook session status
async function checkAndDisplaySession() {
    sessionResult.style.display = 'block';
    sessionResult.textContent = 'Checking session status...';
    try {
        const data = await api.checkStatus();
        if (data.isLoggedIn) {
            sessionResult.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(99, 102, 241, 0.35); padding: 14px; border-radius: 12px; margin-top: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                    <img src="${data.avatarUrl}" alt="Profile Avatar" onerror="this.src='https://via.placeholder.com/52'" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid #6366f1;">
                    <div style="flex: 1;">
                        <div style="font-size: 1.05rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
                            ${data.fullName || 'Facebook Account'}
                            <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 8px; border-radius: 12px; font-weight: 500;">Active</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #a5b4fc; margin-top: 2px;">
                            ${data.username || ''} • User ID: <code style="color: #f3f4f6; font-family: monospace;">${data.userId || 'N/A'}</code>
                        </div>
                    </div>
                    <div>
                        <a href="${data.profileUrl}" target="_blank" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 8px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; text-decoration: none;">View Profile ↗</a>
                    </div>
                </div>
            `;
        } else if (data.isLoginInProgress) {
            sessionResult.innerHTML = `
                <div style="padding: 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 10px; color: #93c5fd;">
                    🌐 <strong>Login in progress:</strong> Chrome window is open on your desktop. Please enter your login credentials.
                </div>
            `;
        } else {
            sessionResult.innerHTML = `
                <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; color: #fca5a5;">
                    ❌ <strong>Status: Logged Out</strong> — Click "Launch Chrome Login Window" or use "Paste / Import Cookies".
                </div>
            `;
        }
    } catch (err) {
        sessionResult.textContent = `Error checking session: ${err.message}`;
    }
}

// Session Status Check Button
btnStatus.addEventListener('click', checkAndDisplaySession);

// Auto-check on page load
checkAndDisplaySession();

// Launch Login Window
btnLogin.addEventListener('click', async () => {
    btnLogin.disabled = true;
    const originalText = btnLogin.textContent;
    btnLogin.textContent = '🌐 Chrome Window Active...';
    try {
        await api.launchLogin();
        await checkAndDisplaySession();
    } catch (err) {
        alert(`Error launching login window: ${err.message}`);
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = originalText;
    }
});

// Import Cookies Toggle
btnToggleImport.addEventListener('click', () => {
    importBox.style.display = importBox.style.display === 'none' ? 'flex' : 'none';
});

btnCancelImport.addEventListener('click', () => {
    importBox.style.display = 'none';
});

// Submit Cookies Import
btnSubmitImport.addEventListener('click', async () => {
    const rawVal = cookieInputText.value.trim();
    if (!rawVal) {
        alert('Please paste your cookie string or JSON array!');
        return;
    }

    btnSubmitImport.disabled = true;
    btnSubmitImport.textContent = 'Importing...';
    try {
        const res = await api.importCookies(rawVal);
        if (res.success) {
            importBox.style.display = 'none';
            cookieInputText.value = '';
            await checkAndDisplaySession();
        } else {
            alert(`Error: ${res.error || 'Failed to import'}`);
        }
    } catch (err) {
        alert(`Import Error: ${err.message}`);
    } finally {
        btnSubmitImport.disabled = false;
        btnSubmitImport.textContent = '💾 Save & Verify Cookies';
    }
});
