export type MessageRiskLevel = 'clean' | 'medium' | 'high';

export type MessageRiskCategory = 'blocked_word' | 'phone' | 'social_contact' | 'private_deal';

export type MessageRiskHit = {
  category: MessageRiskCategory;
  label: string;
  keyword: string;
  level: Exclude<MessageRiskLevel, 'clean'>;
};

export type MessageRiskResult = {
  level: MessageRiskLevel;
  normalizedText: string;
  compactText: string;
  hits: MessageRiskHit[];
  shouldBlock: boolean;
};

type RiskRule = {
  category: MessageRiskCategory;
  label: string;
  keywords: string[];
  level: Exclude<MessageRiskLevel, 'clean'>;
};

const digitMap: Record<string, string> = {
  零: '0',
  〇: '0',
  一: '1',
  幺: '1',
  二: '2',
  两: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
};

const highRiskRules: RiskRule[] = [
  {
    category: 'blocked_word',
    label: '基础屏蔽词',
    level: 'high',
    keywords: ['加我', '私聊', '私下聊', '私下联系', '留联系方式', '联系方式', '发号码', '加好友'],
  },
  {
    category: 'social_contact',
    label: '社交账号',
    level: 'high',
    keywords: ['微信', 'vx', 'v信', 'v我', '微我', '薇信', 'wechat', 'qq', '扣扣', '小红书', '小红薯', 'redbook', 'ins', 'instagram', 'ig'],
  },
  {
    category: 'private_deal',
    label: '私下交易',
    level: 'high',
    keywords: ['转账', '线下付', '线下付款', '线下交易', '私下付', '私下付款', '私下交易', '绕平台', '跳平台', '别走平台', '平台外', '支付宝', '收款码', '红包', '扫码付'],
  },
];

const mediumRiskRules: RiskRule[] = [
  {
    category: 'private_deal',
    label: '交易提示',
    level: 'medium',
    keywords: ['现金', '到付', '先付', '尾款', '订金', '定金', '便宜点', '优惠点', '不下单'],
  },
  {
    category: 'social_contact',
    label: '联系方式提示',
    level: 'medium',
    keywords: ['账号', '号码', '电话', '联系你', '怎么联系', '方便联系'],
  },
];

export const blockedWords = highRiskRules.flatMap((rule) => rule.keywords);

export function normalizeMessageText(content: string) {
  return content
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[零〇一幺二两三四五六七八九]/g, (value) => digitMap[value] ?? value);
}

export function compactRiskText(content: string) {
  return normalizeMessageText(content).replace(/[\s\p{P}\p{S}_]+/gu, '');
}

export function evaluateMessageRisk(content: string): MessageRiskResult {
  const normalizedText = normalizeMessageText(content);
  const compactText = compactRiskText(content);
  const hits = [...findRuleHits(compactText, highRiskRules), ...findPhoneHits(compactText), ...findRuleHits(compactText, mediumRiskRules)];
  const hasHighRisk = hits.some((hit) => hit.level === 'high');

  return {
    level: hasHighRisk ? 'high' : hits.length > 0 ? 'medium' : 'clean',
    normalizedText,
    compactText,
    hits: dedupeHits(hits),
    shouldBlock: hasHighRisk,
  };
}

export function findMessageRiskWords(content: string) {
  return evaluateMessageRisk(content).hits.map((hit) => hit.keyword);
}

function findRuleHits(compactText: string, rules: RiskRule[]) {
  return rules.flatMap((rule) =>
    rule.keywords
      .map((keyword) => compactRiskText(keyword))
      .filter((keyword) => keyword && compactText.includes(keyword))
      .map((keyword) => ({
        category: rule.category,
        label: rule.label,
        keyword,
        level: rule.level,
      })),
  );
}

function findPhoneHits(compactText: string): MessageRiskHit[] {
  const phoneLikePattern = /(?:\+?86)?1[3-9]\d{9}/g;
  const matches = compactText.match(phoneLikePattern) ?? [];

  return matches.map((keyword) => ({
    category: 'phone',
    label: '手机号',
    keyword,
    level: 'high',
  }));
}

function dedupeHits(hits: MessageRiskHit[]) {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.category}:${hit.keyword}:${hit.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
