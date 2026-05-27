import { ArrowLeft, CalendarDays, CheckCircle2, CreditCard, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { getPostDetail } from '../../services/feedService';
import { formatMoney } from '../../utils/money';

export function CheckoutPage() {
  const { postId } = useParams();
  const [searchParams] = useSearchParams();
  const [paid, setPaid] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState('');
  const { createOrder } = useAppData();
  const post = useMemo(() => getPostDetail(postId), [postId]);

  const area = searchParams.get('area') ?? post.companion.areas[0];
  const slot = searchParams.get('slot') ?? post.companion.slots[0].label;
  const activity = searchParams.get('activity') ?? post.companion.activities[0].name;
  const duration = searchParams.get('duration') ?? post.companion.activities[0].durationLabel;
  const selectedActivity = post.companion.activities.find((item) => item.name === activity) ?? post.companion.activities[0];
  const selectedSlot = post.companion.slots.find((item) => item.label === slot) ?? post.companion.slots[0];
  const price = Number(searchParams.get('price') ?? post.companion.activities[0].priceCents);
  const total = price;

  if (paid) {
    return (
      <div className="grid min-h-dvh place-items-center pp-page px-5 text-center">
        <div className="rounded-[26px] bg-white/82 p-6 ring-1 ring-[#eadfd8]">
          <CheckCircle2 className="mx-auto text-emerald-600" size={64} />
          <h1 className="mt-5 text-2xl font-bold text-[#3f302c]">订单已创建</h1>
          <p className="mt-2 text-xs font-semibold text-[#a99b94]">{createdOrderId}</p>
          <p className="mt-2 text-sm leading-6 text-[#6f625d]">
            款项已由平台托管，等待 {post.companion.name} 确认后订单生效。确认前你可以免费取消。
          </p>
          <div className="mt-6 grid gap-3">
            <Link to="/consumer/messages" className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-bold text-white">
              <MessageCircle size={18} />
              进入订单聊天
            </Link>
            <Link to="/consumer/orders" className="flex h-12 items-center justify-center rounded-full bg-[#f2e8e1] text-sm font-bold text-[#3f302c]">
              查看订单
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pp-page px-4 py-5">
      <header className="flex items-center gap-3">
        <Link to={`/consumer/post/${post.id}`} className="grid h-10 w-10 place-items-center rounded-full bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-[#3f302c]">确认订单</h1>
      </header>

      <section className="mt-5 overflow-hidden rounded-[22px] pp-surface">
        <img className="h-48 w-full object-cover" src={post.images[0]?.url} alt={post.location} />
        <div className="p-4">
          <div className="flex items-center gap-3">
            <img className="h-12 w-12 rounded-[16px] object-cover" src={post.companion.avatar} alt="" />
            <div>
              <h2 className="font-bold text-[#3f302c]">{post.companion.name}</h2>
              <p className="text-xs text-[#8f8078]">{post.companion.tags.slice(0, 2).join(' · ')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-3 rounded-[22px] pp-surface p-4">
        <OrderLine icon={<MapPin size={18} />} label="约拍地点" value={area} />
        <OrderLine icon={<CalendarDays size={18} />} label="约拍时间" value={slot} />
        <OrderLine icon={<CreditCard size={18} />} label="活动形式" value={`${activity}｜${duration}`} />
      </section>

      <section className="mt-5 rounded-[22px] bg-[#eef8f1] p-4">
        <div className="flex gap-2 text-[#23724a]">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p className="text-sm leading-6">
            平台托管全款，陪拍者确认后订单生效。请在订单聊天内沟通需求，避免私下交易和不安全见面。
          </p>
        </div>
      </section>

      <section className="mt-5 space-y-3 rounded-[22px] pp-surface p-4">
        <PriceLine label="基础服务" value={formatMoney(price)} />
        <div className="border-t border-zinc-100 pt-3">
          <PriceLine label="应付合计" value={formatMoney(total)} strong />
        </div>
      </section>

      <button
        className="mt-6 h-12 w-full rounded-full pp-primary text-sm font-bold"
        onClick={() => {
          const order = createOrder({
            title: `${activity} 陪拍`,
            time: slot,
            place: area,
            amountCents: total,
            companion: post.companion.name,
            companionId: post.companion.id,
            postId: post.id,
            activityId: selectedActivity.id,
            activityName: selectedActivity.name,
            slotId: selectedSlot.id,
            startAt: selectedSlot.startAt,
            endAt: selectedSlot.endAt,
            dateLabel: selectedSlot.dateLabel,
            timeLabel: selectedSlot.timeLabel,
            durationMinutes: selectedActivity.durationMinutes,
            durationLabel: duration,
            addOns: [],
          });
          setCreatedOrderId(order.id);
          setPaid(true);
        }}
      >
        确认并支付
      </button>
    </div>
  );
}

function OrderLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f4ebe6] text-[#6f625d]">{icon}</span>
      <span className="flex-1 text-sm text-[#7a6b64]">{label}</span>
      <span className="max-w-[50%] truncate text-sm font-bold text-[#3f302c]">{value}</span>
    </div>
  );
}

function PriceLine({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${strong ? 'text-base font-bold' : 'text-sm'} ${muted ? 'text-[#c4b7af]' : 'text-[#6f625d]'}`}>{label}</span>
      <span className={`${strong ? 'text-xl font-bold' : 'text-sm font-semibold'} ${muted ? 'text-[#c4b7af]' : 'text-[#3f302c]'}`}>{value}</span>
    </div>
  );
}
