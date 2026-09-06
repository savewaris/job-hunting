const { EventEmitter } = require('events');
const BrowserManager = require('./browser');
const AuthManager = require('./auth');
const { log } = require('./utils');

// Unified Facebook Core Engine
class FacebookCore extends EventEmitter {
    constructor(options = {}) {
        super();
        this.browserManager = new BrowserManager(options);
        this.authManager = new AuthManager(this.browserManager);
    }

    // Create a logger handler that emits 'log' event and calls optional onLog callback
    createLogHandler(onLog) {
        return (logObj) => {
            this.emit('log', logObj);
            if (typeof onLog === 'function') {
                onLog(logObj);
            }
        };
    }

    // Check FB Login status
    async checkAuthStatus(onLog) {
        return await this.authManager.checkAuthStatus(this.createLogHandler(onLog));
    }

    // Launch visible browser window for user login
    async launchLoginBrowser(onLog) {
        return await this.authManager.launchLoginBrowser(this.createLogHandler(onLog));
    }
}

module.exports = FacebookCore;
