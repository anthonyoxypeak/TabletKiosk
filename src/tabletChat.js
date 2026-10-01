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
        if(chart.unavailable){rooms.delete(chamber);throw fault(409,'The current dive could not be confirmed.');}
        const testMode=!chart.dive;
        const future=rows.map(r=>normalizeSessionRow(r,{...options,chamberName})).filter(s=>s&&['scheduled','active','in_progress'].includes(s.status)&&s.start.toMillis()>at).map(s=>s.start.toMillis());
        const until=testMode?Math.min(at+30*60000,...future):Date.parse(chart.validUntil),scope=testMode?'between-dives':chart.dive.startTime;
        let room=rooms.get(chamber);
        if(!room||room.scope!==scope||room.until<=at){room={scope,until,testMode,members:new Map(),messages:[],sequence:0};rooms.set(chamber,room);}
        const previous=new Map([...room.members.values()].map(m=>[m.identity,m])),members=new Map(),identities=new Set();
        const entries=testMode?Array.from({length:14},(_,i)=>({seatNumber:i+1,name:'Unassigned'})):chart.seats;
        for(const entry of entries){
            let identity='test-seat:'+entry.seatNumber;
            if(!testMode){
                const row=rows.find(r=>{const s=normalizeSessionRow(r,{...options,chamberName});return s&&s.seatNumber===entry.seatNumber&&['scheduled','active','in_progress'].includes(s.status)&&s.start.toMillis()<=at&&s.end.toMillis()>at;});
                const s=row&&normalizeSessionRow(row,{...options,chamberName});
                if(s?.id==null)throw fault(503,'Seat identity could not be confirmed.');
                // A person retains their conversation when an IA moves them within this dive.
                identity=JSON.stringify([row.patient_id!=null?'patient:'+row.patient_id:'booking:'+s.id,s.start.toMillis(),row.timeslot_id??null]);
            }
            if(identities.has(identity)){rooms.delete(chamber);throw fault(409,'Duplicate guest assignments must be corrected before chatting.');}
            identities.add(identity);
            let member=previous.get(identity);
            if(!member)member={identity,id:crypto.randomUUID(),secret:crypto.randomUUID(),seat:entry.seatNumber,blocked:new Set(),read:new Map(),muted:false,lastSent:-Infinity};
            else if(member.seat!==entry.seatNumber)member.secret=crypto.randomUUID(); // Revoke the old tablet's session.
            member.seat=entry.seatNumber;member.name=entry.name;members.set(entry.seatNumber,member);
        }
        room.members=members;
        const ids=new Set([...members.values()].map(m=>m.id));
        room.messages=room.messages.filter(m=>ids.has(m.from)&&ids.has(m.to));
        for(const m of members.values()){for(const id of m.blocked)if(!ids.has(id))m.blocked.delete(id);for(const id of m.read.keys())if(!ids.has(id))m.read.delete(id);}
        room.until=testMode?Math.min(room.until,until):until;
        return room;
    }
    function snapshot(room,me,summary=false){
        const incoming=room.messages.filter(m=>m.to===me.id&&!me.blocked.has(m.from)&&m.id>(me.read.get(m.from)||0));
        const base={fetchedAt:new Date(now()).toISOString(),validUntil:new Date(room.until).toISOString(),token:me.secret,self:me.id,testMode:room.testMode,muted:me.muted,unreadCount:me.muted?0:incoming.length};
        if(summary)return base;
        return {...base,blocked:[...me.blocked],read:Object.fromEntries(me.read),participants:[...room.members.values()].map(m=>({id:m.id,seat:m.seat,name:m.name})),messages:room.messages.filter(m=>(m.from===me.id||m.to===me.id)&&!me.blocked.has(m.from)).map(({clientId,...m})=>m)};
    }
    const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store, private');try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Chat connection unavailable. Try again shortly.'});}};
    async function tablet(req,res,action){
        const input=req.method==='GET'?{...req.query,token:req.get('x-chat-session')||''}:req.body,{chamber,seat}={chamber:Number(input.chamber),seat:Number(input.seat)};
        if(!validLocation(chamber,seat))throw fault(400,'Invalid chamber or seat.');
        await serial(chamber,async()=>{
            const room=await roomFor(chamber),me=room.members.get(seat);
            if(!me)throw fault(409,'This seat is unassigned. Chat is available during your dive.');
            if((req.method!=='GET'||input.token)&&input.token!==me.secret)throw fault(409,'Your seat assignment changed. Close chat and return to the tablet home screen.');
            if(action)action(input,room,me);
            res.json(snapshot(room,me,req.method==='GET'&&input.summary==='1'));
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
        if(input.readFrom){
            const through=Number(input.through);
            if(!Number.isInteger(through)||through<0)throw fault(400,'Invalid read marker.');
            const confirmed=Math.max(0,...room.messages.filter(m=>m.to===me.id&&m.from===input.readFrom&&m.id<=through).map(m=>m.id));
            me.read.set(input.readFrom,Math.max(me.read.get(input.readFrom)||0,confirmed));
        }
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
