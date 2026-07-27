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

