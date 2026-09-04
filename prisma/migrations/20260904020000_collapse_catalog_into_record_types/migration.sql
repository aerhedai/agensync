-- Collapse the Product and Customer tables into ordinary Record Types.
--
-- These were the last hardcoded domain tables: every business, in every
-- industry, carried a retail-shaped schema it could not change. They are now
-- seeded Record Types like any other -- editable, extendable, deletable
-- (CLAUDE.md §4.3, §7).
--
-- Rows are copied before the tables are dropped, so this migration is correct
-- whether the tables are empty or not. It does not depend on anyone having
-- checked first.
--
-- ON CONFLICT DO NOTHING respects a business that already defined its own type
-- called "Product" or "Customer": its definition wins, and the copied rows
-- land in it rather than a second type of the same name (which the
-- (organisationId, name) unique index would reject anyway).

INSERT INTO "CustomEntityType" (id, "organisationId", name, fields, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o.id, 'Product', '[{"name":"sku","description":"The product code used to identify this item","type":"text","required":true},{"name":"name","description":"What the product is called","type":"text","required":true},{"name":"unitPrice","description":"Price for a single unit","type":"currency","required":true},{"name":"stockQuantity","description":"How many units are currently in stock","type":"number","required":true}]'::jsonb, NOW(), NOW()
FROM "Organisation" o
ON CONFLICT ("organisationId", name) DO NOTHING;

INSERT INTO "CustomEntityType" (id, "organisationId", name, fields, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o.id, 'Customer', '[{"name":"name","description":"The customer''s full name","type":"text","required":true},{"name":"email","description":"The customer''s email address","type":"text","required":true},{"name":"company","description":"The company they buy on behalf of, if any","type":"text","required":false}]'::jsonb, NOW(), NOW()
FROM "Organisation" o
ON CONFLICT ("organisationId", name) DO NOTHING;

-- unitPrice goes through jsonb_build_object rather than a float cast so the
-- Decimal(10,2) lands as an exact JSON number. Casting via float8 would be the
-- exact IEEE-754 round trip the column type existed to avoid.
INSERT INTO "CustomEntityRecord" (id, "entityTypeId", "organisationId", data, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t.id, p."organisationId",
       jsonb_build_object(
         'sku', p.sku,
         'name', p.name,
         'unitPrice', p."unitPrice",
         'stockQuantity', p."stockQuantity"
       ),
       p."createdAt", p."updatedAt"
FROM "Product" p
JOIN "CustomEntityType" t
  ON t."organisationId" = p."organisationId" AND t.name = 'Product';

INSERT INTO "CustomEntityRecord" (id, "entityTypeId", "organisationId", data, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t.id, c."organisationId",
       jsonb_build_object('name', c.name, 'email', c.email, 'company', c.company),
       c."createdAt", c."updatedAt"
FROM "Customer" c
JOIN "CustomEntityType" t
  ON t."organisationId" = c."organisationId" AND t.name = 'Customer';

DROP TABLE "Product";
DROP TABLE "Customer";
