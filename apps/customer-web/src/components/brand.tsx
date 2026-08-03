import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Super Shine home">
      <span className="brand-mark" aria-hidden="true">✦</span>
      <span>Super Shine</span>
    </Link>
  );
}
