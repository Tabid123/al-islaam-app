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
      const [{data,statusError},{data:cred, error:credError}]=await Promise.all([
        admin.rpc('waafipay_admin_status'),
        admin.rpc('waafipay_admin_credentials'),
      ]);
      if(statusError) throw statusError;
      if(credError && status?.configured) throw credError;
      const merchant=String(cred?.merchant_uid||'');
      const apiUser=String(cred?.api_user_id||'');
      const key=String(cred?.api_key||'');
      const valid=status?.configured!==true || (merchant.length>=7&&merchant.length<=15&&apiUser.length>=7&&apiUser.length<=15&&key.length>=10&&key.length<=100);
      return json({success:true,integration:{...status,credentials_valid:valid}});
    }

    if(action==='save'){
      const merchant=String(body?.merchant_uid||'').trim();
      const apiUser=String(body?.api_user_id||'').trim();
      const apiKey=typeof body?.api_key==='string'&&body.api_key.trim()?body.api_key.trim():null;
      if(merchant.length<7||merchant.length>15) return json({error:'invalid_merchant_uid',message:'Merchant UID-ga waa inuu ahaadaa 7 ilaa 15 xaraf.'},400);
      if(apiUser.length<7||apiUser.length>15) return json({error:'invalid_api_user_id',message:'API User ID-ga waa inuu ahaadaa 7 ilaa 15 xaraf.'},400);
      if(apiKey&&(apiKey.length<10||apiKey.length>100)) return json({error:'invalid_api_key',message:'API Key-ga buuxa geli.'},400);
      const {data,error}=await admin.rpc('waafipay_admin_save',{
        p_merchant_uid:merchant,p_api_user_id:apiUser,p_api_key:apiKey,
        p_environment:body?.environment==='sandbox'?'sandbox':'production',
        p_is_active:body?.is_active===true,
      });
      if(error) return json({error:error.message},400);
      return json({success:true,integration:data});
    }

    if(action==='delete'){
      const {data,error}=await admin.rpc('waafipay_admin_delete');
      if(error) throw error;
      return json({success:true,integration:data});
    }

    return json({error:'unknown_action'},400);
  }catch(e){ return json({error:e instanceof Error?e.message:'server_error'},500); }
});
