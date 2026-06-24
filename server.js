const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Config
const DR_CHRONO_API = 'https://app.drchrono.com/api';
const TOKEN_ENDPOINT = 'https://app.drchrono.com/o/token/';
const CLIENT_ID = process.env.DRCHRONO_CLIENT_ID || process.env.CLIENT_ID || process.env.APPSETTING_CLIENT_ID;
const CLIENT_SECRET = process.env.DRCHRONO_CLIENT_SECRET || process.env.CLIENT_SECRET || process.env.APPSETTING_CLIENT_SECRET;

let accessToken = process.env.DRCHRONO_ACCESS_TOKEN || process.env.ACCESS_TOKEN || process.env.APPSETTING_ACCESS_TOKEN;
let refreshToken = process.env.DRCHRONO_REFRESH_TOKEN || process.env.REFRESH_TOKEN || process.env.APPSETTING_REFRESH_TOKEN;
let tokenExpiry = Date.now() + 172800000; // 2 days

function hasTokenConfig() {
    return Boolean(CLIENT_ID && CLIENT_SECRET && accessToken && refreshToken);
}

// Refresh token before it expires
async function refreshAccessToken() {
    try {
        if (!CLIENT_ID || !CLIENT_SECRET || !refreshToken) {
            console.error('Missing Dr. Chrono OAuth configuration');
            return false;
        }

        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            console.error('Token refresh failed:', response.status);
            return false;
        }

        const data = await response.json();
        accessToken = data.access_token;
        if (data.refresh_token) refreshToken = data.refresh_token;
        tokenExpiry = Date.now() + ((data.expires_in || 172800) * 1000);
        console.log('Token refreshed successfully');
        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

async function fetchDrChrono(url) {
    return fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
}

// Check and refresh if needed
setInterval(async () => {
    if (Date.now() > tokenExpiry - 3600000) { // Refresh 1 hour before expiry
        await refreshAccessToken();
    }
}, 300000); // Check every 5 minutes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Proxy endpoint for appointments
app.get('/appointments', async (req, res) => {
    try {
        if (!hasTokenConfig()) {
            return res.status(500).json({ error: 'Dr. Chrono OAuth environment variables are not configured' });
        }

        // Refresh token if needed
        if (Date.now() > tokenExpiry - 3600000) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                return res.status(401).json({ error: 'Token refresh failed' });
            }
        }

        // Build query string
        const queryParams = new URLSearchParams(req.query);
        if (!queryParams.has('date') && !queryParams.has('date_range') && !queryParams.has('since')) {
            return res.status(400).json({ error: 'Missing required date, date_range, or since query parameter' });
        }

        const queryString = queryParams.toString();
        const url = `${DR_CHRONO_API}/appointments${queryString ? `?${queryString}` : ''}`;

        console.log(`Proxying Dr. Chrono appointments for query: ${queryString}`);

        // Fetch from Dr. Chrono. If permissions/tokens changed recently, refresh once and retry.
        let response = await fetchDrChrono(url);
        if (response.status === 401 || response.status === 403) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                response = await fetchDrChrono(url);
            }
        }

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            const body = contentType.includes('application/json')
                ? await response.json()
                : await response.text();

            console.error('Dr. Chrono API error:', response.status, body);
            return res.status(response.status).json({
                error: `Dr. Chrono API error: ${response.status}`,
                detail: body
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
