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
        send.disabled=busy||!enabled||!token||active;send.hidden=Boolean(active);send.textContent=busy?'Sending…':'Request staff help';help.dataset.state=request?.status||'ready';
        cancel.hidden=!active;cancel.disabled=busy;
        status.textContent=!enabled?'Help requests are unavailable.\nPlease get staff attention directly.':!token?'Connecting to your seat…\nPlease get staff attention directly if you need help now.':busy?'Sending your request…':request?.status==='acknowledged'?'Staff has seen your request.\nYou can close this window.':active?'Your request has been sent.\nWaiting for staff to see it.':request?.status==='resolved'?'Your request is complete.\nNeed anything else? Send a new request.':request?.status==='cancelled'?'Request cancelled.\nYou can ask again whenever you need.':'Need a hand?\nTap below to ask staff for help.';
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
        const style=document.createElement('style');style.textContent=".support-dialog{box-sizing:border-box;width:min(640px,94vw);max-height:94dvh;overflow:auto;border:0;border-radius:24px;padding:26px;background:#fff;color:#173048;font:20px/1.45 system-ui}.support-dialog::backdrop{background:#102a43aa}.support-dialog h2{font-size:28px;margin:0 0 16px}.support-dialog button{font:inherit;min-height:54px;padding:12px 20px;border:1px solid #b7ccca;border-radius:14px;background:white;color:#173048;cursor:pointer}.support-dialog button:focus-visible{outline:3px solid #247f70;outline-offset:3px}.support-dialog button:disabled{opacity:.55}.support-dialog [hidden]{display:none!important}.support-dialog #support-status{white-space:pre-line;font-size:23px;font-weight:650;line-height:1.5;padding:20px;background:#edf6f3;border-radius:16px;margin:0 0 18px}.support-dialog[data-state=requested] #support-status{background:#fff3db}.support-dialog[data-state=acknowledged] #support-status{background:#ddf3e9;border:2px solid #287f70}.support-actions{display:flex;gap:10px;flex-wrap:wrap}.support-dialog #support-send{background:#247f70;color:white;border-color:#247f70;flex:1}.support-dialog #support-close{margin-left:auto}.support-tips{font-size:17px;margin-top:20px}.support-tips summary{cursor:pointer;font-weight:650}.support-tips p{margin:12px 0}.support-urgent{font-size:16px;margin:18px 0 0;color:#526b7c}@media(max-height:520px){.support-dialog{padding:18px;font-size:18px}.support-dialog h2{font-size:25px;margin-bottom:10px}.support-dialog #support-status{font-size:21px;padding:14px;margin-bottom:12px}.support-tips{margin-top:12px}.support-urgent{margin-top:12px}}";document.head.append(style);
        help=document.createElement('dialog');help.className='support-dialog';help.setAttribute('aria-label','Help');
        help.innerHTML="<h2>Help from staff</h2><p id=\"support-status\" role=\"status\" aria-live=\"polite\"></p><div class=\"support-actions\"><button id=\"support-send\">Request staff help</button><button id=\"support-cancel\" hidden>Cancel request</button><button id=\"support-close\">Close</button></div><details class=\"support-tips\"><summary>Headphones, volume &amp; getting around</summary><p><strong>Headphones:</strong> Plug them into the tablet.</p><p><strong>Volume:</strong> Tap the volume buttons on the main screen.</p><p><strong>Home:</strong> Tap Back to home to leave a game or seating chart.</p><p><strong>Dim screen:</strong> Tap the moon at the top of the homepage.</p></details><p class=\"support-urgent\">Need urgent help? Get staff attention directly.</p>";
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
