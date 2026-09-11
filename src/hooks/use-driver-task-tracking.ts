import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';

export function useDriverTaskTracking(taskId?: string, orderId?: string) {
  const [sharing,setSharing]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const subscription=useRef<Location.LocationSubscription|null>(null); const lastSentAt=useRef(0); const ids=useRef({taskId,orderId}); ids.current={taskId,orderId};
  const clear=useCallback(()=>{subscription.current?.remove();subscription.current=null;setSharing(false);},[]);
  const send=useCallback(async(location:Location.LocationObject,first:boolean)=>{if(!supabase||!ids.current.taskId)throw new Error('Task is unavailable.');const now=Date.now();if(!first&&now-lastSentAt.current<4000)return;lastSentAt.current=now;const c=location.coords;const args={p_task_id:ids.current.taskId,p_latitude:c.latitude,p_longitude:c.longitude,p_accuracy_meters:c.accuracy,p_heading_degrees:c.heading==null||c.heading<0?null:c.heading,p_speed_mps:c.speed==null||c.speed<0?null:c.speed};const result=first?await supabase.rpc('driver_start_task_v1',args):await supabase.rpc('driver_update_task_location_v1',args);if(result.error)throw new Error(result.error.message);},[]);
  const start=useCallback(async()=>{if(busy||sharing)return false;setBusy(true);setError('');try{const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted')throw new Error('Location permission is required to start this trip.');const first=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});await send(first,true);subscription.current=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:4000,distanceInterval:8},(next)=>void send(next,false).catch((cause)=>{setError(cause instanceof Error?cause.message:'GPS update failed.');clear();}));setSharing(true);return true;}catch(cause){setError(cause instanceof Error?cause.message:'Live location could not start.');return false;}finally{setBusy(false);}},[busy,clear,send,sharing]);
  const stop=useCallback(async()=>{clear();if(supabase&&ids.current.orderId)await supabase.rpc('staff_stop_order_tracking_v1',{p_order_id:ids.current.orderId});},[clear]);
  useEffect(()=>()=>{clear();if(supabase&&ids.current.orderId)void supabase.rpc('staff_stop_order_tracking_v1',{p_order_id:ids.current.orderId});},[clear]);
  return{sharing,busy,error,start,stop};
}
