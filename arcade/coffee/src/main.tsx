import { createRoot } from "react-dom/client";
import { CoffeeRushApp } from "./coffee-rush-game";

const root = document.getElementById("root");
if (root) createRoot(root).render(<CoffeeRushApp />);
