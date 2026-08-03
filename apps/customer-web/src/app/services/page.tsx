'use client';

import { AppShell } from '@/components/shell';
import { ServiceCard } from '@/components/service-card';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

export default function ServicesPage() {
  const app = useWebApp();
  return <AppShell><PageHeader eyebrow="Laundry care" title="Services for every wash day" description="Prices and availability come directly from the same catalogue used by the Super Shine mobile app."/>{app.catalogLoading ? <LoadingState label="Loading services…"/> : app.error && !app.services.length ? <ErrorState body={app.error} retry={() => void app.refresh()}/> : <div className="grid grid-3">{app.services.map((service) => <ServiceCard key={service.id} service={service}/>)}</div>}</AppShell>;
}
