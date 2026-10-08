// Cache schedule inputs only. Every response still evaluates dive boundaries now.
// Failed refreshes never serve expired rows. Concurrent readers share one query.
function cacheScheduleProvider(provider, {ttl=10000, now=Date.now}={}) {
    if (!provider?.fetchChamberSessions) return provider;
    const entries = new Map();
    async function fetchChamberSessions(request) {
        const key = JSON.stringify([request.chamberName,request.startDate,request.endDate]);
        const current = entries.get(key);
        if (current?.pending) return current.pending;
        if (current && now() < current.until) return current.rows;
        for (const [key, entry] of entries) if (!entry.pending && entry.until <= now()) entries.delete(key);
        const entry = {until:0};
        entry.pending = Promise.resolve().then(()=>provider.fetchChamberSessions(request)).then(rows=>{
            entry.rows=rows; entry.until=now()+ttl; entry.pending=null; return rows;
        }, error=>{entries.delete(key);throw error;});
        entries.set(key,entry);
        return entry.pending;
    }
    return {...provider,fetchChamberSessions,async fetchSeatSessions(request) {
        const rows=await fetchChamberSessions(request);
        return rows.filter(row=>Number(row.seat_number ?? row.seatNumber ?? row.seat)===Number(request.seatNumber));
    }};
}
module.exports={cacheScheduleProvider};
