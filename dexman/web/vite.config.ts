import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command, mode }) => {
 const env = loadEnv(mode,process.cwd(),"VITE_");
 return {
  plugins:[react()],
  define:{ "import.meta.env.VITE_GAME_SERVER":JSON.stringify(env.VITE_GAME_SERVER || (command==="serve"?"http://127.0.0.1:2567":"")) },
  css:{postcss:{plugins:[]}},
  build:{outDir:"dist",sourcemap:false},
 };
});