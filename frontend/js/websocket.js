/**
 * WebSocket Log Streamer Client Module
 */
export function initWebSocket(onLogReceived, onStatusChange) {
    const wsUrl = `ws://${window.location.host}/ws/logs`;
    let ws;

    function connect() {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            if (typeof onStatusChange === 'function') onStatusChange(true);
        };

        ws.onclose = () => {
            if (typeof onStatusChange === 'function') onStatusChange(false);
            setTimeout(connect, 3000);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (typeof onLogReceived === 'function') onLogReceived(data);
            } catch (e) {
                console.error("Malformed log message:", event.data);
            }
        };
    }

    connect();
    return ws;
}
