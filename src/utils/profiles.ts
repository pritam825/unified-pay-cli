import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface ProfileData {
  stripeApiKey?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  lemonApiKey?: string;
  lemonStoreId?: string;
  cashfreeAppId?: string;
  cashfreeSecretKey?: string;
  upiVpa?: string;
  upiName?: string;
  [key: string]: any;
}

interface ConfigStore {
  activeProfile: string;
  profiles: Record<string, string>; // Encrypted ciphertext strings
}

export class ProfileManager {
  private configPath: string;
  private encryptionKey: Buffer;

  constructor() {
    const configDir = path.join(os.homedir(), '.config', 'unified-pay');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    this.configPath = path.join(configDir, 'profiles.json');

    const machineIdentifier = `${os.hostname()}-${os.userInfo().username}-unified-pay-v1`;
    this.encryptionKey = crypto.scryptSync(machineIdentifier, 'local-salt-key-99', 32);
  }

  private encrypt(data: ProfileData): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(encryptedString: string): ProfileData {
    try {
      const [ivHex, authTagHex, cipherText] = encryptedString.split(':');
      if (!ivHex || !authTagHex || !cipherText) return {};
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      let decrypted = decipher.update(cipherText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch {
      return {};
    }
  }

  private loadStore(): ConfigStore {
    if (!fs.existsSync(this.configPath)) {
      return { activeProfile: 'default', profiles: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return { activeProfile: 'default', profiles: {} };
    }
  }

  private writeStore(store: ConfigStore) {
    fs.writeFileSync(this.configPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  }

  getActiveProfileName(): string {
    return this.loadStore().activeProfile || 'default';
  }

  setActiveProfile(name: string): void {
    const store = this.loadStore();
    store.activeProfile = name;
    if (!store.profiles[name]) {
      store.profiles[name] = this.encrypt({});
    }
    this.writeStore(store);
  }

  listProfiles(): string[] {
    const store = this.loadStore();
    const profiles = Object.keys(store.profiles || {});
    if (!profiles.includes('default')) {
      profiles.unshift('default');
    }
    return profiles;
  }

  getProfile(name?: string): ProfileData {
    const store = this.loadStore();
    const target = name || store.activeProfile || 'default';
    const encryptedData = store.profiles[target];
    return encryptedData ? this.decrypt(encryptedData) : {};
  }

  saveProfile(name: string, data: Partial<ProfileData>) {
    const store = this.loadStore();
    const existing = this.getProfile(name);
    const merged = { ...existing, ...data };
    store.profiles[name] = this.encrypt(merged);
    this.writeStore(store);
  }

  updateProfile(data: Partial<ProfileData>) {
    this.saveProfile(this.getActiveProfileName(), data);
  }
}