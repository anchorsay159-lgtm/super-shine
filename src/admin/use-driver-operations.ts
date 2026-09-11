import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { mapDriverTask, type DriverIssueSummary, type DriverSummary, type DriverTask } from '@/types/driver';

export function useDriverOperations(enabled: boolean) {
  const [drivers,setDrivers]=useState<DriverSummary[]>([]); const [tasks,setTasks]=useState<DriverTask[]>([]); const [issues,setIssues]=useState<DriverIssueSummary[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async()=>{if(!supabase||!enabled){setLoading(false);return;}const result=await supabase.rpc('admin_driver_operations_v1');setLoading(false);if(result.error){setError(result.error.message);return;}const data=(result.data||{}) as Record<string,unknown>;setError('');setDrivers(((data.drivers||[]) as Record<string,unknown>[]).map((row)=>({id:String(row.id),name:String(row.name||''),email:String(row.email||''),phone:String(row.phone||''),activeTaskCount:Number(row.activeTaskCount||0)})));setTasks(((data.tasks||[]) as Record<string,unknown>[]).map(mapDriverTask));setIssues(((data.issues||[]) as Record<string,unknown>[]).map((row)=>({id:String(row.id),taskId:String(row.taskId),orderId:String(row.orderId),orderNumber:String(row.orderNumber||''),driverId:String(row.driverId),driverName:String(row.driverName||''),reason:String(row.reason||''),notes:String(row.notes||''),status:row.status as 'open'|'resolved',createdAt:String(row.createdAt||'')})));},[enabled]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!supabase||!enabled)return;const client=supabase;const channel=client.channel('admin-driver-operations-v1').on('postgres_changes',{event:'*',schema:'public',table:'driver_tasks'},()=>void load()).on('postgres_changes',{event:'*',schema:'public',table:'driver_task_issues'},()=>void load()).subscribe();return()=>{void client.removeChannel(channel);};},[enabled,load]);
  return{drivers,tasks,issues,loading,error,reload:load};
}

