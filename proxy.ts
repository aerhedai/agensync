import { clerkMiddleware } from "@clerk/nextjs/server";

// Just the base Clerk plumbing — this is what makes auth()/currentUser()
// work at all in Server Components and Actions, nothing more. Actual route
// protection lives at the resource level, in
// lib/organisations/current-organisation.ts / lib/auth/current-user.ts
// (both redirect if there's no session), not here: Clerk's own
// `createRouteMatcher` helper is deprecated as of this SDK version
// precisely because path-matching-based protection "can diverge from how
// Next.js routes requests and leave protected resources reachable" —
// checking at the point data is actually read doesn't have that gap.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static assets, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
