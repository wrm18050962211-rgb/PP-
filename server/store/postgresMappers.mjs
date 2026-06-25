export function buildStoreFromPostgresRows(rows) {
  const companions = mapCompanions(rows);
  const companionById = new Map(companions.map((companion) => [companion.id, companion]));
  const posts = mapPosts(rows, companionById);

  return {
    meta: { version: 3 },
    companions,
    posts,
    users: [],
    activeSession: null,
    orders: [],
    payments: [],
    conversations: {},
    riskCases: [],
    messageRiskEvents: [],
    reports: [],
    auditCases: [],
    auditLogs: [],
    adminActionLogs: [],
    settlements: [],
    ledgerEntries: [],
    refunds: [],
    wallets: [],
    application: { reviewStatus: 'draft', updatedAt: new Date().toISOString() },
    workDraft: { reviewStatus: 'draft', updatedAt: new Date().toISOString() },
  };
}

function mapCompanions(rows) {
  return (rows.companions || []).map((row) => {
    const id = stringId(row.id);
    const profileTags = (rows.companionTags || []).filter((tag) => stringId(tag.companion_id) === id && tag.tag_type === 'profile').map((tag) => tag.tag_name);
    const safetyBadges = (rows.companionTags || []).filter((tag) => stringId(tag.companion_id) === id && tag.tag_type === 'safety').map((tag) => tag.tag_name);
    const serviceAreas = (rows.serviceAreas || []).filter((area) => stringId(area.companion_id) === id).map(mapServiceArea);

    return {
      id,
      userId: stringId(row.user_id),
      name: row.display_name,
      baseCity: row.base_city,
      gender: row.gender || 'unknown',
      bio: row.bio || '',
      avatar: row.real_photo_url || '',
      photo: row.real_photo_url || '',
      status: row.status || 'approved',
      serviceEnabled: row.service_enabled !== false,
      ratingAvg: number(row.rating_avg),
      ratingCount: number(row.rating_count),
      completedOrderCount: number(row.completed_order_count),
      tags: profileTags,
      safetyBadges,
      areas: serviceAreas.map((area) => area.areaName),
      locationName: serviceAreas[0]?.areaName || row.base_city,
      serviceAreas,
      activities: (rows.activityPricings || []).filter((activity) => stringId(activity.companion_id) === id).map(mapActivity),
      extras: (rows.companionExtras || []).filter((extra) => stringId(extra.companion_id) === id).map(mapExtra),
      slots: (rows.availabilitySlots || []).filter((slot) => stringId(slot.companion_id) === id).map(mapSlot),
    };
  });
}

function mapPosts(rows, companionById) {
  return (rows.posts || []).map((row) => {
    const id = stringId(row.id);
    const companion = companionById.get(stringId(row.companion_id));
    const images = (rows.postImages || [])
      .filter((image) => stringId(image.post_id) === id)
      .sort((a, b) => number(a.sort_order) - number(b.sort_order))
      .map((image) => ({
        id: stringId(image.id),
        url: image.file_url,
        objectKey: image.file_key || '',
        width: image.width == null ? undefined : number(image.width),
        height: image.height == null ? undefined : number(image.height),
        sortOrder: number(image.sort_order),
      }));

    return {
      id,
      city: row.city,
      locationName: row.location_name,
      location: `${row.city} - ${row.location_name}`,
      lat: row.lat == null ? undefined : number(row.lat),
      lng: row.lng == null ? undefined : number(row.lng),
      timeLabel: row.time_label,
      caption: row.caption || '',
      activity: row.activity_name || companion?.activities?.[0]?.name || '',
      status: row.status || 'approved',
      isFeedVisible: row.is_feed_visible !== false,
      isFeatured: Boolean(row.is_featured),
      qualityScore: number(row.quality_score),
      images,
      cover: images[0]?.url || companion?.photo || '',
      styleTags: (rows.postTags || []).filter((tag) => stringId(tag.post_id) === id).map((tag) => tag.tag_name),
      companion,
    };
  });
}

function mapServiceArea(row) {
  return {
    id: stringId(row.id),
    city: row.city,
    areaName: row.area_name,
    areaType: row.area_type || 'business_area',
    lat: row.lat == null ? undefined : number(row.lat),
    lng: row.lng == null ? undefined : number(row.lng),
    radiusMeters: row.radius_meters == null ? 3000 : number(row.radius_meters),
    enabled: row.enabled !== false,
  };
}

function mapActivity(row) {
  const durationMinutes = number(row.duration_minutes);
  return {
    id: stringId(row.id),
    name: row.activity_name,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    priceCents: number(row.price_cents),
    priceText: formatMoney(row.price_cents),
  };
}

function mapExtra(row) {
  return {
    id: stringId(row.id),
    name: row.name,
    unit: row.unit || 'per_order',
    unitLabel: row.description || row.unit || 'per_order',
    priceCents: number(row.price_cents),
    priceText: formatMoney(row.price_cents),
  };
}

function mapSlot(row) {
  const startAt = toIso(row.start_at);
  const endAt = toIso(row.end_at);
  const dateLabel = startAt.slice(0, 10);
  const timeLabel = `${startAt.slice(11, 16)}-${endAt.slice(11, 16)}`;
  return {
    id: stringId(row.id),
    label: `${dateLabel} ${timeLabel}`,
    dateLabel,
    timeLabel,
    startAt,
    endAt,
    status: row.status || 'available',
  };
}

function formatMoney(cents) {
  const yuan = Math.round(number(cents)) / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function formatDuration(minutes) {
  if (!minutes) return '';
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  return `${Number((minutes / 60).toFixed(1))}小时`;
}

function toIso(value) {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringId(value) {
  return String(value || '');
}
