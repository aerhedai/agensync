import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { NotAChatbot } from "@/components/marketing/not-a-chatbot";

export default async function MarketingHomePage() {
  // A signed-in visitor landing on "/" (e.g. a bookmark) goes straight into
  // the product rather than seeing marketing copy aimed at people who
  // haven't signed up yet.
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <>
      <Hero />
      <NotAChatbot />
      <HowItWorks />
      <FeatureGrid />
      <CtaBand />
    </>
  );
}
