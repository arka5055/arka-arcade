import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#030c14", color: "#d9f8ff" }}>
      <p>
        Skyline Signal lives at{" "}
        <a href="https://amber-brick-glow-nova.grok.me/" style={{ color: "#00e5ff" }}>
          amber-brick-glow-nova.grok.me
        </a>
      </p>
    </main>
  );
}
