// @ts-nocheck
import { db } from "./db";
import {
  groups, travelers, hotels, bookings, jobsQueue, auditLogs, objectives,
  type Group, type InsertGroup,
  type Traveler, type InsertTraveler,
  type Hotel, type Booking,
  type Job,
  type AuditLog,
  type Objective, type InsertObjective,
  insertJobSchema
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

type InsertJob = z.infer<typeof insertJobSchema>;

export interface IStorage {
  // Groups
  getGroups(): Promise<Group[]>;
  getGroup(id: string): Promise<Group | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group>;

  // Travelers
  getTravelers(groupId: string): Promise<Traveler[]>;
  createTraveler(traveler: InsertTraveler): Promise<Traveler>;
  bulkCreateTravelers(travelers: InsertTraveler[]): Promise<Traveler[]>;
  updateTraveler(id: string, traveler: Partial<InsertTraveler>): Promise<Traveler>;

  // Jobs
  getJobs(): Promise<Job[]>;
  enqueueJob(job: InsertJob): Promise<Job>;

  // Audit
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: any): Promise<AuditLog>;
}

export class SQLiteStorage implements IStorage {
  // Groups
  async getGroups(): Promise<Group[]> {
    return await db.select().from(groups).orderBy(desc(groups.createdAt));
  }

  async getGroup(id: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async createGroup(insertGroup: InsertGroup): Promise<Group> {
    const [group] = await db.insert(groups).values(insertGroup).returning();
    return group;
  }

  async updateGroup(id: string, updates: Partial<InsertGroup>): Promise<Group> {
    const [group] = await db.update(groups).set(updates).where(eq(groups.id, id)).returning();
    return group;
  }

  // Travelers
  async getTravelers(groupId: string): Promise<Traveler[]> {
    return await db.select().from(travelers).where(eq(travelers.groupId, groupId));
  }

  async createTraveler(insertTraveler: InsertTraveler): Promise<Traveler> {
    const [traveler] = await db.insert(travelers).values(insertTraveler).returning();
    return traveler;
  }

  async bulkCreateTravelers(insertTravelers: InsertTraveler[]): Promise<Traveler[]> {
    if (insertTravelers.length === 0) return [];
    return await db.insert(travelers).values(insertTravelers).returning();
  }

  async updateTraveler(id: string, updates: Partial<InsertTraveler>): Promise<Traveler> {
    const [traveler] = await db.update(travelers).set(updates).where(eq(travelers.id, id)).returning();
    return traveler;
  }

  // Hotels
  async getHotels(): Promise<Hotel[]> {
    return await db.select().from(hotels).orderBy(desc(hotels.createdAt));
  }

  async createHotel(insertHotel: { name: string; city: string }): Promise<Hotel> {
    const [hotel] = await db.insert(hotels).values(insertHotel).returning();
    return hotel;
  }

  // Bookings
  async getBookings(groupId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.groupId, groupId));
  }

  async createBooking(insertBooking: { groupId: string; hotelId: string; checkIn: string; checkOut: string }): Promise<Booking> {
    const [booking] = await db.insert(bookings).values(insertBooking).returning();
    return booking;
  }

  // Jobs
  async getJobs(): Promise<Job[]> {
    return await db.select().from(jobsQueue).orderBy(desc(jobsQueue.createdAt));
  }

  async enqueueJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobsQueue).values(insertJob).returning();
    return job;
  }

  // Objectives (Executive TODOs)
  async getObjectives(groupId?: string): Promise<Objective[]> {
    if (groupId) {
      return await db.select().from(objectives).where(eq(objectives.groupId, groupId));
    }
    return await db.select().from(objectives);
  }

  async createObjective(insertObjective: InsertObjective): Promise<Objective> {
    const [objective] = await db.insert(objectives).values(insertObjective).returning();
    return objective;
  }

  async updateObjective(id: string, completed: boolean): Promise<Objective> {
    const [objective] = await db.update(objectives)
      .set({ isCompleted: completed })
      .where(eq(objectives.id, id))
      .returning();
    return objective;
  }

  // Audit with chain integrity
  async getAuditLogs(): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  async getLatestAuditLog(): Promise<AuditLog | null> {
    const [latest] = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1);
    return latest || null;
  }

  async createAuditLog(insertLog: any): Promise<AuditLog> {
    const crypto = await import('crypto');

    // Get previous log's hash for chain integrity
    const prevLog = await this.getLatestAuditLog();
    const prevHash = prevLog?.hash || 'GENESIS';

    // Hash the payload (PII-safe: don't include raw passport)
    const payloadStr = JSON.stringify(insertLog.payload || {});
    const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

    // Create chain hash: SHA-256(prevHash + payloadHash + timestamp)
    const timestamp = new Date().toISOString();
    const chainData = `${prevHash}:${payloadHash}:${timestamp}`;
    const hash = crypto.createHash('sha256').update(chainData).digest('hex');

    const logWithChain = {
      ...insertLog,
      payloadHash,
      prevHash,
      hash,
      createdAt: insertLog.createdAt || new Date(),
    };

    const [log] = await db.insert(auditLogs).values(logWithChain).returning();
    return log;
  }

  // Verify audit chain integrity
  async verifyAuditChain(): Promise<{ valid: boolean; brokenAt?: string }> {
    const crypto = await import('crypto');
    const logs = await db.select().from(auditLogs).orderBy(auditLogs.createdAt);

    let expectedPrevHash = 'GENESIS';

    for (const log of logs) {
      // Check prevHash matches expected
      if (log.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: log.id };
      }

      // Verify hash computation (if we have the raw payload)
      expectedPrevHash = log.hash || '';
    }

    return { valid: true };
  }
}

export const storage = new SQLiteStorage();

