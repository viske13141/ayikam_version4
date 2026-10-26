import { createFileRoute } from "@tanstack/react-router";
import { ShivaExperience } from "@/components/shiva/ShivaExperience";

export const Route = createFileRoute("/aikya-mandala_/shiva")({
  head: () => ({
    meta: [
      { title: "Shiva — I SEE | The 12 Jyotirlingas | AIKYAM" },
      {
        name: "description",
        content:
          "Pause, observe, and deepen your awareness through the twelve Jyotirlinga traditions.",
      },
    ],
  }),
  component: ShivaExperience,
});
