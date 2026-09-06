const express = require('express');
const fs = require('fs');
const path = require('path');
const { log } = require('../lib/utils');

const SESSION_FILE_PATH = path.join(process.cwd(), '.facebook_session.json');
const COOKIES_EXPORT_PATH = path.join(process.cwd(), 'facebook_cookies.json');

/**
 * Creates API router for Facebook Login & Cookie endpoints.
 * @param {import('../lib/facebook-core')} fbEngine 
 */
function createApiRouter(fbEngine) {
    const router = express.Router();

    const getEngine = (req) => fbEngine || req.app.locals.fbEngine;

    // GET /api/status - Check Facebook session authentication status
    router.get('/status', async (req, res) => {
        try {
            const engine = getEngine(req);
            const result = await engine.checkAuthStatus();
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/login - Launch visible browser window for manual user login
    router.get('/login', async (req, res) => {
        try {
            const engine = getEngine(req);
            const result = await engine.launchLoginBrowser();
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/cookies/import - Import cookies directly from JSON or header string
    router.post('/cookies/import', async (req, res) => {
        try {
            const { cookiesInput } = req.body;
            if (!cookiesInput) {
                return res.status(400).json({ success: false, error: 'cookiesInput is required.' });
            }

            let cookieArray = [];

            // Case 1: JSON array format
            if (typeof cookiesInput === 'object' && Array.isArray(cookiesInput)) {
                cookieArray = cookiesInput;
            } else if (typeof cookiesInput === 'string' && cookiesInput.trim().startsWith('[')) {
                try {
                    cookieArray = JSON.parse(cookiesInput);
                } catch {
                    // Fallback to string parsing
                }
            }

            // Case 2: Cookie header string format (e.g. "c_user=12345; xs=abc; datr=xyz")
            if (cookieArray.length === 0 && typeof cookiesInput === 'string') {
                const pairs = cookiesInput.split(';');
                for (const pair of pairs) {
                    const [rawName, ...rest] = pair.trim().split('=');
                    const rawVal = rest.join('=');
                    if (rawName && rawVal) {
                        cookieArray.push({
                            name: rawName.trim(),
                            value: rawVal.trim(),
                            domain: '.facebook.com',
                            path: '/'
                        });
                    }
                }
            }

            if (cookieArray.length === 0) {
                return res.status(400).json({ success: false, error: 'No valid cookies found in input.' });
            }

            const cUser = cookieArray.find((c) => c.name === 'c_user');

            // Save to session and export files
            const sessionData = {
                lastUpdated: new Date().toISOString(),
                cookies: cookieArray,
                userId: cUser ? cUser.value : undefined
            };

            fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2), 'utf-8');
            fs.writeFileSync(COOKIES_EXPORT_PATH, JSON.stringify(cookieArray, null, 2), 'utf-8');

            const engine = getEngine(req);
            if (engine) {
                engine.emit('log', {
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'success',
                    message: `Imported ${cookieArray.length} cookies successfully! (User ID: ${cUser ? cUser.value : 'N/A'})`
                });
            }

            return res.json({
                success: true,
                count: cookieArray.length,
                userId: cUser ? cUser.value : undefined,
                message: `Successfully imported ${cookieArray.length} cookies!`
            });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = createApiRouter;
