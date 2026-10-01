const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildSeatingChart } = require('./seatingChart');
const { normalizeSessionRow } = require('./kioskService');
const { validLocation, validId } = require('./communications');

// Local English-language screening. Boundaries avoid matching innocent substrings.
const roots = ['ass','dickhead','prick','wanker','twat','arsehole','tits','whore','slut','fuck','shit','bitch','asshole','bastard','cunt','dick','cock','pussy','motherfucker','bullshit','nigger','nigga','faggot','retard'];
const profanity = new RegExp('(?:^|[^a-z0-9])(?:'+roots.map(w=>w.split('').map(c=>c+'+').join('[\\s\\p{P}\\p{S}]*')).join('|')+')(?:s|es|ed|ing|er|ers|y)?(?=$|[^a-z0-9])','iu');
function cleanMessage(value) {
    if(typeof value!=='string') throw fault(400,'Enter a message.');
    const text=value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').trim();
    if(!text || [...text].length>300) throw fault(400,'Use 1–300 characters.');
    const folded=value.normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu,'').toLowerCase().replace(/(?<=[a-z])!(?=[a-z])/g,'i').replace(/[013457@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s','!':'i'}[c]));
    if(profanity.test(folded)) throw fault(422,'Please reword your message without profanity.');
    return text;
}
function fault(status,message){return Object.assign(Error(message),{status});}

function createTabletChat({loadRows,requireTablet,requireStaff,settingsPath,options={},now=Date.now}) {
    const router=express.Router(),rooms=new Map(),queues=new Map();
    let paused={},settingsQueue=Promise.resolve();
    const ready=settingsPath?fs.readFile(settingsPath,'utf8').then(s=>{const data=JSON.parse(s);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid settings');paused=data;}).catch(e=>{if(e.code!=='ENOENT')throw e;}):Promise.resolve();
    ready.catch(()=>{}); // Awaiters fail closed without an unhandled startup rejection.
    function prune(){for(const [chamber,room] of rooms)if(room.until<=now())rooms.delete(chamber);}
    const sweep=setInterval(prune,1000);sweep.unref();
    function serial(chamber,work){const task=(queues.get(chamber)||Promise.resolve()).then(work);const tail=task.catch(()=>{});queues.set(chamber,tail);tail.finally(()=>{if(queues.get(chamber)===tail)queues.delete(chamber);});return task;}
    async function roomFor(chamber) {
        await ready;prune();
        if(paused[chamber]){rooms.delete(chamber);throw fault(403,'Staff have paused chat for this chamber.');}
        const chamberName=(options.chamberPrefix||'HBOT')+' '+chamber;
        const rows=await loadRows(chamberName),at=now();
        const chart=buildSeatingChart(rows,{...options,chamberName,now:new Date(at)});
        if(chart.unavailable||!chart.dive){rooms.delete(chamber);throw fault(409,'Chat is available only during an active dive with confirmed seats.');}
        const until=Date.parse(chart.validUntil),scope=chart.dive.startTime;
        let room=rooms.get(chamber);
        if(!room||room.scope!==scope||room.until<=at){room={scope,until,members:new Map(),messages:[],sequence:0};rooms.set(chamber,room);}
        const live=new Set();
        for(const entry of chart.seats){
            const row=rows.find(r=>{const s=normalizeSessionRow(r,{...options,chamberName});return s&&s.seatNumber===entry.seatNumber&&['scheduled','active','in_progress'].includes(s.status)&&s.start.toMillis()<=at&&s.end.toMillis()>at;});
            const s=row&&normalizeSessionRow(row,{...options,chamberName});
            if(s?.id==null)throw fault(503,'Seat identity could not be confirmed.');
            const identity=JSON.stringify([s.id,row.patient_id??null,s.start.toMillis(),s.end.toMillis(),row.timeslot_id??null]);
            let member=room.members.get(entry.seatNumber);
            if(!member||member.identity!==identity){member={identity,id:crypto.randomUUID(),secret:crypto.randomUUID(),seat:entry.seatNumber,blocked:new Set(),muted:false,lastSent:-Infinity};room.members.set(entry.seatNumber,member);}
            member.name=entry.name;live.add(entry.seatNumber);
        }
        for(const seat of room.members.keys())if(!live.has(seat))room.members.delete(seat);
        const ids=new Set([...room.members.values()].map(m=>m.id));
        room.messages=room.messages.filter(m=>ids.has(m.from)&&ids.has(m.to));
        for(const m of room.members.values())for(const id of m.blocked)if(!ids.has(id))m.blocked.delete(id);
        room.until=until;
        return room;
    }
    function snapshot(room,me){return {fetchedAt:new Date(now()).toISOString(),validUntil:new Date(room.until).toISOString(),token:me.secret,self:me.id,muted:me.muted,blocked:[...me.blocked],participants:[...room.members.values()].map(m=>({id:m.id,seat:m.seat,name:m.name})),messages:room.messages.filter(m=>(m.from===me.id||m.to===me.id)&&!me.blocked.has(m.from)).map(({clientId,...m})=>m)};}
    const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store, private');try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Chat connection unavailable. Try again shortly.'});}};
    async function tablet(req,res,action){
        const input=req.method==='GET'?{...req.query,token:req.get('x-chat-session')||''}:req.body,{chamber,seat}={chamber:Number(input.chamber),seat:Number(input.seat)};
        if(!validLocation(chamber,seat))throw fault(400,'Invalid chamber or seat.');
        await serial(chamber,async()=>{
            const room=await roomFor(chamber),me=room.members.get(seat);
            if(!me)throw fault(409,'This seat is unassigned. Chat is available during your dive.');
            if((req.method!=='GET'||input.token)&&input.token!==me.secret)throw fault(409,'Your seat assignment changed. Close chat and return to the tablet home screen.');
            if(action)action(input,room,me);
            res.json(snapshot(room,me));
        });
    }
    router.get('/api/tablet/chat',requireTablet,wrap((req,res)=>tablet(req,res)));
    router.post('/api/tablet/chat',requireTablet,wrap((req,res)=>tablet(req,res,(input,room,me)=>{
        const other=[...room.members.values()].find(m=>m.id===input.to);
        if(!other||other===me)throw fault(409,'That guest is no longer available.');
        if(me.muted||other.muted||me.blocked.has(other.id)||other.blocked.has(me.id))throw fault(403,'Chat with this seat is paused.');
        if(!validId(input.id))throw fault(400,'Invalid message ID.');
        if(room.messages.some(m=>m.from===me.id&&m.clientId===input.id))return;
        const text=cleanMessage(input.text);
        if(now()-me.lastSent<1500)throw fault(429,'Please wait a moment before sending another message.');
        me.lastSent=now();room.messages.push({id:++room.sequence,clientId:input.id,from:me.id,to:other.id,text,at:now()});
        if(room.messages.length>500)room.messages.splice(0,room.messages.length-500);
    })));
    router.post('/api/tablet/chat/preferences',requireTablet,wrap((req,res)=>tablet(req,res,(input,room,me)=>{
        if(typeof input.muted==='boolean')me.muted=input.muted;
        if(typeof input.blocked==='boolean'){
            if(![...room.members.values()].some(m=>m.id===input.to&&m!==me))throw fault(400,'Select a current seat.');
            input.blocked?me.blocked.add(input.to):me.blocked.delete(input.to);
        }
    })));
    router.post('/api/staff/chat',requireStaff,wrap(async(req,res)=>{
        const {chamber,paused:pause}=req.body;
        if(!validLocation(chamber,1)||typeof pause!=='boolean')throw fault(400,'Select a chamber and chat setting.');
        await serial(chamber,async()=>{
            const operation=settingsQueue.then(async()=>{await ready;const next={...paused,[chamber]:pause};if(settingsPath){await fs.mkdir(path.dirname(settingsPath),{recursive:true});await fs.writeFile(settingsPath+'.tmp',JSON.stringify(next),{mode:0o600});await fs.rename(settingsPath+'.tmp',settingsPath);}paused=next;rooms.delete(chamber);});
            settingsQueue=operation.catch(()=>{});await operation;
        });res.json({ok:true});
    }));
    return {router,async settings(){await ready;return {pausedChambers:[1,3,4,6].filter(c=>paused[c])};},close(){clearInterval(sweep);}};
}
module.exports={createTabletChat,cleanMessage};
