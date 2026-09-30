const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const CHAMBERS = [1,3,4,6];
const validLocation = (chamber, seat) => CHAMBERS.includes(chamber) && Number.isInteger(seat) && seat >= 1 && seat <= 14;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id);
function sessionToken(appointment) {
    if (!appointment) return '';
    return crypto.createHash('sha256').update(`${appointment.chamberNumber}:${appointment.seatNumber}:${appointment.id || ''}:${appointment.startTime}`).digest('hex');
}
function createCommunications({ filePath, now = Date.now }) {
    let state = { version:1, requests:{}, announcements:{} };
    // A failed read must fail closed, never silently replace an unreadable queue.
    const ready = fs.readFile(filePath, 'utf8').then(text => {
        const saved = JSON.parse(text);
        if (saved.version !== 1 || !saved.requests || !saved.announcements) throw Error('Invalid communications state');
        state = saved;
    }).catch(error => { if (error.code !== 'ENOENT') throw error; });
    let queue = ready.catch(() => {});
    const active = item => item && item.expiresAt > now();
    function mutate(operation) {
        const work = queue.then(async () => {
            await ready;
            const next = structuredClone(state);
            const result = operation(next);
            if (JSON.stringify(next) !== JSON.stringify(state)) {
                await fs.mkdir(path.dirname(filePath), { recursive:true });
                const temporary = `${filePath}.${process.pid}.tmp`;
                await fs.writeFile(temporary, JSON.stringify(next), { mode:0o600 });
                await fs.rename(temporary, filePath);
                state = next;
            }
            return result;
        });
        queue = work.catch(() => {});
        return work;
    }
    async function read() { await ready; await queue; }
    return {
        async snapshot() {
            await read();
            return {
                requests:Object.values(state.requests).filter(r => active(r) && ['requested','acknowledged'].includes(r.status)).map(({ token, ...r }) => r),
                announcements:Object.values(state.announcements).filter(a => active(a) && !a.dismissed).map(({ recipients, ...a }) => ({ ...a, targetCount:Object.keys(recipients).length, displayedCount:Object.keys(a.receipts).length }))
            };
        },
        async forTablet(chamber, seat, token) {
            await read();
            const request = state.requests[`${chamber}:${seat}`];
            const announcement = state.announcements[chamber];
            return {
                fetchedAt:new Date(now()).toISOString(),
                request:active(request) && request.token === token ? { id:request.id, status:request.status, expiresAt:request.expiresAt } : null,
                announcement:active(announcement) && !announcement.dismissed && announcement.recipients[seat] === token
                    ? { id:announcement.id, text:announcement.text, expiresAt:announcement.expiresAt } : null
            };
        },
        request({ chamber, seat, token, expiresAt, id }) {
            if (!validLocation(chamber,seat) || !validId(id) || !token || !Number.isFinite(expiresAt) || expiresAt <= now()) return Promise.reject(Error('Invalid request'));
            return mutate(next => {
                const key = `${chamber}:${seat}`, old = next.requests[key];
                if (active(old) && old.token === token && (old.id === id || ['requested','acknowledged'].includes(old.status))) return { id:old.id,status:old.status };
                const request = { id,chamber,seat,token,expiresAt,status:'requested',createdAt:now(),updatedAt:now() };
                next.requests[key] = request;
                return { id,status:request.status };
            });
        },
        reconcile(chamber,seat,token) {
            return mutate(next => {
                const request = next.requests[`${chamber}:${seat}`];
                if (active(request) && request.token !== token) { request.status='cancelled'; request.updatedAt=now(); }
            });
        },
        updateRequest(id, action, token) {
            return mutate(next => {
                const request = Object.values(next.requests).find(r=>r.id===id);
                if (!active(request) || !['requested','acknowledged'].includes(request.status)) return false;
                if (action==='cancelled' && request.token !== token) return false;
                if (!['acknowledged','resolved','cancelled'].includes(action)) return false;
                if (action==='acknowledged' && request.status!=='requested') return true;
                request.status=action;request.updatedAt=now();return true;
            });
        },
        announce({ id,chamber,text,expiresAt,recipients }) {
            if (!validId(id) || !CHAMBERS.includes(chamber) || typeof text!=='string' || !text.trim() || text.length>240 || !Number.isFinite(expiresAt) || expiresAt<=now()) return Promise.reject(Error('Invalid announcement'));
            return mutate(next => {
                const old=next.announcements[chamber];
                if (old?.id===id) return { id:old.id }; // A retry cannot resurrect a dismissed message.
                next.announcements[chamber]={id,chamber,text:text.trim(),expiresAt,recipients,receipts:{},createdAt:now()};
                return {id};
            });
        },
        receipt(id,chamber,seat,token) {
            return mutate(next => {
                const a=next.announcements[chamber];
                if (!active(a) || a.dismissed || a.id!==id || a.recipients[seat]!==token) return false;
                if (!a.receipts[seat]) a.receipts[seat]=now();
                return true;
            });
        },
        dismiss(id) { return mutate(next=>{const a=Object.values(next.announcements).find(a=>a.id===id);if(!a)return false;a.dismissed=true;return true;}); }
    };
}
module.exports = { createCommunications, sessionToken, validLocation, validId };
