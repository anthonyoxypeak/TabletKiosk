const crypto = require('node:crypto');

const PUBLIC_FILES = new Set([
    '/seat.html','/seating-chart.html','/seating-chat.js','/seating-chat.css',
    '/tablet-polling.js','/tablet-session.js','/tablet-experience.js','/tablet-support.js','/tablet-chat-home.js',
    '/staff.html','/staff-alerts.js','/games.html','/games.js','/games.css','/games-core.js',
    '/game-words.js','/offline-worker.js','/screensaver/index.html','/screensaver/idle.mp4'
]);
function equalSecret(a,b) {
    if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
    return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest());
}
function securityHeaders(req,res,next) {
    res.set({
        'Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff',
        'X-Frame-Options':'SAMEORIGIN',
        'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy':"base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'",
        'Cache-Control':'no-store, private'
    });
    if(req.secure||process.env.WEBSITE_SITE_NAME)res.set('Strict-Transport-Security','max-age=31536000');
    next();
}
function originGuard(env=process.env) {
    const allowed=new Set((env.KIOSK_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
    return (req,res,next)=>{
        const origin=req.get('origin');
        if(!origin)return next(); // Native kiosk requests still require their credential.
        const localOrigin=`${req.protocol}://${req.get('host')}`;
        const azureOrigin=env.WEBSITE_HOSTNAME?'https://'+env.WEBSITE_HOSTNAME:null;
        if(origin!==localOrigin&&origin!==azureOrigin&&!allowed.has(origin))return res.status(403).json({error:'Origin not allowed'});
        res.vary('Origin');res.set('Access-Control-Allow-Origin',origin);
        if(req.method==='OPTIONS'){
            res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers','Content-Type, X-Kiosk-Key, X-Chat-Session, X-Staff-Action');
            return res.sendStatus(204);
        }
        next();
    };
}

// Reject anonymous schedule access when no tablet key is configured. A device
// registry can replace the shared key without changing the tablet UI.
function tabletAuth(env=process.env) {
    let devices=null;
    if(env.KIOSK_DEVICE_KEYS){
        devices=JSON.parse(env.KIOSK_DEVICE_KEYS);
        if(!Array.isArray(devices)||!devices.length||devices.some(d=>!/^\w[\w-]{0,79}$/.test(d.id)||!/^([a-f0-9]{64})$/.test(d.sha256)||![1,3,4,6].includes(d.chamber)||!Number.isInteger(d.seat)||d.seat<1||d.seat>14))throw Error('Invalid tablet device registry');
        if(new Set(devices.map(d=>d.sha256)).size!==devices.length)throw Error('Duplicate tablet credential');
    }
    return (req,res,next)=>{
        const key=req.get('x-kiosk-key'); // Never accept authentication in API URLs.
        if(devices){
            const digest=crypto.createHash('sha256').update(typeof key==='string'?key:'').digest('hex');
            const device=devices.find(d=>equalSecret(d.sha256,digest));
            if(!device)return res.status(401).json({error:'Tablet access required'});
            const input=req.method==='GET'?req.query:req.body;
            if(String(input?.chamber)!==String(device.chamber)||String(input?.seat)!==String(device.seat))return res.status(403).json({error:'This tablet is assigned to a different seat'});
            req.securityActor='device:'+device.id;return next();
        }
        if(!env.KIOSK_API_KEY){
            if(env.KIOSK_DEMO_MODE==='true'){req.securityActor='demo';return next();}
            return res.status(503).json({error:'Tablet authentication is not configured'});
        }
        if(!equalSecret(key,env.KIOSK_API_KEY))return res.status(401).json({error:'Tablet access required'});
        req.securityActor='legacy-tablet';next();
    };
}

// Only trust these headers behind enabled Azure App Service Authentication.
// Azure strips client-supplied identity headers before injecting its own.
function staffAuth(env=process.env) {
    const mode=env.KIOSK_STAFF_AUTH_MODE||'key';
    if(!['key','entra'].includes(mode))throw Error('Invalid staff authentication mode');
    const allowedIds=new Set((env.KIOSK_STAFF_OBJECT_IDS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
    const allowedGroups=new Set((env.KIOSK_STAFF_GROUP_IDS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
    const role=env.KIOSK_STAFF_APP_ROLE||'Tablet.Staff';
    function configured(){return mode==='entra'?Boolean(env.WEBSITE_SITE_NAME&&env.KIOSK_ENTRA_TENANT_ID):Boolean(env.KIOSK_STAFF_KEY||env.KIOSK_API_KEY);}
    function middleware(req,res,next){
        if(!configured())return res.status(503).json({error:'Staff access is not configured'});
        if(mode==='key'){
            if(!equalSecret(req.get('x-kiosk-key'),env.KIOSK_STAFF_KEY||env.KIOSK_API_KEY))return res.status(401).json({error:'Staff access required'});
            req.securityActor='legacy-staff';return next();
        }
        let p;try{p=JSON.parse(Buffer.from(req.get('x-ms-client-principal')||'','base64').toString('utf8'));}catch(_){return res.status(401).json({error:'Sign in with Microsoft'});}
        const claims=Array.isArray(p.claims)?p.claims:[];
        const claim=names=>claims.find(c=>names.includes(c.typ))?.val;
        const tenant=claim(['tid','http://schemas.microsoft.com/identity/claims/tenantid']);
        const oid=claim(['oid','http://schemas.microsoft.com/identity/claims/objectidentifier']);
        if(p.auth_typ!=='aad'||typeof oid!=='string'||!/^[-a-f0-9]{36}$/i.test(oid)||tenant?.toLowerCase()!==env.KIOSK_ENTRA_TENANT_ID.toLowerCase())return res.status(401).json({error:'OxyPeak Microsoft sign-in required'});
        const hasRole=claims.some(c=>['roles','http://schemas.microsoft.com/ws/2008/06/identity/claims/role'].includes(c.typ)&&c.val===role);
        const hasGroup=claims.some(c=>['groups','http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'].includes(c.typ)&&typeof c.val==='string'&&allowedGroups.has(c.val.toLowerCase()));
        if(!allowedIds.has(oid.toLowerCase())&&!hasRole&&!hasGroup)return res.status(403).json({error:'Your account has not been assigned tablet dashboard access. Contact IT.'});
        // Custom header plus origin validation protects cookie-authenticated writes.
        if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('x-staff-action')!=='1')return res.status(403).json({error:'Reload the dashboard before making changes'});
        req.securityActor='staff:'+oid.toLowerCase();next();
    }
    return {mode,configured,middleware};
}

function audit(req,res,next){
    res.on('finish',()=>{
        // Controlled route names only: no queries, keys, patient names or bodies.
        const route=req.route?.path;
        const action=typeof route==='string'?route:'unmatched';
        if(req.securityActor?.startsWith('staff:')||res.statusCode===401||res.statusCode===403){
            console.info(JSON.stringify({event:'kiosk_security',at:new Date().toISOString(),actor:req.securityActor||'anonymous',method:req.method,action,status:res.statusCode}));
        }
    });next();
}
module.exports={PUBLIC_FILES,equalSecret,securityHeaders,originGuard,tabletAuth,staffAuth,audit};
