(() => {
  const realFetch = window.fetch.bind(window);
  const now = () => new Date().toISOString();
  const future = (days, hour) => {
    const value = new Date(Date.now() + days * 86400000);
    value.setHours(hour, 0, 0, 0);
    return value.toISOString();
  };
  const image = (id, url, width = 900, height = 1200) => ({ id, url, width, height, sortOrder: 1 });
  const companion = (id, name, avatar, photo, bio, area, tags) => ({
    id,
    userId: `user-${id}`,
    name,
    avatar,
    photo,
    bio,
    gender: 'unknown',
    baseCity: '上海',
    status: 'approved',
    serviceEnabled: true,
    ratingAvg: 4.8,
    ratingCount: 24,
    followerCount: 386,
    postCount: 2,
    tags,
    safetyBadges: ['身份已核验', '资料已审核'],
    areas: [area, '安福路', '徐汇滨江'],
    slots: [],
    activities: [],
    extras: [],
  });

  const photographers = [
    companion('sim-mori', 'Mori', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=84', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=1000&q=84', '会聊天，也会帮你慢慢找角度。第一次拍照也不尴尬。', '武康路', ['自然光', '松弛感', '会指导动作']),
    companion('sim-aki', 'Aki', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=84', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=84', '熟悉街角与咖啡店光线，擅长轻松日常的人像记录。', '巨鹿路', ['日常感', '咖啡店', '街拍']),
    companion('sim-mika', 'Mika', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=84', 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=1000&q=84', '偏爱蓝调时刻和城市夜景，会提前确认安全路线。', '苏州河', ['夜景', '蓝调', '情绪人像']),
    companion('sim-kai', 'Kai', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=84', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=1000&q=84', '以纪实方式记录散步、相处和自然发生的瞬间。', '外滩', ['纪实', '情侣', '城市漫步']),
  ];

  const postSeed = [
    ['sim-work-1', 0, '梧桐树影', '武康路', '黄昏的梧桐树影很温柔，适合边散步边拍松弛感街拍。', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=84', 900, 1200],
    ['sim-work-2', 1, '街角咖啡', '巨鹿路', '在窗边和街角记录自然表情，保留城市午后的轻盈感。', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=84', 900, 1180],
    ['sim-work-3', 2, '蓝调散步', '苏州河', '入夜前的一小时，灯光和河面一起把城市变得安静。', 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=900&q=84', 900, 1280],
    ['sim-work-4', 3, '外滩日记', '外滩', '不刻意摆拍，沿着建筑与人流记录两个人的真实互动。', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=1100&q=84', 1100, 820],
    ['sim-work-5', 0, '午后人像', '安福路', '柔和逆光和简单穿搭，让照片更像一段日常记忆。', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=84', 900, 1260],
    ['sim-work-6', 1, '窗边一刻', '衡山路', '从聊天开始，在自然停顿中抓住松弛而明亮的表情。', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=84', 900, 1080],
    ['sim-work-7', 2, '夜色回声', '北外滩', '霓虹、人群与步行节奏，组成有呼吸感的夜景人像。', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=84', 900, 1260],
    ['sim-work-8', 3, '城市漫游', '愚园路', '把熟悉的街区当作背景，记录轻松而真实的相处。', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=84', 900, 1160],
  ];
  const posts = postSeed.map(([id, ownerIndex, title, locationName, caption, url, width, height], index) => ({
    id,
    title,
    city: '上海',
    locationName,
    location: `上海 · ${locationName}`,
    timeLabel: '本周可约',
    caption,
    styleTags: photographers[ownerIndex].tags,
    activity: photographers[ownerIndex].tags[0],
    images: [image(`${id}-image`, url, width, height)],
    companion: photographers[ownerIndex],
    likeCount: 128 + index * 17,
    favoriteCount: 32 + index * 5,
    creator: { id: `creator-${index}`, name: index % 2 ? 'Still 用户' : 'Lin', avatar: photographers[(ownerIndex + 1) % photographers.length].avatar, source: 'creator_upload' },
  }));

  const makeBooking = (id, status, photographer, days) => {
    const startAt = future(days, 15);
    const endAt = future(days, 17);
    const createdAt = new Date(Date.now() - days * 3600000).toISOString();
    return {
      id,
      status,
      photographer: { id: photographer.id, name: photographer.name, avatarUrl: photographer.avatar },
      requestedSchedule: { startAt, endAt, timezone: 'Asia/Shanghai', city: '上海', addressText: photographer.areas[0] },
      confirmation: status === 'confirmed' ? { startAt, endAt, city: '上海', addressText: photographer.areas[0], arrivalInstructions: '请提前十分钟到达集合点，平台会继续同步安排。', supportChannel: 'store_lite.support', confirmedAt: createdAt } : null,
      requirements: '希望拍摄自然、轻松的城市人像，可根据现场光线调整路线。',
      statusLogs: [{ id: `${id}-log`, fromStatus: null, toStatus: status, message: status === 'submitted' ? '预约申请已提交，等待平台确认。' : status === 'confirmed' ? '平台已确认本次预约安排。' : status === 'declined' ? '本次时间暂时无法安排，可重新选择时间。' : '预约申请已取消。', createdAt }],
      createdAt,
      updatedAt: createdAt,
    };
  };
  const bookings = [
    makeBooking('sim-booking-submitted', 'submitted', photographers[0], 3),
    makeBooking('sim-booking-confirmed', 'confirmed', photographers[1], 5),
    makeBooking('sim-booking-declined', 'declined', photographers[2], 7),
    makeBooking('sim-booking-cancelled', 'cancelled', photographers[3], 9),
  ];
  const userRequests = [{ id: 'sim-request-1', requestType: 'support', supportCategory: 'booking', description: '希望确认集合信息。', status: 'processing', createdAt: now(), updatedAt: now(), statusLogs: [{ id: 'sim-request-log-1', fromStatus: null, toStatus: 'processing', actorType: 'admin', publicMessage: '平台正在核对信息。', createdAt: now() }] }];
  const reports = [{ id: 'sim-report-1', targetType: 'post', targetId: 'sim-work-7', category: 'privacy_or_rights', description: '模拟器回归记录。', status: 'investigating', result: null, createdAt: now(), updatedAt: now() }];
  const blocked = [];
  let signedIn = localStorage.getItem('pp-auth-token-v1') === 'store-lite-simulator-token';

  function success(data, status = 200) {
    return new Response(JSON.stringify({ success: true, data, error: null }), { status, headers: { 'Content-Type': 'application/json' } });
  }
  function failure(code, message, status = 400) {
    return new Response(JSON.stringify({ success: false, data: null, error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
  }
  function session() {
    return { token: 'store-lite-simulator-token', provider: 'phone', role: 'consumer', roles: ['consumer'], user: { id: 'sim-user', phone: '13800138000', nickname: '模拟器用户', gender: 'unknown', status: 'active', isCompanion: false, roles: ['consumer'] }, loginAt: now() };
  }
  function page(items) {
    return { items, nextCursor: null, hasMore: false };
  }
  function bodyOf(init) {
    try { return JSON.parse(String(init && init.body || '{}')); } catch { return {}; }
  }

  async function mockApi(url, init) {
    const path = url.pathname;
    const method = String(init && init.method || 'GET').toUpperCase();
    const body = bodyOf(init);
    if (path === '/api/auth/phone/request-code' && method === 'POST') return success({ expiresInSeconds: 300, cooldownSeconds: 1, testCode: '246810' });
    if (path === '/api/auth/phone/verify' && method === 'POST') {
      if (body.code !== '246810') return failure('PHONE_CODE_INVALID', '验证码不正确');
      signedIn = true;
      return success(session());
    }
    if (path === '/api/auth/session') return signedIn ? success(session()) : failure('AUTH_REQUIRED', 'Authentication is required', 401);
    if (path === '/api/auth/logout' && method === 'POST') { signedIn = false; return success({ ok: true }); }
    if (path === '/api/feed/posts') {
      const city = url.searchParams.get('city');
      return success(page(city ? posts.filter((post) => post.city === city) : posts));
    }
    if (/^\/api\/posts\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop());
      return posts.find((post) => post.id === id) ? success(posts.find((post) => post.id === id)) : failure('NOT_FOUND', 'Post not found', 404);
    }
    if (/^\/api\/companions\/[^/]+\/posts$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      return success(page(posts.filter((post) => post.companion.id === id)));
    }
    if (/^\/api\/companions\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop());
      const item = photographers.find((value) => value.id === id);
      return item ? success(item) : failure('NOT_FOUND', 'Photographer not found', 404);
    }
    if (!signedIn) return failure('AUTH_REQUIRED', 'Authentication is required', 401);
    if (path === '/api/booking-requests' && method === 'POST') {
      const photographer = photographers.find((item) => item.id === body.companionId) || photographers[0];
      const item = makeBooking(`sim-booking-${Date.now()}`, 'submitted', photographer, 2);
      item.requestedSchedule = { startAt: body.requestedStartAt, endAt: body.requestedEndAt, timezone: body.timezone || 'Asia/Shanghai', city: body.city, addressText: body.addressText };
      item.requirements = body.requirements;
      bookings.unshift(item);
      return success(item, 201);
    }
    if (path === '/api/booking-requests') {
      const status = url.searchParams.get('status');
      return success(page(status ? bookings.filter((item) => item.status === status) : bookings));
    }
    if (/^\/api\/booking-requests\/[^/]+\/cancel$/.test(path) && method === 'POST') {
      const id = decodeURIComponent(path.split('/')[3]);
      const item = bookings.find((value) => value.id === id);
      if (!item) return failure('NOT_FOUND', 'Booking not found', 404);
      item.status = 'cancelled'; item.updatedAt = now(); item.confirmation = null;
      item.statusLogs.unshift({ id: `${id}-cancel`, fromStatus: 'submitted', toStatus: 'cancelled', message: '预约申请已取消。', createdAt: now() });
      return success(item);
    }
    if (/^\/api\/booking-requests\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop());
      const item = bookings.find((value) => value.id === id);
      return item ? success(item) : failure('NOT_FOUND', 'Booking not found', 404);
    }
    if (path === '/api/user-requests' && method === 'POST') {
      const item = { id: `sim-request-${Date.now()}`, requestType: body.requestType, supportCategory: body.supportCategory || null, bookingRequestId: body.bookingRequestId || null, description: body.description || null, status: 'submitted', createdAt: now(), updatedAt: now(), statusLogs: [{ id: `sim-request-log-${Date.now()}`, fromStatus: null, toStatus: 'submitted', actorType: 'user', publicMessage: '请求已提交。', createdAt: now() }] };
      userRequests.unshift(item); return success(item, 201);
    }
    if (path === '/api/user-requests') return success(page(userRequests));
    if (/^\/api\/user-requests\/[^/]+\/cancel$/.test(path) && method === 'POST') {
      const item = userRequests.find((value) => value.id === decodeURIComponent(path.split('/')[3]));
      if (!item) return failure('NOT_FOUND', 'Request not found', 404);
      item.status = 'cancelled'; item.updatedAt = now(); return success(item);
    }
    if (/^\/api\/user-requests\/[^/]+$/.test(path)) {
      const item = userRequests.find((value) => value.id === decodeURIComponent(path.split('/').pop()));
      return item ? success(item) : failure('NOT_FOUND', 'Request not found', 404);
    }
    if (path === '/api/content-reports' && method === 'POST') {
      const item = { id: `sim-report-${Date.now()}`, targetType: body.targetType, targetId: body.targetId, category: body.category, description: body.description || null, status: 'pending', result: null, createdAt: now(), updatedAt: now() };
      reports.unshift(item); return success(item, 201);
    }
    if (path === '/api/me/content-reports') return success(page(reports));
    if (/^\/api\/me\/content-reports\/[^/]+$/.test(path)) {
      const item = reports.find((value) => value.id === decodeURIComponent(path.split('/').pop()));
      return item ? success(item) : failure('NOT_FOUND', 'Report not found', 404);
    }
    if (path === '/api/me/blocked-companions') return success(page(blocked));
    if (/^\/api\/me\/blocked-companions\/[^/]+$/.test(path) && method === 'PUT') {
      const id = decodeURIComponent(path.split('/').pop());
      const profile = photographers.find((value) => value.id === id);
      if (!profile) return failure('NOT_FOUND', 'Photographer not found', 404);
      const item = { companionId: id, displayName: profile.name, avatarUrl: profile.avatar, baseCity: profile.baseCity, blockedAt: now() };
      if (!blocked.some((value) => value.companionId === id)) blocked.unshift(item);
      return success(item);
    }
    if (/^\/api\/me\/blocked-companions\/[^/]+$/.test(path) && method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').pop());
      const index = blocked.findIndex((value) => value.companionId === id);
      if (index >= 0) blocked.splice(index, 1);
      return success({ companionId: id, blocked: false, blockedAt: null });
    }
    return failure('NOT_FOUND', 'Route not found', 404);
  }

  window.fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : input && input.url;
    try {
      const url = new URL(raw, window.location.href);
      if (url.pathname.startsWith('/api/')) return mockApi(url, init || {});
    } catch {
      // Non-URL inputs continue through the native fetch implementation.
    }
    return realFetch(input, init);
  };
})();
