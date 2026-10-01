/* Guest conversations are kept in memory only, never in browser storage. */
window.createSeatChat=function({apiBase,apiKey,chamber,seat}){
    const $=id=>document.getElementById(id),dialog=$('chat-dialog'),log=$('chat-log'),draft=$('chat-draft'),message=$('chat-message'),hint=$('chat-hint');
    let self='',data=null,token='',selected='',epoch=0,busy=false,sending=false,locked=false,expiry,signature='',pending=null;
    const read=new Map();
    const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
    function clear(text){clearTimeout(expiry);data=null;epoch++;log.replaceChildren();draft.value='';pending=null;signature='';$('chat-title').textContent='Dive chat';$('chat-send').disabled=true;$('chat-block').disabled=true;$('chat-pause').disabled=true;message.textContent=text;hint.textContent=text;decorate();}
    async function api(path,body){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
        try{const response=await fetch(apiBase+path,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{'X-Kiosk-Key':apiKey,...(token?{'X-Chat-Session':token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Chat unavailable.'),{status:response.status});return result;}finally{clearTimeout(timer);}
    }
    function accept(next,started){
        const remaining=Date.parse(next.validUntil)-Date.parse(next.fetchedAt)-(performance.now()-started);
        if(!(remaining>0)){clear('This dive has ended. Return home for your next dive.');return;}
        if(token&&token!==next.token){locked=true;clear('Your seat changed. Return home before opening chat again.');return;}
        token=next.token;self=next.self;data=next;clearTimeout(expiry);expiry=setTimeout(()=>clear('Checking the current dive. Messages are hidden until reconnected.'),Math.min(remaining,12000));render();
    }
    function decorate(){
        for(const item of document.querySelectorAll('#seats > li')){
            let button=item.querySelector('.chat-seat');const number=Number(item.querySelector('.seat-label')?.textContent.match(/Seat (\d+)/)?.[1]);
            const peer=data?.participants.find(p=>p.seat===number&&p.id!==self);
            if(!peer){button?.remove();continue;}
            if(!button){button=node('button','Chat');button.type='button';button.className='chat-seat';item.append(button);}
            const count=data.messages.filter(m=>m.from===peer.id&&m.to===self&&m.id>(read.get(peer.id)||0)).length;
            button.textContent=count?'Chat · '+count:'Chat';button.classList.toggle('unread',count>0);button.setAttribute('aria-label',`Chat with ${peer.name}, seat ${peer.seat}${count?', '+count+' unread':''}`);button.onclick=()=>open(peer.id);
        }
    }
    function render(){
        if(!data)return;
        const peer=data.participants.find(p=>p.id===selected),blocked=data.blocked.includes(selected);
        $('chat-pause').disabled=false;$('chat-pause').textContent=data.muted?'Resume my chat':'Pause my chat';
        hint.textContent=data.muted?'Your chat is paused. Resume when you want to exchange messages.':'Tap Chat on an occupied seat. Conversations clear after this dive.';
        if(dialog.open){
            $('chat-title').textContent=peer?`${peer.name} · Seat ${peer.seat}`:'Dive chat';
            $('chat-block').disabled=!peer;$('chat-block').textContent=blocked?'Unblock seat':'Block seat';
            $('chat-send').disabled=!peer||blocked||data.muted||sending;draft.disabled=!peer||blocked||data.muted;
            if(!peer){log.replaceChildren();draft.value='';signature='';message.textContent='This guest is no longer in the dive.';}
            else{
                const rows=data.messages.filter(m=>(m.from===self&&m.to===selected)||(m.from===selected&&m.to===self));
                const next=JSON.stringify(rows);
                if(next!==signature){signature=next;log.replaceChildren();if(!rows.length)log.append(node('p','Say hello! Keep messages friendly.'));for(const m of rows){const bubble=node('div','');bubble.className='chat-bubble'+(m.from===self?' outgoing':'');bubble.append(node('strong',m.from===self?'You':peer.name),node('p',m.text));log.append(bubble);}log.scrollTop=log.scrollHeight;}
                if(!document.hidden)read.set(selected,Math.max(read.get(selected)||0,...rows.filter(m=>m.from===selected).map(m=>m.id)));
                if(blocked||data.muted)message.textContent=blocked?'This seat is blocked.':'Your chat is paused.';
            }
        }
        decorate();
    }
    function open(id){selected=id;signature='';draft.value='';pending=null;message.textContent='';if(!dialog.open)dialog.showModal();render();if(!draft.disabled)draft.focus();}
    async function poll(){
        if(document.hidden||busy||locked)return;busy=true;const version=epoch,started=performance.now();
        try{const next=await api('/api/tablet/chat?'+new URLSearchParams({chamber,seat}));if(version===epoch&&!document.hidden)accept(next,started);}
        catch(e){if(version===epoch){if(e.status===409&&token)locked=true;clear(e.name==='AbortError'?'Chat connection timed out. Trying again…':e.message);}}
        finally{busy=false;}
    }
    $('chat-close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{draft.value='';pending=null;signature='';log.replaceChildren();});
    $('chat-form').onsubmit=async event=>{
        event.preventDefault();if(!data||sending||!selected)return;
        const text=draft.value.trim();if(!text)return;
        if(!pending||pending.text!==text||pending.to!==selected)pending={id:crypto.randomUUID(),text,to:selected};
        const version=epoch,started=performance.now(),attempt=pending;sending=true;render();message.textContent='Sending…';
        try{const next=await api('/api/tablet/chat',{chamber:Number(chamber),seat:Number(seat),token,...attempt});if(version!==epoch)return;draft.value='';pending=null;message.textContent='Sent';accept(next,started);}
        catch(e){if(version!==epoch)return;if(e.status===409){locked=true;clear(e.message);}else message.textContent=e.status?e.message:'Delivery not confirmed. Tap Send again to retry.';}
        finally{sending=false;render();}
    };
    async function preference(body){if(!data)return;const version=epoch,started=performance.now();try{const next=await api('/api/tablet/chat/preferences',{chamber:Number(chamber),seat:Number(seat),token,...body});if(version===epoch){message.textContent='';accept(next,started);}}catch(e){if(version===epoch)clear(e.message);}}
    $('chat-block').onclick=()=>preference({to:selected,blocked:!data.blocked.includes(selected)});
    $('chat-pause').onclick=()=>preference({muted:!data.muted});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clear('Return to the seating chart to reconnect chat.');else poll();});
    window.addEventListener('pagehide',()=>{clear('Chat closed.');if(dialog.open)dialog.close();});
    window.addEventListener('pageshow',poll);setInterval(poll,5000);poll();
    return {decorate};
};
