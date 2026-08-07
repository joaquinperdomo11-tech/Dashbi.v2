import { pgTable, text, uuid, timestamp, integer, numeric, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  nombre: text("nombre"),
  email: text("email"),
  mlUserId: text("ml_user_id"),
  mlSiteId: text("ml_site_id").default("MLU"),
  status: text("status").default("trial"), // trial | active | inactive
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).defaultNow(),
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  plan: text("plan").default("pro"),
  initialSyncDone: boolean("initial_sync_done").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const mlTokens = pgTable("ml_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ordenes = pgTable("ordenes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  orderId: text("order_id").notNull(),
  fecha: timestamp("fecha", { withTimezone: true }),
  producto: text("producto"),
  sku: text("sku"),
  itemIdMl: text("item_id_ml"),
  cantidad: integer("cantidad").default(1),
  precioUnitario: numeric("precio_unitario"),
  totalItem: numeric("total_item"),
  comisionMl: numeric("comision_ml").default("0"),
  shippingCostSeller: numeric("shipping_cost_seller").default("0"),
  bonificacionEnvio: numeric("bonificacion_envio").default("0"),
  tipoEnvio: text("tipo_envio"),
  shipmentId: text("shipment_id"),
  estado: text("estado"),
  estadoEnvio: text("estado_envio"),
  buyer: text("buyer"),
}, (table) => ({
  tenantOrderUnique: uniqueIndex("tenant_order_unique").on(table.tenantId, table.orderId),
}));

export const publicaciones = pgTable("publicaciones", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  itemId: text("item_id").notNull(),
  sku: text("sku"),
  title: text("title"),
  thumbnail: text("thumbnail"),
  price: numeric("price"),
  availableQuantity: integer("available_quantity"),
  status: text("status"),
  soldQuantity: integer("sold_quantity"),
  freeShipping: boolean("free_shipping").default(false),
  // Categoría de ML, solo lectura (sincronizada por sync-publicaciones)
  categoryId: text("category_id"),
  categoryName: text("category_name"),
  // Promoción activa en ML, solo lectura (sincronizada 1x/día por sync-promociones)
  promoActiva: boolean("promo_activa").default(false),
  promoTipo: text("promo_tipo"), // DEAL | PRICE_DISCOUNT | DOD | etc.
  promoPrecio: numeric("promo_precio"), // precio con descuento (deal_price)
  promoHasta: timestamp("promo_hasta", { withTimezone: true }),
}, (table) => ({
  tenantItemUnique: uniqueIndex("tenant_item_unique").on(table.tenantId, table.itemId),
}));

export const costos = pgTable("costos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  sku: text("sku").notNull(),
  costoSinIva: numeric("costo_sin_iva").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantSkuUnique: uniqueIndex("tenant_sku_unique").on(table.tenantId, table.sku),
}));

// Combos: SKU real de ML cuya venta representa el consumo conjunto de otros SKUs propios.
// Solo metadata (receta) — el stock sigue siendo 100% lectura de ML, se calcula al vuelo.
export const combos = pgTable("combos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  comboSku: text("combo_sku").notNull(),
  nombre: text("nombre"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantComboSkuUnique: uniqueIndex("tenant_combo_sku_unique").on(table.tenantId, table.comboSku),
}));

export const comboComponentes = pgTable("combo_componentes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  comboId: integer("combo_id").references(() => combos.id, { onDelete: "cascade" }).notNull(),
  componentSku: text("component_sku").notNull(),
  cantidad: integer("cantidad").notNull().default(1),
});

export const preguntas = pgTable("preguntas", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  questionId: text("question_id").notNull(),
  itemId: text("item_id").notNull(),
  itemTitle: text("item_title"),
  itemThumbnail: text("item_thumbnail"),
  sku: text("sku"),
  fromNickname: text("from_nickname"),
  text: text("text"),
  answerText: text("answer_text"),
  status: text("status").default("UNANSWERED"),
  dateCreated: timestamp("date_created", { withTimezone: true }),
  dateAnswered: timestamp("date_answered", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantQuestionUnique: uniqueIndex("tenant_question_unique").on(table.tenantId, table.questionId),
}));

export const syncCursors = pgTable("sync_cursors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  syncType: text("sync_type").notNull(),
  itemIds: text("item_ids"),
  cursorPosition: integer("cursor_position").default(0),
  lastFullSync: timestamp("last_full_sync", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantSyncTypeUnique: uniqueIndex("tenant_sync_type_unique").on(table.tenantId, table.syncType),
}));

export const reputacion = pgTable("reputacion", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  storeName: text("store_name"),
  levelId: text("level_id"),
  claimsRate: numeric("claims_rate"),
  claimsLimit: numeric("claims_limit"),
  cancellationsRate: numeric("cancellations_rate"),
  cancellationsLimit: numeric("cancellations_limit"),
  delayedRate: numeric("delayed_rate"),
  delayedLimit: numeric("delayed_limit"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const visitasMensuales = pgTable("visitas_mensuales", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  monthKey: text("month_key").notNull(),
  totalVisitas: integer("total_visitas").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantMonthUnique: uniqueIndex("tenant_month_unique").on(table.tenantId, table.monthKey),
}));

export const visitasDiarias = pgTable("visitas_diarias", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  fecha: text("fecha").notNull(), // YYYY-MM-DD
  totalVisitas: integer("total_visitas").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantFechaUnique: uniqueIndex("tenant_fecha_unique").on(table.tenantId, table.fecha),
}));

// ─────────────────────────────────────────────────────────────────
// Mercado Ads (Product Ads) — agregado para el analista de campañas
// ─────────────────────────────────────────────────────────────────

// advertiser_id/site_id de Product Ads por tenant (se resuelve una vez y
// se cachea, para no repetir el llamado a /advertising/advertisers cada vez)
export const adsAdvertisers = pgTable("ads_advertisers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  advertiserId: text("advertiser_id").notNull(),
  siteId: text("site_id").notNull(),
  advertiserName: text("advertiser_name"),
  productAdsEnabled: boolean("product_ads_enabled").default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantAdvertiserUnique: uniqueIndex("tenant_advertiser_unique").on(table.tenantId),
}));

// Campañas de Product Ads: metadata + últimas métricas conocidas de 7 días
export const adsCampaigns = pgTable("ads_campaigns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  campaignId: text("campaign_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  strategy: text("strategy"),
  acosTarget: numeric("acos_target"),
  roasTarget: numeric("roas_target"),
  budget: numeric("budget"),
  automaticBudget: boolean("automatic_budget").default(false),
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
  itemsLastSyncedAt: timestamp("items_last_synced_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantCampaignUnique: uniqueIndex("tenant_campaign_unique").on(table.tenantId, table.campaignId),
}));

// Última foto conocida de cada anuncio (item) dentro de una campaña, con
// métricas de los últimos 7 días. Se pisa en cada sync — no es histórico
// día a día, alcanza para el análisis semanal.
export const adsItemsSnapshot = pgTable("ads_items_snapshot", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantItemAdsUnique: uniqueIndex("tenant_item_ads_unique").on(table.tenantId, table.itemId),
}));

// Recomendaciones generadas semanalmente (solo lectura para el usuario)
export const adsRecomendaciones = pgTable("ads_recomendaciones", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  weekStart: text("week_start").notNull(), // YYYY-MM-DD, mismo criterio que visitasDiarias.fecha
  tipo: text("tipo").notNull(), // 'item' | 'campania' | 'cuenta'
  prioridad: text("prioridad").notNull(), // 'alta' | 'media' | 'baja'
  itemId: text("item_id"),
  campaignId: text("campaign_id"),
  titulo: text("titulo").notNull(),
  descripcion: text("descripcion").notNull(),
  accionSugerida: text("accion_sugerida").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
