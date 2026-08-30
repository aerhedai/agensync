// No-op. Organisations are provisioned automatically now — the first
// time a real Clerk sign-in resolves a not-yet-seen clerkOrgId,
// getCurrentOrganisation() (lib/organisations/current-organisation.ts)
// creates the local Organisation row and calls provisionEmailWorkflow()
// itself. There's no way to fabricate a fixed demo org here anymore:
// Organisation.clerkOrgId is required and unique, and no synthetic value
// this script could invent would ever match a real Clerk session — it
// would just be an equally unreachable row, with the added risk of
// looking real enough to be trusted.
//
// To get a working org locally: run `pnpm dev`, sign up through the app
// (a free Clerk account works fine for this), and the Email Handling
// workflow appears automatically. See README.md's "Getting started".
async function main() {
  console.log(
    "prisma/seed.ts is a no-op — organisations are provisioned " +
      "automatically on first Clerk sign-in. See the comment at the top " +
      "of this file.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
