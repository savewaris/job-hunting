// Utility & helper functions for Facebook Automation

// Helper: Log formatted messages to console or UI callback
function log(onLog, message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    if (onLog && typeof onLog === 'function') {
        onLog({ timestamp, message, type, formatted });
    } else {
        console.log(formatted);
    }
}

// Helper: Human-like delay
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomSleep(minSec = 2, maxSec = 5) {
    const ms = Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
    await sleep(ms);
}

// Helper: Human-like text typing simulation
async function humanType(element, text) {
    for (const char of text) {
        await element.type(char, { delay: Math.floor(Math.random() * 80) + 30 });
    }
}

module.exports = {
    log,
    sleep,
    randomSleep,
    humanType
};
