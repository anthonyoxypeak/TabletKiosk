/* Shared request budget for the home page and its same-origin seating iframe. */
(() => {
    let shared;
    try { if (window.parent !== window) shared = window.parent.TabletPolling; } catch (_) {}
    const state = shared?.state || { stopped:false, due:new Map(), failures:new Map() };
    const setupMessage = 'This tablet needs setup. Staff: reload the saved start page.';
    function stop() {
        state.stopped = true;
        if (!document.getElementById('tablet-setup-warning')) {
            const warning = document.createElement('div');
            warning.id = 'tablet-setup-warning'; warning.setAttribute('role','alert');
            warning.textContent = setupMessage;
            warning.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:20px;background:#fff3db;color:#173048;font:bold 20px system-ui;text-align:center';
            document.body.append(warning);
        }
        shared?.stop();
        window.dispatchEvent(new Event('tablet-auth-required'));
    }
    function begin(channel, interval) {
        if (state.stopped || document.hidden || Date.now() < (state.due.get(channel) || 0)) return false;
        state.due.set(channel, Date.now() + interval);
        return true;
    }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function(input, options = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith('/api/tablet/')) return nativeFetch(input, options);
        if (state.stopped || !new Headers(options.headers).get('X-Kiosk-Key')) {
            stop(); throw Object.assign(Error(setupMessage), {status:401});
        }
        const channel = url.pathname.split('/').pop() + (url.searchParams.get('summary') === '1' ? '-summary' : '');
        function backoff() {
            const failures = (state.failures.get(channel) || 0) + 1;
            state.failures.set(channel, failures);
            const delay = Math.min(60000, 5000 * 2 ** Math.min(failures, 4));
            state.due.set(channel, Math.max(state.due.get(channel) || 0, Date.now() + delay + Math.random() * 2000));
        }
        try {
            const response = await nativeFetch(input, options);
            if (response.status === 401) { stop(); throw Object.assign(Error(setupMessage), {status:401}); }
            if (response.status >= 500 || response.status === 429) backoff();
            else if (response.ok) state.failures.delete(channel);
            return response;
        } catch (error) { if (error.status !== 401) backoff(); throw error; }
    };
    window.TabletPolling = {state, begin, stop};
})();
