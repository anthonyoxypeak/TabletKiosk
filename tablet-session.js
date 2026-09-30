(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TabletSession = factory();
})(typeof window === 'undefined' ? this : window, function () {
    // No names are persisted. The local deadline is derived from server time.
    function create({ storage, storageKey, onReset, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
        let current = null, timer;
        try { current = JSON.parse(storage.getItem(storageKey)); } catch (_) {}
        if (!current || typeof current.key !== 'string' || !Number.isFinite(current.deadline)) current = null;
        function persist() { try { current ? storage.setItem(storageKey, JSON.stringify(current)) : storage.removeItem(storageKey); } catch (_) {} }
        function reset(reason) {
            cancel(timer);
            if (!current) return;
            current = null;
            persist();
            onReset(reason);
        }
        function check() { if (current && now() >= current.deadline) reset('ended'); }
        function arm() {
            cancel(timer);
            if (current) timer = schedule(() => { check(); arm(); }, Math.min(Math.max(0, current.deadline - now()), 2147483647));
        }
        return {
            start() { check(); arm(); },
            check,
            sync(session, serverTime, elapsed = 0) {
                check();
                const remaining = session ? Date.parse(session.endTime) - Date.parse(serverTime) - Math.max(0, elapsed) : 0;
                if (!session || !Number.isFinite(remaining) || remaining <= 0) { reset('ended'); return; }
                if (current && current.key !== session.key) reset('changed');
                current = { key:session.key, deadline:now() + remaining };
                persist(); arm();
            },
            active:() => Boolean(current),
            dispose() { cancel(timer); }
        };
    }
    return { create };
});
