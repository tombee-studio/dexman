import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./base.css";
import Home from "./app/page";
createRoot(document.getElementById("root")!).render(<StrictMode><Home/></StrictMode>);