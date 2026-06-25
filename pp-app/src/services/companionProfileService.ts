import type { AuthSession, Companion, UserRole } from '../types/api';
import { readDomainJson, writeDomainJson } from './scopedStorage';

export type CompanionAvatarReviewStatus = 'approved' | 'pending' | 'rejected';

export type CompanionProfileDraft = {
  companionId: string;
  displayName: string;
  approvedAvatarUrl: string;
  pendingAvatarUrl: string;
  avatarReviewStatus: CompanionAvatarReviewStatus;
  bio: string;
  personalityTags: string[];
  styleTags: string[];
  interactionTags: string[];
  equipment: string[];
  registrationGenderLabel: string;
  registrationAgeRangeLabel: string;
  updatedAt: string;
};

export type CompanionWithEditableProfile = Companion & {
  profilePersonalityTags: string[];
  profileStyleTags: string[];
  profileInteractionTags: string[];
  profileEquipment: string[];
  registrationGenderLabel: string;
  registrationAgeRangeLabel: string;
  pendingAvatarUrl?: string;
  avatarReviewStatus?: CompanionAvatarReviewStatus;
};

const storageKey = 'companion-profile-v1';
const sharedProfileStorageKey = 'pp-cloud-db:shared:companion-profile-overrides-v1';

export function readCompanionProfile(companionId?: string | null, role?: UserRole) {
  if (!companionId) return null;
  const sharedProfile = readSharedCompanionProfile(companionId);
  if (sharedProfile) return sharedProfile;

  const scopedProfile = readDomainJson<CompanionProfileDraft | null>(storageKey, null, role);
  return scopedProfile?.companionId === companionId ? scopedProfile : null;
}

export function saveCompanionProfile(profile: CompanionProfileDraft, role?: UserRole) {
  const nextProfile = { ...profile, updatedAt: new Date().toISOString() };
  writeDomainJson(storageKey, nextProfile, role);
  writeSharedCompanionProfile(nextProfile.companionId, nextProfile);
  return nextProfile;
}

export function createDefaultCompanionProfile(session: AuthSession | null, companion: Companion): CompanionProfileDraft {
  return {
    companionId: companion.id,
    displayName:
      session?.companionId === companion.id && session.user.nickname && !/^Demo/i.test(session.user.nickname)
        ? session.user.nickname
        : companion.name,
    approvedAvatarUrl: companion.avatar || companion.photo,
    pendingAvatarUrl: '',
    avatarReviewStatus: 'approved',
    bio: companion.bio,
    personalityTags: buildDefaultPersonalityTags(companion),
    styleTags: buildDefaultStyleTags(companion),
    interactionTags: buildDefaultInteractionTags(companion),
    equipment: buildDefaultEquipment(companion),
    registrationGenderLabel: formatGender(companion.gender),
    registrationAgeRangeLabel: '注册资料已锁定',
    updatedAt: new Date().toISOString(),
  };
}

export function applyCompanionProfile(companion: Companion, profile: CompanionProfileDraft | null): CompanionWithEditableProfile {
  if (!profile || profile.companionId !== companion.id) {
    return {
      ...companion,
      profilePersonalityTags: buildDefaultPersonalityTags(companion),
      profileStyleTags: buildDefaultStyleTags(companion),
      profileInteractionTags: buildDefaultInteractionTags(companion),
      profileEquipment: buildDefaultEquipment(companion),
      registrationGenderLabel: formatGender(companion.gender),
      registrationAgeRangeLabel: '注册资料已锁定',
      avatarReviewStatus: 'approved',
    };
  }

  return {
    ...companion,
    name: profile.displayName.trim() || companion.name,
    avatar: profile.approvedAvatarUrl || companion.avatar,
    bio: profile.bio.trim() || companion.bio,
    tags: [...new Set([...profile.styleTags, ...profile.personalityTags, ...profile.interactionTags, ...companion.tags])],
    profilePersonalityTags: profile.personalityTags,
    profileStyleTags: profile.styleTags,
    profileInteractionTags: profile.interactionTags,
    profileEquipment: profile.equipment,
    registrationGenderLabel: profile.registrationGenderLabel || formatGender(companion.gender),
    registrationAgeRangeLabel: profile.registrationAgeRangeLabel || '注册资料已锁定',
    pendingAvatarUrl: profile.pendingAvatarUrl || undefined,
    avatarReviewStatus: profile.avatarReviewStatus,
  };
}

function readSharedCompanionProfile(companionId: string) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(sharedProfileStorageKey);
    const records = raw ? (JSON.parse(raw) as Record<string, CompanionProfileDraft>) : {};
    return records[companionId] ?? null;
  } catch {
    return null;
  }
}

function writeSharedCompanionProfile(companionId: string, profile: CompanionProfileDraft) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(sharedProfileStorageKey);
    const records = raw ? (JSON.parse(raw) as Record<string, CompanionProfileDraft>) : {};
    localStorage.setItem(sharedProfileStorageKey, JSON.stringify({ ...records, [companionId]: profile }));
  } catch {
    localStorage.setItem(sharedProfileStorageKey, JSON.stringify({ [companionId]: profile }));
  }
}

function buildDefaultPersonalityTags(companion: Companion) {
  const defaults = ['轻松沟通', '耐心引导'];
  return [...new Set([...companion.tags.filter((tag) => /沟通|耐心|温柔|轻松|友好/.test(tag)), ...defaults])].slice(0, 4);
}

function buildDefaultStyleTags(companion: Companion) {
  return companion.tags.filter((tag) => !/沟通|耐心|温柔|轻松|友好|指导|路线|等待|穿搭|角度/.test(tag)).slice(0, 5);
}

function buildDefaultInteractionTags(companion: Companion) {
  const defaults = ['会指导动作', '会看光线'];
  return [...new Set([...companion.tags.filter((tag) => /指导|路线|等待|穿搭|角度/.test(tag)), ...defaults])].slice(0, 4);
}

function buildDefaultEquipment(companion: Companion) {
  const hasVideo = companion.extras.some((extra) => /视频|短片/.test(extra.name));
  return hasVideo ? ['全画幅相机', '35mm/50mm 定焦', '补光灯', '短视频稳定器'] : ['全画幅相机', '35mm/50mm 定焦', '便携补光灯'];
}

function formatGender(gender?: string) {
  if (gender === 'female') return '女';
  if (gender === 'male') return '男';
  return '不展示';
}
