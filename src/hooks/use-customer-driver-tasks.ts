import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { mapDriverTask, type DriverTask } from '@/types/driver';

export function useCustomerDriverTasks(orderId?:string){const[tasks,setTasks]=useState<DriverTask[]>([]);const load=useCallback(async()=>{if(!supabase||!orderId){setTasks([]);return;}const result=await supabase.rpc('customer_order_driver_tasks_v1',{p_order_id:orderId});if(!result.error)setTasks(((result.data||[]) as Record<string,unknown>[]).map(mapDriverTask));},[orderId]);useEffect(()=>{void load();if(!supabase||!orderId)return;const client=supabase;const channel=client.channel(`customer-driver-tasks:${orderId}`).on('postgres_changes',{event:'*',schema:'public',table:'driver_tasks',filter:`order_id=eq.${orderId}`},()=>void load()).subscribe();return()=>{void client.removeChannel(channel);};},[load,orderId]);return{tasks,reload:load};}

