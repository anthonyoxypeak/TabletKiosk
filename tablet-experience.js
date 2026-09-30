/* Home remains mounted while the seating chart or games are open. */
(() => {
    const VERSION = '1.2.0';
    let dialog, frame, lifecycle, lastSync = 'checking', heartbeatPending = false;
    const chartLink = document.getElementById('seatingChartLink');
    const gamesLink = document.getElementById('gamesLink');
    let opener = chartLink;
    function closeChart() {
        if (!dialog || !dialog.open) return;
        dialog.close();
        frame.src = 'about:blank'; // Destroy guest content and any pending responses.
        opener?.focus();
    }
    function resetGuest() {
        closeChart();
        window.TabletSupport?.reset();
        acknowledgedWelcomeSessionKey = '';
        try { sessionStorage.removeItem(WELCOME_ACK_STORAGE_KEY); } catch (_) {}
        resetComfortSettingsForSeat();
        setText(els.patientStartName, 'Welcome');
        setText(els.patientStartSubtitle, '');
        showEmpty();
        window.scrollTo(0, 0);
        // Bring the kiosk home tab forward where the native bridge is available.
        // Third-party cookies and external app sessions are not changed here.
        try { if (typeof fully !== 'undefined') fully.focusThisTab(); } catch (_) {}
        setTimeout(fetchAndDisplayAppointment, 0);
    }
    async function heartbeat() {
        if (heartbeatPending) return;
        heartbeatPending = true;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            await fetch(`${API_BASE_URL}/api/tablet/heartbeat`, {
                method:'POST', cache:'no-store', signal:controller.signal,
                headers:{ 'Content-Type':'application/json', 'X-Kiosk-Key':API_KEY },
                body:JSON.stringify({ chamber:CHAMBER_NUMBER, seat:SEAT_NUMBER, version:VERSION,
                    sync:lastSync, view:document.hidden ? 'background' : dialog?.open ? 'chart' : 'home',
                    cleanup:typeof fully !== 'undefined' && typeof fully.focusThisTab === 'function' ? 'ready' : 'browser-only' })
            });
        } catch (_) { /* The dashboard expires missing check-ins using server time. */ }
        finally { clearTimeout(timer); heartbeatPending = false; }
    }
    window.TabletExperience = {
        sync(data, elapsed) {
            lastSync = 'ok';
            const appt = data.activeAppointment || data.active_appointment;
            lifecycle?.sync(appt ? {
                key:`${appt.id || ''}:${appt.startTime || appt.start_time}`,
                endTime:appt.endTime || appt.end_time
            } : null, data.fetchedAt, elapsed);
            window.TabletSupport?.sync(data);
        },
        failed() { lastSync = 'error'; },
        check() { lifecycle?.check(); },
        closeChart
    };
    document.addEventListener('DOMContentLoaded', () => {
        dialog = document.createElement('dialog');
        dialog.id = 'chartDialog';
        dialog.setAttribute('aria-label', 'Seating chart');
        dialog.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;max-width:none;height:100vh;max-height:none;background:#f4f7f9';
        frame = document.createElement('iframe');
        frame.title = 'Current dive seating chart';
        frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
        dialog.append(frame); document.body.append(dialog);
        function openPanel(link, title, event) {
            if (typeof dialog.showModal !== 'function' || location.protocol === 'file:') return;
            event.preventDefault();
            lifecycle.check();
            opener = link;
            dialog.setAttribute('aria-label', title);
            frame.title = title;
            frame.src = link.href;
            dialog.showModal();
        }
        chartLink.addEventListener('click', event => openPanel(chartLink, 'Current dive seating chart', event));
        gamesLink?.addEventListener('click', event => openPanel(gamesLink, 'Games', event));
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('offline-worker.js').catch(() => {});
        dialog.addEventListener('cancel', event => { event.preventDefault(); closeChart(); });
        window.addEventListener('message', event => {
            if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
            if (event.data?.type === 'oxypeak-chart-close') closeChart();
            if (event.data?.type === 'oxypeak-help-open') window.TabletSupport?.open();
        });
        let storage;
        try { storage = localStorage; } catch (_) { storage = { getItem:() => null, setItem() {}, removeItem() {} }; }
        lifecycle = TabletSession.create({ storage, storageKey:`oxypeak-expiry:${CHAMBER_NUMBER}:${SEAT_NUMBER}`, onReset:resetGuest });
        lifecycle.start();
        setInterval(() => lifecycle.check(), 1000);
        document.addEventListener('visibilitychange', () => {
            lifecycle.check();
            if (!document.hidden) { fetchAndDisplayAppointment(); heartbeat(); }
        });
        window.addEventListener('pageshow', () => { lifecycle.check(); fetchAndDisplayAppointment(); });
        setInterval(heartbeat, 60000);
        heartbeat();
    });
})();
