// @ts-nocheck
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === Groups ===
  app.get(api.groups.list.path, async (req, res) => {
    const groups = await storage.getGroups();
    res.json(groups);
  });

  app.get(api.groups.get.path, async (req, res) => {
    const group = await storage.getGroup(String(req.params.id));
    if (!group) return res.status(404).json({ message: "Group not found" });
    res.json(group);
  });

  app.post(api.groups.create.path, async (req, res) => {
    try {
      const input = api.groups.create.input.parse(req.body);
      const group = await storage.createGroup(input);

      // Audit Log
      await storage.createAuditLog({
        entityType: 'group',
        entityId: group.id,
        action: 'create',
        payload: { name: group.name },
        createdAt: new Date()
      });

      res.status(201).json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === Travelers ===
  app.get(api.travelers.list.path, async (req, res) => {
    const travelers = await storage.getTravelers(String(req.params.groupId));
    res.json(travelers);
  });

  app.post(api.travelers.create.path, async (req, res) => {
    try {
      const input = api.travelers.create.input.parse(req.body);
      const traveler = await storage.createTraveler(input);
      res.status(201).json(traveler);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.travelers.bulkCreate.path, async (req, res) => {
    try {
      const input = api.travelers.bulkCreate.input.parse(req.body);
      const travelers = await storage.bulkCreateTravelers(input.travelers);

      // Audit
      if (travelers.length > 0) {
        await storage.createAuditLog({
          entityType: 'group',
          entityId: travelers[0].groupId || 'unknown',
          action: 'bulk_create_travelers',
          payload: { count: travelers.length },
          createdAt: new Date()
        });
      }

      res.status(201).json(travelers);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === Jobs ===
  app.get(api.jobs.list.path, async (req, res) => {
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.post(api.jobs.create.path, async (req, res) => {
    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.enqueueJob(input);
      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === Stats (Dashboard) ===
  app.get('/api/stats', async (req, res) => {
    try {
      const groups = await storage.getGroups();
      const jobs = await storage.getJobs();

      // Calculate real stats
      let totalTravelers = 0;
      for (const group of groups) {
        const travelers = await storage.getTravelers(group.id);
        totalTravelers += travelers.length;
      }

      const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
      const completedJobs = jobs.filter(j => j.status === 'completed').length;
      const failedJobs = jobs.filter(j => j.status === 'failed').length;

      res.json({
        groups: groups.length,
        travelers: totalTravelers,
        pendingJobs,
        completedJobs,
        failedJobs,
        successRate: completedJobs > 0 ? Math.round((completedJobs / (completedJobs + failedJobs)) * 100) : 100
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === Objectives (Executive TODOs) ===
  app.get('/api/objectives', async (req, res) => {
    try {
      const groupId = req.query.groupId as string;
      const objectives = await storage.getObjectives(groupId);
      res.json(objectives);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/objectives', async (req, res) => {
    try {
      const objective = await storage.createObjective(req.body);
      res.status(201).json(objective);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/objectives/:id', async (req, res) => {
    try {
      const { isCompleted } = req.body;
      const objective = await storage.updateObjective(req.params.id, isCompleted);
      res.json(objective);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Hotels ===
  app.get('/api/hotels', async (req, res) => {
    const hotels = await storage.getHotels();
    res.json(hotels);
  });

  app.post('/api/hotels', async (req, res) => {
    try {
      const hotel = await storage.createHotel(req.body);
      res.status(201).json(hotel);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Bookings ===
  app.get('/api/groups/:groupId/bookings', async (req, res) => {
    const bookings = await storage.getBookings(String(req.params.groupId));
    res.json(bookings);
  });

  app.post('/api/groups/:groupId/bookings', async (req, res) => {
    try {
      const booking = await storage.createBooking({
        ...req.body,
        groupId: String(req.params.groupId)
      });
      res.status(201).json(booking);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Messaging ===
  app.post('/api/messages/send', async (req, res) => {
    try {
      const { travelerId, phone, template } = req.body;

      const templates: Record<string, string> = {
        confirmation: 'Your Umrah booking is confirmed! Group ID: {{groupId}}. Please prepare your documents.',
        reminder: 'Reminder: Your departure is in 7 days. Ensure passport and visa are ready.',
        update: 'Important update regarding your Umrah trip. Please check your email for details.',
      };

      const message = templates[template] || templates.confirmation;
      const { messageService } = await import('./services/messageService');

      const link = messageService.generateWhatsAppLink(phone, message);
      await messageService.markAsSent(travelerId, template);

      res.json({ success: true, whatsappLink: link });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === Audit ===
  app.get(api.audit.list.path, async (req, res) => {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });


  // === Risk Scan (AI Service) ===
  app.post('/api/groups/:groupId/risk-scan', async (req, res) => {
    try {
      const { groupId } = req.params;
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }

      const travelers = await storage.getTravelers(groupId);
      if (travelers.length === 0) {
        return res.status(400).json({ message: 'No travelers to scan' });
      }

      // Import AI service lazily to avoid circular deps
      const { aiService } = await import('./services/aiService');
      const crypto = await import('crypto');

      // Prepare features for AI (PII-safe)
      const featuresList = travelers.map((t) => ({
        id: t.id,
        passportHash: crypto.createHash('sha256').update(t.passportNumber || '').digest('hex'),
        ageRange: calculateAgeRange(t.dob),
        missingFieldsCount: countMissingFields(t),
        nationalityRiskLevel: undefined,
      }));

      // Run batch assessment
      const results = await aiService.assessBatch(featuresList);

      // Update travelers with risk scores
      for (const result of results) {
        await storage.updateTraveler(result.travelerId, {
          riskScore: result.riskScore,
          riskReason: result.riskReason,
        });
      }

      // Audit log
      await storage.createAuditLog({
        entityType: 'group',
        entityId: groupId,
        action: 'risk_scan',
        payload: {
          travelersScanned: travelers.length,
          avgRiskScore: Math.round(results.reduce((acc, r) => acc + r.riskScore, 0) / results.length)
        },
        createdAt: new Date()
      });

      res.json({
        success: true,
        scanned: travelers.length,
        results: results.map(r => ({ id: r.travelerId, score: r.riskScore }))
      });
    } catch (err: any) {
      console.error('Risk scan error:', err);
      res.status(500).json({ message: err.message || 'Risk scan failed' });
    }
  });

  // === NUSUK Submit (Queue Job) ===
  app.post('/api/groups/:groupId/nusuk-submit', async (req, res) => {
    try {
      const groupId = String(req.params.groupId);
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }

      const travelers = await storage.getTravelers(groupId);
      if (travelers.length === 0) {
        return res.status(400).json({ message: 'No travelers to submit' });
      }

      // Queue NUSUK sync job for RPA processing
      const job = await storage.enqueueJob({
        type: 'nusuk_sync',
        payload: { groupId, travelerCount: travelers.length },
        status: 'pending',
      });

      // Audit log
      await storage.createAuditLog({
        entityType: 'group',
        entityId: groupId,
        action: 'nusuk_submit',
        payload: { jobId: job.id, travelerCount: travelers.length },
        createdAt: new Date()
      });

      // Update group status
      await storage.updateGroup(groupId, { status: 'submitted' });

      res.json({
        success: true,
        message: 'NUSUK job queued for processing',
        jobId: job.id,
        travelers: travelers.length
      });
    } catch (err: any) {
      console.error('NUSUK submit error:', err);
      res.status(500).json({ message: err.message || 'NUSUK submit failed' });
    }
  });

  // === Audit Chain Verification ===
  app.get('/api/audit/verify', async (req, res) => {
    try {
      const result = await storage.verifyAuditChain();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message });
    }
  });

  return httpServer;
}

// Helper functions for risk scan
function calculateAgeRange(dob: string | null): string {
  if (!dob) return 'unknown';
  const birthYear = new Date(dob).getFullYear();
  const age = new Date().getFullYear() - birthYear;
  const decade = Math.floor(age / 10) * 10;
  return `${decade}-${decade + 10}`;
}

function countMissingFields(traveler: any): number {
  let count = 0;
  if (!traveler.passportNumber) count++;
  if (!traveler.name) count++;
  if (!traveler.nationality) count++;
  if (!traveler.dob) count++;
  return count;
}

// Seed function
export async function seedDatabase() {
  const groups = await storage.getGroups();
  if (groups.length === 0) {
    const group = await storage.createGroup({
      name: "Demo Umrah Group 2026",
      status: "draft"
    });

    await storage.createTraveler({
      groupId: group.id,
      name: "Ahmed Al-Farsi",
      passportNumber: "A12345678",
      nationality: "Saudi Arabia",
      dob: "1980-01-01",
      riskScore: 10,
      riskReason: "Low risk"
    });

    await storage.createTraveler({
      groupId: group.id,
      name: "Fatima Al-Zahra",
      passportNumber: "B87654321",
      nationality: "UAE",
      dob: "1985-05-15",
      riskScore: 85,
      riskReason: "Visa expiring soon"
    });
  }
}
