(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StaffAlerts=api;})(typeof window!=='undefined'?window:this,()=>{
    // Alerts contain locations only, never guest names or access keys.
    function createState(now=Date.now){
        let pending=[],known=new Set(),lastSound=-Infinity,updated=0,connected=false;
        return {
            update(requests,serverTime,elapsed=0){
                const timestamp=now(),server=Date.parse(serverTime);connected=Number.isFinite(server);updated=timestamp;
                pending=connected?requests.filter(r=>r.status==='requested'&&r.expiresAt>server+elapsed).map(r=>({id:r.id,chamber:r.chamber,seat:r.seat,deadline:timestamp+r.expiresAt-server-elapsed})):[];
                const fresh=pending.filter(r=>!known.has(r.id));known=new Set(pending.map(r=>r.id));
                return fresh;
            },
            view(){return {connected:connected&&now()-updated<20000,pending:pending.filter(r=>r.deadline>now())};},
            due(force=false){const v=this.view();if(!v.connected||!v.pending.length)return false;if(force||now()-lastSound>=30000){lastSound=now();return true;}return false;},
            failed(){connected=false;},
            reset(){pending=[];known.clear();lastSound=-Infinity;updated=0;connected=false;}
        };
    }
    function mount(){
        const state=createState(),baseTitle='Tablet Dashboard · OxyPeak',bar=document.getElementById('alert-controls'),enable=document.getElementById('enable-alerts'),mute=document.getElementById('mute-alerts'),test=document.getElementById('test-alerts'),label=document.getElementById('alert-status');
        let signedIn=false,soundEnabled=false,muted=false,audio,blink=false,notices=new Map(),audioProblem='',permissionProblem='',chimeUntil=0;
        const icon=document.createElement('link');icon.rel='icon';document.head.append(icon);
        const svg=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="'+color+'"/><text x="16" y="23" text-anchor="middle" font-size="22" font-family="sans-serif" font-weight="bold" fill="white">!</text></svg>');
        function closeNotices(ids=new Set()){for(const [id,n] of notices)if(!ids.has(id)){n.close();notices.delete(id);}}
        function chime(){
            if(!audio||audio.state!=='running'){audioProblem='Sound paused by browser — click Enable alerts again.';render();return;}
            // Sustained notes with headroom; never stack sounds and clip the output.
            if(audio.currentTime<chimeUntil)return;
            chimeUntil=audio.currentTime+2.16;
            [740,980,740,980,740,980].forEach((frequency,i)=>{const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+i*.36;oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.8,start+.015);gain.gain.setValueAtTime(.8,start+.24);gain.gain.linearRampToValueAtTime(0,start+.31);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start);oscillator.stop(start+.32);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
        }
        async function prepareAudio(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Sound is unavailable in this browser.');audio=audio||new Audio();await audio.resume();if(audio.state!=='running')throw Error('Sound was blocked. Try Enable alerts again.');soundEnabled=true;muted=false;audioProblem='';}
        function render(){
            const v=state.view(),active=signedIn&&v.connected&&v.pending.length;
            bar.hidden=!signedIn;mute.hidden=!soundEnabled;mute.textContent=muted?'Unmute sound':'Mute sound';mute.setAttribute('aria-pressed',String(muted));enable.textContent=soundEnabled?'Enable alerts again':'Enable alerts';
            label.textContent=!v.connected?'Connection not confirmed. Alerts resume after a successful check.':(soundEnabled?(muted?'Sound muted.':audioProblem||'Sound enabled. Reminders every 30 seconds until acknowledged.'):audioProblem||'Tab alerts are on. Enable alerts for sound and desktop notifications.')+(typeof Notification!=='undefined'&&Notification.permission==='granted'?' Desktop notifications allowed.':permissionProblem?' '+permissionProblem:'');
            if(!signedIn){document.title=baseTitle;icon.href=svg('#247f70');return;}
            if(!v.connected){document.title='⚠ Connection check · OxyPeak';icon.href=svg('#a96c13');return;}
            if(active){const first=v.pending[0];document.title=blink?'🔴 HELP · Suite '+first.chamber+', Seat '+first.seat+(v.pending.length>1?' +'+(v.pending.length-1):''):v.pending.length+' waiting for help · OxyPeak';icon.href=svg(blink?'#c52727':'#ec7777');}
            else {document.title=baseTitle;icon.href=svg('#247f70');}
        }
        function notify(request){
            if(notices.has(request.id))return;
            if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
            try {const n=new Notification('OxyPeak · Help requested',{body:'Suite '+request.chamber+' · Seat '+request.seat+' — open the dashboard to acknowledge.',tag:'oxypeak-help-'+request.id,requireInteraction:true,silent:true});notices.set(request.id,n);n.onclick=()=>{window.focus();document.getElementById('requests').scrollIntoView({behavior:'auto',block:'start'});n.close();};n.onclose=()=>notices.delete(request.id);}catch(_){permissionProblem='Desktop notification unavailable; tab and sound alerts remain available.';}
        }
        enable.onclick=async()=>{
            // Start both permission requests directly from the user's click.
            const audioWork=prepareAudio();let permissionWork;
            try{if(typeof Notification!=='undefined')permissionWork=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);else permissionProblem='Desktop notifications are not supported here.';}catch(_){permissionProblem='Desktop notification permission could not be requested.';}
            try{await audioWork;if(!signedIn){soundEnabled=false;return;}state.due(true);chime();}catch(error){audioProblem=error.message;}
            if(permissionWork){const permission=await permissionWork.catch(()=> 'denied');permissionProblem=permission==='granted'?'':'Desktop notifications blocked; sound and tab alerts still work.';if(signedIn&&permission==='granted'&&state.view().connected)state.view().pending.forEach(notify);}
            render();
        };
        test.onclick=async()=>{try{await prepareAudio();if(signedIn){state.due(true);chime();}}catch(error){audioProblem=error.message;}render();};
        mute.onclick=()=>{muted=!muted;render();};
        setInterval(()=>{if(!signedIn)return;blink=window.matchMedia('(prefers-reduced-motion: reduce)').matches?true:!blink;const view=state.view();closeNotices(new Set(view.connected?view.pending.map(r=>r.id):[]));if(soundEnabled&&!muted&&state.due())chime();render();},2000);
        return {
            update(data,elapsed=0){signedIn=true;const fresh=state.update(data.requests||[],data.fetchedAt,elapsed),view=state.view();closeNotices(new Set(view.pending.map(r=>r.id)));fresh.forEach(notify);if(soundEnabled&&!muted&&state.due(fresh.length>0))chime();render();},
            failed(){state.failed();closeNotices();render();},
            reset(){signedIn=false;soundEnabled=false;muted=false;chimeUntil=0;state.reset();closeNotices();audio?.suspend().catch(()=>{});render();}
        };
    }
    return {createState,mount};
});
