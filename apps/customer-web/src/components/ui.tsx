import type { ComponentPropsWithoutRef, PropsWithChildren, ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p className="page-description">{description}</p> : null}</div>{action ? <div className="page-action">{action}</div> : null}</header>;
}

export function Card({ children, className = '', ...props }: ComponentPropsWithoutRef<'section'>) { return <section className={`card ${className}`} {...props}>{children}</section>; }

export function StatusBadge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'attention' | 'danger' | 'info' }>) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="state-card" role="status"><span className="spinner" aria-hidden="true"/><p>{label}</p></div>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <div className="state-card"><span className="state-icon" aria-hidden="true">◇</span><h2>{title}</h2>{body ? <p>{body}</p> : null}{action}</div>;
}

export function ErrorState({ title = 'Something went wrong', body, retry }: { title?: string; body: string; retry?: () => void }) {
  return <div className="state-card error-state" role="alert"><span className="state-icon" aria-hidden="true">!</span><h2>{title}</h2><p>{body}</p>{retry ? <button className="button button-secondary" onClick={retry}>Try again</button> : null}</div>;
}

export function Field({ label, hint, error, children }: PropsWithChildren<{ label: string; hint?: string; error?: string }>) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint ? <span className="field-hint">{hint}</span> : null}{error ? <span className="field-error">{error}</span> : null}</label>;
}
