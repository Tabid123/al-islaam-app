
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response(null,{headers:cors});
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  try{
    const auth=req.headers.get('Authorization')||'';
    if(!auth) return json({error:'unauthorized'},401);

    const url=Deno.env.get('SUPABASE_URL')||'';
    const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const user=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

    const {data:u}=await user.auth.getUser();
    if(!u?.user) return json({error:'unauthorized'},401);
    const {data:roles,error:roleError}=await admin.from('user_roles').select('role').eq('user_id',u.user.id);
    if(roleError) throw roleError;
    if(!(roles||[]).some((r:any)=>r.role==='super_admin')) return json({error:'super_admin_required'},403);

    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'status');

    if(action==='status'){
      const {data:status,error}=await admin.rpc('edahab_admin_status');
      if(error) throw error;
      return json({success:true,integration:status});
    }

    if(action==='save'){
      const agent=String(body?.agent_code||'').trim();
      const phone=String(body?.merchant_phone||'').replace(/\D/g,'');
      const apiKey=typeof body?.api_key==='string'&&body.api_key.trim()?body.api_key.trim():null;
      const apiSecret=typeof body?.api_secret==='string'&&body.api_secret.trim()?body.api_secret.trim():null;
      if(!agent) return json({error:'invalid_agent_code',message:'Agent Code geli.'},400);
      if(phone.length<7||phone.length>15) return json({error:'invalid_merchant_phone',message:'Phone Number sax ah geli.'},400);
      const {data,error}=await admin.rpc('edahab_admin_save',{
        p_agent_code:agent,
        p_merchant_phone:phone,
        p_api_key:apiKey,
        p_api_secret:apiSecret,
        p_is_active:body?.is_active===true,
      });
      if(error) return json({error:error.message},400);
      return json({success:true,integration:data});
    }

    if(action==='delete'){
      const {data,error}=await admin.rpc('edahab_admin_delete');
      if(error) throw error;
      return json({success:true,integration:data});
    }

    return json({error:'unknown_action'},400);
  }catch(e){
    return json({error:e instanceof Error?e.message:'server_error'},500);
  }
});
