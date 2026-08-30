import { OrganizationList } from "@clerk/nextjs";

// Landing point for a signed-in user with no active organisation yet
// (lib/organisations/current-organisation.ts redirects here when auth()
// has a userId but no orgId). hidePersonal keeps Clerk from offering a
// "personal account" context — this app's whole data model is org-scoped,
// there's nowhere for an orgless session to resolve to.
export default function SelectOrganisationPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6">
      <OrganizationList
        hidePersonal
        afterCreateOrganizationUrl="/dashboard"
        afterSelectOrganizationUrl="/dashboard"
      />
    </div>
  );
}
