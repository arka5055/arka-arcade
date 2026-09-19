import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#030c14", color: "#d9f8ff" }}>
      <p>
        Skyline Signal lives at{" "}
        <a href="https://arka5055.github.io/" style={{ color: "#00e5ff" }}>
          arka5055.github.io
        </a>
      </p>
    </main>
  );
}
