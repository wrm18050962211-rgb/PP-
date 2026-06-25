const roleStorageKey = 'pp-auth-role-v1';
const accountStorageKey = 'pp-auth-account-v1';
const loginStorageKey = 'pp-auth-logged-in-v1';

export function startCreatorDemoSession() {
  const account = {
    phone: '13900001001',
    role: 'companion',
    roles: ['companion'],
    completedRoleRegistrations: ['companion'],
    pendingRoleRegistrations: [],
    roleReviewStatus: { companion: 'approved' },
    nickname: '调研试用创作者',
    creatorName: '调研试用创作者',
    creatorId: 'creator-survey-demo',
    photographerName: '调研试用创作者',
    companionId: 'companion-survey-demo',
    creatorAvatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
    photographerAvatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
    registeredAt: new Date().toISOString(),
  };

  localStorage.setItem(accountStorageKey, JSON.stringify(account));
  localStorage.setItem(loginStorageKey, '1');
  localStorage.setItem(roleStorageKey, 'companion');
  window.dispatchEvent(
    new CustomEvent('pp-auth-session-changed', {
      detail: {
        token: 'local-companion-session',
        provider: 'mock_wechat',
        role: 'companion',
        roles: ['companion'],
        user: {
          id: account.companionId,
          openId: `mock-openid-${account.companionId}`,
          phone: account.phone,
          nickname: account.creatorName,
          avatarUrl: account.creatorAvatarUrl,
          gender: 'unknown',
          city: 'Shanghai',
          status: 'active',
          isCompanion: true,
          roles: ['companion'],
        },
        companionId: account.companionId,
        adminScope: [],
        loginAt: new Date().toISOString(),
      },
    }),
  );
  return account;
}
