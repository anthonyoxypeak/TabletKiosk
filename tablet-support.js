/* Routine requests and announcements are scoped to the server-issued dive token. */
(() => {
    let token='', enabled=false, request=null, pendingId='', busy=false, polling=false, epoch=0, dismissed='', deadline=0;
    let help, announcement, message, status, send, cancel, trigger;
    const id=()=>crypto.randomUUID();
    async function api(path,body) {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
        try {
            const response=await fetch(`${API_BASE_URL}${path}`,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,
                headers:{'X-Kiosk-Key':API_KEY,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
            const data=await response.json();if(!response.ok)throw Error(data.error||'Could not confirm delivery.');return data;
        } finally {clearTimeout(timer);}
    }
    function render() {
        if(!status)return;
        const active=request&&['requested','acknowledged'].includes(request.status);
        trigger.style.background=active?'#ffdc89':'';
        send.disabled=busy||!enabled||!token||active;
        cancel.hidden=!active;cancel.disabled=busy;
        status.textContent=!enabled?'Staff requests are not connected yet. Please get staff attention directly.':!token?'Please get staff attention directly. The tablet is still checking its seat connection.':request?.status==='acknowledged'?'Staff acknowledged your request.':active?'Request received by the dashboard. Waiting for staff to acknowledge.':request?.status==='resolved'?'Staff marked your request complete.':request?.status==='cancelled'?'Request cancelled.':'You can request routine assistance from staff, including between dives.';
    }
    async function act(action) {
        if(busy||!token)return;busy=true;render();const captured=epoch;
        pendingId=action==='cancel'?request.id:pendingId||id();
        try {
            const data=await api('/api/tablet/help',{chamber:CHAMBER_NUMBER,seat:SEAT_NUMBER,session:token,id:pendingId,action});
            if(captured!==epoch)return;
            request=action==='cancel'?{...request,status:'cancelled'}:data.request;pendingId='';
        } catch(error) {if(captured===epoch){busy=false;render();status.textContent=`Delivery not confirmed. Get staff attention directly. ${error.name==='AbortError'?'Connection timed out.':error.message}`;return;}}
        finally {busy=false;}
        render();
    }
    async function poll() {
        if(polling||document.hidden||!token)return;polling=true;
        const captured=epoch,started=Date.now();
        try {
            const data=await api(`/api/tablet/communications?chamber=${CHAMBER_NUMBER}&seat=${SEAT_NUMBER}&session=${encodeURIComponent(token)}`);
            if(captured!==epoch||document.hidden)return;
            enabled=data.enabled;request=data.request;render();
            const a=data.announcement;
            if(!a){announcement.close();deadline=0;return;}
            deadline=Date.now()+Math.max(0,a.expiresAt-Date.parse(data.fetchedAt)-(Date.now()-started));
            if(a.id===dismissed||deadline<=Date.now())return;
            message.textContent=a.text;
            announcement.dataset.messageId=a.id;
            if(!announcement.open)announcement.showModal();
            await api('/api/tablet/announcement-receipt',{id:a.id,chamber:CHAMBER_NUMBER,seat:SEAT_NUMBER,session:token});
            announcement.dataset.messageId=a.id;
        } catch(_) {if(captured===epoch&&help.open)status.textContent='Connection unavailable. Request status cannot be confirmed. Get staff attention directly.';}
        finally {polling=false;}
    }
    function reset() {epoch++;token='';request=null;pendingId='';dismissed='';deadline=0;help?.close();announcement?.close();render();}
    window.TabletSupport={reset,open:()=>{render();help.showModal();poll();},sync(data){
        const next=data.sessionToken||'';if(next!==token)reset();token=next;enabled=Boolean(data.staffMessagingEnabled);render();poll();
    }};
    document.addEventListener('DOMContentLoaded',()=>{
        const style=document.createElement('style');style.textContent='.support-dialog{box-sizing:border-box;width:min(580px,94vw);max-height:90vh;overflow:auto;border:1px solid #bed5d5;border-radius:20px;padding:24px;background:#fff;color:#173048;font:18px/1.5 system-ui}.support-dialog::backdrop{background:#102a4399}.support-dialog button{font:inherit;min-height:44px;padding:10px 16px;margin:4px;border:1px solid #bed5d5;border-radius:10px;background:#f4f7f9;color:#173048}.support-dialog h2{margin-top:0}.support-dialog [hidden]{display:none!important}';document.head.append(style);
        help=document.createElement('dialog');help.className='support-dialog';help.setAttribute('aria-label','Help');
        help.innerHTML='<h2>Need a hand?</h2><p><strong>Headphones &amp; volume:</strong> Plug in your headphones, then use the tablet’s volume buttons. Keep the volume comfortable.</p><p><strong>Getting around:</strong> Choose Back to home to leave Games or the seating chart. Use the moon for a dimmer display.</p><p>For urgent help, get staff attention directly using the chamber’s usual method. This button is for routine assistance.</p><p id="support-status" role="status"></p><button id="support-send">Request staff help</button><button id="support-cancel" hidden>Cancel request</button><button id="support-close">Close</button>';
        announcement=document.createElement('dialog');announcement.className='support-dialog';announcement.setAttribute('aria-label','Message from staff');
        announcement.innerHTML='<h2>Message from staff</h2><p></p><button>Got it</button>';document.body.append(help,announcement);
        message=announcement.querySelector('p');status=help.querySelector('#support-status');send=help.querySelector('#support-send');cancel=help.querySelector('#support-cancel');trigger=document.getElementById('helpButton');
        trigger.onclick=()=>window.TabletSupport.open();send.onclick=()=>act('request');cancel.onclick=()=>act('cancel');help.querySelector('#support-close').onclick=()=>help.close();
        function dismiss(){dismissed=announcement.dataset.messageId||'';announcement.close();}
        announcement.querySelector('button').onclick=dismiss;announcement.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
        setInterval(poll,5000);setInterval(()=>{if(deadline&&Date.now()>=deadline){announcement.close();deadline=0;}},500);
        document.addEventListener('visibilitychange',()=>{if(document.hidden)announcement.close();else poll();});render();
    });
})();
