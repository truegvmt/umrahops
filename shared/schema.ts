// @ts-nocheck
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// === TABLE DEFINITIONS ===

// === TABLE DEFINITIONS ===

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // draft, submitted, approved, rejected
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const travelers = sqliteTable("travelers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").references(() => groups.id),
  passportNumber: text("passport_number").notNull(),
  name: text("name").notNull(),
  nationality: text("nationality").notNull(),
  dob: text("dob").notNull(), // ISO date string YYYY-MM-DD
  riskScore: integer("risk_score"),
  riskReason: text("risk_reason"),
  nusukId: text("nusuk_id"),
  nusukStatus: text("nusuk_status"), // pending, accepted, rejected
  overlay: text("overlay", { mode: "json" }).default("{}"), // For draggable profile card
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const hotels = sqliteTable("hotels", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  city: text("city").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").references(() => groups.id),
  hotelId: text("hotel_id").references(() => hotels.id),
  checkIn: text("check_in").notNull(), // ISO date string
  checkOut: text("check_out").notNull(), // ISO date string
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: text("entity_type").notNull(), // group, traveler, etc.
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // create, update, delete
  payload: text("payload", { mode: "json" }),
  prevHash: text("prev_hash"),
  hash: text("hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const jobsQueue = sqliteTable("jobs_queue", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(), // nusuk_sync, message_send, etc.
  payload: text("payload", { mode: "json" }).notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  result: text("result", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// Replaces 'objectives' with richer 'todos' schema from spec
export const todos = sqliteTable("todos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").references(() => groups.id),
  travelerId: text("traveler_id").references(() => travelers.id),
  hotelId: text("hotel_id").references(() => hotels.id),
  bookingId: text("booking_id").references(() => bookings.id),
  title: text("title").notNull(),
  description: text("description"),
  source: text("source").notNull().default("system"), // system | user
  status: text("status").notNull().default("open"), // open | in_progress | done | archived
  urgency: text("urgency").notNull().default("medium"), // low | medium | high
  urgencyScore: integer("urgency_score"), // 0-100 logic
  dueAt: integer("due_at", { mode: "timestamp" }),
  assignedTo: text("assigned_to"), // User UUID
  metadata: text("metadata", { mode: "json" }).default("{}"),
  // Backward compatibility fields for current UI
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
  type: text("type").notNull().default("routine"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// Alias for backward compatibility
export const objectives = todos;

export const messageTemplates = sqliteTable("message_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description"),
  channel: text("channel").notNull().default("whatsapp"),
  templateText: text("template_text").notNull(),
  variables: text("variables", { mode: "json" }), // stored as JSON array ["name", "date"]
  stage: text("stage"),
  escalationLevel: integer("escalation_level").default(0),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const boosts = sqliteTable("boosts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  shortDesc: text("short_desc"),
  content: text("content"), // Markdown
  category: text("category"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const chatRules = sqliteTable("chat_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  triggerPattern: text("trigger_pattern").notNull(),
  intent: text("intent"),
  responseText: text("response_text"),
  templateId: text("template_id").references(() => messageTemplates.id),
  action: text("action", { mode: "json" }),
  priority: integer("priority").default(100),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// === RELATIONS ===
// (Skipping complex relations for now, can be added if needed for query helpers)

// === BASE SCHEMAS ===
export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true });
export const insertTravelerSchema = createInsertSchema(travelers).omit({ id: true, createdAt: true });
export const insertHotelSchema = createInsertSchema(hotels).omit({ id: true, createdAt: true });
export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobsQueue).omit({ id: true, createdAt: true, result: true });
export const insertTodoSchema = createInsertSchema(todos).omit({ id: true, createdAt: true });
export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({ id: true, createdAt: true });
export const insertBoostSchema = createInsertSchema(boosts).omit({ id: true, createdAt: true });
export const insertChatRuleSchema = createInsertSchema(chatRules).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export type Traveler = typeof travelers.$inferSelect;
export type InsertTraveler = z.infer<typeof insertTravelerSchema>;

export type Hotel = typeof hotels.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Job = typeof jobsQueue.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type Objective = Todo; // Alias
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type Boost = typeof boosts.$inferSelect;
export type ChatRule = typeof chatRules.$inferSelect;

export const insertObjectiveSchema = insertTodoSchema; // Alias
export type InsertObjective = z.infer<typeof insertTodoSchema>;

// Request types
export type CreateGroupRequest = InsertGroup;
export type UpdateGroupRequest = Partial<InsertGroup>;

export type CreateTravelerRequest = InsertTraveler;
export type UpdateTravelerRequest = Partial<InsertTraveler>;
export type BulkCreateTravelersRequest = { travelers: InsertTraveler[] };

// Helper for frontend CSV import
export const csvImportSchema = z.object({
  passportNumber: z.string(),
  name: z.string(),
  nationality: z.string(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
});
export type CsvImportRow = z.infer<typeof csvImportSchema>;
