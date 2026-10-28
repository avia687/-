import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/700.css";
import "@fontsource/heebo/900.css";
import "./styles.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
