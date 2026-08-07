// AGREGAR estas definiciones a lib/db/schema.ts (no reemplaza el archivo,
// son adicionales). Requiere que el archivo ya importe pgTable, uuid, text,
// boolean, numeric, integer, timestamp, date desde "drizzle-orm/pg-core" —
// agregar los que falten al import existente.

export const adsAdvertisers = pgTable(
  "ads_advertisers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    advertiserId: text("advertiser_id").notNull(), // bigint de ML, se guarda como texto para evitar overflow
    siteId: text("site_id").notNull(),
    advertiserName: text("advertiser_name"),
    productAdsEnabled: boolean("product_ads_enabled").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow(),
  }
);

export const adsCampaigns = pgTable(
  "ads_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    strategy: text("strategy"),
    acosTarget: numeric("acos_target"),
    roasTarget: numeric("roas_target"),
    budget: numeric("budget"),
    automaticBudget: boolean("automatic_budget").notNull().default(false),
    clicks: integer("clicks").default(0),
    prints: integer("prints").default(0),
    cost: numeric("cost").default("0"),
    cpc: numeric("cpc").default("0"),
    ctr: numeric("ctr").default("0"),
    directAmount: numeric("direct_amount").default("0"),
    indirectAmount: numeric("indirect_amount").default("0"),
    totalAmount: numeric("total_amount").default("0"),
    unitsQuantity: integer("units_quantity").default(0),
    acos: numeric("acos").default("0"),
    cvr: numeric("cvr").default("0"),
    roas: numeric("roas").default("0"),
    itemsLastSyncedAt: timestamp("items_last_synced_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const adsItemsSnapshot = pgTable(
  "ads_items_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull(),
    itemId: text("item_id").notNull(),
    title: text("title"),
    price: numeric("price"),
    status: text("status"),
    clicks: integer("clicks").default(0),
    prints: integer("prints").default(0),
    cost: numeric("cost").default("0"),
    cpc: numeric("cpc").default("0"),
    ctr: numeric("ctr").default("0"),
    directAmount: numeric("direct_amount").default("0"),
    indirectAmount: numeric("indirect_amount").default("0"),
    totalAmount: numeric("total_amount").default("0"),
    unitsQuantity: integer("units_quantity").default(0),
    acos: numeric("acos").default("0"),
    cvr: numeric("cvr").default("0"),
    roas: numeric("roas").default("0"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const adsRecomendaciones = pgTable(
  "ads_recomendaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    tipo: text("tipo").notNull(), // 'item' | 'campania' | 'cuenta'
    prioridad: text("prioridad").notNull(), // 'alta' | 'media' | 'baja'
    itemId: text("item_id"),
    campaignId: text("campaign_id"),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion").notNull(),
    accionSugerida: text("accion_sugerida").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  }
);
