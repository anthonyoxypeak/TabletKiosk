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
const CLIENT_ID = 'FKTFgvWy0Pr41RRHI0Hm9jT9eATKdosujH8LaAMx';
const CLIENT_SECRET = 'Hmvxiqzf905LkauminzkThl2tlJ7o5diasTnDUfXjWSomsUW69VPQEYR559mVFmLvTZDD7r8zZfZN2LigjA3IoTcSWCMO9wcGvVfXLlIEdisx00ErOgAA5Ek3TYcLtdp';

let accessToken = process.env.ACCESS_TOKEN || 'RxjwhGXLwjBYH4cOPhAPNkylLifEjt';
let refreshToken = process.env.REFRESH_TOKEN || 'R6EFGEhDcYr5SP3ZCPhCxnxYC53CQh';
let tokenExpiry = Date.now() + 172800000; // 2 days

// Refresh token before it expires
async function refreshAccessToken() {
    try {
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
        // Refresh token if needed
        if (Date.now() > tokenExpiry - 3600000) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                return res.status(401).json({ error: 'Token refresh failed' });
            }
        }

        // Build query string
        const queryParams = new URLSearchParams(req.query);
        const url = `${DR_CHRONO_API}/appointments/?${queryParams.toString()}`;

        console.log(`Proxying: ${url}`);

        // Fetch from Dr. Chrono
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error(`Dr. Chrono API error: ${response.status}`);
            return res.status(response.status).json({ error: `Dr. Chrono API error: ${response.status}` });
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
