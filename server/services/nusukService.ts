// @ts-nocheck
import { storage } from "../storage";

export class NusukService {
  private apiUrl: string | undefined;

  constructor() {
    this.apiUrl = process.env.VITE_NUSUK_URL;
  }

  async syncGroup(groupId: string) {
    // Mode A: API
    if (this.apiUrl) {
      console.log(`NusukService: Syncing group ${groupId} via API at ${this.apiUrl}`);
      // TODO: Implement API call
      return { status: 'synced_api' };
    }

    // Mode B: RPA Stub
    console.log(`NusukService: API URL missing. Enqueuing RPA job for group ${groupId}`);

    // Enqueue job
    await storage.enqueueJob({
      type: 'nusuk_sync',
      payload: { groupId },
      status: 'pending'
    });

    return { status: 'queued_rpa' };
  }
}

export const nusukService = new NusukService();
