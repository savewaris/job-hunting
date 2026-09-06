/**
 * Terminal UI Log Renderer Module
 */
const terminalBody = document.getElementById('terminalBody');
const btnClearLogs = document.getElementById('btnClearLogs');

export function appendLog(log) {
    if (!terminalBody) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const type = (log.type || 'info').toLowerCase();
    const timestamp = log.timestamp || new Date().toLocaleTimeString();

    entry.innerHTML = `
        <span class="log-time">[${timestamp}]</span>
        <span class="log-type ${type}">${type}</span>
        <span class="log-msg">${log.message || log}</span>
    `;

    terminalBody.appendChild(entry);
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

export function initTerminal() {
    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            if (terminalBody) terminalBody.innerHTML = '';
        });
    }
}
