/* The home indicator receives counts only, never message bodies or guest names. */
(() => {
    let token='',session='',generation=0,busy=false,expiry,button,badge;
    function hide(){clearTimeout(expiry);if(badge){badge.hidden=true;badge.textContent='';button.setAttribute('aria-label','Chat');}}
    function reset(){generation++;token='';session='';hide();}
    async function poll(){
        if(!button||busy||document.hidden)return;
        busy=true;const current=generation,started=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
        try{
            const query=new URLSearchParams({chamber:CHAMBER_NUMBER,seat:SEAT_NUMBER,summary:'1'});
            const response=await fetch(`${API_BASE_URL}/api/tablet/chat?${query}`,{credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'X-Kiosk-Key':API_KEY,...(token?{'X-Chat-Session':token}:{})}});
            if(current!==generation||document.hidden)return;
            if(!response.ok){hide();if(response.status===409){token='';generation++;window.TabletExperience?.closeChart();}return;}
            const data=await response.json();if(current!==generation||document.hidden)return;
            const remaining=Date.parse(data.validUntil)-Date.parse(data.fetchedAt)-(performance.now()-started);
            clearTimeout(expiry);if(!(remaining>0)){hide();return;}token=data.token;
            const count=Math.max(0,Number(data.unreadCount)||0),label=count>99?'99+':String(count),aria=count?`Chat, ${count} unread message${count===1?'':'s'}`:'Chat';
            if(badge.textContent!==label)badge.textContent=label;
            if(badge.hidden!==(count===0))badge.hidden=count===0;
            if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
            expiry=setTimeout(hide,Math.min(12000,remaining));
        }catch(_){if(current===generation)hide();}finally{clearTimeout(timer);busy=false;}
    }
    window.TabletChatHome={reset,sync(data){if(session!==data.sessionToken){reset();session=data.sessionToken||'';}poll();}};
    document.addEventListener('DOMContentLoaded',()=>{button=document.getElementById('homeChatButton');badge=document.getElementById('homeChatBadge');button.onclick=()=>document.getElementById('seatingChartLink').click();poll();setInterval(poll,5000);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;hide();}else poll();});
    window.addEventListener('pagehide',reset);
})();
