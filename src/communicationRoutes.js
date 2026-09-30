const express = require('express');
const { validLocation, validId, sessionToken, idleToken } = require('./communications');
function createCommunicationRoutes({ store, requireTablet, staffEnabled, requireStaff, currentSeat, currentChamber }) {
    const router=express.Router();
    const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){console.error('Tablet communication failed; code=%s',error.code||'unavailable');res.status(503).json({error:'Could not confirm delivery. Get staff attention directly.'});}};
    function location(req,res) {
        const source=req.method==='GET'?req.query:req.body;
        const chamber=Number(source?.chamber),seat=Number(source?.seat);
        if(!validLocation(chamber,seat)){res.status(400).json({error:'Invalid chamber or seat'});return null;}
        return {chamber,seat};
    }
    router.get('/api/tablet/communications',requireTablet,wrap(async(req,res)=>{
        const loc=location(req,res);if(!loc)return;
        const token=typeof req.query.session==='string'?req.query.session:'';
        res.json({enabled:staffEnabled(),...await store.forTablet(loc.chamber,loc.seat,token)});
    }));
    router.post('/api/tablet/help',requireTablet,wrap(async(req,res)=>{
        if(!staffEnabled())return res.status(503).json({error:'Tablet requests are not connected yet. Get staff attention directly.'});
        const loc=location(req,res);if(!loc)return;
        if(!validId(req.body.id))return res.status(400).json({error:'Invalid request ID'});
        const appointment=await currentSeat(loc);
        const expected=sessionToken(appointment)||idleToken(loc.chamber,loc.seat);
        if(expected!==req.body.session)return res.status(409).json({error:'The seat assignment changed. Get staff attention directly.'});
        if(req.body.action==='cancel') {
            const ok=await store.updateRequest(req.body.id,'cancelled',req.body.session);
            return res.status(ok?200:409).json({ok});
        }
        if(req.body.action!=='request')return res.status(400).json({error:'Invalid action'});
        const request=await store.request({...loc,id:req.body.id,token:req.body.session,expiresAt:appointment?Date.parse(appointment.endTime):Date.now()+15*60000});
        res.json({request});
    }));
    router.post('/api/tablet/announcement-receipt',requireTablet,wrap(async(req,res)=>{
        const loc=location(req,res);if(!loc)return;
        const ok=await store.receipt(req.body.id,loc.chamber,loc.seat,req.body.session);
        res.status(ok?200:409).json({ok});
    }));
    router.post('/api/staff/requests/:id',requireStaff,wrap(async(req,res)=>{
        if(!['acknowledged','resolved'].includes(req.body.action))return res.status(400).json({error:'Invalid action'});
        const ok=await store.updateRequest(req.params.id,req.body.action);
        res.status(ok?200:409).json({ok});
    }));
    router.post('/api/staff/announcements',requireStaff,wrap(async(req,res)=>{
        const {id,chamber,text}=req.body;
        if(![1,3,4,6].includes(chamber)||!validId(id)||typeof text!=='string'||!text.trim()||text.length>240)return res.status(400).json({error:'Select a chamber and enter up to 240 characters.'});
        const appointments=await currentChamber(chamber);
        if(!appointments.length)return res.status(503).json({error:'Chamber status is unavailable. Try again shortly.'});
        const expiresAt=Math.min(Date.now()+120000,...appointments.filter(a=>a.endTime).map(a=>Date.parse(a.endTime)));
        const recipients=Object.fromEntries(appointments.map(a=>[a.seatNumber,a.token]));
        res.json(await store.announce({id,chamber,text,expiresAt,recipients}));
    }));
    router.post('/api/staff/announcements/:id/dismiss',requireStaff,wrap(async(req,res)=>{
        const ok=await store.dismiss(req.params.id);res.status(ok?200:409).json({ok});
    }));
    return router;
}
module.exports={createCommunicationRoutes};
