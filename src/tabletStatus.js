const CHAMBERS = [1, 3, 4, 6];
function createTabletStatus({ version, now = Date.now } = {}) {
    // Bounded, process-local operational data only. No patient or device identifiers.
    const records = new Map();
    const startedAt = new Date(now()).toISOString();
    return {
        record(body) {
            const { chamber, seat } = body || {};
            if (!CHAMBERS.includes(chamber) || !Number.isInteger(seat) || seat < 1 || seat > 14) return false;
            if (typeof body.version !== 'string' || !/^[\w.-]{1,40}$/.test(body.version) || !['ok','error','checking'].includes(body.sync)) return false;
            records.set(`${chamber}:${seat}`, {
                chamber, seat, version:body.version, sync:body.sync,
                view:['home','chart','background'].includes(body.view) ? body.view : 'home',
                cleanup:['ready','browser-only'].includes(body.cleanup) ? body.cleanup : 'browser-only',
                lastSeen:now()
            });
            return true;
        },
        snapshot() {
            const timestamp = now();
            return { version, startedAt, fetchedAt:new Date(timestamp).toISOString(), tablets:CHAMBERS.flatMap(chamber =>
                Array.from({ length:14 }, (_, i) => {
                    const seat = i + 1, record = records.get(`${chamber}:${seat}`);
                    return record ? { ...record, lastSeen:new Date(record.lastSeen).toISOString(),
                        status:timestamp - record.lastSeen > 150000 ? 'stale' : 'reporting',
                        updateAvailable:record.version !== version }
                        : { chamber, seat, status:'unknown' };
                })) };
        }
    };
}
module.exports = { createTabletStatus };
