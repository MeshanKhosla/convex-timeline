import { defineApp } from "convex/server";
import timeline from "convex-timeline/convex.config.js";

const app = defineApp();
app.use(timeline);

export default app;
