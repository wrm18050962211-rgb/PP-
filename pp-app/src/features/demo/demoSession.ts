const roleStorageKey = 'pp-auth-role-v1';
const accountStorageKey = 'pp-auth-account-v1';
const loginStorageKey = 'pp-auth-logged-in-v1';

export type DemoRole = 'consumer' | 'companion';

export function startCreatorDemoSession() {
  return startDemoSession({
    role: 'consumer',
    phone: '13900001001',
    nickname: '调研试用创作者',
    nameKey: 'creatorName',
    idKey: 'creatorId',
    avatarKey: 'creatorAvatarUrl',
    id: 'creator-survey-demo',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
  });
}

export function startCompanionDemoSession() {
  return startDemoSession({
    role: 'companion',
    phone: '13900001002',
    nickname: '调研试用摄影师',
    nameKey: 'photographerName',
    idKey: 'companionId',
    avatarKey: 'photographerAvatarUrl',
    id: '00000000-0000-0000-0000-000000000301',
    avatarUrl: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=240&q=80',
  });
}

function startDemoSession(config: {
  role: DemoRole;
  phone: string;
  nickname: string;
  nameKey: 'creatorName' | 'photographerName';
  idKey: 'creatorId' | 'companionId';
  avatarKey: 'creatorAvatarUrl' | 'photographerAvatarUrl';
  id: string;
  avatarUrl: string;
}) {
  const account = {
    phone: config.phone,
    role: config.role,
    roles: [config.role],
    completedRoleRegistrations: [config.role],
    pendingRoleRegistrations: [],
    roleReviewStatus: { [config.role]: 'approved' },
    nickname: config.nickname,
    [config.nameKey]: config.nickname,
    [config.idKey]: config.id,
    [config.avatarKey]: config.avatarUrl,
    registeredAt: new Date().toISOString(),
  };
  const isCompanion = config.role === 'companion';

  localStorage.setItem(accountStorageKey, JSON.stringify(account));
  localStorage.setItem(loginStorageKey, '1');
  localStorage.setItem(roleStorageKey, config.role);
  window.dispatchEvent(
    new CustomEvent('pp-auth-session-changed', {
      detail: {
        token: `local-${config.role}-session`,
        provider: 'mock_wechat',
        role: config.role,
        roles: [config.role],
        user: {
          id: config.id,
          openId: `mock-openid-${config.id}`,
          phone: account.phone,
          nickname: config.nickname,
          avatarUrl: config.avatarUrl,
          gender: 'unknown',
          city: 'Shanghai',
          status: 'active',
          isCompanion,
          roles: [config.role],
        },
        companionId: isCompanion ? config.id : null,
        adminScope: [],
        loginAt: new Date().toISOString(),
      },
    }),
  );
  return account;
}
