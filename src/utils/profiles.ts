import Conf from 'conf';
import chalk from 'chalk';

export interface ProfileCredentials {
  name: string;
  stripeApiKey?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  lemonApiKey?: string;
  lemonStoreId?: string;
}

export class ProfileManager {
  private conf = new Conf({ projectName: 'unified-pay-cli-profiles' });

  getActiveProfileName(): string {
    return (this.conf.get('activeProfile') as string) || 'default';
  }

  setActiveProfile(name: string): void {
    this.conf.set('activeProfile', name);
  }

  listProfiles(): string[] {
    const profiles = (this.conf.get('profiles') as Record<string, any>) || {};
    return Object.keys(profiles).length ? Object.keys(profiles) : ['default'];
  }

  getProfile(name?: string): ProfileCredentials {
    const target = name || this.getActiveProfileName();
    const profiles = (this.conf.get('profiles') as Record<string, ProfileCredentials>) || {};
    return profiles[target] || { name: target };
  }

  saveProfile(name: string, creds: Partial<ProfileCredentials>): void {
    const profiles = (this.conf.get('profiles') as Record<string, ProfileCredentials>) || {};
    profiles[name] = {
      ...(profiles[name] || { name }),
      ...creds,
    };
    this.conf.set('profiles', profiles);
  }

  updateProfile(updates: Partial<ProfileCredentials>): void {
    const current = this.getProfile();
    const updated = {
      ...current,
      ...updates,
    };
    this.saveProfile(updated.name, updated);
  }

  deleteProfile(name: string): boolean {
    if (name === 'default') return false;
    const profiles = (this.conf.get('profiles') as Record<string, ProfileCredentials>) || {};
    delete profiles[name];
    this.conf.set('profiles', profiles);
    if (this.getActiveProfileName() === name) {
      this.setActiveProfile('default');
    }
    return true;
  }
}