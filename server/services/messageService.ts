// @ts-nocheck
import { storage } from "../storage";

export class MessageService {
  generateWhatsAppLink(phone: string, text: string): string {
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  async markAsSent(travelerId: string, type: string) {
    console.log(`MessageService: Marked ${type} as sent to ${travelerId}`);

    await storage.createAuditLog({
      entityType: 'traveler',
      entityId: travelerId,
      action: 'message_sent',
      payload: { type },
      createdAt: new Date()
    });
  }
}

export const messageService = new MessageService();
