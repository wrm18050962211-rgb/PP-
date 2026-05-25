import { feedPosts, seedOrders } from './mockApi';

export type Companion = {
  id: string;
  name: string;
  avatar: string;
  photo: string;
  bio: string;
  tags: string[];
  safetyBadges: string[];
  areas: string[];
  slots: string[];
  activities: Array<{ name: string; duration: string; price: number }>;
  extras: string[];
  gender: string;
  sameGenderPreferred: boolean;
};

export type Post = {
  id: string;
  city: string;
  location: string;
  placeKeywords: string[];
  nearbyRank: number;
  timeLabel: string;
  availableDates: string[];
  timeSlots: string[];
  caption: string;
  styleTags: string[];
  activity: string;
  budgetRange: [number, number];
  images: string[];
  companion: Companion;
};

const postSearchMeta: Record<string, Omit<Post, 'id' | 'location' | 'timeLabel' | 'caption' | 'styleTags' | 'activity' | 'images' | 'companion'>> = {
  '上海 · 武康路': {
    city: '上海',
    placeKeywords: ['武康路', '街道', '商圈', 'Citywalk', '徐汇'],
    nearbyRank: 1,
    availableDates: ['今天', '明天', '周末'],
    timeSlots: ['下午', '傍晚'],
    budgetRange: [299, 499],
  },
  '上海 · 巨鹿路咖啡店': {
    city: '上海',
    placeKeywords: ['巨鹿路', '咖啡店', '餐厅', '探店', '商圈', '静安'],
    nearbyRank: 2,
    availableDates: ['今天', '明天', '周五'],
    timeSlots: ['下午', '午后'],
    budgetRange: [199, 399],
  },
  '上海 · 外滩': {
    city: '上海',
    placeKeywords: ['外滩', '景点', '商圈', '夜景', '黄浦'],
    nearbyRank: 4,
    availableDates: ['明天', '周末', '周六'],
    timeSlots: ['晚上', '夜景'],
    budgetRange: [199, 699],
  },
};

export const posts: Post[] = feedPosts.map((post, index) => {
  const activityPrices = post.companion.activities.map((activity) => Math.round(activity.priceCents / 100));
  const fallbackMeta = {
    city: post.companion.baseCity,
    placeKeywords: [...post.companion.areas, ...post.styleTags, post.activity],
    nearbyRank: index + 1,
    availableDates: post.companion.slots.map((slot) => slot.dateLabel),
    timeSlots: post.companion.slots.map((slot) => slot.timeLabel),
    budgetRange: [Math.min(...activityPrices), Math.max(...activityPrices)] as [number, number],
  };
  const meta = postSearchMeta[post.location] ?? fallbackMeta;

  return {
    id: post.id,
    ...meta,
    location: post.location,
    timeLabel: post.timeLabel,
    caption: post.caption,
    styleTags: post.styleTags,
    activity: post.activity,
    images: post.images.map((image) => image.url),
    companion: {
      id: post.companion.id,
      name: post.companion.name,
      avatar: post.companion.avatar,
      photo: post.companion.photo,
      bio: post.companion.bio,
      tags: post.companion.tags,
      safetyBadges: post.companion.safetyBadges,
      areas: post.companion.areas,
      slots: post.companion.slots.map((slot) => slot.label),
      activities: post.companion.activities.map((activity) => ({
        name: activity.name,
        duration: activity.durationLabel,
        price: Math.round(activity.priceCents / 100),
      })),
      extras: post.companion.extras.map((extra) => extra.priceText),
      gender: post.companion.gender,
      sameGenderPreferred: post.companion.tags.includes('同性陪拍优先'),
    },
  };
});

export const orders = seedOrders.map((order) => ({
  id: order.id,
  status: order.statusText,
  title: order.title,
  time: order.time,
  place: order.place,
  amount: Math.round(order.amountCents / 100),
  companion: order.companion,
  steps: order.steps,
  currentStep: order.currentStep,
}));

export const blockedWords = ['微信', 'VX', '加我', '私下付', '转账'];
