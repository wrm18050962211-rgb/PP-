import type { ActivityPricing, AvailabilitySlot, FeedPost, MatchingCompanionItem } from '../types/api';
import { apiGet, isApiEnabled } from './apiClient';

export type GenderPreference = 'any' | 'female_only';

export type MatchCompanionsInput = {
  city: string;
  lat?: number;
  lng?: number;
  location?: string;
  locationKeywords?: string[];
  date?: string;
  time?: string;
  activityType?: string;
  durationMinutes?: number;
  maxBudgetCents?: number;
  genderPreference?: GenderPreference;
  nearbyOnly?: boolean;
  keyword?: string;
};

type MatchCandidate = {
  post: FeedPost;
  matchedSlot: AvailabilitySlot | null;
  matchedActivity: ActivityPricing;
  distanceRank: number;
  timeRank: number;
  featuredRank: number;
  activeAt: number;
};

const ANY = '不限';

const locationDistanceRank: Record<string, number> = {
  武康路: 1,
  安福路: 2,
  衡山路: 3,
  徐家汇: 4,
  静安寺: 1,
  巨鹿路: 2,
  陕西南路: 3,
  新天地: 4,
  外滩: 1,
  北外滩: 2,
  南京东路: 3,
  苏州河: 4,
};

export function matchCompanions(posts: FeedPost[], input: MatchCompanionsInput): FeedPost[] {
  return posts
    .map((post) => buildCandidate(post, input))
    .filter((candidate): candidate is MatchCandidate => Boolean(candidate))
    .sort(compareCandidates)
    .map((candidate) => candidate.post);
}

export async function fetchMatchedCompanions(input: MatchCompanionsInput): Promise<MatchingCompanionItem[]> {
  if (!isApiEnabled() || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return [];

  const query = new URLSearchParams({
    lat: String(input.lat),
    lng: String(input.lng),
  });
  if (hasValue(input.city)) query.set('city', input.city);
  if (input.activityType) query.set('activity', input.activityType);
  if (input.genderPreference === 'female_only') query.set('gender', 'female');
  if (input.nearbyOnly) query.set('maxDistanceMeters', '5000');

  try {
    const response = await apiGet<{ items: MatchingCompanionItem[] }>(`/api/matching/companions?${query.toString()}`);
    return response.success ? response.data.items : [];
  } catch {
    return [];
  }
}

function buildCandidate(post: FeedPost, input: MatchCompanionsInput): MatchCandidate | null {
  const companion = post.companion;

  if (companion.status !== 'approved' || !companion.serviceEnabled) return null;
  if (hasValue(input.city) && companion.baseCity !== input.city) return null;
  if (input.genderPreference === 'female_only' && companion.gender !== 'female') return null;

  const locationTexts = normalizeSearchTexts(input.locationKeywords?.length ? input.locationKeywords : [input.location]);
  const keywordTexts = normalizeSearchTexts([input.keyword]);
  if (locationTexts.length && !locationTexts.some((text) => isPostSearchMatch(post, text))) return null;
  if (keywordTexts.length && !keywordTexts.every((text) => isPostSearchMatch(post, text))) return null;

  const matchedSlot = findMatchedSlot(companion.slots, input);
  if ((hasValue(input.date) || hasValue(input.time)) && !matchedSlot) return null;

  const matchedActivity = findMatchedActivity(companion.activities, post, input);
  if (!matchedActivity) return null;
  if (input.maxBudgetCents && matchedActivity.priceCents > input.maxBudgetCents) return null;

  return {
    post,
    matchedSlot,
    matchedActivity,
    distanceRank: getDistanceRank(post, locationTexts[0] ?? keywordTexts[0] ?? '', input.nearbyOnly),
    timeRank: getTimeRank(matchedSlot, input),
    featuredRank: isFeaturedPost(post) ? 0 : 1,
    activeAt: getRecentActiveAt(companion.slots),
  };
}

function findMatchedSlot(slots: AvailabilitySlot[], input: MatchCompanionsInput) {
  const availableSlots = slots.filter((slot) => slot.status === 'available');

  return (
    availableSlots.find((slot) => matchesDate(slot, input.date) && matchesTime(slot, input.time)) ??
    availableSlots.find((slot) => matchesDate(slot, input.date)) ??
    availableSlots.find((slot) => matchesTime(slot, input.time)) ??
    null
  );
}

function findMatchedActivity(activities: ActivityPricing[], post: FeedPost, input: MatchCompanionsInput) {
  if (hasValue(input.activityType) && !matchesPostActivity(post, input.activityType)) return null;

  return (
    activities.find((activity) => matchesActivityPrice(activity, input.activityType) && matchesDuration(activity, input.durationMinutes)) ??
    null
  );
}

function matchesDate(slot: AvailabilitySlot, date?: string) {
  if (!hasValue(date)) return true;
  const targetDate = date ?? '';
  return slot.dateLabel === targetDate || slot.label.includes(targetDate);
}

function matchesTime(slot: AvailabilitySlot, time?: string) {
  if (!hasValue(time)) return true;
  const targetTime = time ?? '';
  return slot.timeLabel.includes(targetTime) || slot.label.includes(targetTime) || isTimeInPeriod(slot.timeLabel, targetTime);
}

function matchesActivityPrice(activity: ActivityPricing, activityType?: string) {
  if (!hasValue(activityType)) return true;

  const target = normalizeFreeText(activityType ?? '');
  return normalizeFreeText(activity.name).includes(target) || target.includes(normalizeFreeText(activity.name));
}

function matchesPostActivity(post: FeedPost, activityType?: string) {
  if (!hasValue(activityType)) return true;

  const target = normalizeFreeText(activityType ?? '');
  return [post.activity, ...post.styleTags].some((item) => normalizeFreeText(item).includes(target) || target.includes(normalizeFreeText(item)));
}

function matchesDuration(activity: ActivityPricing, durationMinutes?: number) {
  if (!durationMinutes) return true;
  return activity.durationMinutes === durationMinutes;
}

function isPostSearchMatch(post: FeedPost, searchText: string) {
  const searchableFields = [
    post.location,
    post.timeLabel,
    post.caption,
    post.activity,
    post.companion.name,
    post.companion.bio,
    ...post.styleTags,
    ...post.companion.areas,
    ...post.companion.tags,
  ];

  return searchableFields.some((field) => {
    const normalizedField = normalizeFreeText(field);
    return normalizedField.includes(searchText) || searchText.includes(normalizedField);
  });
}

function getDistanceRank(post: FeedPost, location: string, nearbyOnly?: boolean) {
  const areaRanks = post.companion.areas.map((area) => {
    const normalizedArea = normalizeFreeText(area);
    const exactRank = location && (location.includes(normalizedArea) || normalizedArea.includes(location)) ? 0 : Number.POSITIVE_INFINITY;
    return Math.min(exactRank, locationDistanceRank[area] ?? 99);
  });
  const bestAreaRank = Math.min(...areaRanks);

  if (Number.isFinite(bestAreaRank)) return nearbyOnly ? bestAreaRank : bestAreaRank + 1;
  return post.location.includes(post.companion.baseCity) ? 20 : 99;
}

function getTimeRank(slot: AvailabilitySlot | null, input: MatchCompanionsInput) {
  if (!slot) return 99;
  if (matchesDate(slot, input.date) && matchesTime(slot, input.time)) return 0;
  if (matchesDate(slot, input.date)) return 1;
  if (matchesTime(slot, input.time)) return 2;
  return 3;
}

function isFeaturedPost(post: FeedPost) {
  return post.styleTags.some((tag) => tag.includes('精选')) || post.images.length > 1;
}

function getRecentActiveAt(slots: AvailabilitySlot[]) {
  return Math.max(...slots.map((slot) => new Date(slot.startAt).getTime()).filter(Number.isFinite), 0);
}

function compareCandidates(a: MatchCandidate, b: MatchCandidate) {
  return (
    a.distanceRank - b.distanceRank ||
    a.timeRank - b.timeRank ||
    a.featuredRank - b.featuredRank ||
    b.post.companion.ratingAvg - a.post.companion.ratingAvg ||
    b.activeAt - a.activeAt ||
    a.matchedActivity.priceCents - b.matchedActivity.priceCents
  );
}

function normalizeFreeText(value?: string) {
  return (value ?? '').trim().toLowerCase();
}

function normalizeSearchTexts(values: Array<string | undefined>) {
  return values.map((value) => normalizeFreeText(value)).filter(Boolean);
}

function hasValue(value?: string) {
  return Boolean(value && value !== ANY);
}

function isTimeInPeriod(timeLabel: string, period: string) {
  const hour = Number(timeLabel.match(/\d{1,2}/)?.[0]);
  if (!Number.isFinite(hour)) return false;

  if (period === '上午') return hour >= 6 && hour < 12;
  if (period === '下午') return hour >= 12 && hour < 18;
  if (period === '傍晚') return hour >= 17 && hour < 20;
  if (period === '晚上') return hour >= 18 && hour < 24;
  return false;
}
