import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { mapDriverTask, type DriverIssueSummary, type DriverSummary, type DriverTask } from '@/types/driver';

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    : [];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Driver operations could not be loaded.';
}

let driverOperationsChannelSequence = 0;

export function useDriverOperations(enabled: boolean) {
  const [drivers,setDrivers]=useState<DriverSummary[]>([]); const [tasks,setTasks]=useState<DriverTask[]>([]); const [issues,setIssues]=useState<DriverIssueSummary[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async()=>{if(!supabase||!enabled){setLoading(false);return;}setError('');try{const result=await supabase.rpc('admin_driver_operations_v1');if(result.error){setError(result.error.message);return;}const data=result.data&&typeof result.data==='object'&&!Array.isArray(result.data)?result.data as Record<string,unknown>:{};setDrivers(records(data.drivers).map((row)=>({id:String(row.id),name:String(row.name||''),email:String(row.email||''),phone:String(row.phone||''),activeTaskCount:Number(row.activeTaskCount||0)})));setTasks(records(data.tasks).map(mapDriverTask));setIssues(records(data.issues).map((row)=>({id:String(row.id),taskId:String(row.taskId),orderId:String(row.orderId),orderNumber:String(row.orderNumber||''),driverId:String(row.driverId),driverName:String(row.driverName||''),reason:String(row.reason||''),notes:String(row.notes||''),status:row.status as 'open'|'resolved',createdAt:String(row.createdAt||'')})));}catch(loadError){setError(errorMessage(loadError));}finally{setLoading(false);}},[enabled]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!supabase||!enabled)return;const client=supabase;let channel:ReturnType<typeof client.channel>|null=null;try{const name=`admin-driver-operations-v2-${++driverOperationsChannelSequence}`;channel=client.channel(name).on('postgres_changes',{event:'*',schema:'public',table:'driver_tasks'},()=>void load()).on('postgres_changes',{event:'*',schema:'public',table:'driver_task_issues'},()=>void load()).subscribe((status)=>{if(status==='SUBSCRIBED')void load();if(__DEV__&&['CHANNEL_ERROR','TIMED_OUT'].includes(status))console.warn('admin_driver_realtime_state',{status});});}catch(subscriptionError){setError(errorMessage(subscriptionError));}return()=>{if(channel)void client.removeChannel(channel);};},[enabled,load]);
  return{drivers,tasks,issues,loading,error,reload:load};
}
