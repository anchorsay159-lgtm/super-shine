'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type PropsWithChildren } from 'react';

import { Brand } from '@/components/brand';
import { useWebApp } from '@/context/web-app';

const links = [
  { href: '/', key: 'home' as const, icon: '⌂' },
  { href: '/services', key: 'services' as const, icon: '◇' },
  { href: '/orders', key: 'orders' as const, icon: '▤' },
  { href: '/notifications', key: 'notifications' as const, icon: '●' },
  { href: '/profile', key: 'profile' as const, icon: '○' },
];

export function CustomerGuard({ children }: PropsWithChildren) {
  const app = useWebApp(); const router = useRouter();
  useEffect(() => { if (app.initialized && app.mode === 'guest') router.replace('/auth?mode=signin'); }, [app.initialized, app.mode, router]);
  if (!app.initialized || app.mode === 'guest') return <div className="fullscreen-state"><span className="spinner"/><p>Preparing your account…</p></div>;
  return children;
}

export function AppShell({ children }: PropsWithChildren) {
  const app = useWebApp(); const pathname = usePathname();
  return (
    <CustomerGuard>
      <div className="app-shell">
        <header className="topbar">
          <div className="shell-width topbar-inner"><Brand/><nav className="desktop-nav" aria-label="Customer navigation">
            {links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href)) ? 'nav-link active' : 'nav-link'}><span aria-hidden="true">{link.icon}</span>{app.t(link.key)}{link.key === 'notifications' && app.unreadCount ? <span className="nav-count">{app.unreadCount}</span> : null}</Link>)}
          </nav><div className="topbar-actions"><Link className="cart-link" href="/cart" aria-label={`${app.cartCount} items in cart`}>▱ <span>{app.cartCount}</span></Link><select aria-label="Language" value={app.language} onChange={(event) => app.setLanguage(event.target.value as typeof app.language)}><option value="en">EN</option><option value="th">ไทย</option><option value="my">မြန်မာ</option><option value="bn">বাংলা</option><option value="dz">རྫོང་ཁ</option></select></div></div>
        </header>
        {app.mode === 'demo' ? <div className="demo-banner"><span>Demo mode</span><span>Actions are simulated and isolated from real customer data.</span></div> : null}
        {app.feedback ? <div className={`global-feedback feedback-${app.feedback.tone}`} role="status"><span>{app.feedback.message}</span><button aria-label="Dismiss message" onClick={app.dismissFeedback}>×</button></div> : null}
        <main className="shell-width main-content">{children}</main>
        <nav className="mobile-nav" aria-label="Customer navigation">{links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href)) ? 'mobile-link active' : 'mobile-link'}><span aria-hidden="true">{link.icon}</span><small>{app.t(link.key)}</small>{link.key === 'notifications' && app.unreadCount ? <span className="mobile-count">{app.unreadCount}</span> : null}</Link>)}</nav>
      </div>
    </CustomerGuard>
  );
}
