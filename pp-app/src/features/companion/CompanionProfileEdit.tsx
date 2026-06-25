import { ArrowLeft, Camera, Check, Clock3, ImagePlus, Save, ShieldCheck, Sparkles, UserRound, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';
import {
  applyCompanionProfile,
  createDefaultCompanionProfile,
  readCompanionProfile,
  saveCompanionProfile,
  type CompanionProfileDraft,
} from '../../services/companionProfileService';
import { listFeedPosts } from '../../services/feedService';
import type { Companion } from '../../types/api';

const personalityOptions = ['轻松聊天', '温柔耐心', '不尴尬', '情绪稳定', '会鼓励', '适合第一次拍照'];
const styleOptions = ['自然光', 'Citywalk', '探店日常', '旅行跟拍', '宠物友好', '时装街拍', '夜景氛围', '胶片感'];
const interactionOptions = ['会指导动作', '会找角度', '会看穿搭', '会规划路线', '会看光线', '会带动情绪'];

export function CompanionProfileEdit() {
  const { session } = useAppData();
  const [toast, setToast] = useState('');
  const posts = useMemo(() => listFeedPosts(), []);
  const baseCompanion = useMemo(() => {
    const ownPost = posts.find((post) => post.companion.id === session?.companionId);
    return ownPost?.companion ?? posts[0].companion;
  }, [posts, session?.companionId]);
  const [draft, setDraft] = useState<CompanionProfileDraft>(() => buildInitialDraft(session, baseCompanion));

  useEffect(() => {
    setDraft(buildInitialDraft(session, baseCompanion));
  }, [baseCompanion.id, session?.companionId, session?.user.phone]);

  const previewProfile = applyCompanionProfile(baseCompanion, draft);
  const previewAvatar = draft.pendingAvatarUrl || previewProfile.avatar;
  const avatarPending = draft.avatarReviewStatus === 'pending' && Boolean(draft.pendingAvatarUrl);
  const completeness = [
    draft.displayName.trim(),
    previewAvatar,
    draft.bio.trim(),
    draft.personalityTags.length,
    draft.styleTags.length,
    draft.interactionTags.length,
    draft.equipment.length,
  ].filter(Boolean).length;

  function updateDraft(patch: Partial<CompanionProfileDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleList(field: 'personalityTags' | 'styleTags' | 'interactionTags', item: string) {
    const current = draft[field];
    updateDraft({ [field]: current.includes(item) ? current.filter((value) => value !== item) : [...current, item] });
  }

  function updateEquipment(value: string) {
    updateDraft({ equipment: splitListInput(value) });
  }

  function handleAvatarInput(value: string) {
    const nextUrl = value.trim();
    if (!nextUrl || nextUrl === draft.approvedAvatarUrl) {
      updateDraft({ pendingAvatarUrl: '', avatarReviewStatus: 'approved' });
      return;
    }
    updateDraft({ pendingAvatarUrl: nextUrl, avatarReviewStatus: 'pending' });
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDraft({ pendingAvatarUrl: reader.result, avatarReviewStatus: 'pending' });
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    const saved = saveCompanionProfile(
      {
        ...draft,
        displayName: draft.displayName.trim() || baseCompanion.name,
        bio: draft.bio.trim() || baseCompanion.bio,
        equipment: draft.equipment.map((item) => item.trim()).filter(Boolean),
      },
      'companion',
    );
    setDraft(saved);
    setToast(saved.avatarReviewStatus === 'pending' ? '资料已保存，头像变更待审核' : '资料已保存');
    window.setTimeout(() => setToast(''), 1600);
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] pb-28 text-zinc-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-100 bg-white/95 px-4 py-4 backdrop-blur">
        <Link to="/companion/mine" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black">资料编辑</h1>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">按当前登录摄影师账号保存，头像变更进入审核队列</p>
        </div>
      </header>

      <main className="px-4 py-5">
        <section className="rounded-[12px] bg-zinc-950 p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="relative h-20 w-20 overflow-hidden rounded-[12px] bg-zinc-800">
              {previewAvatar ? (
                <img src={previewAvatar} alt={`${draft.displayName || baseCompanion.name} 头像预览`} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <UserRound className="text-white/45" size={30} />
                </div>
              )}
              {avatarPending ? (
                <span className="absolute inset-x-1 bottom-1 rounded-full bg-black/72 px-1 py-0.5 text-center text-[10px] font-black text-white">
                  待审核
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-black">{draft.displayName || baseCompanion.name}</p>
                {avatarPending ? <Clock3 className="text-amber-300" size={17} /> : <Check className="text-emerald-300" size={17} />}
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-white/70">{draft.bio || baseCompanion.bio}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...draft.personalityTags, ...draft.styleTags, ...draft.interactionTags].slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-white/12 px-2 py-1 text-[11px] font-bold text-white/85">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-white/15">
            <div className="h-1.5 rounded-full bg-rose-400 transition-all" style={{ width: `${Math.round((completeness / 7) * 100)}%` }} />
          </div>
        </section>

        <FormSection title="基础资料">
          <label className="input-line">
            <UserRound size={18} />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="摄影师 ID 名称"
              value={draft.displayName}
              onChange={(event) => updateDraft({ displayName: event.target.value })}
            />
          </label>

          <div className="rounded-[12px] border border-dashed border-zinc-300 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-zinc-50">
                <Camera size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black">头像/真人照片</p>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">可更换，但必须经过管理端审核后才替换主页头像</p>
              </div>
              <label className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-zinc-950 text-white" title="上传头像">
                <ImagePlus size={18} />
                <input className="hidden" type="file" accept="image/*" onChange={handlePhotoChange} />
              </label>
            </div>
            <input
              className="field mt-3 bg-zinc-50"
              placeholder="粘贴图片 URL，保存后进入审核"
              value={draft.pendingAvatarUrl || draft.approvedAvatarUrl}
              onChange={(event) => handleAvatarInput(event.target.value)}
            />
            {avatarPending ? (
              <p className="mt-2 rounded-[8px] bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                新头像待审核。审核通过前，主页仍展示当前已通过头像。
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ReadOnlyFact label="性别" value={draft.registrationGenderLabel} />
            <ReadOnlyFact label="年龄段" value={draft.registrationAgeRangeLabel} />
          </div>

          <textarea
            className="field min-h-28 resize-none rounded-[12px] py-3 leading-6"
            placeholder="文字简介：说清楚你的拍摄风格、相处方式、适合什么用户。"
            value={draft.bio}
            onChange={(event) => updateDraft({ bio: event.target.value })}
          />
        </FormSection>

        <TagSection title="性格标签" desc="让用户知道跟你相处是什么感觉" items={personalityOptions} selected={draft.personalityTags} onToggle={(item) => toggleList('personalityTags', item)} />
        <TagSection title="擅长风格" desc="帮助用户判断你能不能拍出 TA 想要的感觉" items={styleOptions} selected={draft.styleTags} onToggle={(item) => toggleList('styleTags', item)} />
        <TagSection title="互动方式" desc="强调你能提供的现场支持和情绪价值" items={interactionOptions} selected={draft.interactionTags} onToggle={(item) => toggleList('interactionTags', item)} />

        <section className="mt-6 rounded-[12px] border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-start gap-2">
            <Wrench className="mt-0.5 text-rose-500" size={18} />
            <div>
              <h2 className="text-base font-black">持有设备</h2>
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">用逗号或顿号分隔，主页会展示给创作者参考</p>
            </div>
          </div>
          <textarea
            className="field min-h-24 resize-none rounded-[12px] py-3 leading-6"
            placeholder="例如：Sony A7M4、35mm 定焦、50mm 定焦、补光灯、短视频稳定器"
            value={draft.equipment.join('、')}
            onChange={(event) => updateEquipment(event.target.value)}
          />
        </section>

        <section className="mt-5 rounded-[12px] bg-rose-50 p-4 text-rose-900">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 shrink-0" size={20} />
            <p className="text-xs font-bold leading-5">
              性别和年龄段属于注册资料，只在注册或实名审核流程内确定；本页只允许修改主页展示资料。头像审核、设备与标签后续可迁移到管理端审核表。
            </p>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-black text-white" onClick={handleSave}>
          <Save size={18} />
          保存资料
        </button>
      </div>
      {toast ? <div className="fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
    </div>
  );
}

function buildInitialDraft(session: ReturnType<typeof useAppData>['session'], companion: Companion) {
  return readCompanionProfile(companion.id, session?.role) ?? createDefaultCompanionProfile(session, companion);
}

function splitListInput(value: string) {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-black">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-white px-4 py-3 ring-1 ring-zinc-200">
      <p className="text-xs font-black text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-black text-zinc-900">{value}</p>
    </div>
  );
}

function TagSection({
  title,
  desc,
  items,
  selected,
  onToggle,
}: {
  title: string;
  desc: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles className="mt-0.5 text-rose-500" size={18} />
        <div>
          <h2 className="text-base font-black">{title}</h2>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">{desc}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item} type="button" onClick={() => onToggle(item)}>
            <Chip active={selected.includes(item)}>{item}</Chip>
          </button>
        ))}
      </div>
    </section>
  );
}
