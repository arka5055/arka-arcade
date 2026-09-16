import { ScrollViewStyleReset } from 'expo-router/html';

/** Web-only document shell for an iPhone Home Screen installation. */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />
        <meta name="theme-color" content="#030C14" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Skyline" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/skyline-180.png" />
        <link rel="preload" href="/scenery/airport.jpg" as="image" type="image/jpeg" fetchPriority="high" />
        <style>{`
          #skyline-launch-screen { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; background: #030c14; color: #d9f8ff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          #skyline-launch-card { display: grid; justify-items: center; gap: 16px; letter-spacing: 0.12em; font-size: 11px; font-weight: 800; }
          #skyline-launch-icon { width: 82px; height: 82px; border-radius: 20px; box-shadow: 0 0 28px rgba(0, 229, 255, 0.30); }
          #skyline-launch-line { width: 92px; height: 2px; overflow: hidden; background: rgba(0, 229, 255, 0.20); }
          #skyline-launch-line::after { content: ""; display: block; width: 38%; height: 100%; background: #00e5ff; animation: skyline-load 0.9s ease-in-out infinite alternate; }
          @keyframes skyline-load { from { transform: translateX(0); } to { transform: translateX(165%); } }
        `}</style>
        <ScrollViewStyleReset />
      </head>
      <body>
        <div id="skyline-launch-screen" aria-label="Loading Skyline Signal">
          <div id="skyline-launch-card">
            <img id="skyline-launch-icon" src="/icons/skyline-180.png" alt="" />
            <span>INITIALIZING RADAR</span>
            <div id="skyline-launch-line" />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
