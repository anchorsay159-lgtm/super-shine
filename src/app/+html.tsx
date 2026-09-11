import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const ADMIN_CANONICAL_PATH_SCRIPT = "if(globalThis.location?.pathname==='/admin'){globalThis.location.replace('/admin/'+globalThis.location.search+globalThis.location.hash)}";

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="application-name" content="Super Shine" />
        <meta name="theme-color" content="#F8FAF9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Super Shine" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest?v=3" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=2" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: ADMIN_CANONICAL_PATH_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
