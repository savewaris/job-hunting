const WebSocket = require('ws');

/**
 * Initializes WebSocket server for streaming automation logs to clients.
 * @param {import('http').Server} server 
 * @param {import('../lib/facebook-core')} fbEngine 
 */
function initWebSocket(server, fbEngine) {
    const wss = new WebSocket.Server({ server, path: '/ws/logs' });

    // Broadcast log object to all connected WebSocket clients
    function broadcastLog(logObj) {
        const data = JSON.stringify(logObj);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    // Client connection event
    wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: 'Connected to Facebook Automation WebSocket log stream.'
        }));
    });

    // Subscribe to FacebookCore log events
    if (fbEngine) {
        fbEngine.on('log', broadcastLog);
    }

    return { wss, broadcastLog };
}

module.exports = { initWebSocket };
